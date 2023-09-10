const clone = require('./utils/clone');
const Node = require('./node');
const log = require('./utils/log')

let knownTypes = {};
let flow = {};

const api = {
    _: () => {
        return "";
    },
    nodes: {
        registerType: (name, constructor) => {
            knownTypes[name] = constructor;
        },
        createNode: (ctx, opts) => {
            flow[opts.id] = ctx;
        }
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

module.exports = {
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
    clear() {
        knownTypes = {};
    },
    getNode(id) {
        return flow[id];
    },
    load(flows, credentials) {
        console.log(knownTypes);
        flows.forEach(config => {
            const node = new Node(config);
            knownTypes[config.type].call(node, config)
            flow[config.id] = node;
        });
    }
}