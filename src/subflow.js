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

function expandSubflows(flow) {
    const templates = {};
    const children = {};
    for (const node of flow) {
        if (node.type === 'subflow') templates[node.id] = node;
    }
    for (const node of flow) {
        if (templates[node.z]) (children[node.z] ||= []).push(node);
    }

    function instantiate(instance, template) {
        const templateChildren = children[template.id] || [];
        const ids = {};
        const configs = [];
        for (const node of templateChildren) ids[node.id] = `${instance.id}:${node.id}`;
        for (const node of templateChildren) {
            const clone = {};
            for (const key in node) clone[key] = key === 'type' ? node[key] : rewrite(node[key], ids);
            clone.z = instance.id;
            clone._credentialId = node.id;
            const nested = node.type.startsWith('subflow:') && templates[node.type.slice(8)];
            if (nested) configs.push(...instantiate(clone, nested));
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
        const result = [wrapper, ...configs];

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
        result.push(...instantiate(node, template));
    }
    return result;
}

module.exports = expandSubflows;
