const { EventEmitter } = require('node:events');
const EMPTY_NODES = [];

const output = {
    events: new EventEmitter(),
    knownTypes: {},
    flow: {},
    eventNodeIndex: new Map(),
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
        output.eventNodeIndex = new Map();
    },
    getNode(id) {
        return output.flow[id];
    },
    getType(name) {
        return output.knownTypes[name];
    },
    getEventNodes(type, source) {
        const nodesByFlow = output.eventNodeIndex.get(type);
        const entry = nodesByFlow && nodesByFlow.get(source.z);
        if (!entry) return EMPTY_NODES;
        const { nodes } = entry;
        if (!entry.hasScoped) return nodes;

        const scoped = [];
        for (const node of nodes) {
            if (!node.scope || node.scope.length === 0 || node.scope.includes(source.id)) {
                scoped.push(node);
            }
        }
        return scoped;
    },
    rebuildEventNodeIndex() {
        const index = new Map();
        for (const id in output.flow) {
            const node = output.flow[id];
            if (node.type !== 'complete' && node.type !== 'catch' && node.type !== 'status') continue;
            let nodesByFlow = index.get(node.type);
            if (!nodesByFlow) index.set(node.type, nodesByFlow = new Map());
            let entry = nodesByFlow.get(node.z);
            if (!entry) nodesByFlow.set(node.z, entry = { nodes: [], hasScoped: false });
            entry.nodes.push(node);
            if (node.scope && node.scope.length > 0) entry.hasScoped = true;
        }
        output.eventNodeIndex = index;
    }
}

module.exports = output;
