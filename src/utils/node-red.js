const clone = require('fast-copy').copy;
const jsonata = require('jsonata');
const moment = require('moment-timezone');

const own = Object.prototype.hasOwnProperty;
const getSetting = (node, name) => node?.getSetting ? node.getSetting(name) : process.env[name];

function cloneMessage(message) {
    if (message == null) return message;
    const { req, res, ...body } = message;
    return { ...clone(body), ...(req && { req }), ...(res && { res }) };
}

function ensureString(value) {
    return Buffer.isBuffer(value) ? value.toString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function ensureBuffer(value) {
    return Buffer.isBuffer(value) ? value : Buffer.from(ensureString(value));
}

const compareObjects = (left, right) => require('node:util').isDeepStrictEqual(left, right);

function error(message) {
    const result = new Error(`Invalid property expression: ${message}`);
    result.code = 'INVALID_EXPR';
    return result;
}

function closingBracket(expression, start) {
    let depth = 1;
    let quote;
    for (let index = start + 1; index < expression.length; index++) {
        const character = expression[index];
        if (quote) {
            if (character === quote && expression[index - 1] !== '\\') quote = undefined;
        } else if (character === '"' || character === "'") quote = character;
        else if (character === '[') depth++;
        else if (character === ']' && --depth === 0) return index;
    }
    throw error("unmatched '['");
}

function normalisePropertyExpression(expression, message, toString) {
    if (!expression) throw error('zero-length');
    const parts = [];
    let index = 0;
    let expectName = true;
    while (index < expression.length) {
        if (!expectName && expression[index] === '.') {
            index++;
            expectName = true;
        }
        if (expression[index] === '[') {
            const end = closingBracket(expression, index);
            const value = expression.slice(index + 1, end);
            if (/^(['"]).+\1$/.test(value)) parts.push(value.slice(1, -1));
            else if (/^\d+$/.test(value)) parts.push(Number(value));
            else if (/^msg(?:[.[])/.test(value)) {
                const resolved = message ? getMessageProperty(message, value.slice(4)) : normalisePropertyExpression(value, message);
                if (resolved === undefined) throw error(`undefined reference ${value}`);
                parts.push(toString ? String(resolved) : resolved);
            } else throw error(`unexpected array expression ${value}`);
            index = end + 1;
            expectName = false;
        } else {
            const match = /^[a-z0-9$_]+/i.exec(expression.slice(index));
            if (!expectName || !match) throw error(`unexpected '${expression[index]}'`);
            const value = match[0];
            parts.push(/^\d+$/.test(value) ? Number(value) : value);
            index += value.length;
            expectName = false;
        }
        if (index < expression.length && expression[index] !== '.' && expression[index] !== '[') throw error(`unexpected '${expression[index]}'`);
    }
    if (expectName) throw error('unterminated expression');
    return parts;
}

function getObjectProperty(object, expression) {
    return normalisePropertyExpression(expression, object).reduce((value, key) => value?.[key], object);
}

function getMessageProperty(message, expression) {
    return getObjectProperty(message, expression.replace(/^msg\./, ''));
}

function setObjectProperty(object, expression, value, createMissing = value !== undefined) {
    const parts = normalisePropertyExpression(expression, object);
    const key = parts.pop();
    let target = object;
    for (let index = 0; index < parts.length; index++) {
        const next = parts[index];
        if (target[next] == null) {
            if (!createMissing) return false;
            target[next] = typeof parts[index + 1] === 'number' ? [] : {};
        }
        if (typeof target[next] !== 'object') return false;
        target = target[next];
    }
    if (value === undefined) Array.isArray(target) && typeof key === 'number' ? target.splice(key, 1) : delete target[key];
    else target[key] = value;
    return true;
}

const setMessageProperty = (message, expression, value, createMissing) =>
    setObjectProperty(message, expression.replace(/^msg\./, ''), value, createMissing);

function parseContextStore(key) {
    const match = /^#:\((\S+?)\)::(.*)$/.exec(key);
    return match ? { store: match[1], key: match[2] } : { key };
}

function evaluateEnvProperty(value, node) {
    return value.replace(/\$\{([^}]+)\}/g, (_, name) => getSetting(node, name) ?? '')
        .replace(/^([^$]+)$/, (_, name) => getSetting(node, name) ?? '');
}

function evaluateNodeProperty(value, type, node, message, callback) {
    let result;
    try {
        if (type === 'str') result = String(value);
        else if (type === 'num') result = Number(value);
        else if (type === 'json') result = JSON.parse(value);
        else if (type === 're') result = new RegExp(value);
        else if (type === 'date') result = Date.now();
        else if (type === 'bin') result = Buffer.from(JSON.parse(value));
        else if (type === 'bool') result = /^true$/i.test(value);
        else if (type === 'msg') result = getMessageProperty(message, value);
        else if (type === 'env') result = evaluateEnvProperty(value, node);
        else if (type === 'flow' || type === 'global') {
            const context = parseContextStore(value);
            context.key = /\[msg/.test(context.key) ? normalisePropertyExpression(context.key, message, true) : context.key;
            if (callback) return node.context()[type].get(context.key, context.store, callback);
            result = node.context()[type].get(context.key, context.store);
        } else if (type === 'jsonata') {
            const expression = prepareJSONataExpression(value, node);
            return evaluateJSONataExpression(expression, message, callback);
        } else result = value;
    } catch (err) {
        if (callback) return callback(err);
        throw err;
    }
    return callback ? callback(null, result) : result;
}

function prepareJSONataExpression(value, node) {
    const expression = jsonata(value);
    expression.assign('flowContext', (key, store) => node ? node.context().flow.get(key, store) : '');
    expression.assign('globalContext', (key, store) => node ? node.context().global.get(key, store) : '');
    expression.assign('env', (name) => getSetting(node, name) ?? '');
    expression.assign('moment', moment);
    expression.registerFunction('clone', cloneMessage, '<(oa)-:o>');
    expression._legacyMode = /(^|[^a-zA-Z0-9_'".])msg([^a-zA-Z0-9_'"]|$)/.test(value);
    expression._node = node;
    return expression;
}

function evaluateJSONataExpression(expression, message, callback) {
    const bindings = {};
    if (callback && expression._node) {
        for (const scope of ['flow', 'global']) {
            bindings[`${scope}Context`] = (key, store) => new Promise((resolve, reject) =>
                expression._node.context()[scope].get(key, store, (err, value) => err ? reject(err) : resolve(value)));
        }
    }
    return expression.evaluate(expression._legacyMode ? { msg: message } : message, bindings, callback);
}

function normaliseNodeTypeName(name) {
    return name.trim().replace(/[^a-zA-Z0-9]+(.)/g, (_, letter) => letter.toUpperCase()).replace(/^./, (letter) => letter.toLowerCase());
}

function encodeObject(entry, options = {}) {
    const limit = options.maxLength ?? 1000;
    const value = entry.msg;
    if (Buffer.isBuffer(value)) return { ...entry, format: `buffer[${value.length}]`, msg: value.toString('hex').slice(0, limit) };
    if (value instanceof Error) return { ...entry, format: 'error', msg: JSON.stringify({ name: value.name, message: value.message }) };
    const type = value === null ? 'null' : typeof value;
    if (type !== 'object') return { ...entry, format: type, msg: type === 'undefined' ? '(undefined)' : String(value).slice(0, limit) };
    const seen = new WeakSet();
    const serialised = JSON.stringify(value, (_, item) => {
        if (typeof item === 'bigint') return { __enc__: true, type: 'bigint', data: String(item) };
        if (typeof item === 'function') return { __enc__: true, type: 'function' };
        if (item && typeof item === 'object') {
            if (seen.has(item)) return '[circular]';
            seen.add(item);
        }
        return item;
    });
    return { ...entry, format: Array.isArray(value) ? `array[${value.length}]` : value.constructor?.name || 'Object', msg: serialised.slice(0, limit) };
}

module.exports = {
    cloneMessage, encodeObject, ensureString, ensureBuffer, compareObjects,
    getMessageProperty, setMessageProperty, getObjectProperty, setObjectProperty,
    evaluateNodeProperty, normalisePropertyExpression, normaliseNodeTypeName,
    prepareJSONataExpression, evaluateJSONataExpression, parseContextStore, getSetting,
};
