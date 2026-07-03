const clone = require("./utils/node-red").cloneMessage;
const Node = require('./node');
const log = require('./utils/log');
const registry = require('./registry');
const context = require('./context');
const crypto = require('crypto');
const HyperExpress = require('hyper-express');

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
    },
    httpNode: undefined,
    httpAdmin: undefined,
    settings: {}
}

const server = new HyperExpress.Server()
api.httpAdmin = api.httpNode = server;
let isServerOpen = false;

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

const output = {
    /**
     * @description Import a module !
     * @param {function} moduleToImport
     * @returns {Promise<>}
     */
    register(moduleToImport) {
        return Promise.resolve(moduleToImport(api));
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
            if (!registry.knownTypes[config.type]) {
                throw new Error("Unknown node type : " + config.type);
            }
            if (ids[config.id]) {
                throw new Error("Duplicate node id : " + config.id);
            }
            ids[config.id] = true;
        });
        const phases = buildLoadPhases(flows);
        await context.start(api.settings.contextStorage);

        // Register every node first so getNode always resolves, then initialise dependencies first.
        flows.forEach((config) => {
            const node = registry.flow[config.id] = new Node(config);
            node.credentials = credentials[config.id];
        });
        for (const phase of phases) {
            await Promise.all(phase.map((config) => {
                return registry.knownTypes[config.type].call(registry.flow[config.id], config);
            }));
        }
        for (const id in registry.flow) {
            const node = registry.getNode(id);
            node.start();
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
            promises.push(node.close(true));
        }
        registry.cleanFlow();
        await Promise.all(promises);
        await context.saveNow();
    },
    /**
     * @description Starts the web server
     * @param {number} [port=1888]
     * @return {Promise<>} 
     */
    startServer(port = 1888) {
        if (isServerOpen) {
            return Promise.resolve();
        }
        isServerOpen = true;
        return server.listen(port);
    },
    /**
     * @description Stops the web server
     * @return {Promise<>} 
     */
    stopServer() {
        if (!isServerOpen) {
            return Promise.resolve();
        }
        isServerOpen = false;
        server.close()
        return Promise.resolve();
    },
    settings(newSettings) {
        api.settings = newSettings || {};
        return api.settings;
    },
    getSettings() {
        return api.settings;
    }
}

module.exports = output;
