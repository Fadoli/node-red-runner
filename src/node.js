const log = require("./utils/log");
const clone = require("./utils/node-red").cloneMessage;
const registry = require("./registry");
const context = require('./context');
const crypto = require('crypto');

let messageIdPrefix = crypto.randomUUID().slice(0, 24);
let nextMessageId = 0;

function generateMessageId() {
    if (nextMessageId === 0x1000000000000) {
        messageIdPrefix = crypto.randomUUID().slice(0, 24);
        nextMessageId = 0;
    }
    return messageIdPrefix + (nextMessageId++).toString(16).padStart(12, '0');
}

function NOOP () { }

function sendMessage(targets, msg) {
    if (msg === null || msg === undefined) {
        return;
    }
    if (msg._msgid === undefined) msg._msgid = generateMessageId();
    if (targets.length === 1) {
        targets[0].receive(msg);
    } else {
        targets.forEach((target) => target.receive(clone(msg)));
    }
}

function sendOutput(targets, output) {
    if (Array.isArray(output)) {
        output.forEach((msg) => sendMessage(targets, msg));
    } else {
        sendMessage(targets, output);
    }
}

class Node {

    /**
     * @param {*} config
     * @memberof Node
     * @constructor
     */
    constructor(config) {
        this.id = config.id;
        this.type = config.type;
        this.z = config.z;

        // Those are optional
        this.name = config.name;
        this.alias = config._alias;
        this.wires = config.wires;
        this.scope = config.scope;
        this._env = config._env;
        this._parentEnv = config._parentEnv;
        this._parentFlowId = config._parentFlowId;

        this.listeners = {};
        this.displayName = this.alias || this.name || this.id;

        this._context = context.getContext(this.id, this.z, this._parentFlowId);
        this.context = () => this._context;
    }

    getSetting(name) {
        if (name === 'NR_NODE_ID') return this.id;
        if (name === 'NR_NODE_NAME') return this.name;
        if (name === 'NR_NODE_PATH') return this.id;
        if (name.startsWith('$parent.')) {
            name = name.substring(8);
            return this._parentEnv && this._parentEnv[name] !== undefined ? this._parentEnv[name] : process.env[name];
        }
        return this._env && this._env[name] !== undefined ? this._env[name] : process.env[name];
    }

    start() {
        this.updateWires();
    }

    /**
     * Update the wiring configuration for this node (this is a small optimisation step) 
     * 
     * @param {Array<Array<String>>} wires
     * @memberof Node
     */
    updateWires() {
        this.wires = this.wires || [];

        let wc = 0;
        this.wires.forEach((wire) => {
            wc += wire.length;
        });
        if (wc === 0) {
            this.send = NOOP;
            return;
        }

        const targetsByOutput = this.wires.map((wire) => {
            return wire.map((id) => registry.getNode(id));
        });
        if (targetsByOutput.length === 1) {
            const targets = targetsByOutput[0];
            this.send = (messages) => {
                sendOutput(targets, Array.isArray(messages) ? messages[0] : messages);
            };
        } else {
            this.send = (messages) => {
                if (!Array.isArray(messages)) {
                    sendMessage(targetsByOutput[0], messages);
                    return;
                }
                const outputCount = Math.min(messages.length, targetsByOutput.length);
                for (let output = 0; output < outputCount; output++) {
                    sendOutput(targetsByOutput[output], messages[output]);
                }
            };
        }
    }

    context() {
        return this._context;
    }

    error(str, msg) {
        const handled = msg && registry.getEventNodes('catch', this).length;
        if (handled) {
            registry.getEventNodes('catch', this).forEach((node) => node.receive({
                ...clone(msg),
                error: {
                    message: str instanceof Error ? str.message : String(str),
                    source: { id: this.id, type: this.type, name: this.name },
                },
            }));
            return;
        }
        log.error(`[NODE-${this.displayName}] ${str}`, msg);
    }
    warn(str, ...options) {
        log.warn(`[NODE-${this.displayName}] ${str}`, ...options);
    }
    log(str, ...options) {
        log.info(`[NODE-${this.displayName}] ${str}`, ...options);
    }
    debug(str, ...options) {
        log.debug(`[NODE-${this.displayName}] ${str}`, ...options);
    }
    trace(str, ...options) {
        log.trace(`[NODE-${this.displayName}] ${str}`, ...options);
    }
    metric() { }
    status(status) {
        const nodes = registry.getEventNodes('status', this);
        for (const node of nodes) {
            node.receive({ status: {
                ...status,
                source: { id: this.id, type: this.type, name: this.name },
            }});
        }
    }

    /**
     * Register an event listener
     * @param {String} eventName
     * @param {Function} cb
     * @memberof Node
     */
    on(eventName, cb) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName].push(cb);
    }

    /**
     * Register an event listener for one time
     * @param {String} eventName
     * @param {Function} cb
     * @memberof Node
     */
    once(eventName, cb) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        const customListen = (...params) => {
            cb(...params);
            this.listeners[eventName] = this.listeners[eventName].filter((e) => e !== customListen)
        }
        this.listeners[eventName].push(customListen);
    }

    /**
     * Trigger events listener
     * @param {*} eventName
     * @param {*} params
     * @return {Array<Promise>} 
     * @memberof Node
     */
    emit(eventName, ...params) {
        if (eventName === 'input') {
            return this.receive(...params);
        }
        const listeners = this.listeners[eventName];
        const output = [];
        if (listeners) {
            for (const listener of listeners) {
                try {
                    const result = listener.call(this, ...params);
                    if (result && typeof result.then === 'function') {
                        output.push(result.catch((err) => this.error(err)));
                    }
                } catch (err) {
                    this.error(err);
                }
            }
        }
        return output;
    }

    receive(msg = {}, send = this.send, complete) {
        const listeners = this.listeners.input || [];
        let completed = false;
        const done = (err) => {
            if (completed) return;
            completed = true;
            if (err) {
                this.error(err, msg);
            } else {
                registry.getEventNodes('complete', this).forEach((node) => node.receive(clone(msg)));
            }
            if (complete) complete(err);
        };
        listeners.forEach((listener) => {
            try {
                const result = listener.call(this, msg, send, done);
                if (result && typeof result.then === 'function') {
                    result.catch(done);
                }
            } catch (err) {
                done(err);
            }
        });
    }

    /**
     * Called when a node is stopped or removed
     * @param {Boolean} [isRemoval]
     */
    close(isRemoval = false) {
        const listeners = this.listeners.close || [];
        const pending = [];
        listeners.forEach((listener) => {
            if (listener.length > 0) {
                pending.push(new Promise((resolve, reject) => {
                    const done = (err) => err ? reject(err) : resolve();
                    try {
                        if (listener.length === 1) {
                            listener.call(this, done);
                        } else {
                            listener.call(this, isRemoval, done);
                        }
                    } catch (err) {
                        reject(err);
                    }
                }));
                return;
            }
            try {
                const result = listener.call(this);
                if (result && typeof result.then === 'function') {
                    pending.push(result);
                }
            } catch (err) {
                pending.push(Promise.reject(err));
            }
        });
        if (pending.length === 1) {
            return pending[0];
        }
        if (pending.length > 1) {
            return Promise.all(pending);
        }
    }
};

module.exports = Node;
