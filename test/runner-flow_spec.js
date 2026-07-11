const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const runnerFlow = require('../nodes/runner-flow');

const getPort = () => new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, () => {
        const { port } = server.address();
        server.close(() => resolve(port));
    });
});

const waitForPort = (port, attempts = 30) => new Promise((resolve, reject) => {
    const connect = () => {
        const socket = net.connect(port, '127.0.0.1');
        socket.once('connect', () => {
            socket.destroy();
            resolve();
        });
        socket.once('error', () => {
            socket.destroy();
            if (attempts-- === 0) reject(new Error(`runner did not listen on ${port}`));
            else setTimeout(connect, 50);
        });
    };
    connect();
});

const waitFor = (check, attempts = 30) => new Promise((resolve, reject) => {
    const retry = () => {
        if (check()) return resolve();
        if (attempts-- === 0) return reject(new Error('condition was not met'));
        setTimeout(retry, 50);
    };
    retry();
});

test('runner-flow runs a disabled tab with isolated context', async (t) => {
    const userDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runner-flow-'));
    const port = await getPort();
    await fs.writeFile(path.join(userDir, 'flows.json'), JSON.stringify([
        { id: 'active', type: 'tab' },
        { id: 'disabled', type: 'tab', disabled: true },
        { id: 'inject', z: 'disabled', type: 'inject', props: [], once: false, wires: [] },
    ]));

    let Node;
    runnerFlow({
        settings: { userDir, flowFile: 'flows.json' },
        nodes: {
            createNode: () => {},
            registerType: (name, constructor) => { if (name === 'runner-flow') Node = constructor; },
        },
    });

    const node = new EventEmitter();
    node.id = 'runner-node';
    node.status = () => {};
    node.error = (error) => { throw error; };
    const metrics = [];
    node.send = (message) => metrics.push(message);
    Node.call(node, { flowId: 'disabled', port });
    t.after(async () => {
        if (node.listenerCount('close')) await new Promise((resolve) => node.emit('close', resolve));
        await fs.rm(userDir, { recursive: true, force: true });
    });

    await waitForPort(port);
    await waitFor(() => metrics.length > 0);
    assert.equal(metrics[0].payload.type, 'metrics');
    assert.equal(typeof metrics[0].payload.cpu.percent, 'number');
    assert.equal(typeof metrics[0].payload.memory.rss, 'number');
    await new Promise((resolve) => node.emit('close', resolve));
    assert.ok(await fs.stat(path.join(userDir, '.node-red-runner', 'runner-node', 'context')));
});
