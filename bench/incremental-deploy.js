const { compileFlow, diffCompiled } = require('../src/compiler');

function makeFlow(size) {
    const flow = [];
    for (let index = 0; index < size; index++) {
        flow.push({ id: `node-${index}`, type: 'bench-node', x: index % 100 * 20, y: Math.floor(index / 100) * 20, wires: index + 1 < size ? [[`node-${index + 1}`]] : [[]] });
    }
    return flow;
}

function measure(size) {
    const knownTypes = { 'bench-node': {} };
    const flow = makeFlow(size);
    const start = process.hrtime.bigint();
    const before = compileFlow(flow, knownTypes);
    const changed = flow.map((node) => node.id === `node-${Math.floor(size / 2)}` ? { ...node, x: 999 } : node);
    const after = compileFlow(changed, knownTypes);
    const plan = diffCompiled(before, after);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    return { size, elapsedMs, restarted: plan.restarted.length, rewired: plan.rewired.length };
}

for (const size of [1000, 10000, 50000]) console.log(JSON.stringify(measure(size)));
