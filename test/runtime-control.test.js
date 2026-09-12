const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  controlTokenPath,
  isLoopbackAddress,
  loadOrCreateControlToken,
  verifyRuntimeControlRequest
} = require('../src/runtime-control');

test('runtime control token is created and reused', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-control-'));
  const token = loadOrCreateControlToken(root);
  assert.equal(token.length > 20, true);
  assert.equal(fs.readFileSync(controlTokenPath(root), 'utf8').trim(), token);
  assert.equal(loadOrCreateControlToken(root), token);
});

test('runtime control only accepts loopback requests with the token', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('192.168.1.2'), false);

  const token = 'secret';
  assert.equal(verifyRuntimeControlRequest({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-paneboard-control-token': token }
  }, token), true);
  assert.equal(verifyRuntimeControlRequest({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-paneboard-control-token': 'wrong' }
  }, token), false);
  assert.equal(verifyRuntimeControlRequest({
    socket: { remoteAddress: '10.0.0.5' },
    headers: { 'x-paneboard-control-token': token }
  }, token), false);
});
