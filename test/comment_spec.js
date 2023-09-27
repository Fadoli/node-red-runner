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
const commentNode = require("./nodes/90-comment.js");

describe('comment Node', function () {
    beforeAll(() => helper.startServer());
    afterAll(() => helper.stopServer());
    // afterEach(() => helper.unload());

    test('should be loaded async', async function () {
        var flow = [{ id: "n1", type: "comment", name: "comment" }];
        await helper.load(commentNode, flow);
        var n1 = helper.getNode("n1");
        expect(n1?.name).toBe('comment');
    });
    
    test('should be loaded async and is in the runtime', async function () {
        var flow = [{ id: "n1", type: "comment", name: "comment" }];
        await helper.load(commentNode, flow);
        var n1 = helper.getNode("n1");
        let promise = helper.awaitNodeInput(n1);
        n1.receive({ payload: 1 });
        expect((await promise).payload).toBe(1);
    });
});
