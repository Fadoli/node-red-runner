const runtime = require('./src/runtime');
const registry = require('./src/registry');
const helperNode = require('./src/helperNode');

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
            promises.push(runtime.register(helperNode));
            // Import other nodes
            nodesToImport.forEach(element => {
                promises.push(runtime.register(element));
            });
            await Promise.all(promises);
            await runtime.load(flow, creds);

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
    init: () => { }
}