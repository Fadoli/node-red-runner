const test = require('node:test');
const assert = require('node:assert');
const helper = require('../index');

const nodes = (RED) => {
    RED.nodes.registerType('append', function (config) {
        this.on('input', (msg, send, done) => {
            msg.payload += config.value;
            send(msg);
            done();
        });
    });
    RED.nodes.registerType('split', function () {
        this.on('input', (msg) => this.send([
            { ...msg, payload: `${msg.payload}:0` },
            { ...msg, payload: `${msg.payload}:1` },
        ]));
    });
    RED.nodes.registerType('inspect-env', function () {
        this.on('input', (msg) => {
            msg.greeting = RED.util.getSetting(this, 'GREETING');
            msg.fromParent = RED.util.evaluateNodeProperty('FROM_PARENT', 'env', this);
            msg.parentContext = this.context().flow.get('$parent.shared');
            this.send(msg);
        });
    });
};

test.afterEach(() => helper.unload());

test('executes a subflow instance', async () => {
    const flow = [
        { id: 'sf', type: 'subflow', in: [{ wires: [{ id: 'inner' }] }], out: [{ wires: [{ id: 'inner', port: 0 }] }] },
        { id: 'inner', z: 'sf', type: 'append', value: '!', wires: [[]] },
        { id: 'instance', z: 'flow', type: 'subflow:sf', wires: [['result']] },
        { id: 'result', z: 'flow', type: 'helper', wires: [] },
    ];
    await helper.load(nodes, flow);
    const received = helper.awaitNodeInput('result');
    helper.getNode('instance').receive({ payload: 'hello' });
    assert.strictEqual((await received).payload, 'hello!');
});

test('maps subflow output ports', async () => {
    const flow = [
        { id: 'sf', type: 'subflow', in: [{ wires: [{ id: 'inner' }] }], out: [
            { wires: [{ id: 'inner', port: 0 }] },
            { wires: [{ id: 'inner', port: 1 }] },
        ] },
        { id: 'inner', z: 'sf', type: 'split', wires: [[], []] },
        { id: 'instance', z: 'flow', type: 'subflow:sf', wires: [['first'], ['second']] },
        { id: 'first', z: 'flow', type: 'helper', wires: [] },
        { id: 'second', z: 'flow', type: 'helper', wires: [] },
    ];
    await helper.load(nodes, flow);
    const first = helper.awaitNodeInput('first');
    const second = helper.awaitNodeInput('second');
    helper.getNode('instance').receive({ payload: 'value' });
    assert.deepStrictEqual([(await first).payload, (await second).payload], ['value:0', 'value:1']);
});

test('executes nested subflows', async () => {
    const flow = [
        { id: 'inner-sf', type: 'subflow', in: [{ wires: [{ id: 'append' }] }], out: [{ wires: [{ id: 'append', port: 0 }] }] },
        { id: 'append', z: 'inner-sf', type: 'append', value: '!', wires: [[]] },
        { id: 'outer-sf', type: 'subflow', in: [{ wires: [{ id: 'nested' }] }], out: [{ wires: [{ id: 'nested', port: 0 }] }] },
        { id: 'nested', z: 'outer-sf', type: 'subflow:inner-sf', wires: [[]] },
        { id: 'instance', z: 'flow', type: 'subflow:outer-sf', wires: [['result']] },
        { id: 'result', z: 'flow', type: 'helper', wires: [] },
    ];
    await helper.load(nodes, flow);
    const received = helper.awaitNodeInput('result');
    helper.getNode('instance').receive({ payload: 'nested' });
    assert.strictEqual((await received).payload, 'nested!');
});

test('applies subflow environment overrides and parent context', async () => {
    const flow = [
        { id: 'flow', type: 'tab', env: [{ name: 'PARENT', value: 'parent-env', type: 'str' }] },
        { id: 'sf', type: 'subflow', env: [
            { name: 'GREETING', value: 'default', type: 'str' },
            { name: 'FROM_PARENT', value: 'PARENT', type: 'env' },
        ], in: [{ wires: [{ id: 'inner' }] }], out: [{ wires: [{ id: 'inner', port: 0 }] }] },
        { id: 'inner', z: 'sf', type: 'inspect-env', wires: [[]] },
        { id: 'seed', z: 'flow', type: 'helper', wires: [] },
        { id: 'instance', z: 'flow', type: 'subflow:sf', env: [{ name: 'GREETING', value: 'override', type: 'str' }], wires: [['result']] },
        { id: 'result', z: 'flow', type: 'helper', wires: [] },
    ];
    await helper.load(nodes, flow);
    helper.getNode('seed').context().flow.set('shared', 'parent-context');
    const received = helper.awaitNodeInput('result');
    helper.getNode('instance').receive({});
    const msg = await received;
    assert.strictEqual(msg.greeting, 'override');
    assert.strictEqual(msg.fromParent, 'parent-env');
    assert.strictEqual(msg.parentContext, 'parent-context');
});
