const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { decryptCredentials, main, parseArgs, selectFlow } = require('../runflow');

test('CLI parses runtime options', () => {
    assert.deepStrictEqual(parseArgs(['--flow', 'flow.json', '--port', '1888']), {
        flow: 'flow.json',
        port: '1888',
    });
});

test('CLI decrypts Node-RED credential files', () => {
    const secret = 'test-secret';
    const iv = Buffer.alloc(16, 1);
    const cipher = crypto.createCipheriv('aes-256-ctr', crypto.createHash('sha256').update(secret).digest(), iv);
    const encrypted = iv.toString('hex') + cipher.update(JSON.stringify({ n1: { token: 'abc' } }), 'utf8', 'base64') + cipher.final('base64');
    assert.deepStrictEqual(decryptCredentials({ $: encrypted }, secret), { n1: { token: 'abc' } });
});

test('CLI selects a disabled flow tab with its config nodes', () => {
    const selected = selectFlow([
        { id: 'active', type: 'tab' },
        { id: 'disabled', type: 'tab', disabled: true },
        { id: 'active-node', z: 'active', type: 'example', wires: [] },
        { id: 'disabled-node', z: 'disabled', type: 'example', wires: [] },
        { id: 'config', type: 'config' },
    ], 'disabled');
    assert.deepStrictEqual(selected.map((node) => node.id), ['disabled', 'disabled-node', 'config']);
    assert.strictEqual(selected[0].disabled, false);
});

test('CLI loads declared package nodes and lets aliases register', async () => {
    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-node-'));
    const packageDir = path.join(userDir, 'node_modules', 'example');
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, 'flows.json'), JSON.stringify([{ id: 'node', type: 'alias-node' }]));
    fs.writeFileSync(path.join(userDir, 'package.json'), JSON.stringify({ dependencies: { example: '1.0.0' } }));
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ 'node-red': { nodes: { example: 'node.js' } } }));
    fs.writeFileSync(path.join(packageDir, 'node.js'), 'module.exports = RED => { const add = RED.nodes.registerType.bind(RED.nodes); add("alias-node", () => {}); };');

    let registered;
    await main(['--user-dir', userDir, '--port', '0'], {
        importCoreNodes: () => [],
        helper: {
            clearFlow: (flow) => flow,
            settings: () => {},
            load: async (nodes) => nodes[0]({ nodes: { registerType: (name) => { registered = name; } } }),
            startServer: async () => {},
            unload: async () => {},
            stopServer: async () => {},
        },
    });

    assert.strictEqual(registered, 'alias-node');
});
