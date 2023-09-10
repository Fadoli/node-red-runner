let ctx = {};

function buildContextFor(id) {
    ctx[id] ??= {};
    const myCtx = ctx[id];
    return {
        get: (key) => {
            const value = myCtx[key];
            // console.log(`get ${key} = ${value}`);
            return value;
        },
        set: (key, value) => {
            // console.log(`Set ${value} into ${key}`);
            myCtx[key] = value;
        },
        keys: () => {
            const keys = Object.keys(myCtx);
            // console.log(`Keys ${keys}`);
            return keys;
        }
    };
}

function getContext(nodeId, flowId) {
    const output = {
        global: buildContextFor('global'),
        flow: buildContextFor(flowId),
        node: buildContextFor(nodeId),
    }
    output.keys = output.node.keys;
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
