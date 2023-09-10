import { expect, test, describe, beforeAll, beforeEach, afterAll, afterEach } from "bun:test";

console.log("TEST");

const helper = require("../index.js");
const commentNode = require("./nodes/90-comment.js");

console.log("TEST");

describe('comment Node', async function () {

    beforeAll(() => helper.startServer());
    afterAll(() => helper.stopServer());
    afterEach(() => helper.unload());

    test('should be loaded', async function () {
        console.log("TEST");
        var flow = [{ id: "n1", type: "comment", name: "comment" }];
        await helper.load(commentNode, flow);
        var n1 = helper.getNode("n1");
        expect(n1?.name).toBe('comment');
    });

});
