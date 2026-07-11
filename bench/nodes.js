let remaining;
let finished;
const CHUNK_SIZE = 10000;

function benchmarkNodes(RED) {
    RED.nodes.registerType('benchmark-source', function (config) {
        RED.nodes.createNode(this, config);
        this.on('input', (msg) => this.send(msg));
    });
    RED.nodes.registerType('benchmark-sink', function (config) {
        RED.nodes.createNode(this, config);
        this.on('input', () => {
            if (--remaining === 0) finished();
        });
    });
}

benchmarkNodes.measure = async (source, count) => {
    const startedAt = process.hrtime.bigint();
    for (let offset = 0; offset < count; offset += CHUNK_SIZE) {
        const chunkSize = Math.min(CHUNK_SIZE, count - offset);
        remaining = chunkSize;
        const done = new Promise((resolve) => { finished = resolve; });
        for (let index = offset; index < offset + chunkSize; index++) source.receive({ payload: index });
        await done;
    }
    return Number(process.hrtime.bigint() - startedAt) / 1e6;
};

module.exports = benchmarkNodes;
