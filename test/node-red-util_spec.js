const test = require('node:test');
const assert = require('node:assert/strict');
const util = require('../src/utils/node-red');

test('clones, converts, compares and encodes values', () => {
    const req = {};
    const original = { nested: { value: 1 }, req };
    const copy = util.cloneMessage(original);
    assert.deepEqual(copy.nested, original.nested);
    assert.notStrictEqual(copy.nested, original.nested);
    assert.strictEqual(copy.req, req);
    assert.strictEqual(util.ensureString(Buffer.from('ok')), 'ok');
    assert.deepEqual(util.ensureBuffer({ value: 1 }), Buffer.from('{"value":1}'));
    assert.ok(util.compareObjects({ a: [1] }, { a: [1] }));
    assert.ok(!util.compareObjects({ a: 1 }, { a: 2 }));
    assert.deepEqual(util.encodeObject({ msg: Buffer.from('ok') }), { msg: '6f6b', format: 'buffer[2]' });
});

test('reads, writes and normalises message properties', () => {
    const msg = { payload: { values: [{ name: 'first' }] } };
    assert.equal(util.getMessageProperty(msg, 'payload.values[0].name'), 'first');
    assert.deepEqual(util.normalisePropertyExpression('payload["values"][0].name'), ['payload', 'values', 0, 'name']);
    assert.ok(util.setMessageProperty(msg, 'payload.values[1].name', 'second', true));
    assert.equal(util.getObjectProperty(msg, 'payload.values[1].name'), 'second');
    assert.ok(util.setObjectProperty(msg, 'payload.values[0].name', 'changed'));
    assert.equal(msg.payload.values[0].name, 'changed');
});

test('evaluates Node-RED property types and context store keys', async () => {
    const node = {
        getSetting: (name) => ({ GREETING: 'hello' })[name],
        context: () => ({ flow: { get: () => 42 }, global: { get: () => 7 } }),
    };
    const msg = { payload: 'value' };
    assert.equal(util.evaluateNodeProperty('12', 'num', node, msg), 12);
    assert.equal(util.evaluateNodeProperty('payload', 'msg', node, msg), 'value');
    assert.equal(util.evaluateNodeProperty('GREETING', 'env', node, msg), 'hello');
    assert.equal(util.evaluateNodeProperty('answer', 'flow', node, msg), 42);
    assert.deepEqual(util.parseContextStore('#:(memory)::value'), { store: 'memory', key: 'value' });
    assert.equal(util.normaliseNodeTypeName('A random-node'), 'aRandomNode');

    const expression = util.prepareJSONataExpression('payload * 2', node);
    const result = await new Promise((resolve, reject) => {
        util.evaluateJSONataExpression(expression, { payload: 21 }, (error, value) => error ? reject(error) : resolve(value));
    });
    assert.equal(result, 42);
});

test('gets settings from a node before the environment', () => {
    const previous = process.env.NODE_RED_UTIL_TEST;
    process.env.NODE_RED_UTIL_TEST = 'environment';
    try {
        assert.equal(util.getSetting(null, 'NODE_RED_UTIL_TEST'), 'environment');
        assert.equal(util.getSetting({ getSetting: () => 'node' }, 'NODE_RED_UTIL_TEST'), 'node');
    } finally {
        if (previous === undefined) delete process.env.NODE_RED_UTIL_TEST;
        else process.env.NODE_RED_UTIL_TEST = previous;
    }
});
