// Subflows are compiled into ordinary configs. This keeps the runtime unaware of
// templates and makes nested subflows use the same lifecycle as top-level nodes.
function rewrite(value, ids) {
    if (typeof value === 'string') return ids[value] || value;
    if (Array.isArray(value)) {
        const result = new Array(value.length);
        for (let i = 0; i < value.length; i++) result[i] = rewrite(value[i], ids);
        return result;
    }
    if (!value || typeof value !== 'object') return value;
    const result = {};
    for (const key in value) result[key] = rewrite(value[key], ids);
    return result;
}

function envValue(entry, current, parent) {
    if (entry.type === 'cred') return { __subflowCredential: entry.name };
    if (entry.type === 'num') return Number(entry.value);
    if (entry.type === 'bool') return /^true$/i.test(entry.value);
    if (entry.type === 'json') return JSON.parse(entry.value);
    if (entry.type === 'env') {
        if (current[entry.value] !== undefined) return current[entry.value];
        if (parent && parent[entry.value] !== undefined) return parent[entry.value];
        return process.env[entry.value];
    }
    return entry.value;
}

function buildEnv(templateEnv, instanceEnv, parent) {
    const entries = {};
    for (const entry of templateEnv || []) entries[entry.name] = entry;
    for (const entry of instanceEnv || []) entries[entry.name] = entry;
    const result = {};
    // Resolve direct values first so `env` entries can reference sibling values.
    for (const name in entries) {
        if (entries[name].type !== 'env') result[name] = envValue(entries[name], result, parent);
    }
    for (const name in entries) {
        if (entries[name].type === 'env') result[name] = envValue(entries[name], result, parent);
    }
    return result;
}

function expandSubflows(flow) {
    const templates = {};
    const children = {};
    const flowEnv = {};
    for (const node of flow) {
        if (node.type === 'subflow') templates[node.id] = node;
        else if (node.type === 'tab') flowEnv[node.id] = buildEnv(node.env);
    }
    for (const node of flow) {
        if (templates[node.z]) (children[node.z] ||= []).push(node);
    }

    function instantiate(instance, template, parentEnv) {
        const env = buildEnv(template.env, instance.env, parentEnv);
        const templateChildren = children[template.id] || [];
        const ids = {};
        const configs = [];
        // Prefixing IDs isolates context, config references, and nested instances.
        for (const node of templateChildren) ids[node.id] = `${instance.id}:${node.id}`;
        for (const node of templateChildren) {
            const clone = {};
            for (const key in node) clone[key] = key === 'type' ? node[key] : rewrite(node[key], ids);
            clone.z = instance.id;
            clone._credentialId = node.id;
            clone._env = env;
            clone._parentEnv = parentEnv;
            clone._parentFlowId = instance.z;
            clone._envCredentialInstance = instance._credentialId || instance.id;
            clone._envCredentialTemplate = template.id;
            const nested = node.type.startsWith('subflow:') && templates[node.type.slice(8)];
            if (nested) configs.push(...instantiate(clone, nested, env));
            else configs.push(clone);
        }

        const targets = [];
        const inputs = template.in || [];
        for (const input of inputs) {
            for (const wire of input.wires || []) targets.push(ids[wire.id]);
        }
        const wrapper = {};
        for (const key in instance) wrapper[key] = instance[key];
        wrapper.type = '__subflow';
        wrapper._targets = targets;
        wrapper._env = env;
        wrapper._parentEnv = parentEnv;
        wrapper._parentFlowId = instance.z;
        wrapper._envCredentialInstance = instance._credentialId || instance.id;
        wrapper._envCredentialTemplate = template.id;
        const result = [wrapper, ...configs];

        // Output proxies turn an internal output into the matching wrapper output.
        const outputs = template.out || [];
        for (let index = 0; index < outputs.length; index++) {
            const proxyId = `${instance.id}:out:${index}`;
            result.push({ id: proxyId, z: instance.id, type: '__subflow-output', parent: instance.id, output: index, wires: [] });
            for (const wire of outputs[index].wires || []) {
                let source;
                const sourceId = ids[wire.id];
                for (const node of result) {
                    if (node.id === sourceId) {
                        source = node;
                        break;
                    }
                }
                if (!source) throw new Error(`Unknown subflow output node: ${wire.id}`);
                source.wires ||= [];
                source.wires[wire.port] ||= [];
                source.wires[wire.port].push(proxyId);
            }
        }
        return result;
    }

    const result = [];
    for (const node of flow) {
        if (node.type === 'subflow' || templates[node.z]) continue;
        if (!node.type.startsWith('subflow:')) {
            result.push(node);
            continue;
        }
        const template = templates[node.type.slice(8)];
        if (!template) throw new Error(`Unknown subflow: ${node.type}`);
        result.push(...instantiate(node, template, flowEnv[node.z]));
    }
    return result;
}

module.exports = expandSubflows;
