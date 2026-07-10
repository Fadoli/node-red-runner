const test = require('node:test');
const assert = require('node:assert');
const helper = require('../index');

const nodes = (RED) => {
    RED.nodes.registerType('processor', function () {
        this.on('input', (msg) => { msg.payload += '!'; this.send(msg); });
    });
    RED.nodes.registerType('status-source', function () {
        this.on('input', () => this.status({ fill: 'green', shape: 'dot', text: 'ready' }));
    });
};

test.afterEach(() => helper.unload());

test('routes link out through link in', async () => {
    const flow = [
        { id: 'out', z: 'flow', type: 'link out', mode: 'link', links: ['in'], wires: [] },
        { id: 'in', z: 'flow', type: 'link in', wires: [['result']] },
        { id: 'result', z: 'flow', type: 'helper', wires: [] },
    ];
    await helper.load(nodes, flow);
    const result = helper.awaitNodeInput('result');
    helper.getNode('out').receive({ payload: 'linked' });
    assert.strictEqual((await result).payload, 'linked');
});

test('returns link call messages to the caller output', async () => {
    const flow = [
        { id: 'call', z: 'flow', type: 'link call', links: ['in'], timeout: '1', wires: [['result']] },
        { id: 'in', z: 'flow', type: 'link in', wires: [['processor']] },
        { id: 'processor', z: 'flow', type: 'processor', wires: [['return']] },
        { id: 'return', z: 'flow', type: 'link out', mode: 'return', links: [], wires: [] },
        { id: 'result', z: 'flow', type: 'helper', wires: [] },
    ];
    await helper.load(nodes, flow);
    const result = helper.awaitNodeInput('result');
    helper.getNode('call').receive({ payload: 'called' });
    assert.strictEqual((await result).payload, 'called!');
});

test('routes node status to scoped Status nodes', async () => {
    const flow = [
        { id: 'source', z: 'flow', type: 'status-source', wires: [] },
        { id: 'status', z: 'flow', type: 'status', scope: ['source'], wires: [['result']] },
        { id: 'result', z: 'flow', type: 'helper', wires: [] },
    ];
    await helper.load(nodes, flow);
    const result = helper.awaitNodeInput('result');
    helper.getNode('source').receive({});
    const msg = await result;
    assert.strictEqual(msg.status.text, 'ready');
    assert.strictEqual(msg.status.source.id, 'source');
});
