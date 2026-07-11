const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function resolveFlowFile(settings) {
    const userDir = settings.userDir || process.cwd();
    const configured = settings.flowFile && path.resolve(userDir, settings.flowFile);
    const hostnameFlow = path.join(userDir, `flows_${os.hostname()}.json`);
    return [configured, hostnameFlow, path.join(userDir, 'flows.json')].find((file) => file && fs.existsSync(file)) || hostnameFlow;
}

function runnerFlow(RED) {
    RED.nodes.registerType('runner-flow', function (config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const port = Number(config.port);
        const forwardOutput = config.forwardOutput !== false && config.forwardOutput !== 'false';
        const forwardToConsole = config.forwardToConsole === true || config.forwardToConsole === 'true';
        const flowFile = resolveFlowFile(RED.settings);
        const flow = JSON.parse(fs.readFileSync(flowFile, 'utf8'));
        const tab = flow.find((entry) => entry.type === 'tab' && entry.id === config.flowId);

        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('runner-flow requires a port between 1 and 65535');
        if (!tab || !tab.disabled) throw new Error(`runner-flow requires a disabled flow tab: ${config.flowId}`);
        if (!node.id || node.id !== path.basename(node.id)) throw new Error('runner-flow node ID must be a path segment');

        const root = path.join(RED.settings.userDir || path.dirname(flowFile), '.node-red-runner', node.id);
        const contextDir = path.join(root, 'context');
        fs.mkdirSync(contextDir, { recursive: true });
        node.status({ fill: 'blue', shape: 'ring', text: `starting on ${port}` });

        let stderr = '';
        const child = spawn(process.execPath, [
            path.join(__dirname, '..', 'runflow.js'),
            '--user-dir', RED.settings.userDir || path.dirname(flowFile),
            '--flow', flowFile,
            '--flow-id', config.flowId,
            '--credentials', flowFile.replace(/\.json$/, '_cred.json'),
            '--context-dir', contextDir,
            '--metrics-interval', '1000',
            '--port', String(port),
        ], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });

        child.stdout.on('data', (data) => {
            const text = data.toString();
            if (forwardToConsole) process.stdout.write(text);
            if (forwardOutput) node.send({ payload: { type: 'stdout', data: text } });
        });
        child.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            if (forwardToConsole) process.stderr.write(text);
            if (forwardOutput) node.send({ payload: { type: 'stderr', data: text } });
        });
        child.on('message', (message) => {
            if (message.type === 'metrics') node.send({ payload: message });
        });
        child.once('spawn', () => node.status({ fill: 'green', shape: 'dot', text: `listening on ${port}` }));
        child.once('exit', (code, signal) => {
            node.status({ fill: 'red', shape: 'ring', text: 'stopped' });
            if (code && !node._closing) node.error(stderr || `runner exited with code ${code}${signal ? ` (${signal})` : ''}`);
        });
        node.on('close', (done) => {
            node._closing = true;
            if (child.exitCode !== null || child.signalCode !== null) return done();
            const forceStop = setTimeout(() => child.kill('SIGKILL'), 1000);
            child.once('exit', () => {
                clearTimeout(forceStop);
                done();
            });
            child.kill();
        });
    });
}

module.exports = runnerFlow;
module.exports.resolveFlowFile = resolveFlowFile;
