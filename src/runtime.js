const clone = require('./utils/clone');
const Node = require('./node');
const log = require('./utils/log');
const registry = require('./registry');
const context = require('./context');
const crypto = require('crypto');
const HyperExpress = require('hyper-express');

const api = {
    // i18n Not implemented
    _: () => {
        return "";
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
        evaluateNodeProperty: (...parameters) => {
            console.log(...parameters)
            log.warn('[RUNTIME] Missing evaluateNodeProperty in RED.util')
        },
        prepareJSONataExpression: () => {
            log.warn('[RUNTIME] Missing prepareJSONataExpression in RED.util')
        },
        evaluateJSONataExpression: () => {
            log.warn('[RUNTIME] Missing evaluateJSONataExpression in RED.util')
        },
        setMessageProperty: () => {
            log.warn('[RUNTIME] Missing setMessageProperty in RED.util')
        }
    },
    httpNode: undefined,
    httpAdmin: undefined,
    settings: {}
}

const server = new HyperExpress.Server()
api.httpAdmin = api.httpNode = server;
let isServerOpen = false;

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
    clear() {
        context.clearContext();
        registry.cleanTypes();
        return output.stop();
    },
    /**
     * @description Loads the flows
     * @param {*} flows
     * @param {*} credentials
     * @return {Promise<>} 
     */
    load(flows, credentials) {
        return Promise.all(
            flows.map((config) => {
                const node = new Node(config);
                if (!registry.knownTypes[config.type]) {
                    throw new Error("Unknown node type : " + config.type);
                } else {
                    registry.flow[config.id] = node;
                    return registry.knownTypes[config.type].call(node, config);
                }
            })
        );
    },
    /**
     * Stops the flow and remove the nodes
     * @param {boolean} [isRemoval=true]
     * @return {Promise<>} 
     */
    stop() {
        const promises = [];
        for (const nodeId in registry.flow) {
            const node = registry.flow[nodeId];
            promises.push(node.close(true));
        }
        registry.cleanFlow();
        return Promise.all(promises);
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
    }
}

module.exports = output;