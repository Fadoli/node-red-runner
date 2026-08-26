const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const helper = require('../index');

test.afterEach(() => helper.unload());

function nodes(state) {
    return (RED) => {
        RED.nodes.registerType('editor-source', function () {
            state.sourceConstructed++;
            this.on('close', () => { state.sourceClosed++; });
            this.on('input', (msg) => this.send(msg));
        });
        RED.nodes.registerType('editor-target', function () {
            state.targetConstructed++;
            this.on('close', () => { state.targetClosed++; });
            this.on('input', (msg) => state.received.push(msg.payload));
        });
    };
}

function configurableNodes(state) {
    return (RED) => {
        RED.nodes.registerType('editor-configurable', function (config) {
            state.constructed++;
            this.on('close', () => { state.closed++; });
            this.on('input', () => state.values.push(config.value));
        });
    };
}

test('editor API rewires without restarting unchanged nodes', async () => {
    const state = { sourceConstructed: 0, sourceClosed: 0, targetConstructed: 0, targetClosed: 0, received: [] };
    await helper.load(nodes(state), [
        { id: 'source', type: 'editor-source', wires: [['first']] },
        { id: 'first', type: 'editor-target', wires: [] },
        { id: 'second', type: 'editor-target', wires: [] },
    ]);
    await helper.request().get('/').expect(302).expect('Location', '/editor');
    await helper.request().get('/editor').expect(200).expect('Content-Type', /html/);
    const first = helper.getNode('first');
    const source = helper.getNode('source');
    const snapshot = await helper.request().get('/api/editor/snapshot').expect(200);
    const response = await helper.request().post('/api/editor/deploy').send({
        baseRev: snapshot.body.rev,
        changes: [{ op: 'replace-wires', id: 'source', wires: [['second']] }],
    }).expect(200);

    assert.deepEqual(response.body.impact.restarted, []);
    assert.equal(state.sourceConstructed, 1);
    assert.equal(state.sourceClosed, 0);
    assert.equal(state.targetConstructed, 2);
    assert.equal(state.targetClosed, 0);
    assert.equal(helper.getNode('first'), first);
    assert.equal(helper.getNode('source'), source);
    helper.getNode('source').receive({ payload: 'updated' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(state.received, ['updated']);
});

test('editor API rejects stale revisions and hides credentials', async () => {
    const state = { sourceConstructed: 0, sourceClosed: 0, targetConstructed: 0, targetClosed: 0, received: [] };
    await helper.load(nodes(state), [
        { id: 'source', type: 'editor-source', wires: [] },
    ], { source: { token: 'secret' } });
    const snapshot = await helper.request().get('/api/editor/snapshot').expect(200);
    assert.equal(snapshot.body.flows[0].credentials, undefined);
    await helper.request().post('/api/editor/deploy').send({
        baseRev: snapshot.body.rev,
        changes: [{ op: 'update-node', id: 'source', set: { x: 100 } }],
    }).expect(200);
    await helper.request().post('/api/editor/deploy').send({
        baseRev: snapshot.body.rev,
        changes: [{ op: 'update-node', id: 'source', set: { x: 200 } }],
    }).expect(409);
});

test('editor API applies protected credential edits without putting them in flow nodes', async () => {
    await helper.load((RED) => {
        RED.nodes.registerType('editor-credential', function () {}, { credentials: { token: { type: 'password' } } });
    }, [{ id: 'credential', type: 'editor-credential', wires: [] }], { credential: { token: 'old' } });
    const snapshot = await helper.request().get('/api/editor/snapshot').expect(200);
    await helper.request().post('/api/editor/deploy').send({
        baseRev: snapshot.body.rev,
        changes: [],
        credentials: { credential: { token: 'new' } },
    }).expect(200);
    assert.equal(helper.getNode('credential').credentials.token, 'new');
    assert.equal((await helper.request().get('/api/editor/snapshot')).body.flows[0].credentials, undefined);
});

test('editor API serves the registered Node-RED editor template', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-api-'));
    const htmlPath = path.join(directory, 'form.html');
    fs.writeFileSync(htmlPath, '<script type="text/html" data-template-name="editor-form"><input id="node-input-name" type="text"></script>');
    await helper.load((RED) => {
        RED.nodes.registerType('editor-form', function () {}, { editor: { htmlPath } });
    }, [{ id: 'form', type: 'editor-form', wires: [] }]);
    const response = await helper.request().get('/api/editor/node-editor/editor-form').expect(200).expect('Content-Type', /html/);
    assert.match(response.text, /node-input-name/);
    await helper.request().get('/api/editor/node-editor/missing').expect(404);
});

test('runtime property changes restart only the changed node and roll back failures', async () => {
    const state = { constructed: 0, closed: 0, values: [] };
    await helper.load(configurableNodes(state), [{ id: 'configurable', type: 'editor-configurable', value: 'old', wires: [] }]);
    const snapshot = await helper.request().get('/api/editor/snapshot').expect(200);
    await helper.request().post('/api/editor/deploy').send({
        baseRev: snapshot.body.rev,
        changes: [{ op: 'update-node', id: 'configurable', set: { value: 'new' } }],
    }).expect(200);
    assert.equal(state.constructed, 2);
    assert.equal(state.closed, 1);
    helper.getNode('configurable').receive({});
    assert.deepEqual(state.values, ['new']);
});

test('restarting an HTTP node does not leave duplicate routes', async () => {
    await helper.load((RED) => {
        RED.nodes.registerType('editor-http', function (config) {
            RED.httpNode.get('/editor-route', (req, res) => res.send(config.value));
        });
    }, [{ id: 'http', type: 'editor-http', value: 'old', wires: [] }]);
    await helper.request().get('/editor-route').expect(200, 'old');
    const snapshot = await helper.request().get('/api/editor/snapshot').expect(200);
    await helper.request().post('/api/editor/deploy').send({
        baseRev: snapshot.body.rev,
        changes: [{ op: 'update-node', id: 'http', set: { value: 'new' } }],
    }).expect(200);
    await helper.request().get('/editor-route').expect(200, 'new');
});

test('accepts Express 4 wildcard routes used by Node-RED nodes', async () => {
    await helper.load((RED) => {
        RED.nodes.registerType('editor-legacy-wildcard', function () {
            RED.httpNode.get('/debug/view/*', (req, res) => res.send(req.params[0]));
        });
    }, [{ id: 'legacy', type: 'editor-legacy-wildcard', wires: [] }]);
    await helper.request().get('/debug/view/a/b').expect(200, 'a/b');
});

test('failed partial deployment restores the previous node', async () => {
    const state = { constructed: 0, closed: 0, value: null };
    await helper.load((RED) => {
        RED.nodes.registerType('editor-failable', function (config) {
            state.constructed++;
            if (config.fail) throw new Error('editor deployment failed');
            state.value = config.value;
            this.on('close', () => { state.closed++; });
        });
    }, [{ id: 'failable', type: 'editor-failable', value: 'old', wires: [] }]);
    const original = helper.getNode('failable');
    const snapshot = await helper.request().get('/api/editor/snapshot').expect(200);
    await helper.request().post('/api/editor/deploy').send({
        baseRev: snapshot.body.rev,
        changes: [{ op: 'update-node', id: 'failable', set: { fail: true } }],
    }).expect(500);
    assert.equal(state.value, 'old');
    assert.notEqual(helper.getNode('failable'), undefined);
    assert.notEqual(helper.getNode('failable'), original);
});
