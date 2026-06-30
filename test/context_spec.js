const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const path = require('node:path');

const helper = require('../index.js');
const context = require('../src/context');
const { readJSON } = require('../src/utils/fs');
const functionNode = require('./nodes/80-function.js');

const contextBaseDir = path.join(__dirname, '.tmp-context');
const contextFile = path.join(contextBaseDir, 'runtime-context.json');
const contextStoreDir = path.join(contextBaseDir, 'runtime-context');
const globalContextFile = path.join(contextStoreDir, 'global.json');
const flowContextFile = path.join(contextStoreDir, 'flow-1.json');
const nodeContextFile = path.join(contextStoreDir, 'flow-1', 'n1.json');

async function cleanupContextFiles() {
    await fs.rm(contextBaseDir, { recursive: true, force: true });
}

test('context persistence reloads on runtime startup', async (t) => {
    await cleanupContextFiles();
    helper.settings({
        contextStorage: {
            file: contextFile,
            saveInterval: 25,
            compressionThreshold: 1024 * 1024,
        },
    });

    await t.test('save a node context value', async () => {
        const flow = [
            { id: 'n1', z: 'flow-1', type: 'function', wires: [['n2']], func: "context.set('count', 42); return msg;" },
            { id: 'n2', z: 'flow-1', type: 'helper' },
        ];

        await helper.load(functionNode, flow);
        const n1 = helper.getNode('n1');
        const n2 = helper.getNode('n2');
        const received = helper.awaitNodeInput(n2);

        n1.receive({ payload: 'first-run' });
        await received;
        await fs.access(nodeContextFile).catch(async () => {
            await new Promise((resolve) => setTimeout(resolve, 60));
        });
        await helper.unload();
    });

    await t.test('reload persisted context on next load', async () => {
        const flow = [
            { id: 'n1', z: 'flow-1', type: 'function', wires: [['n2']], func: "msg.payload = context.get('count'); return msg;" },
            { id: 'n2', z: 'flow-1', type: 'helper' },
        ];

        await helper.load(functionNode, flow);
        const n1 = helper.getNode('n1');
        const n2 = helper.getNode('n2');
        const received = helper.awaitNodeInput(n2);

        n1.receive({ payload: 'second-run' });
        const msg = await received;
        assert.strictEqual(msg.payload, 42);
        assert.deepStrictEqual(await readJSON(globalContextFile), {});
        await helper.unload();
    });

    await t.test('writes split files per subcontext', async () => {
        const [globalContent, flowContent, nodeContent] = await Promise.all([
            fs.readFile(globalContextFile, 'utf8'),
            fs.readFile(flowContextFile, 'utf8'),
            fs.readFile(nodeContextFile, 'utf8'),
        ]);

        assert.deepStrictEqual(JSON.parse(globalContent), {});
        assert.deepStrictEqual(JSON.parse(flowContent), {});
        assert.deepStrictEqual(JSON.parse(nodeContent), { count: 42 });
    });

    helper.settings({});
    await cleanupContextFiles();
});

test('context persistence compresses files above the configured threshold', async () => {
    await cleanupContextFiles();
    helper.settings({
        contextStorage: {
            file: contextFile,
            saveInterval: 0,
            compressionThreshold: 64,
        },
    });

    const flow = [
        { id: 'n1', z: 'flow-1', type: 'function', wires: [['n2']], func: "context.set('blob', 'a'.repeat(512)); return msg;" },
        { id: 'n2', z: 'flow-1', type: 'helper' },
    ];

    await helper.load(functionNode, flow);
    const n1 = helper.getNode('n1');
    const n2 = helper.getNode('n2');
    const received = helper.awaitNodeInput(n2);

    n1.receive({ payload: 'compress-me' });
    await received;
    await helper.unload();

    const content = await fs.readFile(nodeContextFile);
    assert.strictEqual(content[0], 0x78);

    helper.settings({});
    await cleanupContextFiles();
});

test('removing context storage settings disables the previous store', async () => {
    await cleanupContextFiles();
    helper.settings({
        contextStorage: {
            file: contextFile,
            saveInterval: 0,
        },
    });

    const flow = [
        { id: 'n1', z: 'flow-1', type: 'function', wires: [['n2']], func: "context.set('value', 1); return msg;" },
        { id: 'n2', z: 'flow-1', type: 'helper' },
    ];

    await helper.load(functionNode, flow);
    await helper.unload();
    helper.settings({});
    await cleanupContextFiles();

    await helper.load(functionNode, flow);
    await helper.unload();

    await assert.rejects(fs.access(contextStoreDir), { code: 'ENOENT' });
    await cleanupContextFiles();
});

test('context IDs must be safe path segments', () => {
    assert.throws(
        () => context.getContext('n1', '../outside-flow'),
        /Invalid flow ID: expected a single path segment/,
    );
    assert.throws(
        () => context.getContext('../outside-node', 'flow-1'),
        /Invalid node ID: expected a single path segment/,
    );
});
