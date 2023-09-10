const clone = require('./utils/clone');
const Node = require('./node');
const log = require('./utils/log');
const registry = require('./registry');

const api = {
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
        register: () => {

        }
    },
    util: {
        log: log,
        clone: clone,
    },
}

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
}

module.exports = output;