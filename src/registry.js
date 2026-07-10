const output = {
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
        return Object.values(output.flow).filter((node) =>
            node.type === type && node.z === source.z &&
            (!node.scope || node.scope.length === 0 || node.scope.includes(source.id))
        );
    }
}

module.exports = output;
