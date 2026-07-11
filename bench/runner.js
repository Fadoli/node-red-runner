const fs = require('node:fs');
const path = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');

const startedAt = process.hrtime.bigint();
const startedCpu = process.cpuUsage();
const helper = require('../index');
const flow = JSON.parse(fs.readFileSync(path.join(__dirname, 'flow.json')));
const nodes = require('./nodes');

(async () => {
    await helper.load(nodes, helper.clearFlow(flow));
    const startupMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const cpu = process.cpuUsage(startedCpu);
    const memory = process.memoryUsage();
    const flowMs = await nodes.measure(helper.getNode('source'), workerData.messages);
    const stoppingAt = process.hrtime.bigint();
    await helper.unload();
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
