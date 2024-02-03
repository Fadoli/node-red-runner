const fs = require("fs");
const path = require("path");

const helper = require("./index.js");
const NodeReader = require("./src/nodeReader");


const dirToLoad = "~/.node-red"

const mainpackage = require(path.join(dirToLoad, "package.json"));
const flow = require(path.join(dirToLoad, "flows_PC-Franck.json"));

async function run () {
    const nodes = [];

    const importer = new NodeReader(path.join(dirToLoad,"node_modules"));
    const promises = Object.keys(mainpackage.dependencies).map(dep => {
        return importer.importModule(dep).then((importedModule) => {

            nodes.push(...Object.values(importedModule));
        });
    });
    await Promise.all(promises);
    await helper.load(nodes, flow);

    await helper.startServer();
    async function stop() {
        await helper.unload();
        await helper.stopServer();
        process.exit(0);
    }
    
    process.on("SIGABRT", stop);
    process.on("SIGBUS", stop);
    process.on("SIGBREAK", stop);
    process.on("SIGINT", stop);
    process.on("SIGABRT", stop);
    process.on("SIGABRT", stop);
}

run();