const { EventEmitter } = require('node:events');

const output = {
    events: new EventEmitter(),
    knownTypes: {},
    flow: {},
    registerType(name, constructor, options = {}) {
        output.knownTypes[name] = { constructor, options };
    },
    unregisterType(name) {
        delete output.knownTypes[name];
    },
    cleanTypes() {
        output.knownTypes = {};
    },
    cleanFlow() {
        output.flow = {};
    },
    getNode(id) {
        return output.flow[id];
    },
    getType(name) {
        return output.knownTypes[name];
    },
    getEventNodes(type, source) {
        const nodes = [];
        for (const id in output.flow) {
            const node = output.flow[id];
            if (node.type === type && node.z === source.z &&
                (!node.scope || node.scope.length === 0 || node.scope.includes(source.id))) {
                nodes.push(node);
            }
        }
        return nodes;
    }
}

module.exports = output;
