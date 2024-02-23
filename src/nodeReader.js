
// Here we want to store global data
const path = require('path');
const fs = require('fs');
const fsProm = require('fs').promises;
const log = require('./utils/log');

class NodeReader {

    constructor(moduleDirectory = './node_modules/', dynamicImport = false) {
        this.dynamicImport = dynamicImport;
        this.imported = {};
        this.notImported = {};
        this.modules = {};
        this.moduleDirectory = moduleDirectory;
        this.usedInFlows = undefined;
    }

    /**
     * @description
     * @param {Array<node>} flows
     * @memberof NodeReader
     */
    registerFlows(flows) {
        if (!this.dynamicImport) {
            throw new Error("Use dynamicImport in constructor to enable the feature");
        }
        this.usedInFlows = {};
        flows.forEach(node => {
            this.usedInFlows[node.type] = true;
        })
    }

    reportNotLoadedNodes() {
        if (!this.dynamicImport) {
            throw new Error("Use dynamicImport in constructor to enable the feature");
        }
        log.info("List of non imported nodes :\n" + JSON.stringify(this.notImported,null,4))
    }

    /**
     * Import a node-js file ()
     * @param {string} filePath
     * @param {boolean} [forceRefresh=false]
     * @memberof NodeReader
     */
    importFile(filePath, forceRefresh = false) {
        if (this.imported[filePath] && !forceRefresh) {
            log.warn("Module already imported, will use stale data");
            return this.imported[filePath];
        }

        if (this.dynamicImport) {
            if (!this.usedInFlows) {
                throw new Error("When using dynamicImport, please registerFlows before importing nodes")
            }
            const raw = fs.readFileSync(filePath, 'utf8');
            const prefix = 'nodes.registerType(';
            const suffix = ',';

            let containsFileToLoad = false;
            let nodes = [];
            raw.split(prefix).forEach((shard, index) => {
                if (index === 0 || containsFileToLoad) {
                    return;
                }
                const trimed = shard.split(suffix)[0].trim();
                const node = trimed.substring(1, trimed.length - 1);
                if (this.usedInFlows[node]) {
                    containsFileToLoad = true;
                }
                nodes.push(node);
            })
            if (!containsFileToLoad) {
                nodes.forEach((node) => this.notImported[node] = true)
                return () => {};
            }
        }

        delete require.cache[filePath];
        this.imported[filePath] = require(filePath);
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
