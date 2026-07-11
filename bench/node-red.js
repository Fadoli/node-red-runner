const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { parentPort, workerData } = require('node:worker_threads');

const startedAt = process.hrtime.bigint();
const startedCpu = process.cpuUsage();
const RED = require('node-red');
const nodes = require('./nodes');
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-red-bench-'));

(async () => {
    const flowsStarted = new Promise((resolve) => RED.events.once('flows:started', resolve));
    RED.init(http.createServer(), {
        userDir,
        flowFile: path.join(__dirname, 'flow.json'),
        httpAdminRoot: false,
        httpNodeRoot: false,
        logging: { console: { level: 'off' } },
    });
    nodes(RED);
    await RED.start();
    await flowsStarted;
    const startupMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const cpu = process.cpuUsage(startedCpu);
    const memory = process.memoryUsage();
    const flowMs = await nodes.measure(RED.nodes.getNode('source'), workerData.messages);
    const stoppingAt = process.hrtime.bigint();
    await RED.stop();
    parentPort.postMessage({
        startupMs,
        stopMs: Number(process.hrtime.bigint() - stoppingAt) / 1e6,
        flowMs,
        cpuMs: (cpu.user + cpu.system) / 1000,
        rssMiB: memory.rss / 1024 / 1024,
    });
})().catch((error) => {
    throw error;
});
