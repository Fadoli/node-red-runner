const clone = require('./utils/clone');
const Node = require('./node');
const log = require('./utils/log');
const registry = require('./registry');
const context = require('./context');
const crypto = require('crypto');
const express = require('express');

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
     * Import a module !
     * @param {function} module
     */
    async register(module) {
        return Promise.resolve(module(api));
    },
    /**
     * Clear known modules !
     */
    async clear() {
        await output.stop();
        context.clearContext();
        registry.cleanTypes();
    },
    async load(flows, credentials) {
        return Promise.all(
            flows.map(async (config) => {
                const node = new Node(config);
                if (!registry.knownTypes[config.type]) {
                    throw new Error("Unknown node type : " + config.type);
                }
                await registry.knownTypes[config.type].call(node, config)
                registry.flow[config.id] = node;
            })
        );
    },
    /**
     * Stops the flow and remove the nodes
     * @param {boolean} [isRemoval=true]
     * @return {Promise<>} 
     */
    async stop(isRemoval = true) {
        const promises = [];
        for (const nodeId in registry.flow) {
            const node = registry.flow[nodeId];
            promises.push(Promise.all(node.trigger("close", isRemoval)));
        }
        registry.cleanFlow();
        return Promise.all(promises);
    },
    async startServer(port = 1880) {
        if (server) {
            return;
        }
        api.httpNode = express();
        api.httpAdmin = api.httpNode;
        return new Promise((res, rej) => {
            server = api.httpNode.listen(port, (err) => {
                if (err) {
                    rej(err);
                } else {
                    res();
                }
            })
        })
    },
    async stopServer() {
        if (!server) {
            return;
        }
        return new Promise((res, rej) => {
            server.close((err) => {
                if (err) {
                    rej(err);
                } else {
                    res();
                }
            })
            server = undefined;
            api.httpNode = undefined;
            api.httpAdmin = undefined;
        });
    }
}

module.exports = output;