const clone = require("./utils/node-red").cloneMessage;
const Node = require('./node');
const log = require('./utils/log');
const registry = require('./registry');
const context = require('./context');
const crypto = require('crypto');
const http = require('http');
const { EventEmitter } = require('node:events');

const nrUtils = require('./utils/node-red');

const api = {
    // i18n Not implemented
    _: (...stuff) => {
        return stuff;
    },
    auth: {
        needsPermission: (access) => {
            log.warn('[RUNTIME] Missing needsPermission in RED.auth')
            return (req,res,next) => {
                next();
            }
        } 
    },
    log: {
        ...log,
        addHandler: () => {
            log.warn('[RUNTIME] Missing addHandler in RED.log')
        }
    },
    nodes: {
        registerType: registry.registerType,
        createNode: (ctx, opts) => {
            // doesn't do anything
        },
        getNode: registry.getNode,
    },
    library: {
        // Not implemented
        register: () => {

        }
    },
    util: {
        log: log,
        clone: clone,
        cloneMessage: clone,
        generateId: () => {
            return crypto.randomUUID();
        },
        // Imported from NR
        encodeObject: nrUtils.encodeObject,
        ensureString: nrUtils.ensureString,
        ensureBuffer: nrUtils.ensureBuffer,
        compareObjects: nrUtils.compareObjects,
        getMessageProperty: nrUtils.getMessageProperty,
        setMessageProperty: nrUtils.setMessageProperty,
        getObjectProperty: nrUtils.getObjectProperty,
        setObjectProperty: nrUtils.setObjectProperty,
        evaluateNodeProperty: nrUtils.evaluateNodeProperty,
        normalisePropertyExpression: nrUtils.normalisePropertyExpression,
        normaliseNodeTypeName: nrUtils.normaliseNodeTypeName,
        prepareJSONataExpression: nrUtils.prepareJSONataExpression,
        evaluateJSONataExpression: nrUtils.evaluateJSONataExpression,
        parseContextStore: nrUtils.parseContextStore,
        getSetting: nrUtils.getSetting,
    },
    httpNode: undefined,
    httpAdmin: undefined,
    settings: {}
}

let app;
function getApp() {
    if (!app) {
        app = require('express')();
        // Node-RED's HTTP nodes still use Express 4's private router name.
        Object.defineProperty(app, '_router', { get: () => app.router });
    }
    return app;
}
Object.defineProperties(api, {
    httpAdmin: { get: getApp },
    httpNode: { get: getApp },
});
let server;
let deploymentPromise = Promise.resolve();
const httpRoutesByNode = new Map();

function routerStack() {
    const router = getApp().router;
    return router && Array.isArray(router.stack) ? router.stack : [];
}

function captureHttpRoutes(nodeId, before) {
    const after = routerStack();
    const added = [];
    for (const layer of after) if (!before.includes(layer)) added.push(layer);
    if (added.length) httpRoutesByNode.set(nodeId, added);
}

function removeHttpRoutes(nodeId) {
    const routes = httpRoutesByNode.get(nodeId);
    if (!routes) return;
    const stack = routerStack();
    for (let index = stack.length - 1; index >= 0; index--) {
        if (routes.includes(stack[index])) stack.splice(index, 1);
    }
    httpRoutesByNode.delete(nodeId);
}

registry.events.on('status', (value) => output.events.emit('status', value));

function findConfigReferences(value, configIds, references, referenced) {
    if (typeof value === 'string') {
        if (configIds[value] && !referenced[value]) {
            referenced[value] = true;
            references.push(value);
        }
    } else if (Array.isArray(value)) {
        value.forEach((item) => findConfigReferences(item, configIds, references, referenced));
    } else if (value && typeof value === 'object') {
        for (const key in value) {
            findConfigReferences(value[key], configIds, references, referenced);
        }
    }
}

function buildLoadPhases(flows) {
    const configIds = {};
    const nodeById = {};
    const nodeDependsOn = {};
    const nodeDependedOn = {};
    const nodeResolved = {};
    const remainingDependencies = {};

    flows.forEach((config) => {
        nodeById[config.id] = config;
        nodeDependsOn[config.id] = [];
        nodeDependedOn[config.id] = [];
        if (config.wires === undefined) {
            configIds[config.id] = true;
        }
    });

    flows.forEach((config) => {
        const references = [];
        const referenced = {};
        for (const key in config) {
            if (key !== 'id' && key !== 'type' && key !== 'z' && key !== 'g' && key !== 'wires') {
                findConfigReferences(config[key], configIds, references, referenced);
            }
        }
        references.forEach((dependencyId) => {
            if (dependencyId !== config.id) {
                nodeDependsOn[config.id].push(dependencyId);
                nodeDependedOn[dependencyId].push(config.id);
            }
        });
        remainingDependencies[config.id] = nodeDependsOn[config.id].length;
    });

    const phases = [];
    let phase = [];
    flows.forEach((config) => {
        if (remainingDependencies[config.id] === 0) {
            phase.push(config);
        }
    });

    let loadedCount = 0;
    while (phase.length) {
        phases.push(phase);
        loadedCount += phase.length;
        const nextPhase = [];
        phase.forEach((config) => {
            nodeResolved[config.id] = true;
        });
        phase.forEach((config) => {
            nodeDependedOn[config.id].forEach((dependentId) => {
                remainingDependencies[dependentId]--;
                if (remainingDependencies[dependentId] === 0) {
                    nextPhase.push(nodeById[dependentId]);
                }
            });
        });
        phase = nextPhase;
    }

    if (loadedCount !== flows.length) {
        const circularIds = [];
        flows.forEach((config) => {
            if (!nodeResolved[config.id]) {
                circularIds.push(config.id);
            }
        });
        throw new Error(`Circular config node references: ${circularIds.join(', ')}`);
    }
    return phases;
}

function resolveEnvironment(config, credentials) {
    if (!config._env) return;
    const instanceCredentials = credentials[config._envCredentialInstance] || {};
    const templateCredentials = credentials[config._envCredentialTemplate] || {};
    // Expansion leaves credential markers because credentials are only available here.
    const env = {};
    for (const name in config._env) {
        const value = config._env[name];
        if (value && value.__subflowCredential) {
            env[name] = instanceCredentials[name] !== undefined ? instanceCredentials[name] : templateCredentials[name];
        } else {
            env[name] = value;
        }
    }
    config._env = env;
}

const output = {
    events: new EventEmitter(),
    _configs: new Map(),
    _credentials: {},
    /**
     * @description Import a module !
     * @param {function} moduleToImport
     */
    register(moduleToImport) {
        return moduleToImport(api);
    },
    /**
     * @description Clear known modules !
     * @returns {Promise<>}
     */
    async clear() {
        await output.stop();
        await context.stop();
        context.clearContext();
        registry.cleanTypes();
    },
    /**
     * @description Loads the flows
     * @param {*} flows
     * @param {*} credentials
     * @return {Promise<>} 
     */
    async load(flows, credentials) {
        if (!credentials) {
            credentials = {};
        }
        const ids = {};
        flows.forEach((config) => {
            if (!registry.getType(config.type)) {
                throw new Error("Unknown node type : " + config.type);
            }
            if (ids[config.id]) {
                throw new Error("Duplicate node id : " + config.id);
            }
            ids[config.id] = true;
        });
        const phases = buildLoadPhases(flows);
        await context.start(api.settings.contextStorage);

        try {
            // Register every node first so getNode always resolves, then initialise dependencies first.
            flows.forEach((config) => {
                resolveEnvironment(config, credentials);
                const node = registry.flow[config.id] = new Node(config);
                const definition = registry.getType(config.type).options.credentials || {};
                const supplied = credentials[config._credentialId || config.id] || {};
                node.credentials = {};
                for (const name in definition) {
                    if (supplied[name] !== undefined) node.credentials[name] = supplied[name];
                }
            });
            for (const phase of phases) {
                const pending = [];
                phase.forEach((config) => {
                    const beforeRoutes = routerStack().slice();
                    const result = registry.getType(config.type).constructor.call(registry.flow[config.id], config);
                    if (result && typeof result.then === 'function') {
                        pending.push(result.then(() => captureHttpRoutes(config.id, beforeRoutes)));
                    } else {
                        captureHttpRoutes(config.id, beforeRoutes);
                    }
                });
                if (pending.length) {
                    await Promise.all(pending);
                }
            }
            for (const id in registry.flow) registry.getNode(id).start();
            output._configs = new Map(flows.map((config) => [config.id, clone(config)]));
            output._credentials = clone(credentials);
            output.events.emit('loaded', { count: flows.length });
        } catch (error) {
            // Loading is transactional: close everything created so a retry starts clean.
            const pending = [];
            for (const id in registry.flow) {
                try {
                    const result = registry.flow[id].close(true);
                    if (result && typeof result.then === 'function') pending.push(result);
                } catch (_) {
                    // Preserve the startup error.
                }
            }
            registry.cleanFlow();
            if (pending.length) await Promise.allSettled(pending);
            context.clearContext();
            throw error;
        }
    },
    /**
     * Stops the flow and remove the nodes
     * @param {boolean} [isRemoval=true]
     * @return {Promise<>} 
     */
    async stop() {
        const promises = [];
        for (const nodeId in registry.flow) {
            const node = registry.flow[nodeId];
            removeHttpRoutes(nodeId);
            const result = node.close(true);
            if (result && typeof result.then === 'function') {
                promises.push(result);
            }
        }
        registry.cleanFlow();
        output._configs = new Map();
        output._credentials = {};
        if (promises.length) {
            await Promise.all(promises);
        }
        await context.saveNow();
    },
    /**
     * Apply a compiler diff while retaining unaffected node instances.
     * The operation is serialized because the registry and context are process-global.
     */
    async apply(flows, credentials, plan) {
        const run = async () => {
            const nextConfigs = new Map(flows.map((config) => [config.id, config]));
            const oldConfigs = output._configs;
            const oldCredentials = output._credentials;
            const restart = new Set(plan.restarted || []);
            const removed = new Set(plan.removed || []);
            const affected = new Set(restart);
            for (const id of removed) affected.add(id);
            const oldPhases = buildLoadPhases([...oldConfigs.values()]);
            const newPhases = buildLoadPhases(flows);
            const closed = [];
            const staged = [];
            const stagedConfigs = new Map();

            const closeIds = [];
            for (let phaseIndex = oldPhases.length - 1; phaseIndex >= 0; phaseIndex--) {
                const phase = oldPhases[phaseIndex];
                for (let index = phase.length - 1; index >= 0; index--) {
                    if (affected.has(phase[index].id)) closeIds.push(phase[index].id);
                }
            }

            try {
                for (const id of closeIds) {
                    const node = registry.flow[id];
                    if (!node) continue;
                    closed.push(id);
                    removeHttpRoutes(id);
                    await node.close(removed.has(id));
                    delete registry.flow[id];
                }

                // Register replacements before constructors so config references resolve.
                for (const id of restart) {
                    const config = nextConfigs.get(id);
                    if (!config) continue;
                    const prepared = clone(config);
                    resolveEnvironment(prepared, credentials || {});
                    const node = registry.flow[id] = new Node(prepared);
                    const definition = registry.getType(prepared.type).options.credentials || {};
                    const supplied = (credentials || {})[prepared._credentialId || prepared.id] || {};
                    node.credentials = {};
                    for (const name in definition) {
                        if (supplied[name] !== undefined) node.credentials[name] = supplied[name];
                    }
                    staged.push(id);
                    stagedConfigs.set(id, prepared);
                }

                for (const phase of newPhases) {
                    const pending = [];
                    for (const config of phase) {
                        if (!restart.has(config.id)) continue;
                        const beforeRoutes = routerStack().slice();
                        const result = registry.getType(config.type).constructor.call(registry.flow[config.id], stagedConfigs.get(config.id));
                        if (result && typeof result.then === 'function') pending.push(result.then(() => captureHttpRoutes(config.id, beforeRoutes)));
                        else captureHttpRoutes(config.id, beforeRoutes);
                    }
                    if (pending.length) await Promise.all(pending);
                }
                for (const id of staged) registry.flow[id].start();
                for (const id of plan.rewired || []) {
                    if (registry.flow[id]) registry.flow[id].updateWires();
                }

                output._configs = new Map([...nextConfigs].map(([id, config]) => [id, clone(config)]));
                output._credentials = clone(credentials || {});
                const result = { ...plan, restarted: [...restart], removed: [...removed] };
                output.events.emit('deployed', result);
                await context.saveNow();
                return result;
            } catch (error) {
                // Close any partially created replacement nodes and restore the previous set.
                for (let index = staged.length - 1; index >= 0; index--) {
                    const id = staged[index];
                    if (registry.flow[id]) {
                        removeHttpRoutes(id);
                        try { await registry.flow[id].close(true); } catch (_) { /* preserve original error */ }
                        delete registry.flow[id];
                    }
                }
                const restoreIds = new Set(closed);
                const restoreConfigs = [...oldConfigs.values()];
                const restorePrepared = new Map();
                for (const config of restoreConfigs) {
                    if (!restoreIds.has(config.id)) continue;
                    const prepared = clone(config);
                    resolveEnvironment(prepared, oldCredentials);
                    registry.flow[config.id] = new Node(prepared);
                    restorePrepared.set(config.id, prepared);
                    const definition = registry.getType(prepared.type).options.credentials || {};
                    const supplied = oldCredentials[prepared._credentialId || prepared.id] || {};
                    registry.flow[config.id].credentials = {};
                    for (const name in definition) {
                        if (supplied[name] !== undefined) registry.flow[config.id].credentials[name] = supplied[name];
                    }
                }
                try {
                    for (const phase of oldPhases) {
                        const pending = [];
                        for (const config of phase) {
                            if (!restoreIds.has(config.id)) continue;
                            const beforeRoutes = routerStack().slice();
                            const result = registry.getType(config.type).constructor.call(registry.flow[config.id], restorePrepared.get(config.id));
                            if (result && typeof result.then === 'function') pending.push(result.then(() => captureHttpRoutes(config.id, beforeRoutes)));
                            else captureHttpRoutes(config.id, beforeRoutes);
                        }
                        if (pending.length) await Promise.all(pending);
                    }
                    for (const id of restoreIds) registry.flow[id].start();
                    for (const id in registry.flow) registry.flow[id].updateWires();
                } catch (_) {
                    // The original deployment error remains the useful failure signal.
                }
                output._configs = oldConfigs;
                output._credentials = oldCredentials;
                throw error;
            }
        };
        const pending = deploymentPromise.then(run, run);
        deploymentPromise = pending.catch(() => {});
        return pending;
    },
    /**
     * @description Starts the web server
     * @param {number} [port=1888]
     * @return {Promise<>} 
     */
    startServer(port = 1888) {
        if (server) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            server = http.createServer(getApp());
            server.once('error', (err) => {
                server = undefined;
                reject(err);
            });
            server.listen(port, api.settings.host || '127.0.0.1', resolve);
        });
    },
    /**
     * @description Stops the web server
     * @return {Promise<>} 
     */
    stopServer() {
        if (!server) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            const activeServer = server;
            server = undefined;
            activeServer.close((err) => err ? reject(err) : resolve());
        });
    },
    settings(newSettings) {
        api.settings = newSettings || {};
        return api.settings;
    },
    getSettings() {
        return api.settings;
    },
    getApp() {
        return getApp();
    },
    getServerAddress() {
        return server && server.address();
    },
    getLog() {
        return log;
    }
}

module.exports = output;
