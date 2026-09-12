const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { fetchClaudeUsage, fetchCodexUsage, fetchMiniMaxUsage, fetchUsageOverview, keepLastGoodUsage, resolveCliHome, systemNodeFetch } = require('../src/usage');

function fakeNodeSpawn(handler) {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    const child = new EventEmitter();
    const stdout = new PassThrough();
    let stdin = '';
    child.stdout = stdout;
    child.stdin = {
      end(value) {
        stdin = value;
        const reply = handler({ command, args, options, stdin });
        setImmediate(() => {
          if (reply !== null) {
            stdout.write(reply);
          }
          child.emit('close', 0);
        });
      }
    };
    child.kill = () => {};
    calls.push({ command, args, options, get stdin() { return stdin; } });
    return child;
  };
  return { spawnImpl, calls };
}

test('reads Codex rate limits from the local OAuth account without exposing identity', async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-codex-'));
  fs.writeFileSync(path.join(codexHome, 'auth.json'), JSON.stringify({
    tokens: { access_token: 'secret-token' }
  }));
  const result = await fetchCodexUsage({
    codexHome,
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer secret-token');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          email: 'hidden@example.com',
          plan_type: 'plus',
          rate_limit: {
            primary_window: { used_percent: 25, limit_window_seconds: 18000, reset_at: 1800000000 },
            secondary_window: { used_percent: 40, limit_window_seconds: 604800, reset_at: 1800600000 }
          },
          credits: { balance: '12.5', has_credits: true, unlimited: false }
        })
      };
    }
  });

  assert.equal(result.provider, 'codex');
  assert.equal(result.plan, 'plus');
  assert.deepEqual(result.windows.map((window) => [window.label, window.usedPercent]), [['5-hour', 25], ['Weekly', 40]]);
  assert.equal(result.credits.balance, 12.5);
  assert.equal('email' in result, false);
});

test('uses Codex app-server to refresh subscription login and read rate limits', async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-codex-'));
  fs.writeFileSync(path.join(codexHome, 'auth.json'), JSON.stringify({
    tokens: { access_token: 'expired-token', refresh_token: 'refresh-token' }
  }));
  const spawnImpl = (_command, _args, options) => {
    assert.equal(options.env.CODEX_HOME, codexHome);
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => child.emit('exit', 0);
    let input = '';
    child.stdin.on('data', (chunk) => {
      input += chunk.toString();
      while (input.includes('\n')) {
        const end = input.indexOf('\n');
        const message = JSON.parse(input.slice(0, end));
        input = input.slice(end + 1);
        if (message.method === 'initialize') {
          child.stdout.write(`${JSON.stringify({ id: message.id, result: { userAgent: 'codex-test' } })}\n`);
        } else if (message.method === 'account/read') {
          assert.equal(message.params.refreshToken, true);
          child.stdout.write(`${JSON.stringify({
            id: message.id,
            result: { account: { type: 'chatgpt', email: 'hidden@example.com', planType: 'plus' } }
          })}\n`);
        } else if (message.method === 'account/rateLimits/read') {
          child.stdout.write(`${JSON.stringify({
            id: message.id,
            result: {
              rateLimits: {
                primary: { usedPercent: 26, windowDurationMins: 300, resetsAt: 1800000000 },
                secondary: { usedPercent: 41, windowDurationMins: 10080, resetsAt: 1800600000 },
                credits: { balance: 8, hasCredits: true, unlimited: false }
              }
            }
          })}\n`);
        }
      }
    });
    return child;
  };

  const result = await fetchCodexUsage({
    codexHome,
    spawnImpl,
    fetchImpl: async () => ({ ok: false, status: 401 })
  });

  assert.equal(result.source, 'oauth');
  assert.equal(result.plan, 'plus');
  assert.deepEqual(result.windows.map((window) => [window.label, window.usedPercent]), [['5-hour', 26], ['Weekly', 41]]);
  assert.equal(result.credits.balance, 8);
  assert.equal('email' in result, false);
});

test('reads Codex banked reset credits alongside rate limits', async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-codex-'));
  fs.writeFileSync(path.join(codexHome, 'auth.json'), JSON.stringify({
    tokens: { access_token: 'secret-token', account_id: 'acct-123' }
  }));
  const result = await fetchCodexUsage({
    codexHome,
    fetchImpl: async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer secret-token');
      if (url === 'https://chatgpt.com/backend-api/wham/usage') {
        return { ok: true, status: 200, json: async () => ({ plan_type: 'plus', rate_limit: {} }) };
      }
      assert.equal(url, 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits');
      assert.equal(options.headers['ChatGPT-Account-Id'], 'acct-123');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          available_count: 2,
          credits: [
            { id: 'c1', status: 'available', expires_at: '2027-02-01T00:00:00Z' },
            { id: 'c2', status: 'available', expires_at: '2027-01-15T00:00:00Z' },
            { id: 'c3', status: 'consumed', expires_at: '2026-06-01T00:00:00Z' }
          ]
        })
      };
    }
  });

  // The nearest expiry among the *available* credits is what is worth showing,
  // not the earliest of all of them, since a consumed one is no longer at risk.
  assert.deepEqual(result.resetCredits, { count: 2, expiresAt: '2027-01-15T00:00:00.000Z' });
});

test('does not fail Codex usage when the reset-credit lookup fails', async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-codex-'));
  fs.writeFileSync(path.join(codexHome, 'auth.json'), JSON.stringify({
    tokens: { access_token: 'secret-token' }
  }));
  const result = await fetchCodexUsage({
    codexHome,
    fetchImpl: async (url) => {
      if (url === 'https://chatgpt.com/backend-api/wham/usage') {
        return { ok: true, status: 200, json: async () => ({ plan_type: 'plus', rate_limit: {} }) };
      }
      return { ok: false, status: 500, text: async () => 'boom' };
    }
  });

  assert.equal(result.provider, 'codex');
  assert.equal(result.resetCredits, null);
});

test('reads MiniMax Coding Plan windows with bearer authentication', async () => {
  const result = await fetchMiniMaxUsage({
    apiKey: 'sk-cp-secret',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.minimax.io/v1/token_plan/remains');
      assert.equal(options.headers.Authorization, 'Bearer sk-cp-secret');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model_remains: [{
            model_name: 'general',
            current_interval_remaining_percent: 72,
            current_weekly_remaining_percent: 61,
            end_time: 1800000000000,
            weekly_end_time: 1800600000000
          }],
          base_resp: { status_code: 0 }
        })
      };
    }
  });

  assert.equal(result.provider, 'minimax');
  assert.deepEqual(result.services[0].windows.map((window) => window.usedPercent), [28, 39]);
});

test('reads Claude Code limits from the local OAuth account without exposing identity', async () => {
  const claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-claude-'));
  fs.writeFileSync(path.join(claudeHome, '.credentials.json'), JSON.stringify({
    claudeAiOauth: { accessToken: 'claude-secret-token' }
  }));
  const result = await fetchClaudeUsage({
    claudeHome,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.anthropic.com/api/oauth/usage');
      assert.equal(options.headers.Authorization, 'Bearer claude-secret-token');
      assert.equal(options.headers['anthropic-beta'], 'oauth-2025-04-20');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          five_hour: { utilization: 21, resets_at: '2027-01-01T05:00:00Z' },
          seven_day: { utilization: 34, resets_at: '2027-01-07T00:00:00Z' },
          seven_day_sonnet: { utilization: 18, resets_at: '2027-01-07T00:00:00Z' },
          account: { email: 'hidden@example.com' }
        })
      };
    }
  });

  assert.equal(result.provider, 'claude');
  assert.deepEqual(result.windows.map((window) => [window.label, window.usedPercent]), [
    ['5-hour', 21],
    ['Weekly', 34],
    ['Sonnet weekly', 18]
  ]);
  assert.equal('account' in result, false);
});

test('refreshes an expired Claude subscription login through the CLI before retrying usage', async () => {
  const claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-claude-'));
  const credentialsPath = path.join(claudeHome, '.credentials.json');
  fs.writeFileSync(credentialsPath, JSON.stringify({
    claudeAiOauth: { accessToken: 'expired-token', refreshToken: 'refresh-token' }
  }));
  let requestCount = 0;
  const ptyImpl = {
    spawn(_command, _args, options) {
      assert.equal(options.env.CLAUDE_CONFIG_DIR, claudeHome);
      let dataHandler = () => {};
      return {
        onData(handler) {
          dataHandler = handler;
        },
        onExit() {},
        write(value) {
          assert.equal(value, '/status\r');
          fs.writeFileSync(credentialsPath, JSON.stringify({
            claudeAiOauth: { accessToken: 'fresh-token', refreshToken: 'next-refresh-token' }
          }));
          dataHandler('Status');
        },
        kill() {}
      };
    }
  };

  const result = await fetchClaudeUsage({
    claudeHome,
    ptyImpl,
    fetchImpl: async (_url, options) => {
      requestCount += 1;
      if (requestCount === 1) {
        assert.equal(options.headers.Authorization, 'Bearer expired-token');
        return { ok: false, status: 401 };
      }
      assert.equal(options.headers.Authorization, 'Bearer fresh-token');
      return {
        ok: true,
        status: 200,
        json: async () => ({ five_hour: { utilization: 9, resets_at: '2027-01-01T05:00:00Z' } })
      };
    }
  });

  assert.equal(requestCount, 2);
  assert.equal(result.source, 'oauth');
  assert.deepEqual(result.windows.map((window) => window.usedPercent), [9]);
});

// api.anthropic.com/api/oauth/usage rate limits per OAuth token, and every
// Claude Code CLI signed in as the same account draws on that budget, so the
// pane sees a 429 while the login is perfectly good.
test('reports a Claude rate limit as such and does not re-login over it', async () => {
  const claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-claude-'));
  fs.writeFileSync(path.join(claudeHome, '.credentials.json'), JSON.stringify({
    claudeAiOauth: { accessToken: 'claude-token' }
  }));
  let requestCount = 0;
  const ptyImpl = {
    spawn() {
      throw new Error('the CLI must not be started for a rate limit');
    }
  };

  await assert.rejects(fetchClaudeUsage({
    claudeHome,
    ptyImpl,
    fetchImpl: async () => {
      requestCount += 1;
      return { ok: false, status: 429, text: async () => '{"error":{"type":"rate_limit_error"}}' };
    }
  }), (error) => error.message === 'Provider rate limit reached.' && error.code === 'PROVIDER_RATE_LIMIT');

  assert.equal(requestCount, 1);
});

test('a failed lookup falls back to the last good reading until it goes out of date', () => {
  const cache = new Map();
  const good = [{ provider: 'claude', windows: [{ usedPercent: 42 }] }, { provider: 'codex', windows: [] }];
  assert.deepEqual(keepLastGoodUsage(good, cache, 1000), good);

  const limited = [{ provider: 'claude', error: 'Provider rate limit reached.' }, { provider: 'codex', windows: [] }];
  const [claude] = keepLastGoodUsage(limited, cache, 61000);
  assert.deepEqual(claude.windows, [{ usedPercent: 42 }]);
  assert.equal(claude.stale, 'Provider rate limit reached.');
  assert.equal('error' in claude, false);

  // Past the window the reading no longer describes the quota, so the error stands.
  assert.deepEqual(keepLastGoodUsage(limited, cache, 1000 + 31 * 60000)[0], limited[0]);

  // Nothing was ever read for a provider that fails on its first lookup.
  assert.deepEqual(keepLastGoodUsage([{ provider: 'minimax', error: 'MiniMax API key is not configured.' }], cache, 1000), [
    { provider: 'minimax', error: 'MiniMax API key is not configured.' }
  ]);
});

test('sends usage lookups through the system Node binary without putting the token on the command line', async () => {
  const { spawnImpl, calls } = fakeNodeSpawn(() => JSON.stringify({
    status: 200,
    body: JSON.stringify({ five_hour: { utilization: 12 } })
  }));

  const response = await systemNodeFetch('https://api.anthropic.com/api/oauth/usage', {
    headers: { Authorization: 'Bearer sk-ant-oat01-supersecretvalue' }
  }, spawnImpl);

  assert.equal(response.ok, true);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { five_hour: { utilization: 12 } });

  assert.equal(calls.length, 1);
  assert.match(calls[0].command, /node(\.exe)?$/);
  assert.equal(calls[0].args[0], '-e');
  // The token must travel over stdin only, never as an argument another process could read.
  assert.doesNotMatch(calls[0].args.join(' '), /supersecretvalue/);
  assert.match(calls[0].stdin, /supersecretvalue/);
  assert.equal(JSON.parse(calls[0].stdin).url, 'https://api.anthropic.com/api/oauth/usage');
});

test('surfaces the upstream status when the system Node lookup is rejected', async () => {
  const { spawnImpl } = fakeNodeSpawn(() => JSON.stringify({
    status: 403,
    body: '{"error":{"type":"forbidden","message":"Request not allowed"}}'
  }));

  const response = await systemNodeFetch('https://api.anthropic.com/api/oauth/usage', {}, spawnImpl);

  assert.equal(response.ok, false);
  assert.equal(response.status, 403);
  assert.match(await response.text(), /Request not allowed/);
});

test('reports a clear error when the system Node lookup fails to run', async () => {
  const { spawnImpl } = fakeNodeSpawn(() => JSON.stringify({ error: 'getaddrinfo ENOTFOUND' }));

  await assert.rejects(
    systemNodeFetch('https://api.anthropic.com/api/oauth/usage', {}, spawnImpl),
    /getaddrinfo ENOTFOUND/
  );
});

test('logs Claude usage diagnostics without exposing the access token', async () => {
  const claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-claude-'));
  fs.writeFileSync(path.join(claudeHome, '.credentials.json'), JSON.stringify({
    claudeAiOauth: { accessToken: 'sk-ant-oat01-supersecretvalue', expiresAt: 1785087789090 }
  }));
  const messages = [];
  const ptyImpl = {
    spawn() {
      throw new Error('pty unavailable');
    }
  };

  await assert.rejects(fetchClaudeUsage({
    claudeHome,
    ptyImpl,
    log: (message) => messages.push(message),
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      text: async () => '{"error":{"type":"authentication_error"}}'
    })
  }), /Run \/login in Claude Code/);

  const joined = messages.join('\n');
  assert.match(joined, /claude home=/);
  assert.match(joined, /expiresAt=2026-07-26T17:43:09\.090Z/);
  assert.match(joined, /status=401/);
  assert.match(joined, /authentication_error/);
  assert.match(joined, /claude cli spawn failed: pty unavailable/);
  assert.match(joined, /tokenLength=29/);
  assert.doesNotMatch(joined, /sk-ant-oat01/);
  assert.doesNotMatch(joined, /supersecretvalue/);
});

test('usage overview keeps enabled providers available when another fails', async () => {
  const overview = await fetchUsageOverview({
    codex: () => Promise.resolve({ provider: 'codex', windows: [] }),
    claude: () => Promise.resolve({ provider: 'claude', windows: [] }),
    minimax: () => Promise.reject(new Error('MiniMax API key is not configured.'))
  });

  assert.equal(overview.providers[0].provider, 'codex');
  assert.equal(overview.providers[1].provider, 'claude');
  assert.equal(overview.providers[2].provider, 'minimax');
  assert.equal(overview.providers[2].error, 'MiniMax API key is not configured.');
});

test('codex window kinds follow the reported window length, not the window slot', async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-codex-'));
  fs.writeFileSync(path.join(codexHome, 'auth.json'), JSON.stringify({
    tokens: { access_token: 'codex-token' }
  }));
  const result = await fetchCodexUsage({
    codexHome,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        rate_limit: {
          primary_window: { used_percent: 10, limit_window_seconds: 604800, reset_at: 1800000000 },
          secondary_window: { used_percent: 20, limit_window_seconds: 18000, reset_at: 1800600000 }
        }
      })
    })
  });

  assert.deepEqual(result.windows.map((window) => [window.label, window.kind]), [
    ['Weekly', 'weekly'],
    ['5-hour', 'five_hour']
  ]);
});

// An API key cannot read subscription quotas, so the signed-in CLI account is the
// only source and the error must not suggest configuring a key.
test('reports a missing CLI sign-in without mentioning an API key', async () => {
  await assert.rejects(
    fetchCodexUsage({ codexHome: path.join(os.tmpdir(), 'paneboard-codex-missing') }),
    (error) => error.message === 'Codex is not signed in on this server.'
  );
  await assert.rejects(
    fetchClaudeUsage({ claudeHome: path.join(os.tmpdir(), 'paneboard-claude-missing') }),
    (error) => error.message === 'Claude Code is not signed in on this server.'
  );
});

test('usage overview keeps only the window kinds and extras enabled in settings', async () => {
  const overview = await fetchUsageOverview({
    claude: () => Promise.resolve({
      provider: 'claude',
      windows: [
        { kind: 'five_hour', label: '5-hour' },
        { kind: 'weekly', label: 'Weekly' },
        { kind: 'model_weekly', label: 'Opus weekly' }
      ],
      credits: { balance: 5, hasCredits: true, unlimited: false }
    }),
    minimax: () => Promise.resolve({
      provider: 'minimax',
      services: [{ id: 'general', windows: [{ kind: 'five_hour', label: '5-hour' }, { kind: 'weekly', label: 'Weekly' }] }]
    }),
    content: { five_hour: false, weekly: true, model_weekly: false, credits: false }
  });

  assert.deepEqual(overview.providers[0].windows.map((window) => window.label), ['Weekly']);
  assert.equal(overview.providers[0].credits, null);
  assert.deepEqual(overview.providers[1].services[0].windows.map((window) => window.label), ['Weekly']);
});

test('usage overview omits disabled providers', async () => {
  const overview = await fetchUsageOverview({
    codex: null,
    claude: () => Promise.resolve({ provider: 'claude', windows: [] }),
    minimax: null
  });

  assert.deepEqual(overview.providers.map((provider) => provider.provider), ['claude']);
});

// codex login / claude write credentials under the profile of whoever ran them,
// so an account that never ran them has to look at the profiles beside its own.
function profileTree(logins) {
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-profiles-'));
  for (const [index, { user, subfolder, marker }] of logins.entries()) {
    const home = path.join(profileRoot, user, subfolder);
    fs.mkdirSync(home, { recursive: true });
    const file = path.join(home, marker);
    fs.writeFileSync(file, '{}');
    // Spread the timestamps so "most recent login" is unambiguous.
    const when = new Date(Date.now() - (logins.length - index) * 60000);
    fs.utimesSync(file, when, when);
  }
  return profileRoot;
}

test('the CLI home falls back to a signed-in profile beside this account', () => {
  const profileRoot = profileTree([
    { user: 'older', subfolder: '.codex', marker: 'auth.json' },
    { user: 'newer', subfolder: '.codex', marker: 'auth.json' },
    { user: 'wrong-cli', subfolder: '.claude', marker: '.credentials.json' }
  ]);
  const homedir = path.join(profileRoot, 'service-account');
  fs.mkdirSync(homedir, { recursive: true });

  const home = resolveCliHome({ subfolder: '.codex', marker: 'auth.json', homedir, profileRoot });
  assert.equal(home, path.join(profileRoot, 'newer', '.codex'));

  // An explicit setting and the CLI's own variable both win over the search.
  assert.equal(
    resolveCliHome({ configured: 'C:\\pinned', subfolder: '.codex', marker: 'auth.json', homedir, profileRoot }),
    'C:\\pinned'
  );
  assert.equal(
    resolveCliHome({ fromEnv: 'C:\\from-env', subfolder: '.codex', marker: 'auth.json', homedir, profileRoot }),
    'C:\\from-env'
  );

  fs.rmSync(profileRoot, { recursive: true, force: true });
});

test('the CLI home prefers this account and survives an unreadable profile root', () => {
  const profileRoot = profileTree([{ user: 'other', subfolder: '.codex', marker: 'auth.json' }]);
  const homedir = path.join(profileRoot, 'mine');
  fs.mkdirSync(path.join(homedir, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(homedir, '.codex', 'auth.json'), '{}');

  // Its own login is used without reading anyone else's profile.
  assert.equal(
    resolveCliHome({ subfolder: '.codex', marker: 'auth.json', homedir, profileRoot }),
    path.join(homedir, '.codex')
  );

  // Nothing signed in anywhere reachable still names where a login would land,
  // which is also what happens when the profile root cannot be listed at all.
  const bare = path.join(profileRoot, 'bare');
  assert.equal(
    resolveCliHome({ subfolder: '.claude', marker: '.credentials.json', homedir: bare, profileRoot: path.join(profileRoot, 'missing') }),
    path.join(bare, '.claude')
  );

  fs.rmSync(profileRoot, { recursive: true, force: true });
});
