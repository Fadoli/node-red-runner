const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const NodeReader = require('../src/nodeReader');
const registry = require('../src/registry');

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

test('parses editor metadata and defaults from a Node-RED HTML file', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'node-editor-'));
    const jsPath = path.join(directory, 'sample.js');
    fs.writeFileSync(jsPath, 'module.exports = RED => RED.nodes.registerType("sample", () => {});');
    fs.writeFileSync(path.join(directory, 'sample.html'), `<script type="text/html" data-template-name="sample">
        <input id="node-input-name">
        <script>RED.nodes.registerType("sample", { defaults: { name: { value: "hello" }, enabled: { value: false } }, color: "#abcdef", inputs: 2, outputs: 3, icon: "sample.svg", category: "function" });</script>
    </script>`);
    registry.cleanTypes();
    new NodeReader().importFile(jsPath);
    const metadata = registry.typeMetadata.sample;
    assert.strictEqual(metadata.inputs, 2);
    assert.strictEqual(metadata.outputs, 3);
    assert.strictEqual(metadata.color, '#abcdef');
    assert.strictEqual(metadata.icon, 'sample.svg');
    assert.strictEqual(metadata.category, 'function');
    assert.deepStrictEqual(metadata.editor.defaults, { name: 'hello', enabled: false });
});
