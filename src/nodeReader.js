
// Here we want to store global data
const path = require('path');
const fs = require('fs');
const fsProm = require('fs').promises;
const log = require('./utils/log');

class NodeReader {

    constructor(moduleDirectory = './node_modules/') {
        this.imported = {};
        this.modules = {};
        this.moduleDirectory = moduleDirectory;
    }

    /**
     * Import a node-js file ()
     * @param {string} filePath
     * @param {boolean} [forceRefresh=false]
     * @memberof NodeReader
     */
    importFile(filePath, forceRefresh = false) {
        if (this.imported[filePath]) {
            if (forceRefresh) {
                log.trace("Emptying cache and reimporting module " + filePath);
                delete require.cache[filePath];
                this.imported[filePath] = require(filePath);
            } else {
                log.warn("Module already imported, will use stale data");
            }
        } else {
            this.imported[filePath] = require(filePath);
        }
        return this.imported[filePath];
    }

    /**
     * Import a Node-Red module
     * @param {string} moduleName
     * @param {boolean} [forceRefresh=false]
     * @returns {Promise<{string: function}>}
     * @memberof NodeReader
     */
    async importModule(moduleName, forceRefresh = false) {
        if (this.modules[moduleName] && forceRefresh === false) {
            return this.modules[moduleName];
        }
        const importedModule = {};
        try {
            const jsonPath = path.join(this.moduleDirectory, moduleName, 'package.json');
            const importedPackage = JSON.parse(await fsProm.readFile(jsonPath, 'utf8'));
            const nodes = importedPackage['node-red']["nodes"];
            for (const node in nodes) {
                const subPath = nodes[node];
                const appPath = path.join(this.moduleDirectory, moduleName, subPath);
                importedModule[node] = this.importFile(appPath, forceRefresh);
            }
        } catch (e) {
            log.error("Failed loading module : " + moduleName + "\nError is :", e);
        }
        this.modules[moduleName] = importedModule;
        return importedModule;
    }

    clean() {
        this.imported.forEach(module => {
            delete require.cache[module];
        })
        this.imported = [];
    }
};

module.exports = NodeReader;
