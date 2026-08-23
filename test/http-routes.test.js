// Exercises the Express/WebSocket layer in src/main.js against a real, running
// instance. AGENTS.md notes the rest of the suite never does this ("the suite
// does not exercise Express routing... verify against a running server"); this
// file is that verification, automated.
//
// main.js has no exported app-building function (it calls listen()/starts the
// tray/registers process-level handlers unconditionally, and stopRuntime()
// calls process.exit()), so it cannot safely be require()'d into this test
// process. Instead this spawns `node src/main.js` as a real child process
// against an isolated port and a temporary config/state, the same way
// scripts/verify-mobile-scroll.js does for the browser-driven check.
//
// Tests run in declaration order and share one instance: the early tests rely
// on the fresh default config having no password, and a later test sets one
// that every test after it depends on.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const root = path.join(__dirname, '..');
const configPath = path.join(root, 'config.toml');
const dataDir = path.join(root, 'data');
const statePath = path.join(dataDir, 'state.json');
const stateBakPath = path.join(dataDir, 'state.json.bak');
const controlTokenPath = path.join(dataDir, 'control-token');
const pluginPaneFixtureId = `http-route-fixture-${process.pid}`;
const aiPluginFixtureId = `http-route-ai-${process.pid}`;
const pluginPaneFixtureRoot = path.join(root, 'plugin-panes');
const pluginPaneFixtureDir = path.join(pluginPaneFixtureRoot, pluginPaneFixtureId);
const aiPluginFixtureDir = path.join(pluginPaneFixtureRoot, aiPluginFixtureId);

let port;
let child;
let configBackup;
let stateBackup;
let stateBakBackup;
let sessionToken = '';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port: assigned } = server.address();
      server.close(() => resolve(assigned));
    });
  });
}

function backupAside(file) {
  if (!fs.existsSync(file)) {
    return null;
  }
  const backup = `${file}.http-routes-test-backup`;
  fs.renameSync(file, backup);
  return backup;
}

function restoreFrom(file, backup) {
  if (fs.existsSync(file)) {
    fs.rmSync(file);
  }
  if (backup) {
    fs.renameSync(backup, file);
  }
}

function waitForHttp(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/config', timeout: 1000 }, (res) => {
        res.resume();
        res.statusCode === 200 ? resolve() : retry();
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`Server did not respond within ${timeoutMs}ms`));
        return;
      }
      setTimeout(attempt, 300);
    };
    attempt();
  });
}

// Same as waitForHttp, but against a port other than the shared instance's,
// for the port-fallback tests below which spawn their own throwaway children.
function waitForHttpOnPort(targetPort, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: '127.0.0.1', port: targetPort, path: '/api/config', timeout: 1000 }, (res) => {
        res.resume();
        res.statusCode === 200 ? resolve() : retry();
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`Nothing answered on port ${targetPort} within ${timeoutMs}ms`));
        return;
      }
      setTimeout(attempt, 300);
    };
    attempt();
  });
}

function waitForRuntimeInfo(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      let info = null;
      try {
        info = JSON.parse(fs.readFileSync(path.join(dataDir, 'runtime.json'), 'utf8'));
      } catch {
        // Not written yet.
      }
      if (info && predicate(info)) {
        resolve(info);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error('runtime.json did not reach the expected state in time'));
        return;
      }
      setTimeout(attempt, 200);
    };
    attempt();
  });
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.once('exit', (code) => resolve(code));
    setTimeout(() => resolve(null), timeoutMs).unref();
  });
}

// A thin request helper built on http.request rather than fetch(): fetch
// silently drops "forbidden" headers (Host, Origin, ...) per the Fetch spec,
// which is exactly what the Host-header rejection test needs to set.
function request(pathPart, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathPart,
      method,
      headers: {
        ...(payload !== undefined ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json;
        try {
          json = data ? JSON.parse(data) : undefined;
        } catch {
          json = undefined;
        }
        resolve({ status: res.statusCode, headers: res.headers, text: data, json });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

before(async () => {
  port = await freePort();
  configBackup = backupAside(configPath);
  stateBackup = backupAside(statePath);
  stateBakBackup = backupAside(stateBakPath);

  fs.mkdirSync(pluginPaneFixtureDir, { recursive: true });
  fs.writeFileSync(path.join(pluginPaneFixtureDir, 'pane.json'), JSON.stringify({
    name: 'HTTP route fixture',
    entry: 'index.html'
  }));
  fs.writeFileSync(path.join(pluginPaneFixtureDir, 'index.html'), '<!doctype html><title>Private fixture</title>');
  fs.mkdirSync(aiPluginFixtureDir, { recursive: true });
  fs.writeFileSync(path.join(aiPluginFixtureDir, 'pane.json'), JSON.stringify({
    name: 'Drop-in AI fixture',
    type: 'ai',
    provider: aiPluginFixtureId,
    implementation: aiPluginFixtureId
  }));
  fs.writeFileSync(path.join(aiPluginFixtureDir, 'server.js'), [
    'class AiManager {',
    '  updateConfig() {}',
    '  shutdown() {}',
    '  killSession() {}',
    '  killPane() {}',
    '  killTab() {}',
    '  attach(tabId, socket) { socket.send(JSON.stringify({ type: "hello", provider: "drop-in", events: [], pending: [], commands: [] })); }',
    '  restartTab() {}',
    '  resumeSession() { return true; }',
    '  clearTab() { return true; }',
    '}',
    'module.exports = { AiManager };'
  ].join('\n'));
  fs.writeFileSync(path.join(aiPluginFixtureDir, 'client.js'), `window.Wps7AiPanePlugins = window.Wps7AiPanePlugins || {}; window.Wps7AiPanePlugins['${aiPluginFixtureId}'] = { create() {} };`);
  fs.writeFileSync(path.join(aiPluginFixtureDir, 'styles.css'), '.drop-in-ai-fixture {}');

  fs.writeFileSync(configPath, [
    '[server]',
    'host = "127.0.0.1"',
    `port = ${port}`,
    'open_browser = false',
    '',
    '[auth]',
    'password_hash = ""',
    '',
    // As an older build would have written it. file_manager.enabled is retired,
    // so every file-manager test below doubles as proof that the leftover key
    // no longer turns those routes into 404s.
    '[file_manager]',
    'enabled = false',
    ''
  ].join('\n'));

  child = spawn(process.execPath, [path.join(root, 'src', 'main.js')], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await waitForHttp(20000);
});

after(async () => {
  try {
    const controlToken = fs.readFileSync(controlTokenPath, 'utf8').trim();
    await request('/api/runtime/shutdown', { method: 'POST', headers: { 'X-WPS7-Control-Token': controlToken } });
  } catch {
    // Nothing to shut down cleanly with; the kill below covers it.
  }
  await new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once('exit', resolve);
    setTimeout(resolve, 5000).unref();
  });
  if (child.exitCode === null) {
    child.kill();
  }

  restoreFrom(configPath, configBackup);
  restoreFrom(statePath, stateBackup);
  restoreFrom(stateBakPath, stateBakBackup);
  if (path.dirname(pluginPaneFixtureDir) === pluginPaneFixtureRoot) {
    fs.rmSync(pluginPaneFixtureDir, { recursive: true, force: true });
  }
  if (path.dirname(aiPluginFixtureDir) === pluginPaneFixtureRoot) {
    fs.rmSync(aiPluginFixtureDir, { recursive: true, force: true });
  }
});

test('serves the app shell over plain HTTP', async () => {
  const res = await request('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
});

test('rejects a request whose Host header does not match this server', async () => {
  // DNS rebinding: a page that resolves its own name to 127.0.0.1 would send
  // that name as Host. Anything not localhost/an IP/an allow-listed name must
  // be rejected before it reaches a single route.
  const res = await request('/api/config', { headers: { Host: 'evil.example.com' } });
  assert.equal(res.status, 403);
  assert.match(res.text, /Untrusted Host header/);
});

test('a malformed JSON body returns a structured error instead of an Express stack trace', async () => {
  const res = await request('/api/settings', { method: 'POST', body: '{not valid json' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.json, { error: 'Invalid request body.' });
  // The bug this guards against renders the stack (with this machine's
  // absolute paths) straight into the response body.
  assert.doesNotMatch(res.text, /\bat\s+\S+\s+\(/);
  assert.ok(!res.text.includes(root), 'response must not leak the server\'s filesystem root');
});

test(':param routes report 404 with a JSON body for an id that does not exist', async () => {
  const res = await request('/api/panes/does-not-exist/activate', { method: 'POST', body: {} });
  assert.equal(res.status, 404);
  assert.deepEqual(res.json, { error: 'Pane not found.' });
});

test('the default workspace state is reachable with no password set', async () => {
  const res = await request('/api/state');
  assert.equal(res.status, 200);
  assert.ok(res.json.sessions[0].tabs[0].panes[0].id);
});

test('plugin pane assets and pane creation work through the HTTP layer', async () => {
  const listed = await request('/api/plugin-panes');
  assert.equal(listed.status, 200);
  const definition = listed.json.panes.find((pane) => pane.id === pluginPaneFixtureId);
  assert.equal(definition.name, 'HTTP route fixture');
  assert.match(definition.url, new RegExp(`^/plugin-panes/[a-f0-9]{64}/${pluginPaneFixtureId}/index\\.html$`));

  const asset = await request(definition.url);
  assert.equal(asset.status, 200);
  assert.match(asset.text, /Private fixture/);
  assert.equal(asset.headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(asset.headers['content-security-policy'], /sandbox allow-scripts allow-forms/);

  const dropIn = listed.json.panes.find((pane) => pane.id === aiPluginFixtureId);
  assert.deepEqual(dropIn, {
    id: aiPluginFixtureId,
    name: 'Drop-in AI fixture',
    type: 'ai',
    provider: aiPluginFixtureId,
    implementation: aiPluginFixtureId,
    icon: 'external',
    clientUrl: `/plugin-panes/${aiPluginFixtureId}/client.js`,
    styleUrl: `/plugin-panes/${aiPluginFixtureId}/styles.css`
  });
  assert.equal((await request(dropIn.clientUrl)).status, 200);
  assert.equal((await request(dropIn.styleUrl)).status, 200);
  assert.equal((await request(`/plugin-panes/${aiPluginFixtureId}/server.js`)).status, 404);

  const whiteboard = listed.json.panes.find((pane) => pane.id === 'whiteboard');
  assert.deepEqual(whiteboard, {
    id: 'whiteboard',
    name: 'Whiteboard',
    type: 'host',
    icon: 'line',
    translations: { 'zh-HK': '白板' },
    clientUrl: '/plugin-panes/whiteboard/client.js',
    styleUrl: '/plugin-panes/whiteboard/styles.css',
    assetBaseUrl: '/plugin-panes/whiteboard/assets/'
  });
  assert.equal((await request(whiteboard.clientUrl)).status, 200);
  assert.equal((await request('/plugin-panes/whiteboard/assets/excalidraw/react.js')).status, 200);
  assert.equal((await request('/plugin-panes/whiteboard/server.js')).status, 404);

  const loaded = await request('/api/state');
  const basePaneId = loaded.json.sessions[0].tabs[0].panes[0].id;
  const created = await request(`/api/panes/${basePaneId}/plugin`, {
    method: 'POST',
    body: { pluginPaneId: pluginPaneFixtureId }
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.type, 'plugin');
  assert.equal(created.json.pluginPaneId, pluginPaneFixtureId);
  assert.equal(created.json.pluginData, '{}');

  const pluginData = JSON.stringify({ widgets: [{ id: 'clock' }] });
  const savedPluginData = await request(`/api/panes/${created.json.id}/plugin-data`, {
    method: 'PATCH',
    body: { pluginData }
  });
  assert.equal(savedPluginData.status, 200);
  assert.equal((await request('/api/state')).json.sessions[0].tabs[0].panes
    .find((pane) => pane.id === created.json.id).pluginData, pluginData);

  for (const provider of ['claude', 'codex']) {
    const builtIn = listed.json.panes.find((pane) => pane.id === provider);
    assert.deepEqual(builtIn, {
      id: provider,
      name: provider === 'claude' ? 'Claude' : 'Codex',
      type: 'ai',
      provider,
      implementation: provider,
      icon: provider === 'claude' ? 'ai' : 'codex',
      clientUrl: `/plugin-panes/${provider}/client.js`,
      styleUrl: `/plugin-panes/${provider}/styles.css`
    });
    for (const assetName of ['client.js', 'styles.css']) {
      const builtInAsset = await request(`/plugin-panes/${provider}/${assetName}`);
      assert.equal(builtInAsset.status, 200);
    }
    const serverSource = await request(`/plugin-panes/${provider}/server.js`);
    assert.equal(serverSource.status, 404);
    const aiPane = await request(`/api/panes/${basePaneId}/plugin`, {
      method: 'POST',
      body: { pluginPaneId: provider }
    });
    assert.equal(aiPane.status, 201);
    assert.equal(aiPane.json.type, 'ai');
    assert.equal(aiPane.json.aiTabs[0].provider, provider);
    await request(`/api/panes/${aiPane.json.id}`, { method: 'DELETE' });
  }

  const dropInPane = await request(`/api/panes/${basePaneId}/plugin`, {
    method: 'POST',
    body: { pluginPaneId: aiPluginFixtureId }
  });
  assert.equal(dropInPane.status, 201);
  assert.equal(dropInPane.json.aiTabs[0].provider, aiPluginFixtureId);
  await request(`/api/panes/${dropInPane.json.id}`, { method: 'DELETE' });

  const missing = await request(`/api/panes/${basePaneId}/plugin`, {
    method: 'POST',
    body: { pluginPaneId: 'missing-plugin-pane' }
  });
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.json, { error: 'Plugin pane not found.' });

  const closed = await request(`/api/panes/${created.json.id}`, { method: 'DELETE' });
  assert.equal(closed.status, 200);
});

test('file and notepad panes open with no password set', async () => {
  // Regression: the file-manager routes used to sit behind their own guard,
  // which answered 403 while auth.password_hash was empty, so the default local
  // install could not open a file or notepad pane at all -- even though the same
  // install hands out an unauthenticated PowerShell session, and config.js
  // already refuses to bind 0.0.0.0 without a password.
  const loaded = await request('/api/state');
  const basePaneId = loaded.json.sessions[0].tabs[0].panes[0].id;

  const filesPane = await request(`/api/panes/${basePaneId}/files`, { method: 'POST', body: { path: '' } });
  assert.equal(filesPane.status, 201);
  assert.equal(filesPane.json.type, 'files');

  const notepadPane = await request(`/api/panes/${basePaneId}/notepad`, { method: 'POST', body: { path: '' } });
  assert.equal(notepadPane.status, 201);
  assert.equal(notepadPane.json.type, 'notepad');

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-no-password-test-'));
  const listed = await request(`/api/files?path=${encodeURIComponent(folder)}`);
  assert.equal(listed.status, 200);
  fs.rmSync(folder, { recursive: true, force: true });

  for (const paneId of [filesPane.json.id, notepadPane.json.id]) {
    const closed = await request(`/api/panes/${paneId}`, { method: 'DELETE' });
    assert.equal(closed.status, 200);
  }
});

test('setting a password through /api/settings gates every authenticated route after it', async () => {
  const weak = await request('/api/settings', { method: 'POST', body: { auth: { password: 'short' } } });
  assert.equal(weak.status, 400);
  assert.match(weak.json.error, /at least 12 characters/);

  const strong = await request('/api/settings', { method: 'POST', body: { auth: { password: 'Correct-Horse-Battery-9' } } });
  assert.equal(strong.status, 200);
  assert.equal(strong.json.authRequired, true);

  const blocked = await request('/api/state');
  assert.equal(blocked.status, 401);
});

test('logging in with the wrong password is rejected and the right one issues a working token', async () => {
  const wrong = await request('/api/login', { method: 'POST', body: { password: 'not the password' } });
  assert.equal(wrong.status, 401);

  const right = await request('/api/login', { method: 'POST', body: { password: 'Correct-Horse-Battery-9' } });
  assert.equal(right.status, 200);
  assert.ok(right.json.token);
  sessionToken = right.json.token;

  const authed = await request('/api/state', { headers: { Authorization: `Bearer ${sessionToken}` } });
  assert.equal(authed.status, 200);
});

test('saved notepad pane settings survive a reopen of the settings dialog', async () => {
  // Regression: settingsConfig() used to omit these three ui keys from its
  // response, so GET /api/settings (what reopening the dialog fetches) always
  // read them back as undefined even though config.toml had the saved value.
  const auth = { Authorization: `Bearer ${sessionToken}` };

  const saved = await request('/api/settings', {
    method: 'POST',
    headers: auth,
    body: { ui: { notepad_word_wrap: true, notepad_indent_guides: true, notepad_autosave: true } }
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.ui.notepad_word_wrap, true);
  assert.equal(saved.json.ui.notepad_indent_guides, true);
  assert.equal(saved.json.ui.notepad_autosave, true);

  const reopened = await request('/api/settings', { headers: auth });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.json.ui.notepad_word_wrap, true);
  assert.equal(reopened.json.ui.notepad_indent_guides, true);
  assert.equal(reopened.json.ui.notepad_autosave, true);
});

test('a full create/list/delete round trip through the file manager routes', async () => {
  const auth = { Authorization: `Bearer ${sessionToken}` };
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-http-route-test-'));

  const created = await request('/api/files/folder', { method: 'POST', headers: auth, body: { path: parent, name: 'route-test-folder' } });
  assert.equal(created.status, 201);
  assert.equal(created.json.type, 'directory');

  const listed = await request(`/api/files?path=${encodeURIComponent(parent)}`, { headers: auth });
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.json.entries.map((entry) => entry.name), ['route-test-folder']);

  const deleted = await request('/api/files', { method: 'DELETE', headers: auth, body: { path: created.json.path } });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.json.ok, true);
});

test('a WebSocket upgrade is rejected for an untrusted Host or cross-origin request', async () => {
  const untrustedHost = new WebSocket(`ws://127.0.0.1:${port}/ws?paneId=x`, { headers: { Host: 'evil.example.com' } });
  const untrustedHostClose = await new Promise((resolve, reject) => {
    untrustedHost.on('close', (code) => resolve(code));
    untrustedHost.on('error', reject);
  });
  assert.equal(untrustedHostClose, 1008);

  const crossOrigin = new WebSocket(`ws://127.0.0.1:${port}/ws?paneId=x`, { headers: { Origin: 'http://evil.example.com' } });
  const crossOriginClose = await new Promise((resolve, reject) => {
    crossOrigin.on('close', (code) => resolve(code));
    crossOrigin.on('error', reject);
  });
  assert.equal(crossOriginClose, 1008);
});

test('a WebSocket upgrade without a valid session token is rejected once a password is set', async () => {
  const noToken = new WebSocket(`ws://127.0.0.1:${port}/ws?paneId=x`);
  const closeCode = await new Promise((resolve, reject) => {
    noToken.on('close', (code) => resolve(code));
    noToken.on('error', reject);
  });
  assert.equal(closeCode, 1008);
});

test('a WebSocket upgrade with a valid session token and pane id connects', async () => {
  const state = await request('/api/state', { headers: { Authorization: `Bearer ${sessionToken}` } });
  const paneId = state.json.sessions[0].tabs[0].panes[0].id;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?paneId=${paneId}&token=${sessionToken}`);
  try {
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
      ws.on('close', (code) => reject(new Error(`closed early with code ${code}`)));
    });
  } finally {
    ws.close();
  }
});

// These two tests each spawn their own throwaway main.js child on a fresh
// port, independent of the shared instance above. They overwrite config.toml
// while doing so, which is safe: nothing after them re-reads it (the shared
// instance already has its config in memory), and after() restores the
// original file from its own backup regardless of what is left on disk.
test('falls back to the next free port when the configured one is held by another process', async () => {
  const busyPort = await freePort();
  const blocker = net.createServer();
  await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(busyPort, '127.0.0.1', resolve);
  });

  fs.writeFileSync(configPath, [
    '[server]',
    'host = "127.0.0.1"',
    `port = ${busyPort}`,
    'open_browser = false',
    '',
    '[auth]',
    'password_hash = ""',
    ''
  ].join('\n'));

  const fallbackChild = spawn(process.execPath, [path.join(root, 'src', 'main.js')], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    const info = await waitForRuntimeInfo(
      (candidate) => candidate.pid === fallbackChild.pid && candidate.port > busyPort,
      20000
    );
    await waitForHttpOnPort(info.port, 5000);
  } finally {
    fallbackChild.kill();
    await waitForExit(fallbackChild, 3000);
    blocker.close();
  }
});

test('a genuine duplicate launch on the same port still exits instead of hopping to a new port', async () => {
  const dupPort = await freePort();
  fs.writeFileSync(configPath, [
    '[server]',
    'host = "127.0.0.1"',
    `port = ${dupPort}`,
    'open_browser = false',
    '',
    '[auth]',
    'password_hash = ""',
    ''
  ].join('\n'));

  const first = spawn(process.execPath, [path.join(root, 'src', 'main.js')], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForRuntimeInfo((candidate) => candidate.pid === first.pid && candidate.port === dupPort, 20000);
    await waitForHttpOnPort(dupPort, 5000);

    const second = spawn(process.execPath, [path.join(root, 'src', 'main.js')], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const secondExitCode = await waitForExit(second, 8000);
    assert.equal(secondExitCode, 1);

    // The duplicate must not have stolen the next port for itself.
    await assert.rejects(waitForHttpOnPort(dupPort + 1, 1500));

    // The original instance is still the one recorded and still answering.
    const runtimeInfo = JSON.parse(fs.readFileSync(path.join(dataDir, 'runtime.json'), 'utf8'));
    assert.equal(runtimeInfo.pid, first.pid);
    assert.equal(runtimeInfo.port, dupPort);
    await waitForHttpOnPort(dupPort, 2000);
  } finally {
    first.kill();
    await waitForExit(first, 3000);
  }
});

test('protocol = "https" serves the app shell over TLS with a generated self-signed certificate', async () => {
  const tlsPort = await freePort();
  const keyPath = path.join(dataDir, 'tls-key.pem');
  const certPath = path.join(dataDir, 'tls-cert.pem');
  const keyBackup = backupAside(keyPath);
  const certBackup = backupAside(certPath);
  fs.writeFileSync(configPath, [
    '[server]',
    'host = "127.0.0.1"',
    `port = ${tlsPort}`,
    'protocol = "https"',
    'open_browser = false',
    '',
    '[auth]',
    'password_hash = ""',
    ''
  ].join('\n'));

  const tlsChild = spawn(process.execPath, [path.join(root, 'src', 'main.js')], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForRuntimeInfo((candidate) => candidate.pid === tlsChild.pid && candidate.port === tlsPort, 20000);
    assert.ok(fs.existsSync(keyPath), 'expected data/tls-key.pem to be generated');
    assert.ok(fs.existsSync(certPath), 'expected data/tls-cert.pem to be generated');

    const res = await new Promise((resolve, reject) => {
      const req = https.get({ host: '127.0.0.1', port: tlsPort, path: '/', rejectUnauthorized: false, timeout: 5000 }, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('https request timed out')); });
    });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);

    // Plain HTTP against the same port must not be answered by the TLS server.
    await assert.rejects(waitForHttpOnPort(tlsPort, 1500));
  } finally {
    tlsChild.kill();
    await waitForExit(tlsChild, 3000);
    restoreFrom(keyPath, keyBackup);
    restoreFrom(certPath, certBackup);
  }
});
