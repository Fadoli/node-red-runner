
// Here we want to store global data
const path = require('path');
const fs = require('fs');
const log = require('./utils/log');
const registry = require('./registry');

function parseEditorHtml(filePath) {
    const htmlPath = filePath.replace(/\.js$/i, '.html');
    if (!fs.existsSync(htmlPath)) return;
    const source = fs.readFileSync(htmlPath, 'utf8');
    const names = new Set();
    for (const match of source.matchAll(/data-(?:template|help)-name\s*=\s*["']([^"']+)["']/gi)) names.add(match[1]);
    for (const name of names) {
        const icon = (source.match(/(?:fa|fa-solid|fa-brands)\s+fa-([\w-]+)/i) || [])[1];
        const label = (source.match(/data-template-name\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<label[^>]*>([^<]+)/i) || [])[1];
        const color = (source.match(/\bcolor\s*:\s*["']([^"']+)["']/i) || [])[1];
        const inputs = (source.match(/\binputs\s*:\s*(\d+)/i) || [])[1];
        const outputs = (source.match(/\boutputs\s*:\s*(\d+)/i) || [])[1];
        const editorIcon = (source.match(/\bicon\s*:\s*["']([^"']+)["']/i) || [])[1];
        const category = (source.match(/\bcategory\s*:\s*["']([^"']+)["']/i) || [])[1];
        const defaults = {};
        const defaultsBlock = source.match(/\bdefaults\s*:\s*\{([\s\S]*?)\}\s*,\s*(?:credentials|inputs|outputs|icon|color)/i);
        if (defaultsBlock) for (const match of defaultsBlock[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*\{\s*value\s*:\s*([^,}\n]+)/g)) {
            const raw = match[2].trim();
            defaults[match[1]] = raw === 'true' ? true : raw === 'false' ? false : raw === 'null' ? null : (/^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : raw.replace(/^['"]|['"]$/g, ''));
        }
        registry.setTypeMetadata(name, {
            inputs: inputs === undefined ? undefined : Number(inputs),
            outputs: outputs === undefined ? undefined : Number(outputs),
            color,
            icon: editorIcon,
            category,
            editor: { label: label && label.trim(), icon: editorIcon, htmlPath, defaults },
        });
    }
}

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
        parseEditorHtml(filePath);
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
