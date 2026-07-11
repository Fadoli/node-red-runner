const path = require('node:path');
const { Worker } = require('node:worker_threads');

const runsIndex = process.argv.indexOf('--runs');
const runs = runsIndex < 0 ? 10 : Number(process.argv[runsIndex + 1]);
if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer');
const messagesIndex = process.argv.indexOf('--messages');
const messages = messagesIndex < 0 ? 10000 : Number(process.argv[messagesIndex + 1]);
if (!Number.isInteger(messages) || messages < 1) throw new Error('--messages must be a positive integer');

const targets = ['runner', 'node-red'];
const run = (target) => new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, `${target}.js`), { workerData: { messages } });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
        if (code) reject(new Error(`${target}: worker exited with code ${code}`));
    });
});

(async () => {
    const results = [];
    for (const target of targets) {
        const samples = [];
        for (let index = 0; index < runs; index++) samples.push(await run(target));
        const average = (key) => samples.reduce((total, sample) => total + sample[key], 0) / samples.length;
        results.push({ target, runs, messages, startupMs: average('startupMs'), stopMs: average('stopMs'), flowMs: average('flowMs'), msgPerSec: messages / average('flowMs') * 1000, cpuMs: average('cpuMs'), rssMiB: average('rssMiB') });
    }
    const columns = ['target', 'runs', 'messages', 'startupMs', 'stopMs', 'flowMs', 'msgPerSec', 'cpuMs', 'rssMiB'];
    const format = (value, column) => typeof value === 'number' ? (column === 'runs' || column === 'messages' ? value : value.toFixed(2)) : value;
    console.log(`| ${columns.join(' | ')} |`);
    console.log(`| ${columns.map(() => '---').join(' | ')} |`);
    results.forEach((result) => console.log(`| ${columns.map((column) => format(result[column], column)).join(' | ')} |`));
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
