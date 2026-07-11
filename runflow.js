#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const helper = require('./index');
const NodeReader = require('./src/nodeReader');

const usage = `Usage: node runflow.js [options]

  --user-dir <dir>       Node-RED user directory (default: ~/.node-red)
  --flow <file>          Flow JSON file (default: flows.json in user-dir)
  --credentials <file>   Credentials JSON file (default: <flow>_cred.json)
  --settings <file>      Settings JS or JSON file (default: settings.js in user-dir)
  --flow-id <id>         Run only the selected flow tab
  --context-dir <dir>    Context storage root for this run
  --metrics-interval <ms> Send CPU and memory metrics over IPC
  --port <number>        HTTP port (default: 1880)
  --help                 Show this help
`;

function parseArgs(args) {
    const options = {};
    for (let i = 0; i < args.length; i++) {
        const name = args[i];
        if (name === '--help') return { help: true };
        if (!name.startsWith('--') || args[i + 1] === undefined) throw new Error(`Invalid option: ${name}`);
        options[name.slice(2)] = args[++i];
    }
    return options;
}

function readOptional(file, fallback) {
    return file && fs.existsSync(file) ? require(file) : fallback;
}

function selectFlow(flow, flowId) {
    if (!flowId) return flow;
    const tab = flow.find((node) => node.type === 'tab' && node.id === flowId);
    if (!tab) throw new Error(`Unknown flow tab: ${flowId}`);

    const subflowIds = new Set(flow.filter((node) => node.type === 'subflow').map((node) => node.id));
    return flow.filter((node) =>
        node.id === flowId
        || node.z === flowId
        || node.type === 'subflow'
        || subflowIds.has(node.z)
        || (!node.z && node.wires === undefined && node.type !== 'tab'),
    ).map((node) => node.id === flowId ? { ...node, disabled: false } : node);
}

function decryptCredentials(credentials, secret) {
    if (!credentials.$) return credentials;
    if (!secret) throw new Error('Encrypted credentials require credentialSecret in settings');
    const value = credentials.$;
    const decipher = crypto.createDecipheriv(
        'aes-256-ctr',
        crypto.createHash('sha256').update(secret).digest(),
        Buffer.from(value.slice(0, 32), 'hex'),
    );
    return JSON.parse(decipher.update(value.slice(32), 'base64', 'utf8') + decipher.final('utf8'));
}

function importCoreNodes(reader) {
    try {
        const core = path.join(path.dirname(require.resolve('@node-red/nodes/package.json')), 'core');
        return fs.readdirSync(core, { recursive: true })
            .filter((file) => file.endsWith('.js') && !file.split(path.sep).includes('lib'))
            .map((file) => reader.importFile(path.join(core, file)));
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') return [];
        throw err;
    }
}

function startMetrics(interval) {
    if (!process.send || !Number.isInteger(interval) || interval < 1) return () => {};
    let previousCpu = process.cpuUsage();
    let previousAt = process.hrtime.bigint();
    const timer = setInterval(() => {
        const now = process.hrtime.bigint();
        const cpu = process.cpuUsage(previousCpu);
        const elapsedUs = Number(now - previousAt) / 1000;
        previousCpu = process.cpuUsage();
        previousAt = now;
        process.send({
            type: 'metrics',
            cpu: { userUs: cpu.user, systemUs: cpu.system, percent: (cpu.user + cpu.system) / elapsedUs * 100 },
            memory: process.memoryUsage(),
        });
    }, interval);
    timer.unref();
    return () => clearInterval(timer);
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
    const runtime = dependencies.helper || helper;
    const Reader = dependencies.NodeReader || NodeReader;
    const loadCoreNodes = dependencies.importCoreNodes || importCoreNodes;
    const options = parseArgs(argv);
    if (options.help) {
        console.log(usage);
        return;
    }

    const userDir = path.resolve(options['user-dir'] || path.join(require('os').homedir(), '.node-red'));
    const flowFile = path.resolve(options.flow || path.join(userDir, 'flows.json'));
    const credentialFile = path.resolve(options.credentials || flowFile.replace(/\.json$/, '_cred.json'));
    const settingsFile = path.resolve(options.settings || path.join(userDir, 'settings.js'));
    const settings = readOptional(settingsFile, {});
    const runtimeConfig = readOptional(path.join(userDir, '.config.runtime.json'), {});
    const flow = selectFlow(require(flowFile), options['flow-id']);
    const credentials = decryptCredentials(
        readOptional(credentialFile, {}),
        settings.credentialSecret || settings._credentialSecret || runtimeConfig._credentialSecret,
    );
    const cleanedFlow = runtime.clearFlow(flow);
    const reader = new Reader(path.join(userDir, 'node_modules'), true);
    reader.registerFlows(cleanedFlow);

    const nodes = loadCoreNodes(reader);
    const userPackage = readOptional(path.join(userDir, 'package.json'), { dependencies: {} });
    for (const dependency in userPackage.dependencies || {}) {
        nodes.push(...reader.importModule(dependency));
    }

    if (options['context-dir']) {
        settings.contextStorage = { ...settings.contextStorage, file: path.resolve(options['context-dir']) };
    }
    runtime.settings(settings);
    await runtime.load(nodes, cleanedFlow, credentials);
    await runtime.startServer(Number(options.port || 1880));
    const stopMetrics = startMetrics(Number(options['metrics-interval']));

    const stop = async () => {
        stopMetrics();
        await runtime.unload();
        await runtime.stopServer();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
}

module.exports = { decryptCredentials, main, parseArgs, selectFlow, startMetrics, usage };
