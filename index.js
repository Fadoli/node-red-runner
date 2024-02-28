const runtime = require('./src/runtime');
const registry = require('./src/registry');

const clone = require('./src/utils/node-red').clone

/**
 * @description Compile flows to instantiate subflows
 * @param {*} flow
 */
function compileSubflow(flow) {
    const subflowRegister = {};
    flow.forEach((node) => {
        if (node.type === 'subflow') {
            subflowRegister[node.id] = {
                config: node,
                instances: [],
                actualFlow: []
            };
        } else if (node.type.startsWith('subflow:')) {
            subflowRegister[instanceOfSubflow].instances.push(node);
        }
        // This is in a subflow
        if (subflowRegister[node.z]) {
            subflowRegister[node.z].actualFlow.push(node);
        }
    })

    /*
    "in": [
        {
            "x": 80,
            "y": 80,
            "wires": [
                {
                    "id": "4acdc4f13287ab40"
                }
            ]
        }
    ],
    "out": [
        {
            "x": 640,
            "y": 80,
            "wires": [
                {
                    "id": "b9bd378d5071d32f",
                    "port": 0
                }
            ]
        }
    ],
    "env": [
        {
            "name": "var",
            "type": "str",
            "value": "string"
        }
    ],
    */

    /**
     * @description This generates subflows
     * @param {*} instanceId
     * @param {{config: node, instances: Array<node>, actualFlow: Array<node>}} subflowData
     * @returns {Array<node>}
     */
    function generateSubflow(instanceNode, subflowData) {
        let output = [];
        const endWire = subflowDat.config;
        subflowData.actualFlow.forEach((node) => {
            const newNode = clone(node);
            newNode.id = `${instanceNode.id}:${newNode.id}`;
            newNode.z = instanceNode.z;
            newNode.wires.map(wires => {
                return wires.map((wire) => {
                    if (wire === endWire) {
                        return endWire;
                    }
                })
            })
        })
    }

    for (const id in subflowRegister) {
        const element = subflowRegister[id];

        // disable subflows that are empty or have no instances
        if (!element.instances.length || !element.actualFlow.length) {
            element.config.disabled = true;
            element.instances.forEach((node) => {
                node.disabled = true;
            })
            element.actualFlow.forEach((node) => {
                node.disabled = true;
            })
            // stop here
            continue;
        }

        element.instances.forEach((node) => {
            node.disabled = true;
        })
    }
}

// This will remove all non necessary nodes.
/**
 * @description
 * @param {Array<node>} flow
 * @returns {Array<node>} 
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

module.exports = {
    startServer: async (cb) => {
        try {
            await runtime.startServer();
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
            }));

            // Import other nodes
            nodesToImport.forEach(element => {
                promises.push(runtime.register(element));
            });
            await Promise.all(promises);
            const cleanedFlow = clearFlow(flow);
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
    unload: async () => {
        await runtime.clear();
    },
    setFlows: async (flows, creds) => {
        await runtime.stop();
        await runtime.load(flows, creds);
    },
    getNode: registry.getNode,
    awaitNodeInput: async (node, delay = 500) => {
        if (typeof node !== 'object') {
            node = registry.getNode(node);
        }
        if (!node) {
            throw new Error('node does node exist !');
        }
        return new Promise((res, rej) => {
            let rejectTimeout = setTimeout(() => {
                rej(new Error('node did not recieve any message in the expected delay !'));
            }, delay)
            node.once('input', (msg) => {
                clearTimeout(rejectTimeout);
                res(msg);
            })
        })
    },
    init: () => { },
    clearFlow: clearFlow
}