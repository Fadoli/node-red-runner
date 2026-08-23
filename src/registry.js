const { EventEmitter } = require('node:events');

const output = {
    events: new EventEmitter(),
    knownTypes: {},
    typeMetadata: {},
    flow: {},
    registerType(name, constructor, options = {}) {
        const metadata = output.typeMetadata[name];
        if (metadata) options = { ...metadata, ...options, editor: { ...(metadata.editor || {}), ...(options.editor || {}) } };
        output.knownTypes[name] = { constructor, options };
    },
    setTypeMetadata(name, metadata) {
        output.typeMetadata[name] = metadata;
        if (output.knownTypes[name]) {
            const current = output.knownTypes[name].options || {};
            output.knownTypes[name].options = { ...metadata, ...current, editor: { ...(metadata.editor || {}), ...(current.editor || {}) } };
        }
    },
    unregisterType(name) {
        delete output.knownTypes[name];
    },
    cleanTypes() {
        output.knownTypes = {};
        output.typeMetadata = {};
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
