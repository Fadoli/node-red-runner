const fs = require('fs/promises');
const path = require('path');

const { readJSON, writeJSON } = require('./utils/fs');
const { COMPRESSION_THRESHOLD } = require('./utils/constant');

let ctx = {};
let ctx_build = {};
let nodeFlowMap = {};
let persistedContextPaths = {};
let isDirty = false;
let loadPromise = null;
let savePromise = Promise.resolve();
let dirtyContextIds = new Set();
let saveInFlight = false;
let saveRequested = false;
let saveTimer = null;

const defaultStorageOptions = {
    enabled: false,
    file: null,
    saveInterval: 30000,
    compressionThreshold: COMPRESSION_THRESHOLD,
    backup: true,
};

let storageOptions = { ...defaultStorageOptions };

function getStorageRoot() {
    if (!storageOptions.file) {
        return null;
    }

    const parsedPath = path.parse(storageOptions.file);
    if (parsedPath.ext) {
        return path.join(parsedPath.dir, parsedPath.name);
    }
    return storageOptions.file;
}

function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function ensureSafePathSegment(value, label) {
    const segment = String(value);
    if (
        !segment
        || segment === '.'
        || segment === '..'
        || segment.includes('/')
        || segment.includes('\\')
        || segment.includes('\0')
    ) {
        throw new Error(`Invalid ${label}: expected a single path segment`);
    }
    return segment;
}

function getContextFilePath(contextId) {
    const storageRoot = getStorageRoot();
    if (contextId === 'global') {
        return path.join(storageRoot, 'global.json');
    }

    const flowId = nodeFlowMap[contextId];
    if (flowId) {
        return path.join(storageRoot, flowId, `${contextId}.json`);
    }

    return path.join(storageRoot, `${contextId}.json`);
}

async function removeEmptyDirectories(dirPath, stopPath) {
    if (dirPath === stopPath || dirPath.length < stopPath.length) {
        return;
    }

    try {
        const entries = await fs.readdir(dirPath);
        if (entries.length > 0) {
            return;
        }
        await fs.rmdir(dirPath);
        await removeEmptyDirectories(path.dirname(dirPath), stopPath);
    } catch {
        // Ignore cleanup errors.
    }
}

function normalizeStorageOptions(options = {}) {
    const file = options.file || options.path || null;
    const saveInterval = Number.isFinite(options.saveInterval)
        ? Math.max(0, options.saveInterval)
        : defaultStorageOptions.saveInterval;
    const compressionThreshold = Number.isFinite(options.compressionThreshold)
        ? Math.max(0, options.compressionThreshold)
        : defaultStorageOptions.compressionThreshold;

    return {
        ...defaultStorageOptions,
        ...options,
        file,
        saveInterval,
        compressionThreshold,
        enabled: options.enabled ?? !!file,
    };
}

function markContextDirty(contextId) {
    dirtyContextIds.add(contextId);
    isDirty = true;
}

function collectKeys(source) {
    const keys = [];
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            keys.push(key);
        }
    }
    return keys;
}

function clearAutoSaveTimer() {
    if (saveTimer) {
        clearInterval(saveTimer);
        saveTimer = null;
    }
}

function startAutoSaveTimer() {
    clearAutoSaveTimer();
    if (!storageOptions.enabled || !storageOptions.file || storageOptions.saveInterval === 0) {
        return;
    }

    saveTimer = setInterval(() => {
        saveNow().catch(() => {
            // Persistence errors should not crash the runtime timer.
        });
    }, storageOptions.saveInterval);

    if (typeof saveTimer.unref === 'function') {
        saveTimer.unref();
    }
}

async function loadFromDisk() {
    if (!storageOptions.enabled || !storageOptions.file) {
        return;
    }

    try {
        const storageRoot = getStorageRoot();
        const loadedContext = {};
        const loadedNodeFlowMap = {};
        const loadedPersistedContextPaths = {};

        const rootEntries = await fs.readdir(storageRoot, { withFileTypes: true });
        for (const entry of rootEntries) {
            const entryPath = path.join(storageRoot, entry.name);
            if (entry.isFile() && entry.name.endsWith('.json')) {
                const contextId = path.basename(entry.name, '.json');
                loadedContext[contextId] = await readJSON(entryPath);
                loadedPersistedContextPaths[contextId] = entryPath;
                continue;
            }

            if (!entry.isDirectory()) {
                continue;
            }

            const flowId = entry.name;
            const flowEntries = await fs.readdir(entryPath, { withFileTypes: true });
            for (const flowEntry of flowEntries) {
                if (!flowEntry.isFile() || !flowEntry.name.endsWith('.json')) {
                    continue;
                }

                const nodeId = path.basename(flowEntry.name, '.json');
                const nodePath = path.join(entryPath, flowEntry.name);
                loadedContext[nodeId] = await readJSON(nodePath);
                loadedNodeFlowMap[nodeId] = flowId;
                loadedPersistedContextPaths[nodeId] = nodePath;
            }
        }

        ctx = loadedContext;
        ctx_build = {};
        nodeFlowMap = loadedNodeFlowMap;
        persistedContextPaths = loadedPersistedContextPaths;
        dirtyContextIds = new Set();
        isDirty = false;
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }
        ctx = {};
        ctx_build = {};
        nodeFlowMap = {};
        persistedContextPaths = {};
        isDirty = false;
        dirtyContextIds = new Set();
    }
}

function ensureLoaded() {
    if (!loadPromise) {
        loadPromise = loadFromDisk();
    }
    return loadPromise;
}

function snapshotDirtyContextIds() {
    const dirtyIds = [];
    dirtyContextIds.forEach((contextId) => {
        dirtyIds.push(contextId);
    });
    return dirtyIds;
}

async function saveContextFile(contextId, storageRoot) {
    const nextPath = getContextFilePath(contextId);
    const previousPath = persistedContextPaths[contextId];

    if (previousPath && previousPath !== nextPath) {
        await fs.unlink(previousPath).catch(() => {});
        await removeEmptyDirectories(path.dirname(previousPath), storageRoot);
    }

    await fs.mkdir(path.dirname(nextPath), { recursive: true });
    await writeJSON(nextPath, cloneValue(ctx[contextId]), {
        backup: storageOptions.backup,
        compressionThreshold: storageOptions.compressionThreshold,
    });
    persistedContextPaths[contextId] = nextPath;
}

async function flushDirtyContexts() {
    const storageRoot = getStorageRoot();

    while (dirtyContextIds.size > 0) {
        const dirtyIds = snapshotDirtyContextIds();
        dirtyContextIds = new Set();

        try {
            for (let index = 0; index < dirtyIds.length; index += 1) {
                const contextId = dirtyIds[index];
                if (!Object.prototype.hasOwnProperty.call(ctx, contextId)) {
                    continue;
                }
                await saveContextFile(contextId, storageRoot);
            }
        } catch (err) {
            for (let index = 0; index < dirtyIds.length; index += 1) {
                dirtyContextIds.add(dirtyIds[index]);
            }
            isDirty = true;
            throw err;
        }
    }

    isDirty = dirtyContextIds.size > 0;
}

async function saveNow() {
    if (!storageOptions.enabled || !storageOptions.file || !isDirty) {
        return savePromise;
    }

    if (saveInFlight) {
        saveRequested = true;
        return savePromise;
    }

    saveInFlight = true;
    saveRequested = false;
    savePromise = (async () => {
        try {
            await fs.mkdir(getStorageRoot(), { recursive: true });
            do {
                saveRequested = false;
                await flushDirtyContexts();
            } while (saveRequested || dirtyContextIds.size > 0);
        } catch (err) {
            isDirty = dirtyContextIds.size > 0;
            throw err;
        } finally {
            saveInFlight = false;
        }
    })();

    return savePromise;
}

async function configure(options = {}) {
    const previousStorageOptions = storageOptions;
    const nextStorageOptions = normalizeStorageOptions(options);
    const isSameFile = previousStorageOptions.file && previousStorageOptions.file === nextStorageOptions.file;

    clearAutoSaveTimer();
    if (previousStorageOptions.enabled && previousStorageOptions.file && (!nextStorageOptions.enabled || !isSameFile)) {
        await saveNow();
    }

    storageOptions = nextStorageOptions;

    if (!storageOptions.enabled || !storageOptions.file) {
        loadPromise = null;
        return;
    }

    if (!isSameFile || !loadPromise) {
        loadPromise = null;
        await ensureLoaded();
    }
    startAutoSaveTimer();
}

function buildContextFor(id) {
    if (!Object.prototype.hasOwnProperty.call(ctx, id)) {
        ctx[id] = {};
        markContextDirty(id);
    }
    if (!ctx_build[id]) {
        const myCtx = ctx[id];
        ctx_build[id] = {
            get: (key) => {
                const value = myCtx[key];
                // console.log(`get ${key} = ${value}`);
                return value;
            },
            set: (key, value) => {
                // console.log(`Set ${value} into ${key}`);
                if (value === undefined) {
                    delete myCtx[key];
                } else {
                    myCtx[key] = value;
                }
                markContextDirty(id);
            },
            keys: () => {
                const keys = collectKeys(myCtx);
                // console.log(`Keys ${keys}`);
                return keys;
            }
        };
    }
    return ctx_build[id];
}

function getContext(nodeId, flowId, parentFlowId) {
    ensureSafePathSegment(nodeId, 'node ID');
    if (flowId) {
        ensureSafePathSegment(flowId, 'flow ID');
    }

    if (flowId) {
        if (nodeFlowMap[nodeId] !== flowId) {
            nodeFlowMap[nodeId] = flowId;
            if (Object.prototype.hasOwnProperty.call(ctx, nodeId)) {
                markContextDirty(nodeId);
            }
        }
    }

    let flowContext = buildContextFor(flowId);
    if (parentFlowId) {
        const own = flowContext;
        const parent = buildContextFor(parentFlowId);
        flowContext = {
            get: (key) => key.startsWith('$parent.') ? parent.get(key.substring(8)) : own.get(key),
            set: (key, value) => key.startsWith('$parent.') ? parent.set(key.substring(8), value) : own.set(key, value),
            keys: own.keys,
        };
    }
    const output = {
        global: buildContextFor('global'),
        flow: flowContext,
        node: buildContextFor(nodeId),
    }
    output.keys = output.node.keys;
    output.get = output.node.get;
    output.set = output.node.set;
    return output;
}

module.exports = {
    configure,
    getContext,
    saveNow,
    start: async (options) => {
        await configure(options || {});
    },
    stop: async () => {
        clearAutoSaveTimer();
        await saveNow();
    },
    clearContext: () => {
        clearAutoSaveTimer();
        ctx = {};
        ctx_build = {};
        nodeFlowMap = {};
        persistedContextPaths = {};
        isDirty = false;
        dirtyContextIds = new Set();
        loadPromise = null;
        savePromise = Promise.resolve();
        saveInFlight = false;
        saveRequested = false;
    }
};
