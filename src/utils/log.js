
const levels = {
    'trace': 10,
    'debug': 20,
    'info': 30,
    'warn': 40,
    'error': 50,
    'fatal': 60,
}
Object.freeze(levels);
const levelsEntries = {
    'trace': 'trace',
    'debug': 'debug',
    'info': 'info',
    'warn': 'warn',
    'error': 'error',
    'fatal': 'fatal',
}
Object.freeze(levelsEntries);

const logApi = {};
const keys = Object.keys(levels);
for (const key of keys) {
    logApi[key] = (...data) => log(key, ...data);
}
function log(level, ...data) {
    if (levels[level] < levels[output.logLevel]) {
        return;
    }

    const dateStr = (new Date()).toISOString().slice(0, 19).replace(/-/g, "/").replace("T", " ");
    output.logger(`${dateStr} [${level}] ${JSON.stringify}`);
};

const output = {
    levels: levelsEntries,
    logLevel: levelsEntries.info,
    logger: console.log,
    ...logApi
}

module.exports = output;
