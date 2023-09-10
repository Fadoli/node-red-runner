const output = {
    knownTypes: {},
    flow: {},
    registerType(name, constructor) {
        output.knownTypes[name] = constructor;
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
    }
}

module.exports = output;