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
            .filter((file) => file.endsWith('.js'))
            .map((file) => reader.importFile(path.join(core, file)));
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') return [];
        throw err;
    }
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
    const flow = require(flowFile);
    const credentials = decryptCredentials(
        readOptional(credentialFile, {}),
        settings.credentialSecret || settings._credentialSecret || runtimeConfig._credentialSecret,
    );
    const reader = new Reader(path.join(userDir, 'node_modules'), true);
    reader.registerFlows(runtime.clearFlow(flow));

    const nodes = loadCoreNodes(reader);
    const userPackage = readOptional(path.join(userDir, 'package.json'), { dependencies: {} });
    for (const dependency in userPackage.dependencies || {}) {
        nodes.push(...reader.importModule(dependency));
    }

    runtime.settings(settings);
    await runtime.load(nodes, flow, credentials);
    await runtime.startServer(Number(options.port || 1880));

    const stop = async () => {
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

module.exports = { decryptCredentials, main, parseArgs, usage };
