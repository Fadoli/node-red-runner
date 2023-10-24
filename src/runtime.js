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
    nodes: {
        registerType: registry.registerType,
        createNode: (ctx, opts) => {
            // doesn't do anything
        },
    },
    library: {
        // Not implemented
        register: () => {

        }
    },
    util: {
        log: log,
        clone: clone,
        generateId: () => {
            return crypto.randomUUID();
        }
    },
    httpNode: undefined,
    httpAdmin: undefined,
}

let server = undefined;

const output = {
    /**
     * @description Import a module !
     * @param {function} module
     * @returns {Promise<>}
     */
    register(module) {
        return Promise.resolve(module(api));
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
                }
                registry.flow[config.id] = node;
                return registry.knownTypes[config.type].call(node, config);
            })
        );
    },
    /**
     * Stops the flow and remove the nodes
     * @param {boolean} [isRemoval=true]
     * @return {Promise<>} 
     */
    stop(isRemoval = true) {
        const promises = [];
        for (const nodeId in registry.flow) {
            const node = registry.flow[nodeId];
            promises.push(node.trigger("close", isRemoval));
        }
        registry.cleanFlow();
        return Promise.all(promises);
    },
    /**
     * @description Starts the web server
     * @param {number} [port=1880]
     * @return {Promise<>} 
     */
    startServer(port = 1880) {
        if (server) {
            return Promise.resolve();
        }
        server = new HyperExpress.Server()
        api.httpAdmin = api.httpNode = server;
        return server.listen(port);
    },
    /**
     * @description Stops the web server
     * @return {Promise<>} 
     */
    stopServer() {
        if (!server) {
            return Promise.resolve();
        }
        server.close()
        api.httpAdmin = api.httpNode = server = undefined;
        return Promise.resolve();
    }
}

module.exports = output;