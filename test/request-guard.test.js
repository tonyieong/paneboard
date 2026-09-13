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

test('Tailscale literal addresses work without weakening the host allowlist', () => {
  for (const host of ['100.101.102.103:5022', '[fd7a:115c:a1e0::1234]:5022']) {
    assert.equal(isTrustedHost(host, []), true);
    assert.equal(isSameOrigin(`http://${host}`, host), true);
  }
});

test('MagicDNS names need an explicit allowlist entry, not a tailnet wildcard', () => {
  const hostname = 'desktop.example-tailnet.ts.net';
  const host = `${hostname}:5022`;
  assert.equal(isTrustedHost(host, []), false);
  assert.equal(isTrustedHost(host, [hostname]), true);
  assert.equal(isTrustedHost('other.example-tailnet.ts.net:5022', [hostname]), false);
  assert.equal(isTrustedHost(`${hostname}.attacker.example:5022`, [hostname]), false);
  assert.equal(isSameOrigin(`http://${host}`, host), true);
});

test('an Android loopback proxy cannot forward its own origin to a tailnet host', () => {
  const host = '100.101.102.103:5022';
  assert.equal(isSameOrigin('http://127.0.0.1:5022', host), false);
  assert.equal(isSameOrigin('http://localhost:5022', host), false);
  assert.equal(isSameOrigin('null', host), false);
  assert.equal(isSameOrigin(`http://${host}`, host), true);
});
