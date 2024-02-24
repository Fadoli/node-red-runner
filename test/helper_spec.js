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

describe('helper spec', function () {
    test('Multi start/stop', async function () {
        await helper.startServer();
        await helper.stopServer();
        await helper.stopServer();
        await helper.startServer();
        await helper.startServer();
        await helper.stopServer();
    });
});
