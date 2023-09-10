const runtime = require('./src/runtime');

module.exports = {
    startServer: async (cb) => {
        try {
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
                throw error;
            } else {
                cb(error);
            }
        }
    },
    unload: async () => {
        runtime.clear();
    },
    getNode: runtime.getNode,
    init: () => { }
}