const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { decryptCredentials, parseArgs } = require('../runflow');

test('CLI parses runtime options', () => {
    assert.deepStrictEqual(parseArgs(['--flow', 'flow.json', '--port', '1888']), {
        flow: 'flow.json',
        port: '1888',
    });
});

test('CLI decrypts Node-RED credential files', () => {
    const secret = 'test-secret';
    const iv = Buffer.alloc(16, 1);
    const cipher = crypto.createCipheriv('aes-256-ctr', crypto.createHash('sha256').update(secret).digest(), iv);
    const encrypted = iv.toString('hex') + cipher.update(JSON.stringify({ n1: { token: 'abc' } }), 'utf8', 'base64') + cipher.final('base64');
    assert.deepStrictEqual(decryptCredentials({ $: encrypted }, secret), { n1: { token: 'abc' } });
});
