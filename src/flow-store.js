const clone = require('fast-copy').copy;
const fs = require('node:fs/promises');
const path = require('node:path');
const { readJSON, writeJSON } = require('./utils/fs');

function publicFlows(flow) {
    const output = clone(flow || []);
    for (const node of output) {
        if (node.credentials) delete node.credentials;
    }
    return output;
}

class FlowStore {
    constructor(file) {
        this.file = file;
        this.flows = [];
        this.credentials = {};
        this.rev = '0';
        this.mutations = new Map();
    }

    initialize(flows, credentials) {
        this.flows = clone(flows || []);
        this.credentials = clone(credentials || {});
        this.rev = '1';
        this.mutations.clear();
    }

    reset() {
        this.initialize([], {});
    }

    setFile(file) {
        this.file = file;
    }

    async restore() {
        if (!this.file) return false;
        const value = await readJSON(this.file);
        this.flows = clone(value.flows || value);
        this.rev = String(value.rev || '1');
        return true;
    }

    async persist() {
        if (!this.file) return;
        // Credentials deliberately stay out of this editor snapshot. They must
        // continue to come from the runtime's protected credential source.
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        await writeJSON(this.file, { rev: this.rev, flows: this.flows });
    }

    snapshot() {
        return { rev: this.rev, flows: publicFlows(this.flows) };
    }

    getCredentials() {
        return clone(this.credentials);
    }

    candidate(changes, credentials) {
        const flows = clone(this.flows);
        const byId = new Map();
        for (let index = 0; index < flows.length; index++) byId.set(flows[index].id, index);

        for (const change of changes || []) {
            if (!change || typeof change.op !== 'string') throw new Error('Invalid flow change');
            if (change.op === 'add-node') {
                const node = clone(change.node);
                if (!node || typeof node.id !== 'string' || byId.has(node.id)) throw new Error(`Cannot add node '${node && node.id || ''}'`);
                byId.set(node.id, flows.length);
                flows.push(node);
                continue;
            }
            if (change.op === 'remove-node') {
                const index = byId.get(change.id);
                if (index === undefined) throw new Error(`Unknown node '${change.id || ''}'`);
                const removedIds = new Set([change.id]);
                if (flows[index].type === 'tab') {
                    for (const node of flows) if (node.z === change.id) removedIds.add(node.id);
                }
                for (let next = flows.length - 1; next >= 0; next--) {
                    if (!removedIds.has(flows[next].id)) continue;
                    flows.splice(next, 1);
                }
                for (const node of flows) {
                    if (!node.wires) continue;
                    for (let output = 0; output < node.wires.length; output++) {
                        node.wires[output] = (node.wires[output] || []).filter((id) => !removedIds.has(id));
                    }
                }
                byId.clear();
                for (let next = 0; next < flows.length; next++) byId.set(flows[next].id, next);
                continue;
            }
            if (change.op === 'replace-wires') {
                const index = byId.get(change.id);
                if (index === undefined) throw new Error(`Unknown node '${change.id || ''}'`);
                flows[index].wires = clone(change.wires || []);
                continue;
            }
            if (change.op === 'update-node') {
                const index = byId.get(change.id);
                if (index === undefined) throw new Error(`Unknown node '${change.id || ''}'`);
                const set = change.set;
                if (!set || typeof set !== 'object' || Array.isArray(set)) throw new Error('Invalid node update');
                for (const key in set) flows[index][key] = clone(set[key]);
                continue;
            }
            throw new Error(`Unknown flow change '${change.op}'`);
        }

        const nextCredentials = clone(this.credentials);
        for (const id in credentials || {}) {
            nextCredentials[id] = { ...(nextCredentials[id] || {}), ...clone(credentials[id]) };
        }
        return { flows, credentials: nextCredentials };
    }

    commit(candidate, mutationId) {
        this.flows = candidate.flows;
        this.credentials = candidate.credentials;
        this.rev = String(Number(this.rev) + 1);
        if (mutationId) this.mutations.set(mutationId, this.rev);
        return this.rev;
    }

    mutationResult(id) {
        return id && this.mutations.get(id);
    }
}

module.exports = { FlowStore, publicFlows };
