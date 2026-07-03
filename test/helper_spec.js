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
        await helper.startServer();
        await helper.stopServer();
        await helper.stopServer();
        await helper.startServer();
        await helper.startServer();
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
