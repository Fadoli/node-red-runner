const express = require('express');
const { compileFlow, diffCompiled } = require('./compiler');
const context = require('./context');

function credentialsChanged(previous, next) {
    const changed = new Set();
    const ids = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
    for (const id of ids) {
        if (JSON.stringify(previous && previous[id] || {}) !== JSON.stringify(next && next[id] || {})) changed.add(id);
    }
    return changed;
}

function addCredentialImpact(plan, compiled, changedCredentials) {
    for (const node of compiled.nodes) {
        const credentialId = node._credentialId || node.id;
        if (!changedCredentials.has(credentialId)) continue;
        if (!plan.restarted.includes(node.id)) plan.restarted.push(node.id);
    }
}

function createEditorApi({ store, runtime, registry }) {
    const router = express.Router();
    router.use((req, res, next) => {
        const address = req.socket && req.socket.remoteAddress;
        const local = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
        if (!local && !runtime.getSettings().editorApiAllowRemote) {
            res.status(403).json({ error: 'editor-api-local-only' });
            return;
        }
        next();
    });
    router.use(express.json({ limit: '2mb' }));

    function compileCandidate(candidate) {
        return compileFlow(candidate.flows, registry.knownTypes);
    }

    function baseCheck(req, res) {
        if (req.body && req.body.baseRev !== undefined && String(req.body.baseRev) !== store.rev) {
            res.status(409).json({ error: 'revision-mismatch', rev: store.rev });
            return false;
        }
        return true;
    }

    router.get('/snapshot', (req, res) => {
        res.json(store.snapshot());
    });

    router.get('/node-types', (req, res) => {
        const types = [];
        for (const type in registry.knownTypes) {
            const definition = registry.knownTypes[type];
            const credentials = definition.options && definition.options.credentials;
            types.push({
                type,
                inputs: Number.isInteger(definition.options && definition.options.inputs) ? definition.options.inputs : null,
                outputs: Number.isInteger(definition.options && definition.options.outputs) ? definition.options.outputs : null,
                color: definition.options && definition.options.color || null,
                icon: definition.options && definition.options.icon || null,
                category: definition.options && definition.options.category || null,
                credentials: credentials ? Object.keys(credentials) : [],
                editor: definition.options && definition.options.editor,
            });
        }
        res.json(types);
    });

    router.get('/context/:id', (req, res) => {
        try {
            const node = store.flows.find(item => item.id === req.params.id);
            const ctx = context.getContext(req.params.id, node && node.z);
            const read = scope => {
                const values = {};
                for (const key of scope.keys()) values[key] = scope.get(key);
                return values;
            };
            res.json({ node: read(ctx.node), flow: read(ctx.flow), global: read(ctx.global) });
        } catch (error) {
            res.status(422).json({ error: error.message });
        }
    });

    router.post('/validate', (req, res) => {
        try {
            if (!baseCheck(req, res)) return;
            const candidate = store.candidate(req.body.changes || [], req.body.credentials);
            const compiled = compileCandidate(candidate);
            const current = compileFlow(store.flows, registry.knownTypes);
            const impact = diffCompiled(current, compiled);
            addCredentialImpact(impact, compiled, credentialsChanged(store.credentials, candidate.credentials));
            res.json({ valid: true, rev: store.rev, impact });
        } catch (error) {
            res.status(422).json({ valid: false, error: error.message, diagnostics: error.diagnostics || [] });
        }
    });

    router.post('/deploy', async (req, res) => {
        try {
            const mutationId = req.body && req.body.mutationId;
            const previousMutation = store.mutationResult(mutationId);
            if (previousMutation) {
                res.json({ rev: previousMutation, duplicate: true });
                return;
            }
            if (!baseCheck(req, res)) return;
            const candidate = store.candidate(req.body.changes || [], req.body.credentials);
            const compiled = compileCandidate(candidate);
            const current = compileFlow(store.flows, registry.knownTypes);
            const impact = diffCompiled(current, compiled);
            addCredentialImpact(impact, compiled, credentialsChanged(store.credentials, candidate.credentials));
            await runtime.apply(compiled.nodes, candidate.credentials, impact);
            const rev = store.commit(candidate, mutationId);
            await store.persist();
            runtime.events.emit('editor-deployed', { rev, impact });
            res.json({ rev, impact });
        } catch (error) {
            const status = error.code === 'FLOW_VALIDATION' ? 422 : 500;
            res.status(status).json({ error: error.message, diagnostics: error.diagnostics || [] });
        }
    });

    router.get('/events', (req, res) => {
        res.status(200);
        res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.flushHeaders();
        const send = (event, value) => res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
        const onDeploy = (value) => send('deploy', value);
        const onStatus = (value) => send('status', value);
        const onComms = (value) => send(value.topic || 'comms', value.message);
        runtime.events.on('editor-deployed', onDeploy);
        runtime.events.on('status', onStatus);
        runtime.events.on('comms', onComms);
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
        heartbeat.unref();
        req.on('close', () => {
            clearInterval(heartbeat);
            runtime.events.off('editor-deployed', onDeploy);
            runtime.events.off('status', onStatus);
            runtime.events.off('comms', onComms);
        });
    });

    return router;
}

module.exports = createEditorApi;
