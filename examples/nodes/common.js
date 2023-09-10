const util = require("util");
let RED;

module.exports = {
    init(red) {
        RED = red;
    },

    sendResults(node, send, _msgid, msgs, cloneFirstMessage) {
        node.send(msgs);
    },
    updateErrorInfo(err) {
        if (err.stack) {
            var stack = err.stack.toString();
            console.log(stack);
            var m = /^([^:]+):([^:]+):(\d+).*/.exec(stack);
            if (m) {
                var line = parseInt(m[3]) - 1;
                var kind = "body:";
                if (/setup/.exec(m[1])) {
                    kind = "setup:";
                }
                if (/cleanup/.exec(m[1])) {
                    kind = "cleanup:";
                }
                err.message += " (" + kind + "line " + line + ")";
            }
        }
    },
    replaceAll(str, from, to) {
        return str.split(from).join(to);
    }
}