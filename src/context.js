let ctx = {};

function buildContextFor(id) {
    ctx[id] ??= {};
    const myCtx = ctx[id];
    return {
        get: (key) => {
            myCtx[key];
        },
        set: (key, value) => {
            myCtx[key] = value;
        }
    };
}

function getContext(nodeId, flowId) {
    const output = {
        global: buildContextFor('global'),
        flow: buildContextFor(flowId),
        node: buildContextFor(nodeId),
    }
    output.get = output.node.get;
    output.set = output.node.set;
    return output;
}

module.exports = {
    getContext,
    clearContext: () => {
        ctx = {};
    }
};
