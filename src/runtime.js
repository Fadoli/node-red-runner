const clone = require("./utils/node-red").cloneMessage;
const Node = require('./node');
const log = require('./utils/log');
const registry = require('./registry');
const context = require('./context');
const crypto = require('crypto');
const express = require('express');
const nrUtils = require('./utils/node-red');

const http = require("http");

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

const app = express()
api.httpAdmin = api.httpNode = app;
let serverPromise = undefined;
let server;

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
        if (!credentials) {
            credentials = {};
        }
        return Promise.all(
            flows.map((config) => {
                const node = new Node(config);
                if (!registry.knownTypes[config.type]) {
                    throw new Error("Unknown node type : " + config.type);
                } else {
                    registry.flow[config.id] = node;
                    node.credentials = credentials[config.id];
                    return registry.knownTypes[config.type].call(node, config);
                }
            })
        ).then(() => {
            for (const id in registry.flow) {
                const node = registry.getNode(id);
                node.start();
            }
        });
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
        if (serverPromise) {
            return serverPromise;
        }
        serverPromise = new Promise((resolve,reject) => {
            server = http.createServer(app);
            server.listen(port, (err) => {
                if (err) {
                    reject(err);
                    server = undefined;
                    serverPromise = undefined;
                } else {
                    resolve();
                }
            })
        })
        return serverPromise;
    },
    /**
     * @description Stops the web server
     * @return {Promise<>} 
     */
    stopServer() {
        if (!serverPromise) {
            return Promise.resolve();
        }
        return serverPromise.then(() => {
            if (server) {
                server.closeAllConnections();
                server.close();
                server = undefined;
            }
            serverPromise = undefined;
        });
    }
}

module.exports = output;