/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
import { expect, test, describe, beforeAll, beforeEach, afterAll, afterEach } from "bun:test";

var helper = require("../index.js");

var functionNode = require("./nodes/80-function.js");

describe('function node', function () {

    beforeAll(function () {
        return helper.startServer();
    });

    afterAll(function () {
        return helper.stopServer();
    });

    afterEach(function () {
        return helper.unload();
    });

    test('should be loaded', function (done) {
        var flow = [{ id: "n1", type: "function", name: "function" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            expect(n1?.name).toBe('function');
            done();
        });
    });

    test('should send returned message : async', async function () {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "return msg;" },
        { id: "n2", type: "helper" }];
        await helper.load(functionNode, flow);
        const n1 = helper.getNode("n1");
        const n2 = helper.getNode("n2");
        let promiseMsg = helper.awaitNodeInput(n2);
        n1.receive({ payload: "foo", topic: "bar" });
        const msg = await promiseMsg;
        expect(msg.topic).toBe('bar');
        expect(msg.payload).toBe('foo');
    });

    test('should send returned message', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "return msg;" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                expect(msg.topic).toBe('bar');
                expect(msg.payload).toBe('foo');
                done();
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should send returned message using send()', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "node.send(msg);" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                try {
                    expect(msg.topic).toBe('bar');
                    expect(msg.payload).toBe('foo');
                    done();
                } catch (err) {
                    done(err);
                }
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should pass through _topic', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "return msg;" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                try {
                    expect(msg.topic).toBe('bar');
                    expect(msg.payload).toBe('foo');
                    expect(msg._topic).toBe('baz');
                    done();
                } catch (err) {
                    done(err);
                }
            });
            n1.receive({ payload: "foo", topic: "bar", _topic: "baz" });
        });
    });

    test('should send to multiple outputs', function (done) {
        var flow = [{
            id: "n1", type: "function", wires: [["n2"], ["n3"]],
            func: "return [{payload: '1'},{payload: '2'}];"
        },
        { id: "n2", type: "helper" }, { id: "n3", type: "helper" }];
        console.log("should send to multiple outputs");
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            var n3 = helper.getNode("n3");
            var count = 0;
            n2.on("input", function (msg) {
                try {
                    expect(msg).toHaveProperty('payload', '1');
                    count++;
                    if (count == 2) {
                        done();
                    }
                } catch (err) {
                    done(err);
                }
            });
            n3.on("input", function (msg) {
                try {
                    expect(msg).toHaveProperty('payload', '2');
                    count++;
                    if (count == 2) {
                        done();
                    }
                } catch (err) {
                    done(err);
                }
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test.skip('should send to multiple messages', function (done) {
        var flow = [{
            id: "n1", type: "function", wires: [["n2"]],
            func: "return [[{payload: 1},{payload: 2}]];"
        },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            var count = 0;
            n2.on("input", function (msg) {
                count++;
                try {
                    expect(msg).toHaveProperty('payload', count);
                    expect(msg).toHaveProperty('_msgid', 1234);
                    if (count == 2) {
                        done();
                    }
                } catch (err) {
                    done(err);
                }
            });
            n1.receive({ payload: "foo", topic: "bar", _msgid: 1234 });
        });
    });

    test('should allow input to be discarded by returning null', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "return null" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            setTimeout(function () {
                done();
            }, 20);
            n2.on("input", function (msg) {
                done(new Error("unexpected message"));
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test.skip('should handle null amongst valid messages', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "return [[msg,null,msg],null]" },
        { id: "n2", type: "helper" },
        { id: "n3", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            var n3 = helper.getNode("n3");
            var n2MsgCount = 0;
            var n3MsgCount = 0;
            n2.on("input", function (msg) {
                n2MsgCount++;
            });
            n3.on("input", function (msg) {
                n3MsgCount++;
            });
            n1.receive({ payload: "foo", topic: "bar" });
            setTimeout(function () {
                expect(n2MsgCount).toBe(2);
                expect(n3MsgCount).toBe(0);
                done();
            }, 20);
        });
    });

    test('should get keys in global context', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "msg.payload=global.keys();return msg;" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n1.context().global.set("count", "0");
            n2.on("input", function (msg) {
                try {
                    expect(msg.topic).toBe('bar');
                    expect(msg.payload).toEqual(['count']);
                    done();
                } catch (err) {
                    done(err);
                }
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test.skip('should access functionGlobalContext set via help settings()', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "msg.payload=global.get('foo');return msg;" },
        { id: "n2", type: "helper" }];
        helper.settings({
            functionGlobalContext: {
                foo: (function () {
                    return 'bar';
                })(),
            },
        });
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                expect(msg.payload).toBe('bar');
                done();
            });
            n1.receive({ payload: "replaceme" });
        });
        helper.settings({});
    });

    test('should set node context', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "context.set('count','0');return msg;" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                try {
                    expect(msg.topic).toBe('bar');
                    expect(msg.payload).toBe('foo');
                    expect(n1.context().get("count")).toBe("0");
                    done();
                } catch (err) {
                    done(err);
                }
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should get node context', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "msg.payload=context.get('count');return msg;" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n1.context().set("count", "0");
            n2.on("input", function (msg) {
                try {
                    expect(msg.topic).toBe('bar');
                    expect(msg.payload).toBe('0');
                    done();
                } catch (err) {
                    done(err);
                }
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should get keys in node context', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "msg.payload=context.keys();return msg;" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n1.context().set("count", "0");
            n2.on("input", function (msg) {
                try {
                    expect(msg.topic).toBe('bar');
                    expect(msg.payload).toEqual(['count']);
                    done();
                } catch (err) {
                    done(err);
                }
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should set flow context', function (done) {
        var flow = [{ id: "n1", type: "function", z: "flowA", wires: [["n2"]], func: "flow.set('count','0');return msg;" },
        { id: "n2", type: "helper", z: "flowA" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                try {
                    expect(msg.topic).toBe('bar');
                    expect(msg.payload).toBe('foo');
                    expect(n2.context().flow.get("count")).toBe("0");
                    done();
                } catch (err) {
                    done(err);
                }
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should get flow context', function (done) {
        var flow = [{ id: "n1", type: "function", z: "flowA", wires: [["n2"]], func: "msg.payload=flow.get('count');return msg;" },
        { id: "n2", type: "helper", z: "flowA" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n1.context().flow.set("count", "0");
            n2.on("input", function (msg) {
                expect(msg.topic).toBe('bar');
                expect(msg.payload).toBe('0');
                done();
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should get flow context', function (done) {
        var flow = [{ id: "n1", type: "function", z: "flowA", wires: [["n2"]], func: "msg.payload=context.flow.get('count');return msg;" },
        { id: "n2", type: "helper", z: "flowA" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n1.context().flow.set("count", "0");
            n2.on("input", function (msg) {
                expect(msg.topic).toBe('bar');
                expect(msg.payload).toBe('0');
                done();
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should get keys in flow context', function (done) {
        var flow = [{ id: "n1", type: "function", z: "flowA", wires: [["n2"]], func: "msg.payload=flow.keys();return msg;" },
        { id: "n2", type: "helper", z: "flowA" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n1.context().flow.set("count", "0");
            n2.on("input", function (msg) {
                expect(msg.topic).toBe('bar');
                expect(msg.payload).toEqual(['count']);
                done();
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should set global context', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "global.set('count','0');return msg;" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                try {
                    expect(msg.topic).toBe('bar');
                    expect(msg.payload).toBe('foo');
                    expect(n2.context().global.get("count")).toBe("0");
                    done();
                } catch (err) {
                    done(err);
                }
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should get global context', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "msg.payload=global.get('count');return msg;" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n1.context().global.set("count", "0");
            n2.on("input", function (msg) {
                expect(msg.topic).toBe('bar');
                expect(msg.payload).toBe('0');
                done();
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should get global context', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "msg.payload=context.global.get('count');return msg;" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n1.context().global.set("count", "0");
            n2.on("input", function (msg) {
                expect(msg.topic).toBe('bar');
                expect(msg.payload).toBe('0');
                done();
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should handle setTimeout()', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "setTimeout(function(){node.send(msg);},1000);" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                var endTime = process.hrtime(startTime);
                var nanoTime = endTime[0] * 1000000000 + endTime[1];
                expect(msg.topic).toBe('bar');
                expect(msg.payload).toBe('foo');
                if (900000000 < nanoTime && nanoTime < 1100000000) {
                    done();
                } else {
                    try {
                        should.fail(null, null, "Delayed time was not between 900 and 1100 ms");
                    } catch (err) {
                        done(err);
                    }
                }
            });
            var startTime = process.hrtime();
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should handle setInterval()', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "setInterval(function(){node.send(msg);},100);" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            var count = 0;
            n2.on("input", function (msg) {
                expect(msg.topic).toBe('bar');
                expect(msg.payload).toBe('foo');
                count++;
                if (count > 2) {
                    done();
                }
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });

    test('should handle clearInterval()', function (done) {
        var flow = [{ id: "n1", type: "function", wires: [["n2"]], func: "var id=setInterval(null,100);setTimeout(function(){clearInterval(id);node.send(msg);},1000);" },
        { id: "n2", type: "helper" }];
        helper.load(functionNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                expect(msg.topic).toBe('bar');
                expect(msg.payload).toBe('foo');
                done();
            });
            n1.receive({ payload: "foo", topic: "bar" });
        });
    });
});
