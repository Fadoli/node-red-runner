
// Here we want to store global data
const path = require('path');
const fs = require('fs');
const log = require('./utils/log');

class NodeReader {

    constructor(moduleDirectory = './node_modules/', dynamicImport = false) {
        this.moduleDirectory = moduleDirectory;
        this.dynamicImport = dynamicImport;
        this.usedInFlows = new Set();
    }

    registerFlows(flows) {
        this.usedInFlows = new Set(flows.map(({ type }) => type));
    }

    /**
     * Import a node-js file ()
     * @param {string} filePath
     * @memberof NodeReader
     */
    importFile(filePath) {
        if (this.dynamicImport) {
            const source = fs.readFileSync(filePath, 'utf8');
            const calls = source.match(/registerType\s*\(/g) || [];
            const literalTypes = [...source.matchAll(/registerType\s*\(\s*(['"`])([^'"`]+)\1/g)]
                .map((match) => match[2]);

            // Only skip when parsing is conclusive; aliases and generated calls must load.
            if (calls.length === literalTypes.length &&
                literalTypes.length > 0 &&
                !literalTypes.some((type) => this.usedInFlows.has(type))) {
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
