import { expect, test, describe, beforeAll, beforeEach, afterAll, afterEach } from "bun:test";

const helper = require("../index.js");

describe('helper spec', async function () {

    test('Multi start/stop', async function () {
        await helper.startServer();
        await helper.stopServer();
        await helper.stopServer();
        await helper.startServer();
        await helper.startServer();
        await helper.stopServer();
    });
});
