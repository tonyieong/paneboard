const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter, isSameOrigin, isTrustedHost } = require('../src/request-guard');

test('trusted hosts accept addresses but reject rebinding domains', () => {
  assert.equal(isTrustedHost('127.0.0.1:5000', []), true);
  assert.equal(isTrustedHost('localhost:5000', []), true);
  assert.equal(isTrustedHost('[::1]:5000', []), true);
  assert.equal(isTrustedHost('192.168.1.5:5000', []), true);
  assert.equal(isTrustedHost('127.0.0.1', []), true);

  // A DNS rebinding attack has to use a name the attacker controls, so a Host
  // header that is not an address is only trusted when it was configured.
  assert.equal(isTrustedHost('attacker.example.com:5000', []), false);
  assert.equal(isTrustedHost('paneboard.internal:5000', ['paneboard.internal']), true);
  assert.equal(isTrustedHost('Paneboard.Internal:5000', ['paneboard.internal']), true);
  assert.equal(isTrustedHost('attacker.example.com:5000', ['paneboard.internal']), false);
  assert.equal(isTrustedHost('', []), false);
  assert.equal(isTrustedHost(undefined, []), false);
});

test('a wildcard entry accepts every name but still needs a Host header', () => {
  assert.equal(isTrustedHost('win-ai:5000', ['*']), true);
  assert.equal(isTrustedHost('attacker.example.com:5000', ['*']), true);
  assert.equal(isTrustedHost('paneboard.internal:5000', ['paneboard.internal', '*']), true);
  assert.equal(isTrustedHost(' * ', ['*']), false);
  assert.equal(isTrustedHost('', ['*']), false);
  assert.equal(isTrustedHost(undefined, ['*']), false);
});

test('same origin allows non-browser clients but rejects cross-site upgrades', () => {
  // Terminal clients and curl send no Origin at all.
  assert.equal(isSameOrigin(undefined, '127.0.0.1:5000'), true);
  assert.equal(isSameOrigin('', '127.0.0.1:5000'), true);

  assert.equal(isSameOrigin('http://127.0.0.1:5000', '127.0.0.1:5000'), true);
  assert.equal(isSameOrigin('https://127.0.0.1:5000', '127.0.0.1:5000'), true);
  assert.equal(isSameOrigin('http://evil.example.com', '127.0.0.1:5000'), false);
  assert.equal(isSameOrigin('http://127.0.0.1:6000', '127.0.0.1:5000'), false);
  assert.equal(isSameOrigin('null', '127.0.0.1:5000'), false);
});

test('rate limiter blocks a key after the limit and recovers when the window passes', () => {
  let clock = 1000;
  const limiter = createRateLimiter({ limit: 3, windowMs: 60000, now: () => clock });

  assert.equal(limiter.check('1.2.3.4').allowed, true);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    limiter.record('1.2.3.4');
  }
  const blocked = limiter.check('1.2.3.4');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 60000);

  // A different caller is unaffected.
  assert.equal(limiter.check('5.6.7.8').allowed, true);

  clock += 60001;
  assert.equal(limiter.check('1.2.3.4').allowed, true);
});

test('rate limiter forgets a key once the caller succeeds', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 60000, now: () => 1000 });
  limiter.record('1.2.3.4');
  limiter.record('1.2.3.4');
  assert.equal(limiter.check('1.2.3.4').allowed, false);

  limiter.reset('1.2.3.4');
  assert.equal(limiter.check('1.2.3.4').allowed, true);
});
