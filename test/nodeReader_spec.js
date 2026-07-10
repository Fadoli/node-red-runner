const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const NodeReader = require('../src/nodeReader');

test('loads needed metadata entries and conservatively skips unused node files', () => {
    const modules = fs.mkdtempSync(path.join(os.tmpdir(), 'node-reader-'));
    const packageDir = path.join(modules, 'example');
    fs.mkdirSync(packageDir);
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({
        'node-red': { nodes: { example: 'node.js', unused: 'unused.js' } },
    }));
    fs.writeFileSync(path.join(packageDir, 'node.js'), 'module.exports = RED => { const register = RED.nodes.registerType.bind(RED.nodes); register("example", () => {}); };');
    fs.writeFileSync(path.join(packageDir, 'unused.js'), 'module.exports = RED => RED.nodes.registerType("unused", () => {});');

    const reader = new NodeReader(modules, true);
    reader.registerFlows([{ type: 'example' }]);
    const [register, unused] = reader.importModule('example');
    let registered;
    register({ nodes: { registerType: (name) => { registered = name; } } });

    assert.strictEqual(registered, 'example');
    assert.strictEqual(unused.toString(), '() => {}');
});
