const log = require("./utils/log");
const clone = require("./utils/node-red").cloneMessage;
const registry = require("./registry");
const context = require('./context');

function NOOP () { }
function done(err) { 
    if (err) {
        console.error(err);
    }
}

function wrapOnInput(node, cb) {
    return (msg) => cb.call(node, msg, node.send, (err) => {
        if (err) {
            node.error(err);
        }
    });
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

        // Those are optional
        this.name = config.name;
        this.alias = config._alias;
        this.wires = config.wires;

        this.listeners = {};
        this.displayName = this.alias || this.name || this.id;

        this._context = context.getContext(this.id, this.z);
        this.context = () => this._context;
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
        for (const wire of this.wires) {
            wc += wire.length;
        }
        if (wc === 0) {
            this.send = NOOP;
        } else if (this.wires.length === 1) {
            // Optimisation for single output ... 
            if (this.wires[0].length === 1) {
                const target = this.wires[0][0];
                const actualTarget = registry.getNode(target);
                this.send = (msg) => {
                    if (Array.isArray(msg)) {
                        msg = msg[0];
                    }
                    if (Array.isArray(msg)) {
                        msg = msg[0];
                    }
                    if (!msg) {
                        return;
                    }
                    actualTarget.receive(msg);
                }
            } else {
                const targets = this.wires[0];
                const actualTargets = targets.map((id) => registry.getNode(id));
                this.send = (msg) => {
                    if (Array.isArray(msg)) {
                        msg = msg[0];
                    }
                    if (Array.isArray(msg)) {
                        msg = msg[0];
                    }
                    if (!msg) {
                        return;
                    }
                    actualTargets.forEach((actualTarget) => { 
                        actualTarget.receive(clone(msg));
                    })
                }
            }
        } else {
            // Not optimised use case.
            this.send = (msgArray) => {
                // handle non array case
                if (!Array.isArray(msgArray)) {
                    msgArray = [msgArray];
                }
                for (let id = 0; id < msgArray.length; id++) {
                    const msg = msgArray[id];
                    if (!msg) {
                        continue;
                    }
                    const targets = this.wires[id];
                    targets.forEach((target) => { registry.getNode(target).receive(clone(msg)); })
                }
            }
        }
    }

    context() {
        return this._context;
    }

    error(str, ...options) {
        log.error(`[NODE-${this.displayName}] ${str}`, ...options);
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
    status() { }

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
        // Hack for injecting send and done
        if (eventName === 'input') {
            cb = wrapOnInput(this, cb);
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
        const listeners = this.listeners[eventName];
        const output = [];
        if (listeners) {
            for (const listener of listeners) {
                output.push(
                    Promise.resolve(listener.call(this, ...params))
                        .catch(e => {
                            this.error(e);
                        })
                );
            }
        }
        return output;
    }

    receive(msg) {
        const listeners = this.listeners["input"];
        for (const listener of listeners) {
            listener(msg, this.send, done);
        }
    }

    /**
     * Called when a node is stopped or removed
     * @param {Boolean} [isRemoval]
     * @memberof Node
     */
    close(isRemoval = false) {
        const promises = this.emit("close", () => { }, isRemoval);
        return Promise.all(promises);
    }
};

module.exports = Node;
