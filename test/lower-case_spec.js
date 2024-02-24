// import { expect, test, describe, beforeAll, beforeEach, afterAll, afterEach } from "bun:test";
let { describe, it: test, expect, beforeEach, afterEach, after: afterAll, before: beforeAll } = require("node:test");

const helper = require('../index.js');
const lowerNode = require('./nodes/lower-case.js');

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

describe('lower-case Node', async function () {

    afterEach(function () {
        return helper.unload();
    });

    test('should be loaded async', async function () {
        const flow = [{ id: "n1", type: "lower-case", name: "lower-case" }];
        await helper.load(lowerNode, flow);
        const n1 = helper.getNode("n1");
        expect(n1.name).toBe('lower-case');
    });

    test('should be loaded in exported flow', async function () {
        const flow = [{ "id": "3912a37a.c3818c", "type": "lower-case", "z": "e316ac4b.c85a2", "name": "lower-case", "x": 240, "y": 320, "wires": [[]] }];
        await helper.load(lowerNode, flow);
        const n1 = helper.getNode("3912a37a.c3818c");
        expect(n1.name).toBe('lower-case');
    });

    test('should make payload lower case', async function () {
        const flow = [
            { id: "n1", type: "lower-case", name: "test name", wires: [["n2"]] },
            { id: "n2", type: "helper" }
        ];
        await helper.load(lowerNode, flow);
        const n2 = helper.getNode("n2");
        const n1 = helper.getNode("n1");
        const promise = helper.awaitNodeInput(n2);
        n1.receive({ payload: "UpperCase" });
        const msg = await promise;
        expect(msg.payload).toBe('uppercase');
    });

    test('should modify the flow then lower case of payload', async function () {
        const flow = [
            { id: "n2", type: "helper" }
        ]
        await helper.load(lowerNode, flow);
        const newFlow = [...flow]
        newFlow.push({ id: "n1", type: "lower-case", name: "lower-case", wires: [['n2']] });
        await helper.setFlows(newFlow)
        const n2 = helper.getNode("n2");
        const n1 = helper.getNode("n1");
        const promise = helper.awaitNodeInput(n2);
        n1.receive({ payload: "HELLO" });
        const msg = await promise;
        expect(msg.payload).toBe('hello');
    });

    test('should recieve twice the payload !', async function () {
        const flow = [
            { id: "n1", type: "lower-case", name: "lower-case", wires: [['n2', 'n2']] },
            { id: "n2", type: "helper" }
        ];
        await helper.load(lowerNode, flow);
        const n1 = helper.getNode("n1");
        expect(n1.name).toBe('lower-case');
        const n2 = helper.getNode("n2");
        let count = 0;
        return new Promise((res,rej) => { 
            n2.on('input', (msg) => {
                try {
                    count++;
                    expect(msg).toBe({ payload: "uppercase !" });
                    if (count === 2) {
                        res();
                    }
                } catch (err) {
                    rej(err);
                }
            })
            n1.receive({ payload: 'UpPeRCaSE !' });
        })
    });
});