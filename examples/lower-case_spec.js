import { expect, test, describe, beforeAll, beforeEach, afterAll, afterEach } from "bun:test";

var helper = require("../index.js");
var lowerNode = require("./nodes/lower-case.js");

describe('lower-case Node', function () {

    afterEach(function () {
        return helper.unload();
    });

    test('should be loaded async', async function () {
        var flow = [{ id: "n1", type: "lower-case", name: "lower-case" }];
        await helper.load(lowerNode, flow);
        var n1 = helper.getNode("n1");
        expect(n1.name).toBe('lower-case');
    });

    test('should be loaded', function (done) {
        var flow = [{ id: "n1", type: "lower-case", name: "lower-case" }];
        helper.load(lowerNode, flow, function () {
            try {
                var n1 = helper.getNode("n1");
                expect(n1.name).toBe('lower-case');
                done();
            } catch (err) {
                done(err);
            }
        });
    });

    test('should be loaded in exported flow', function (done) {
        var flow = [{ "id": "3912a37a.c3818c", "type": "lower-case", "z": "e316ac4b.c85a2", "name": "lower-case", "x": 240, "y": 320, "wires": [[]] }];
        helper.load(lowerNode, flow, function () {
            try {
                var n1 = helper.getNode("3912a37a.c3818c");
                expect(n1.name).toBe('lower-case');
                done();
            } catch (err) {
                done(err);
            }
        });
    });

    test('should make payload lower case', function (done) {
        var flow = [
            { id: "n1", type: "lower-case", name: "test name", wires: [["n2"]] },
            { id: "n2", type: "helper" }
        ];
        helper.load(lowerNode, flow, function () {
            var n2 = helper.getNode("n2");
            var n1 = helper.getNode("n1");
            n2.on("input", function (msg) {
                try {
                    expect(msg.payload).toBe('uppercase');
                    done();
                } catch (err) {
                    done(err);
                }
            });
            n1.receive({ payload: "UpperCase" });
        });
    });
    test('should modify the flow then lower case of payload', async function () {
        const flow = [
            { id: "n2", type: "helper" }
        ]
        await helper.load(lowerNode, flow)

        const newFlow = [...flow]
        newFlow.push({ id: "n1", type: "lower-case", name: "lower-case", wires: [['n2']] },)
        await helper.setFlows(newFlow)
        const n1 = helper.getNode('n1')
        expect(n1.name).toBe('lower-case');
        await new Promise((resolve, reject) => {
            const n2 = helper.getNode('n2')
            n2.on('input', function (msg) {
                try {
                    expect(msg.payload).toBe('hello');
                    resolve()
                } catch (err) {
                    reject(err);
                }
            });
            n1.receive({ payload: 'HELLO' });
        });
    });
});
