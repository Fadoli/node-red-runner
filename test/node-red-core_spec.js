const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const helper = require('../index');

function core(relative) {
    return require(path.join(path.dirname(require.resolve('@node-red/nodes/package.json')), 'core', relative));
}

const inject = core('common/20-inject.js');
const functionNode = core('function/10-function.js');
const change = core('function/15-change.js');
const http = core('network/21-httpin.js');
const switchNode = core('function/10-switch.js');
const template = core('function/80-template.js');
const delay = core('function/89-delay.js');
const json = core('parsers/70-JSON.js');
const file = core('storage/10-file.js');

test.afterEach(async () => {
    await helper.unload();
    await helper.stopServer();
});

test('runs optional Node-RED inject, function and change nodes', async () => {
    const flow = [
        { id: 'inject', z: 'flow', type: 'inject', props: [{ p: 'payload', v: 'core', vt: 'str' }], wires: [['function']] },
        { id: 'function', z: 'flow', type: 'function', func: "msg.payload += '-function'; return msg;", outputs: 1, wires: [['change']] },
        { id: 'change', z: 'flow', type: 'change', rules: [{ t: 'set', p: 'changed', pt: 'msg', to: 'true', tot: 'bool' }], wires: [['result']] },
        { id: 'complete', z: 'flow', type: 'complete', scope: ['function'], wires: [] },
        { id: 'catch', z: 'flow', type: 'catch', scope: ['function'], wires: [] },
        { id: 'result', z: 'flow', type: 'helper', wires: [] },
    ];
    await helper.load([inject, functionNode, change], flow);
    const result = helper.awaitNodeInput('result');
    const completed = helper.awaitNodeInput('complete');
    helper.getNode('inject').receive({});
    const msg = await result;
    assert.strictEqual(msg.payload, 'core-function');
    assert.strictEqual(msg.changed, true);
    assert.strictEqual(typeof msg._msgid, 'string');
    assert.strictEqual((await completed).payload, 'core-function');
});

test('routes errors from a Node-RED function node to Catch', async () => {
    const flow = [
        { id: 'function', z: 'flow', type: 'function', func: "throw new Error('core failure');", outputs: 1, wires: [] },
        { id: 'catch', z: 'flow', type: 'catch', scope: ['function'], wires: [] },
    ];
    await helper.load(functionNode, flow);
    const caught = helper.awaitNodeInput('catch');
    helper.getNode('function').receive({ payload: 1 });
    assert.match((await caught).error.message, /core failure/);
});

test('serves HTTP In through Function and HTTP Response', async () => {
    const flow = [
        { id: 'in', z: 'flow', type: 'http in', method: 'post', url: '/compat', wires: [['function']] },
        { id: 'function', z: 'flow', type: 'function', func: "msg.payload = {received: msg.payload.value}; msg.statusCode = 201; return msg;", outputs: 1, wires: [['out']] },
        { id: 'out', z: 'flow', type: 'http response', wires: [] },
    ];
    await helper.load([http, functionNode], flow);
    await helper.request().post('/compat').send({ value: 42 }).expect(201, { received: 42 });
});

test('runs optional Node-RED Template, JSON, Switch and Delay nodes', async () => {
    const flow = [
        { id: 'template', z: 'flow', type: 'template', field: 'payload', fieldType: 'msg', syntax: 'mustache', output: 'str', template: '{"value":"{{payload}}"}', wires: [['json']] },
        { id: 'json', z: 'flow', type: 'json', property: 'payload', action: 'obj', wires: [['switch']] },
        { id: 'switch', z: 'flow', type: 'switch', property: 'payload.value', propertyType: 'msg', checkall: 'true', rules: [{ t: 'eq', v: 'core', vt: 'str' }], wires: [['delay']] },
        { id: 'delay', z: 'flow', type: 'delay', pauseType: 'delay', timeout: '1', timeoutUnits: 'milliseconds', rate: '1', rateUnits: 'second', randomFirst: '1', randomLast: '1', outputs: 1, wires: [['result']] },
        { id: 'result', z: 'flow', type: 'helper', wires: [] },
    ];
    await helper.load([template, json, switchNode, delay], flow);
    const result = helper.awaitNodeInput('result');
    helper.getNode('template').receive({ payload: 'core' });
    assert.deepStrictEqual((await result).payload, { value: 'core' });
});

test('runs optional Node-RED File write and read nodes', async () => {
    const filename = path.join(__dirname, '.tmp-core-file.txt');
    const flow = [
        { id: 'write', z: 'flow', type: 'file', filename, filenameType: 'str', appendNewline: false, overwriteFile: true, createDir: true, encoding: 'utf8', wires: [['read']] },
        { id: 'read', z: 'flow', type: 'file in', filename, filenameType: 'str', format: 'utf8', encoding: 'utf8', wires: [['result']] },
        { id: 'result', z: 'flow', type: 'helper', wires: [] },
    ];
    try {
        await helper.load(file, flow);
        const result = helper.awaitNodeInput('result');
        helper.getNode('write').receive({ payload: 'file-content' });
        assert.strictEqual((await result).payload, 'file-content');
    } finally {
        await require('node:fs/promises').unlink(filename).catch(() => {});
    }
});
