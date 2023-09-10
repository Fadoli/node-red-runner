const helper = require("../index.js");
const commentNode = require("./nodes/90-comment.js");

console.log("TEST");
await helper.startServer();
console.log("TEST");
var flow = [{ id: "n1", type: "comment", name: "comment" }];
await helper.load(commentNode, flow);
var n1 = helper.getNode("n1");
console.log(n1);
console.log(n1.name);
await helper.unload();
await helper.stopServer();
