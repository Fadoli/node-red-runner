// import { expect, test, describe, beforeAll, beforeEach, afterAll, afterEach } from "bun:test";
let { describe, test, expect, beforeEach, afterEach, after: afterAll, before: beforeAll } = require("node:test");

// node wrapper
if (!expect) {
    const assert = require("node:assert");
    expect = (input) => {
        return {
            toBe: (something) => {
                assert.deepStrictEqual(input,something);
            }
        }
    }
}

const helper = require("../index.js");
const assert = require("node:assert");

describe('helper spec', function () {
    afterEach(() => helper.unload());

    test('Multi start/stop', async function () {
        await helper.startServer(0);
        await helper.stopServer();
        await helper.stopServer();
        await helper.startServer(0);
        await helper.startServer(0);
        await helper.stopServer();
    });

    test('loads referenced config nodes before their users', async function () {
        const loaded = [];
        const nodes = (RED) => {
            RED.nodes.registerType("backend-config", function () {
                loaded.push("backend");
                this.ready = true;
            });
            RED.nodes.registerType("server-config", function (config) {
                assert.strictEqual(RED.nodes.getNode(config.backend).ready, true);
                loaded.push("server");
                this.ready = true;
            });
            RED.nodes.registerType("consumer", function (config) {
                assert.strictEqual(RED.nodes.getNode(config.server).ready, true);
                loaded.push("consumer");
            });
        };
        const flow = [
            { id: "consumer", type: "consumer", server: "server", wires: [] },
            { id: "server", type: "server-config", backend: "backend" },
            { id: "backend", type: "backend-config" },
        ];

        await helper.load(nodes, flow);
        assert.deepStrictEqual(loaded, ["backend", "server", "consumer"]);
    });

    test('deduplicates nested config references', async function () {
        const loaded = [];
        const nodes = (RED) => {
            RED.nodes.registerType("config", function () {
                loaded.push("config");
                this.ready = true;
            });
            RED.nodes.registerType("consumer", function (config) {
                assert.strictEqual(RED.nodes.getNode(config.options.primary).ready, true);
                loaded.push("consumer");
            });
        };
        const flow = [
            {
                id: "consumer",
                type: "consumer",
                options: { primary: "server", fallbacks: ["server", { id: "server" }] },
                wires: [],
            },
            { id: "server", type: "config" },
        ];

        await helper.load(nodes, flow);
        assert.deepStrictEqual(loaded, ["config", "consumer"]);
    });

    test('waits for asynchronous dependency phases', async function () {
        let releaseBackend;
        let backendStarted = false;
        let consumerStarted = false;
        const backendReady = new Promise((resolve) => {
            releaseBackend = resolve;
        });
        const nodes = (RED) => {
            RED.nodes.registerType("config", function () {
                backendStarted = true;
                return backendReady.then(() => {
                    this.ready = true;
                });
            });
            RED.nodes.registerType("consumer", function (config) {
                assert.strictEqual(RED.nodes.getNode(config.server).ready, true);
                consumerStarted = true;
            });
        };
        const flow = [
            { id: "consumer", type: "consumer", server: "server", wires: [] },
            { id: "server", type: "config" },
        ];

        const loading = helper.load(nodes, flow);
        await new Promise(setImmediate);
        assert.strictEqual(backendStarted, true);
        assert.strictEqual(consumerStarted, false);
        releaseBackend();
        await loading;
        assert.strictEqual(consumerStarted, true);
    });

    test('does not treat wired node cycles as config cycles', async function () {
        let constructed = 0;
        const nodes = (RED) => {
            RED.nodes.registerType("regular", function () {
                constructed++;
            });
        };
        const flow = [
            { id: "first", type: "regular", peer: "second", wires: [["second"]] },
            { id: "second", type: "regular", peer: "first", wires: [["first"]] },
        ];

        await helper.load(nodes, flow);
        assert.strictEqual(constructed, 2);
    });

    test('passes send and done to input handlers', async function () {
        const errors = [];
        const nodes = (RED) => {
            RED.nodes.registerType("input-node", function () {
                this.on("input", (msg, send, done) => {
                    assert.strictEqual(send, this.send);
                    done(new Error(msg.payload));
                });
            });
        };

        await helper.load(nodes, [{ id: "input", type: "input-node", wires: [] }]);
        const node = helper.getNode("input");
        node.error = (err, msg) => errors.push([err.message, msg.payload]);
        await node.receive({ payload: "failed" });
        assert.deepStrictEqual(errors, [["failed", "failed"]]);
    });

    test('exposes declared credentials only', async function () {
        const nodes = (RED) => RED.nodes.registerType('secured', function () {}, {
            credentials: { username: { type: 'text' }, password: { type: 'password' } },
        });
        await helper.load(nodes, [{ id: 'secured', type: 'secured', wires: [] }], {
            secured: { username: 'alice', password: 'secret', ignored: 'nope' },
        });
        assert.deepStrictEqual(helper.getNode('secured').credentials, { username: 'alice', password: 'secret' });
    });

    test('routes done errors to scoped catch nodes', async function () {
        const nodes = (RED) => RED.nodes.registerType('source', function () {
            this.on('input', (msg, send, done) => done(new Error('broken')));
        });
        const flow = [
            { id: 'source', z: 'flow', type: 'source', wires: [] },
            { id: 'catch', z: 'flow', type: 'catch', scope: ['source'], wires: [] },
        ];
        await helper.load(nodes, flow);
        const caught = helper.awaitNodeInput('catch');
        helper.getNode('source').receive({ payload: 42 });
        const msg = await caught;
        assert.strictEqual(msg.payload, 42);
        assert.strictEqual(msg.error.message, 'broken');
        assert.strictEqual(msg.error.source.id, 'source');
    });

    test('routes successful done calls to scoped complete nodes once', async function () {
        const nodes = (RED) => RED.nodes.registerType('source', function () {
            this.on('input', (msg, send, done) => { done(); done(); });
        });
        const flow = [
            { id: 'source', z: 'flow', type: 'source', wires: [] },
            { id: 'complete', z: 'flow', type: 'complete', scope: ['source'], wires: [] },
        ];
        await helper.load(nodes, flow);
        let count = 0;
        helper.getNode('complete').on('input', () => count++);
        helper.getNode('source').receive({ payload: 42 });
        assert.strictEqual(count, 1);
    });

    test('provides an Express-compatible HTTP application', async function () {
        const nodes = (RED) => RED.nodes.registerType('http-user', function () {
            assert.strictEqual(typeof RED.httpNode.use, 'function');
            assert.strictEqual(typeof RED.httpNode.get, 'function');
        });
        await helper.load(nodes, [{ id: 'http', type: 'http-user', wires: [] }]);
    });

    test('waits for every close handler style', async function () {
        const closed = [];
        const nodes = (RED) => {
            RED.nodes.registerType("close-node", function () {
                this.on("close", () => {
                    closed.push("sync");
                });
                this.on("close", (done) => {
                    setImmediate(() => {
                        closed.push("callback");
                        done();
                    });
                });
                this.on("close", (removed, done) => {
                    assert.strictEqual(removed, true);
                    setImmediate(() => {
                        closed.push("removed");
                        done();
                    });
                });
                this.on("close", async () => {
                    await Promise.resolve();
                    closed.push("promise");
                });
            });
        };

        await helper.load(nodes, [{ id: "close", type: "close-node", wires: [] }]);
        await helper.unload();
        assert.deepStrictEqual(closed.sort(), ["callback", "promise", "removed", "sync"]);
    });

    test('rejects circular config node references', async function () {
        let constructed = 0;
        const nodes = (RED) => {
            RED.nodes.registerType("config", function () {
                constructed++;
            });
        };
        const flow = [
            { id: "first", type: "config", peer: "second" },
            { id: "second", type: "config", peer: "first" },
        ];

        await assert.rejects(helper.load(nodes, flow), /Circular config node references: first, second/);
        assert.strictEqual(constructed, 0);
    });
});
