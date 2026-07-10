const runtime = require('./src/runtime');
const registry = require('./src/registry');
const request = require('supertest');
const clone = require('./src/utils/node-red').cloneMessage;
const expandSubflows = require('./src/subflow');
const registerBuiltins = require('./src/builtins');

// This will remove all non necessary nodes.
/**
 * @description
 * @param {Array<nodes>} flow
 * @returns {Array<nodes>} 
 */
function clearFlow(flow) {
    const disabledFlows = {};
    const disabledIds = {};
    const enabledIds = {};

    // clean disabled flows / node
    const newFlow = flow.filter((node) => {
        if (node.type === 'tab') {
            disabledFlows[node.id] = node.disabled;
            disabledIds[node.id] = true;
            return false;
        }
        /*
        if (node.type === 'comment') {
            return false;
        }
        */
        if (node.z && disabledFlows[node.z]) {
            disabledIds[node.id] = true;
            return false;
        }
        if (node.d || node.disabled) {
            disabledIds[node.id] = true;
            return false;
        }
        enabledIds[node.id] = true;
        return true;
    })

    // clean disabled wires
    newFlow.forEach((node) => {
        if (!node.wires) {
            return;
        }
        node.wires = node.wires.map((subWires => {
            return subWires.filter((id) => !!enabledIds[id])
        }))
    })

    return newFlow;
}

const helper = {
    startServer: async (port = 0, cb) => {
        if (port instanceof Function) {
            cb = port;
            port = 0;
        }
        try {
            await runtime.startServer(port);
            if (cb) {
                cb();
            }
        } catch (error) {
            if (!cb) {
                throw error;
            } else {
                cb(error);
            }
        }
    },
    stopServer: async (cb) => {
        try {
            await runtime.stopServer();
            if (cb) {
                cb();
            }
        } catch (error) {
            if (!cb) {
                throw error;
            } else {
                cb(error);
            }
        }
    },

    load: async (nodesToImport, flow, creds, cb) => {
        // we can import multiple nodes
        if (!Array.isArray(nodesToImport)) {
            nodesToImport = [nodesToImport];
        }
        // handle specifics inputs cases
        if (creds instanceof Function) {
            cb = creds;
            creds = undefined;
        }

        try {
            // Do the thing !
            const promises = [];
            // Add helper node !
            promises.push(runtime.register((RED) => {
                RED.nodes.registerType("tab", () => { });
                RED.nodes.registerType("helper", () => { });
                RED.nodes.registerType("debug", () => { });
                RED.nodes.registerType("comment", () => { });
                registerBuiltins(RED, registry, clone);
                RED.nodes.registerType('__subflow', function (config) {
                    this.on('input', (msg) => config._targets.forEach((id, index) => {
                        const target = registry.getNode(id);
                        if (target) target.receive(index === 0 ? msg : clone(msg));
                    }));
                });
                RED.nodes.registerType('__subflow-output', function (config) {
                    this.on('input', (msg) => {
                        const messages = Array(config.output + 1).fill(null);
                        messages[config.output] = msg;
                        registry.getNode(config.parent).send(messages);
                    });
                });
            }));

            // Import other nodes
            nodesToImport.forEach(element => {
                promises.push(runtime.register(element));
            });
            await Promise.all(promises);
            const cleanedFlow = clearFlow(expandSubflows(flow));
            await runtime.load(cleanedFlow, creds);

            if (cb) {
                cb();
            }
        } catch (error) {
            if (!cb) {
                console.error(error);
                throw error;
            } else {
                cb(error);
            }
        }
    },
    unload: async (cb) => {
        try {
            await runtime.clear();
            if (cb) cb();
        } catch (error) {
            if (cb) cb(error);
            else throw error;
        }
    },
    clearFlows: async () => runtime.stop(),
    setFlows: async (flows, type, creds, cb) => {
        if (typeof type !== 'string') {
            cb = creds instanceof Function ? creds : undefined;
            creds = type;
        } else if (creds instanceof Function) {
            cb = creds;
            creds = undefined;
        }
        try {
            await runtime.stop();
            await runtime.load(clearFlow(expandSubflows(flows.flows || flows)), creds || flows.credentials);
            if (cb) cb();
        } catch (error) {
            if (cb) cb(error);
            else throw error;
        }
    },
    settings: (newSettings) => {
        return runtime.settings(newSettings);
    },
    getNode: registry.getNode,
    awaitNodeEvent: async (node, event, delay = 500) => {
        if (typeof node !== 'object') {
            node = registry.getNode(node);
        }
        if (!node) {
            throw new Error('node does not exist');
        }
        return new Promise((res, rej) => {
            let rejectTimeout = setTimeout(() => {
                rej(new Error(`node did not emit ${event} within ${delay}ms`));
            }, delay)
            node.once(event, (...args) => {
                clearTimeout(rejectTimeout);
                res(args.length > 1 ? args : args[0]);
            })
        })
    },
    awaitNodeInput: async (node, delay = 500) => {
        const value = await helper.awaitNodeEvent(node, 'input', delay);
        return Array.isArray(value) ? value[0] : value;
    },
    init: (runtimePath, userSettings) => {
        if (userSettings) runtime.settings(userSettings);
        return helper;
    },
    request: () => request(runtime.getApp()),
    url: () => {
        const address = runtime.getServerAddress();
        return address && `http://127.0.0.1:${address.port}`;
    },
    log: () => runtime.getLog(),
    clearFlow: clearFlow,
    expandSubflows
};

// ponytail: runtime state is process-global; split it per instance if parallel helpers are needed.
helper.NodeTestHelper = function NodeTestHelper() { return helper; };

module.exports = helper;
