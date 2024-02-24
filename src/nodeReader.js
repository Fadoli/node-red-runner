
// Here we want to store global data
const path = require('path');
const fs = require('fs');
const fsProm = require('fs').promises;
const log = require('./utils/log');

class NodeReader {

    constructor(moduleDirectory = './node_modules/', dynamicImport = false) {
        this.dynamicImport = dynamicImport;
        this.notImported = {};
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
            log.warn("Use dynamicImport in constructor to enable the 'registerFlows' feature")
            return;
        }
        this.usedInFlows = {};
        flows.forEach(node => {
            this.usedInFlows[node.type] = true;
        })
    }

    reportNotLoadedNodes() {
        if (!this.dynamicImport) {
            log.warn("Use dynamicImport in constructor to enable the 'reportNotLoadedNodes' feature")
            return;
        }
        log.info("List of non imported nodes :\n" + JSON.stringify(this.notImported,null,4))
    }

    /**
     * Import a node-js file ()
     * @param {string} filePath
     * @memberof NodeReader
     */
    importFile(filePath) {
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

        return require(filePath);
    }

    /**
     * Import a Node-Red module
     * @param {string} moduleName
     * @returns {Array<function>}
     * @memberof NodeReader
     */
    importModule(moduleName) {
        const importedFiles = [];
        try {
            const jsonPath = path.join(this.moduleDirectory, moduleName, 'package.json');
            const importedPackage = require(jsonPath);
            const nodes = importedPackage['node-red']["nodes"];
            for (const node in nodes) {
                const subPath = nodes[node];
                const appPath = path.join(this.moduleDirectory, moduleName, subPath);
                importedFiles.push(this.importFile(appPath));
            }
        } catch (e) {
            log.error("Failed loading module : " + moduleName + "\nError is :", e);
        }
        return importedFiles;
    }
};

module.exports = NodeReader;
