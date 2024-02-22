const fs = require("fs");
const path = require("path");

const helper = require("./index.js");
const NodeReader = require("./src/nodeReader");


const dirToLoad = "~/.node-red"

const mainpackage = require(path.join(dirToLoad, "package.json"));
const flow = require(path.join(dirToLoad, "flows_PC-Franck.json"));

const { execSync } = require("child_process");

async function baseNodeImporter() {
    let output = [];
    try {
        const nodeRedDirectory = path.resolve(execSync('npm ls -g node-red').toString().trim().split('\n')[0].trim());
        const nodesDirectory = path.join(nodeRedDirectory, 'node_modules/node-red/node_modules/@node-red/nodes/core');
        const nodesDirectoryContent = (await fs.promises.readdir(nodesDirectory)).map((subDir => {
            return fs.promises.readdir(path.join(nodesDirectory, subDir))
                .then((files) => {
                    files.forEach((fileName) => {
                        if (fileName.endsWith('.js')) {
                            output.push(path.join(nodesDirectory, subDir, fileName.substring(0, fileName.length - 3)))
                        }
                    })
                })
        }));
        await Promise.all(nodesDirectoryContent);
    } catch (err) {
        console.error("Failed at locating node-red nodes !");
    }
    console.log(output)
    return output;
}

async function run() {
    const nodes = [];

    const importer = new NodeReader(path.join(dirToLoad, "node_modules"));
    const baseFiles = await baseNodeImporter();
    baseFiles.forEach((file => {
        nodes.push(importer.importFile(file));
    }))
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