const crypto = require('crypto');

// Routing nodes live here because they coordinate runtime nodes rather than perform
// user work. Keeping them on Node.receive/send preserves normal cloning and errors.
module.exports = function registerBuiltins(RED, registry, clone) {
    function passThrough() {
        this.on('input', (msg) => this.send(msg));
    }

    RED.nodes.registerType('status', passThrough);
    RED.nodes.registerType('catch', passThrough);
    RED.nodes.registerType('complete', passThrough);

    RED.nodes.registerType('link in', passThrough);
    RED.nodes.registerType('link out', function (config) {
        this.on('input', (msg, send, done) => {
            if (config.mode === 'return') {
                const source = msg._linkSource && msg._linkSource.pop();
                const caller = source && registry.getNode(source.node);
                if (caller && caller.returnLinkMessage) caller.returnLinkMessage(source.id, msg);
                else done(new Error('missing link call return'));
                return;
            }
            const links = config.links || [];
            for (let i = 0; i < links.length; i++) {
                const target = registry.getNode(links[i]);
                if (target) target.receive(i === 0 ? msg : clone(msg));
            }
            done();
        });
    });
    RED.nodes.registerType('link call', function (config) {
        // Each in-flight call retains the original send/done pair until a Link Return.
        const pending = {};
        const timeout = Number(config.timeout || 30) * 1000;
        this.on('input', (msg, send, done) => {
            const targetId = config.linkType === 'dynamic' ? msg.target : (Array.isArray(config.links) ? config.links[0] : config.links);
            const target = registry.getNode(targetId);
            if (!target) return done(new Error(`target link-in node '${targetId || ''}' not found`));
            const id = crypto.randomUUID();
            const timer = setTimeout(() => {
                delete pending[id];
                done(new Error('timeout'));
            }, timeout);
            pending[id] = { send, done, timer };
            (msg._linkSource ||= []).push({ id, node: this.id });
            target.receive(msg);
        });
        this.returnLinkMessage = (id, msg) => {
            const request = pending[id];
            if (!request) return this.send(msg);
            clearTimeout(request.timer);
            delete pending[id];
            if (msg._linkSource && msg._linkSource.length === 0) delete msg._linkSource;
            request.send(msg);
            request.done();
        };
        this.on('close', () => {
            for (const id in pending) clearTimeout(pending[id].timer);
        });
    });
};
