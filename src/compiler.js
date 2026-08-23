const { isDeepStrictEqual } = require('node:util');
const copy = require('fast-copy').copy;
const expandSubflows = require('./subflow');

// Fields owned by the editor. They must not cause a node restart.
const EDITOR_ONLY_FIELDS = new Set(['x', 'y', 'l', 'wires']);

function clearFlow(flow) {
    const disabledFlows = {};
    const enabledIds = {};
    const output = [];

    for (const original of flow || []) {
        const node = copy(original);
        if (node.type === 'tab') {
            disabledFlows[node.id] = !!node.disabled;
            continue;
        }
        if (node.z && disabledFlows[node.z]) continue;
        if (node.d || node.disabled) continue;
        enabledIds[node.id] = true;
        output.push(node);
    }

    for (const node of output) {
        if (!node.wires) continue;
        for (let outputIndex = 0; outputIndex < node.wires.length; outputIndex++) {
            const wires = node.wires[outputIndex];
            node.wires[outputIndex] = wires.filter((id) => !!enabledIds[id]);
        }
    }
    return output;
}

function findConfigReferences(value, configIds, references, seen) {
    if (typeof value === 'string') {
        if (configIds[value] && !seen[value]) {
            seen[value] = true;
            references.push(value);
        }
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) findConfigReferences(item, configIds, references, seen);
        return;
    }
    if (!value || typeof value !== 'object') return;
    for (const key in value) findConfigReferences(value[key], configIds, references, seen);
}

function dependencyIndex(nodes) {
    const configIds = {};
    const configDependencies = {};
    const configDependents = {};
    const nodesById = new Map();

    for (const node of nodes) {
        nodesById.set(node.id, node);
        configDependencies[node.id] = [];
        configDependents[node.id] = [];
        if (node.wires === undefined) configIds[node.id] = true;
    }
    for (const node of nodes) {
        const references = [];
        findConfigReferences(node, configIds, references, {});
        for (const dependencyId of references) {
            if (dependencyId === node.id) continue;
            configDependencies[node.id].push(dependencyId);
            configDependents[dependencyId].push(node.id);
        }
    }
    return { nodesById, configDependencies, configDependents };
}

function validateWires(nodesById, nodes) {
    const incomingWires = {};
    const diagnostics = [];
    for (const node of nodes) {
        if (!node.wires) continue;
        for (let output = 0; output < node.wires.length; output++) {
            for (const targetId of node.wires[output] || []) {
                if (!nodesById.has(targetId)) {
                    diagnostics.push({ code: 'unknown-wire-target', id: node.id, target: targetId, output });
                    continue;
                }
                (incomingWires[targetId] ||= []).push(node.id);
            }
        }
    }
    return { incomingWires, diagnostics };
}

function runtimeConfig(node) {
    const result = {};
    for (const key in node) {
        if (!EDITOR_ONLY_FIELDS.has(key)) result[key] = node[key];
    }
    return result;
}

function compileFlow(flow, knownTypes) {
    const sourceIds = new Set((flow || []).map((node) => node.id));
    // Expand before removing tabs: subflow environment resolution needs tab env.
    const expanded = clearFlow(expandSubflows(copy(flow || [])));
    const { nodesById, configDependencies, configDependents } = dependencyIndex(expanded);
    const diagnostics = [];

    for (const node of expanded) {
        if (!node.id || typeof node.id !== 'string') {
            diagnostics.push({ code: 'invalid-id', node });
        }
        if (knownTypes && !knownTypes[node.type]) {
            diagnostics.push({ code: 'unknown-node-type', id: node.id, type: node.type });
        }
    }
    const wireInfo = validateWires(nodesById, expanded);
    diagnostics.push(...wireInfo.diagnostics);
    if (diagnostics.length) {
        const error = new Error(diagnostics.map((item) => `${item.code}${item.id ? `: ${item.id}` : ''}`).join(', '));
        error.code = 'FLOW_VALIDATION';
        error.diagnostics = diagnostics;
        throw error;
    }

    const sourceToRuntimeIds = {};
    const runtimeToSourceId = {};
    for (const id of sourceIds) sourceToRuntimeIds[id] = [];
    for (const node of expanded) {
        let sourceId = node.id;
        if (!sourceIds.has(sourceId)) {
            sourceId = node.id.split(':', 1)[0];
            for (const candidate of sourceIds) {
                if (node.id.endsWith(`:${candidate}`)) {
                    sourceId = candidate;
                    break;
                }
            }
        }
        runtimeToSourceId[node.id] = sourceId;
        (sourceToRuntimeIds[sourceId] ||= []).push(node.id);
    }

    return {
        nodes: expanded,
        nodesById,
        sourceToRuntimeIds,
        runtimeToSourceId,
        configDependencies,
        configDependents,
        incomingWires: wireInfo.incomingWires,
        subflowInstances: sourceToRuntimeIds,
        diagnostics: [],
    };
}

function changedRuntimeConfig(before, after) {
    return !isDeepStrictEqual(runtimeConfig(before), runtimeConfig(after));
}

function addDependents(set, ids, dependents) {
    const pending = [...ids];
    while (pending.length) {
        const id = pending.pop();
        for (const dependent of dependents[id] || []) {
            if (!set.has(dependent)) {
                set.add(dependent);
                pending.push(dependent);
            }
        }
    }
}

function diffCompiled(previous, next) {
    const created = [];
    const removed = [];
    const changed = [];
    const rewired = new Set();
    const restart = new Set();
    const previousById = previous ? previous.nodesById : new Map();

    for (const [id, node] of next.nodesById) {
        const old = previousById.get(id);
        if (!old) {
            created.push(id);
            restart.add(id);
            continue;
        }
        if (!isDeepStrictEqual(old.wires || [], node.wires || [])) rewired.add(id);
        if (changedRuntimeConfig(old, node)) {
            changed.push(id);
            restart.add(id);
        }
    }
    if (previous) {
        for (const id of previous.nodesById.keys()) {
            if (!next.nodesById.has(id)) {
                removed.push(id);
                restart.add(id);
            }
        }
    }

    // A changed config node invalidates every node that captured it at startup.
    addDependents(restart, restart, next.configDependents);
    if (previous) addDependents(restart, restart, previous.configDependents);

    // Cached wire targets must be refreshed when a target is replaced or removed.
    for (const id of restart) {
        for (const source of next.incomingWires[id] || []) rewired.add(source);
        for (const source of previous ? (previous.incomingWires[id] || []) : []) rewired.add(source);
    }

    return {
        created,
        removed,
        changed,
        restarted: [...restart],
        rewired: [...rewired],
        unchanged: [...next.nodesById.keys()].filter((id) => !restart.has(id)),
    };
}

module.exports = {
    clearFlow,
    compileFlow,
    diffCompiled,
    dependencyIndex,
};
