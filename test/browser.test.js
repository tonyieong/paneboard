const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const WebSocket = require('ws');

const {
  BrowserManager,
  RemoteBrowserPage,
  chromeArguments,
  chromiumProfileCleanupCommand,
  desktopUserAgent,
  findChromiumExecutable,
  isOwnServerWebsite,
  mobileUserAgent,
  normalizeEmulationMode,
  normalizeViewport,
  SELECT_POPUP_SCRIPT,
  terminateStaleChromium,
  userAgentMetadata
} = require('../src/browser');

test('remote browser launches an isolated headless Chromium profile', () => {
  const executable = findChromiumExecutable({
    existsSync: (candidate) => candidate.includes('Google\\Chrome')
  }, 'win32');
  assert.match(executable, /Google\\Chrome\\Application\\chrome\.exe$/);

  const args = chromeArguments('C:\\paneboard\\data\\browser-profile');
  assert.ok(args.includes('--headless=new'));
  assert.ok(args.includes('--remote-debugging-port=0'));
  assert.ok(args.includes('--user-data-dir=C:\\paneboard\\data\\browser-profile'));
  assert.ok(args.includes('--auto-accept-this-tab-capture'));
  assert.ok(args.includes('--auto-select-tab-capture-source-by-title=Paneboard Capture Target'));
  assert.ok(args.includes('--autoplay-policy=no-user-gesture-required'));
});

test('Chromium executable search falls back to Edge and then reports nothing found', () => {
  const edgeOnly = findChromiumExecutable({
    existsSync: (candidate) => candidate.includes('Microsoft\\Edge')
  }, 'win32');
  assert.match(edgeOnly, /Microsoft\\Edge\\Application\\msedge\.exe$/);

  const nothingInstalled = findChromiumExecutable({ existsSync: () => false }, 'win32');
  assert.equal(nothingInstalled, '');
});

test('a Linux server finds Chrome or Chromium where its packages install them', () => {
  assert.equal(findChromiumExecutable({ existsSync: (candidate) => candidate === '/usr/bin/chromium-browser' }, 'linux'), '/usr/bin/chromium-browser');
  assert.equal(findChromiumExecutable({ existsSync: (candidate) => candidate.includes('Google') }, 'linux'), '');
});

test('headless Chromium does not announce itself as automation controlled', () => {
  // Headless Chromium sets navigator.webdriver to true, which every major bot
  // check (reCAPTCHA, Cloudflare, Akamai) reads first. It made Browser panes
  // hit "verify you are human" interstitials on ordinary browsing.
  assert.ok(chromeArguments('C:\\paneboard\\data\\browser-profile').includes('--disable-blink-features=AutomationControlled'));
});

test('a masked user agent ships the matching Client Hints metadata', () => {
  // Emulation.setUserAgentOverride wipes Chromium's Client Hints unless the
  // metadata is supplied too: Sec-CH-UA/-Mobile/-Platform stop being sent and
  // navigator.userAgentData goes blank. A Chrome user agent with no Client
  // Hints at all is a louder automation signal than the Headless marker was.
  const desktop = userAgentMetadata('desktop', 'win32');
  assert.equal(desktop.mobile, false);
  assert.equal(desktop.platform, 'Windows');
  // Headless Chromium on Linux announces X11; Linux, so the hints must agree.
  assert.equal(userAgentMetadata('desktop', 'linux').platform, 'Linux');
  assert.ok(desktop.platformVersion);
  assert.equal(desktop.model, '');

  const mobile = userAgentMetadata('mobile');
  assert.equal(mobile.mobile, true);
  assert.equal(mobile.platform, 'Android');
  assert.match(mobileUserAgent('Mozilla/5.0 Chrome/150.0.7339.12 Safari/537.36'), new RegExp(mobile.model));

  // brands and fullVersionList are deliberately left out so Chromium keeps its
  // own real values (including the GREASE brand) instead of an invented list.
  for (const metadata of [desktop, mobile]) {
    assert.equal(metadata.brands, undefined);
    assert.equal(metadata.fullVersionList, undefined);
  }
});

test('mobile emulation borrows a real device model rather than an invented one', () => {
  // "Paneboard Mobile" is a device model no bot check has ever seen, so it read as
  // a forged identity on every mobile-mode page load.
  const agent = mobileUserAgent('Mozilla/5.0 Chrome/150.0.7339.12 Safari/537.36');
  assert.doesNotMatch(agent, /Paneboard/);
  assert.equal(userAgentMetadata('mobile').model, 'Pixel 7');
});

test('starting Chromium first clears out any stale process still holding the profile lock', { skip: process.platform !== 'win32' }, async () => {
  const command = chromiumProfileCleanupCommand('C:\\paneboard\\data\\browser-profile');
  assert.match(command, /Name='chrome\.exe' OR Name='msedge\.exe'/);
  assert.match(command, /CommandLine\.Contains\('C:\\paneboard\\data\\browser-profile'\)/);
  assert.match(command, /Stop-Process -Id \$_\.ProcessId -Force/);

  const calls = [];
  const run = (file, args, options, callback) => {
    calls.push({ file, args, options });
    callback(null, '', '');
  };
  await terminateStaleChromium('C:\\paneboard\\data\\browser-profile', run);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, 'powershell.exe');
  assert.match(calls[0].args.join(' '), /browser-profile/);

  // A prior instance's stale-cleanup attempt must never block a fresh launch,
  // even if the check itself fails (e.g. powershell.exe missing from PATH).
  const failingRun = (file, args, options, callback) => callback(new Error('spawn failed'));
  await assert.doesNotReject(terminateStaleChromium('C:\\paneboard\\data\\browser-profile', failingRun));
});

test('on Linux, a stale process holding the profile lock is killed', { skip: process.platform !== 'linux' }, async () => {
  const profile = path.join(os.tmpdir(), `paneboard-profile-${process.pid}`);
  const stale = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', '--', `--user-data-dir=${profile}`]);
  const other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', '--', `--user-data-dir=${profile}-other`]);
  try {
    await new Promise((resolve) => stale.once('spawn', resolve));
    const exited = new Promise((resolve) => stale.once('exit', (code, signal) => resolve(signal)));
    await terminateStaleChromium(profile);
    assert.equal(await exited, 'SIGKILL');
    assert.equal(other.exitCode, null);
  } finally {
    stale.kill();
    other.kill();
  }
});

test('the stale-Chromium cleanup command escapes a single quote in the profile path', () => {
  // The path is interpolated into a PowerShell single-quoted string; an
  // unescaped ' would break out of it and change what the command matches.
  const command = chromiumProfileCleanupCommand("C:\\paneboard's data\\browser-profile");
  assert.match(command, /CommandLine\.Contains\('C:\\paneboard''s data\\browser-profile'\)/);
});

test('remote browser viewport is bounded for safe screencasting', () => {
  assert.deepEqual(normalizeViewport(12, 9000, 4), { width: 320, height: 2160, deviceScaleFactor: 2 });
  assert.deepEqual(normalizeViewport(1280, 720, 1), { width: 1280, height: 720, deviceScaleFactor: 1 });
  assert.deepEqual(normalizeViewport(1200, 800, 3, 'mobile'), { width: 932, height: 800, deviceScaleFactor: 2 });
  assert.deepEqual(normalizeViewport(900, 1400, 1, 'mobile'), { width: 480, height: 1400, deviceScaleFactor: 1 });
});

test('mobile emulation uses an Android Chromium identity', () => {
  assert.equal(normalizeEmulationMode('mobile'), 'mobile');
  assert.equal(normalizeEmulationMode('tablet'), 'desktop');
  assert.match(mobileUserAgent('Mozilla/5.0 Chrome/150.0.7339.12 Safari/537.36'), /Android 15/);
  assert.match(mobileUserAgent('Mozilla/5.0 Chrome/150.0.7339.12 Safari/537.36'), /Chrome\/150\.0\.0\.0 Mobile/);
});

test('emulation mode only ever resolves to mobile or desktop', () => {
  assert.equal(normalizeEmulationMode('desktop'), 'desktop');
  assert.equal(normalizeEmulationMode(undefined), 'desktop');
  assert.equal(normalizeEmulationMode(null), 'desktop');
  assert.equal(normalizeEmulationMode(''), 'desktop');
  // Case-sensitive on purpose: only the exact stored value switches modes.
  assert.equal(normalizeEmulationMode('Mobile'), 'desktop');
});

test('desktop identity masks the Headless marker instead of going blank', () => {
  // A blank User-Agent header is a strong bot signal on its own and was tripping
  // sites' (e.g. Google's) automated-traffic detection on every desktop-mode page load.
  const headless = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36';
  assert.equal(
    desktopUserAgent(headless),
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  assert.equal(desktopUserAgent(''), '');
});

test('mobile viewport enables device metrics, touch and the mobile user agent', async () => {
  const page = Object.create(RemoteBrowserPage.prototype);
  page.viewport = normalizeViewport(390, 844, 2, 'mobile');
  page.emulationMode = 'mobile';
  page.desktopUserAgent = 'Mozilla/5.0 Chrome/150.0.7339.12 Safari/537.36';
  const calls = [];
  page.send = async (method, params) => { calls.push({ method, params }); return {}; };

  await page.applyViewport();

  // The window is sized to the viewport (so screencast frames fill the pane)
  // before the emulation overrides are applied. Insets are 0 with the mock,
  // so the final window bounds equal the viewport.
  const windowBounds = calls.filter((call) => call.method === 'Browser.setWindowBounds').at(-1);
  assert.ok(windowBounds);
  assert.equal(windowBounds.params.bounds.width, page.viewport.width);
  assert.equal(windowBounds.params.bounds.height, page.viewport.height);

  const deviceMetrics = calls.find((call) => call.method === 'Emulation.setDeviceMetricsOverride');
  assert.ok(deviceMetrics);
  assert.equal(deviceMetrics.params.mobile, true);
  const touch = calls.find((call) => call.method === 'Emulation.setTouchEmulationEnabled');
  assert.equal(touch.params.enabled, true);
  const userAgent = calls.find((call) => call.method === 'Emulation.setUserAgentOverride');
  assert.match(userAgent.params.userAgent, /Mobile/);
});

test('desktop viewport masks the headless Chromium user agent instead of sending a blank one', async () => {
  const page = Object.create(RemoteBrowserPage.prototype);
  page.viewport = normalizeViewport(1280, 720, 1);
  page.emulationMode = 'desktop';
  page.desktopUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36';
  const calls = [];
  page.send = async (method, params) => { calls.push({ method, params }); return {}; };

  await page.applyViewport();

  const userAgent = calls.find((call) => call.method === 'Emulation.setUserAgentOverride');
  assert.ok(userAgent.params.userAgent);
  assert.doesNotMatch(userAgent.params.userAgent, /Headless/);
  assert.match(userAgent.params.userAgent, /Chrome\/120\.0\.0\.0/);
  assert.deepEqual(userAgent.params.userAgentMetadata, userAgentMetadata('desktop'));
  // navigator.platform stays whatever the host Chromium really reports; naming
  // it here would replace the genuine "Win32" with a value no Chrome sends.
  assert.equal(userAgent.params.platform, undefined);
});

test('a desktop pane reports a screen larger than its viewport', async () => {
  // Sizing the emulated screen to the viewport makes screen.width === innerWidth,
  // an impossible reading on a real desktop and a well known headless tell.
  const page = Object.create(RemoteBrowserPage.prototype);
  page.viewport = normalizeViewport(1100, 640, 1);
  page.emulationMode = 'desktop';
  page.desktopUserAgent = 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36';
  const calls = [];
  page.send = async (method, params) => { calls.push({ method, params }); return {}; };

  await page.applyViewport();

  const metrics = calls.find((call) => call.method === 'Emulation.setDeviceMetricsOverride').params;
  assert.equal(metrics.width, 1100);
  assert.equal(metrics.height, 640);
  assert.ok(metrics.screenWidth > metrics.width);
  assert.ok(metrics.screenHeight > metrics.height);
  // A desktop display is never reported as a rotated device.
  assert.equal(metrics.screenOrientation.angle, 0);
});

test('a viewport wider than the default desktop screen still fits inside it', async () => {
  const page = Object.create(RemoteBrowserPage.prototype);
  page.viewport = normalizeViewport(2560, 1440, 1);
  page.emulationMode = 'desktop';
  page.desktopUserAgent = '';
  const calls = [];
  page.send = async (method, params) => { calls.push({ method, params }); return {}; };

  await page.applyViewport();

  const metrics = calls.find((call) => call.method === 'Emulation.setDeviceMetricsOverride').params;
  assert.ok(metrics.screenWidth >= metrics.width);
  assert.ok(metrics.screenHeight >= metrics.height);
});

test('a mobile pane keeps the screen equal to the viewport, as a phone reports it', async () => {
  const page = Object.create(RemoteBrowserPage.prototype);
  page.viewport = normalizeViewport(390, 844, 2, 'mobile');
  page.emulationMode = 'mobile';
  page.desktopUserAgent = 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36';
  const calls = [];
  page.send = async (method, params) => { calls.push({ method, params }); return {}; };

  await page.applyViewport();

  const metrics = calls.find((call) => call.method === 'Emulation.setDeviceMetricsOverride').params;
  assert.equal(metrics.screenWidth, metrics.width);
  assert.equal(metrics.screenHeight, metrics.height);
  assert.equal(metrics.screenOrientation.type, 'portraitPrimary');

  const userAgent = calls.find((call) => call.method === 'Emulation.setUserAgentOverride').params;
  assert.deepEqual(userAgent.userAgentMetadata, userAgentMetadata('mobile'));
  assert.equal(userAgent.platform, 'Linux armv8l');
});

test('a blank tab uses the app theme background instead of Chromium\'s stark white default', async () => {
  const page = Object.create(RemoteBrowserPage.prototype);
  const calls = [];
  page.send = async (method, params) => { calls.push({ method, params }); return {}; };

  await page.applyBackground('#06111b');

  assert.deepEqual(calls, [
    { method: 'Emulation.setEmulatedMedia', params: { features: [{ name: 'prefers-color-scheme', value: 'dark' }] } },
    { method: 'Emulation.setDefaultBackgroundColorOverride', params: { color: { r: 6, g: 17, b: 27, a: 1 } } }
  ]);
});

test('a light theme background is emulated as prefers-color-scheme: light', async () => {
  // Headless Chromium's own chrome (about:blank, the raw JSON/text viewer) reads
  // prefers-color-scheme rather than the background override to decide its color,
  // so it renders dark regardless of the override unless this is also set.
  const page = Object.create(RemoteBrowserPage.prototype);
  const calls = [];
  page.send = async (method, params) => { calls.push({ method, params }); return {}; };

  await page.applyBackground('#ffffff');

  const media = calls.find((call) => call.method === 'Emulation.setEmulatedMedia');
  assert.deepEqual(media.params, { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
});

test('an invalid background color is ignored rather than sent to Chromium', async () => {
  const page = Object.create(RemoteBrowserPage.prototype);
  const calls = [];
  page.send = async (method, params) => { calls.push({ method, params }); return {}; };

  await page.applyBackground('not-a-color');

  assert.deepEqual(calls, []);
});

test('applyBackground accepts padded, uppercase hex but rejects shorthand or unprefixed values', async () => {
  const accepted = Object.create(RemoteBrowserPage.prototype);
  const acceptedCalls = [];
  accepted.send = async (method, params) => { acceptedCalls.push({ method, params }); return {}; };
  await accepted.applyBackground('  #FFFFFF  ');
  const override = acceptedCalls.find((call) => call.method === 'Emulation.setDefaultBackgroundColorOverride');
  assert.deepEqual(override.params, { color: { r: 255, g: 255, b: 255, a: 1 } });

  for (const invalid of ['#fff', 'ffffff', '#gggggg', '#1234567']) {
    const page = Object.create(RemoteBrowserPage.prototype);
    const calls = [];
    page.send = async (method, params) => { calls.push({ method, params }); return {}; };
    await page.applyBackground(invalid);
    assert.deepEqual(calls, [], `expected "${invalid}" to be rejected`);
  }
});

test('a <select> dropdown is drawn as page content so the capture paths can see it', async () => {
  // Chromium puts the native <select> popup in a widget outside the page's own
  // compositing surface, so neither Page.startScreencast nor the WebRTC tab
  // capture recorded it: the list never appeared in a Browser pane and the
  // popup nobody could see swallowed the next click.
  const page = Object.create(RemoteBrowserPage.prototype);
  const calls = [];
  page.send = async (method, params) => { calls.push({ method, params }); return {}; };

  await page.installSelectPopup();

  // The hook covers later navigations and subframes; the document the tab was
  // created with is already loaded, so it needs the script evaluated directly too.
  const hook = calls.find((call) => call.method === 'Page.addScriptToEvaluateOnNewDocument');
  const now = calls.find((call) => call.method === 'Runtime.evaluate');
  assert.equal(hook.params.source, SELECT_POPUP_SCRIPT);
  assert.equal(now.params.expression, SELECT_POPUP_SCRIPT);
});

test('the injected dropdown suppresses the native popup and reports the choice to the page', () => {
  // The script ships to Chromium as a string, so a syntax error would only ever
  // surface as a silently dead dropdown. Run it against a minimal stub instead.
  const listeners = [];
  const target = (owner) => ({
    addEventListener: (type, handler, capture) => listeners.push({ owner, type, capture: Boolean(capture) })
  });
  const context = vm.createContext({ Math });
  context.window = { ...target('window') };
  context.document = target('document');
  context.getComputedStyle = () => ({});
  vm.runInContext(SELECT_POPUP_SCRIPT, context);

  assert.ok(listeners.some((entry) => entry.owner === 'document' && entry.type === 'mousedown' && entry.capture));
  assert.ok(listeners.some((entry) => entry.owner === 'document' && entry.type === 'keydown' && entry.capture));

  // Re-injection happens on every navigation through the new-document hook, so a
  // second run must not stack a duplicate set of listeners.
  const installed = listeners.length;
  vm.runInContext(SELECT_POPUP_SCRIPT, context);
  assert.equal(listeners.length, installed);

  // Cancelling the mousedown is what stops the invisible native popup, and both
  // events have to bubble or a framework binding (v-model, onChange) never sees
  // the new value.
  assert.match(SELECT_POPUP_SCRIPT, /event\.preventDefault\(\);\s*select\.focus/);
  assert.match(SELECT_POPUP_SCRIPT, /dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  assert.match(SELECT_POPUP_SCRIPT, /dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
});

test('a client reporting its theme background updates the shared manager color and Chromium', async () => {
  const page = Object.create(RemoteBrowserPage.prototype);
  page.manager = { themeBackground: '#06111b' };
  const calls = [];
  page.send = async (method, params) => { calls.push({ method, params }); return {}; };
  const client = { readyState: WebSocket.OPEN, send() {} };

  await page.handle({ type: 'theme', backgroundColor: '#ffffff' }, client);

  assert.equal(page.manager.themeBackground, '#ffffff');
  const bg = calls.find((call) => call.method === 'Emulation.setDefaultBackgroundColorOverride');
  assert.deepEqual(bg.params, { color: { r: 255, g: 255, b: 255, a: 1 } });
});

test('an unchanged or invalid client background does not re-issue the Chromium override', async () => {
  const page = Object.create(RemoteBrowserPage.prototype);
  page.manager = { themeBackground: '#06111b' };
  const calls = [];
  page.send = async (method, params) => { calls.push({ method, params }); return {}; };
  const client = { readyState: WebSocket.OPEN, send() {} };

  await page.handle({ type: 'theme', backgroundColor: '#06111b' }, client);
  await page.handle({ type: 'theme', backgroundColor: 'nope' }, client);

  assert.deepEqual(calls.filter((call) => call.method === 'Emulation.setDefaultBackgroundColorOverride'), []);
  assert.equal(page.manager.themeBackground, '#06111b');
});

test('input events are dispatched without waiting on the renderer', async () => {
  // Awaiting each dispatch costs a renderer round trip -- ~18ms even on an idle
  // page -- so a moving pointer queues events faster than they drain. The backlog
  // grew until every command tripped send()'s 10 second deadline and the pane
  // stopped responding ("Chromium command timed out: Input.dispatchMouseEvent")
  // until it emptied again.
  const page = Object.create(RemoteBrowserPage.prototype);
  const sent = [];
  page.socket = { readyState: WebSocket.OPEN, send: (payload) => sent.push(JSON.parse(payload)) };
  page.nextRequestId = 1;
  page.send = async () => { throw new Error('input must not wait for a reply'); };
  page.claimViewport = async () => {};
  const client = { readyState: WebSocket.OPEN, send() {} };

  await page.handle({ type: 'mouse', event: 'mouseMoved', x: 5, y: 6, buttons: 0 }, client);
  await page.handle({ type: 'key', event: 'keyDown', key: 'a', text: 'a' }, client);
  await page.handle({ type: 'text', text: 'hi' }, client);
  await page.handle({ type: 'touch', event: 'touchStart', touchPoints: [{ x: 1, y: 2 }] }, client);

  assert.deepEqual(sent.map((message) => message.method), [
    'Input.dispatchMouseEvent',
    'Input.dispatchKeyEvent',
    'Input.insertText',
    'Input.dispatchTouchEvent'
  ]);
  // Each command still gets its own id and rides the ordered CDP socket, so
  // Chromium sees them in the order the user made them.
  assert.deepEqual(sent.map((message) => message.id), [1, 2, 3, 4]);
  assert.equal(sent[0].params.x, 5);
});

test('input aimed at a closed socket is dropped rather than thrown', async () => {
  const page = Object.create(RemoteBrowserPage.prototype);
  page.socket = { readyState: WebSocket.CLOSED, send: () => { throw new Error('socket is closed'); } };
  page.nextRequestId = 1;
  page.claimViewport = async () => {};
  const client = { readyState: WebSocket.OPEN, send() {} };

  await assert.doesNotReject(page.handle({ type: 'mouse', event: 'mouseMoved', x: 1, y: 1, buttons: 0 }, client));
});

test('mobile keyboard only opens when the remote page focused a text field', async () => {
  const page = Object.create(RemoteBrowserPage.prototype);
  const messages = [];
  let focusedTextField = true;
  page.send = async (method, params) => {
    assert.equal(method, 'Runtime.evaluate');
    assert.match(params.expression, /input\[type="text"\]/);
    return { result: { value: focusedTextField } };
  };
  const client = { readyState: WebSocket.OPEN, send: (payload) => messages.push(JSON.parse(payload)) };

  await page.handle({ type: 'keyboardFocus' }, client);
  focusedTextField = false;
  await page.handle({ type: 'keyboardFocus' }, client);

  assert.deepEqual(messages, [
    { type: 'keyboardFocus', visible: true },
    { type: 'keyboardFocus', visible: false }
  ]);
});

test('JPEG fallback preserves text detail at high quality', async () => {
  const page = Object.create(RemoteBrowserPage.prototype);
  page.screencasting = false;
  page.viewport = { width: 390, height: 844 };
  const calls = [];
  page.send = async (method, params) => { calls.push({ method, params }); return {}; };

  await page.startScreencast();

  assert.deepEqual(calls, [{
    method: 'Page.startScreencast',
    params: { format: 'jpeg', quality: 90, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 }
  }]);
});

test('only the latest controlling browser client can resize a shared tab', async () => {
  const first = { readyState: WebSocket.OPEN, send() {} };
  const second = { readyState: WebSocket.OPEN, send() {} };
  const page = Object.create(RemoteBrowserPage.prototype);
  page.clients = new Set([first, second]);
  page.clientMetadata = new Map([
    [first, { viewport: { width: 800, height: 600, deviceScaleFactor: 1 } }],
    [second, { viewport: { width: 390, height: 844, deviceScaleFactor: 2 } }]
  ]);
  page.viewportOwner = first;
  page.broadcastViewportOwner = () => {};
  const resized = [];
  page.resize = async (...values) => resized.push(values);

  await page.updateClientViewport(second, 400, 850, 2, false);
  assert.deepEqual(resized, []);
  await page.claimViewport(second);
  assert.equal(page.viewportOwner, second);
  assert.deepEqual(resized, [[400, 850, 2]]);
});

test('WebRTC negotiation falls back to JPEG after its connection deadline', async () => {
  const client = { readyState: WebSocket.OPEN, send() {} };
  const page = Object.create(RemoteBrowserPage.prototype);
  page.clients = new Set([client]);
  page.rtcClients = new Map([['peer-1', client]]);
  page.rtcTimers = new Map();
  page.rtcConnectedPeers = new Set();
  page.rtcTimeoutMs = 5;
  page.closeRtcClient = async (candidate) => {
    assert.equal(candidate, client);
    page.rtcClients.delete('peer-1');
  };
  const modes = [];
  page.setClientStreamMode = (candidate, mode, reason) => modes.push({ candidate, mode, reason });

  page.scheduleRtcFallback('peer-1', client, 'WebRTC negotiation timed out.');
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(page.rtcTimers.size, 0);
  assert.deepEqual(modes, [{ candidate: client, mode: 'jpeg', reason: 'WebRTC negotiation timed out.' }]);
});

test('an already connected WebRTC peer cannot receive a late fallback timer', () => {
  const client = { readyState: WebSocket.OPEN, send() {} };
  const page = Object.create(RemoteBrowserPage.prototype);
  page.rtcTimers = new Map();
  page.rtcConnectedPeers = new Set(['peer-1']);

  page.scheduleRtcFallback('peer-1', client, 'WebRTC negotiation timed out.');

  assert.equal(page.rtcTimers.size, 0);
});

test('tab capture ending signals every WebRTC peer sharing the stream', () => {
  const page = Object.create(RemoteBrowserPage.prototype);
  page.rtcStateKey = '__state';
  page.rtcBinding = '__signal';
  const expression = page.rtcCaptureExpression('peer-1');

  assert.match(expression, /for \(const activePeerId of state\.peers\.keys\(\)\)/);
  assert.match(expression, /peerId: activePeerId, type: 'captureEnded'/);
});

test('tab capture leaves the page title alone', () => {
  // The capture used to rename the page to "Paneboard Capture Target" so
  // --auto-select-tab-capture-source-by-title would match it, which made the
  // rename observable to the site and briefly replaced the real title. The flag
  // still auto-selects the pane's own tab without it; dropping the flag as well
  // was tried and sends every pane back to JPEG streaming.
  const page = Object.create(RemoteBrowserPage.prototype);
  page.rtcStateKey = '__state';
  page.rtcBinding = '__signal';
  const expression = page.rtcCaptureExpression('peer-1');

  assert.doesNotMatch(expression, /document\.title/);
  assert.match(expression, /preferCurrentTab: true/);
  assert.ok(chromeArguments('C:\\paneboard\\data\\browser-profile')
    .includes('--auto-select-tab-capture-source-by-title=Paneboard Capture Target'));
});

test('tab capture crops WebRTC video to the emulated page viewport when Chromium supports it', () => {
  const page = Object.create(RemoteBrowserPage.prototype);
  page.rtcStateKey = '__state';
  page.rtcBinding = '__signal';
  const expression = page.rtcCaptureExpression('peer-1');

  assert.match(expression, /CropTarget\?\.fromElement/);
  assert.match(expression, /CropTarget\.fromElement\(document\.documentElement\)/);
  assert.match(expression, /videoTrack\.cropTo\(cropTarget\)/);
});

test('remote browser blocks every local interface on the Paneboard server port', () => {
  const interfaces = {
    Ethernet: [
      { address: '192.168.1.25' },
      { address: 'fe80::25' }
    ]
  };

  assert.equal(isOwnServerWebsite('http://localhost:5000/', 5000, interfaces), true);
  assert.equal(isOwnServerWebsite('http://127.8.7.6:5000/', 5000, interfaces), true);
  assert.equal(isOwnServerWebsite('https://192.168.1.25:5000/', 5000, interfaces), true);
  assert.equal(isOwnServerWebsite('http://[fe80::25]:5000/', 5000, interfaces), true);
  assert.equal(isOwnServerWebsite('http://0.0.0.0:5000/', 5000, interfaces), true);
  assert.equal(isOwnServerWebsite('http://192.168.1.26:5000/', 5000, interfaces), false);
  assert.equal(isOwnServerWebsite('http://192.168.1.25:5001/', 5000, interfaces), false);
});

test('isOwnServerWebsite recognizes the host name and tolerates a malformed URL', () => {
  const interfaces = { Ethernet: [{ address: '192.168.1.25' }] };

  assert.equal(isOwnServerWebsite(`http://${os.hostname()}:5000/`, 5000, interfaces), true);
  assert.equal(isOwnServerWebsite(`http://${os.hostname().toUpperCase()}:5000/`, 5000, interfaces), true);
  assert.equal(isOwnServerWebsite('not a url', 5000, interfaces), false);
  assert.equal(isOwnServerWebsite('', 5000, interfaces), false);
  // https on the port 80 default never coincides with our own http-only port 5000.
  assert.equal(isOwnServerWebsite('https://192.168.1.25/', 5000, interfaces), false);
});

test('browser resize waits for the initial frame before handling client messages', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-browser-test-'));
  const pane = {
    id: 'pane-1',
    type: 'browser',
    activeBrowserTabId: 'tab-1',
    browserTabs: [{ id: 'tab-1', url: '', zoom: 1 }]
  };
  const manager = new BrowserManager({
    root,
    store: { findPane: () => ({ pane }) },
    normalizeWebsite: (value) => value,
    serverPort: 5000,
    networkInterfaces: {}
  });
  const events = [];
  const page = {
    clients: new Set(),
    async attachClient(client) {
      this.clients.add(client);
      events.push('attach:start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      events.push('attach:end');
    },
    async detachClient() {},
    async handle(message) {
      events.push(`handle:${message.type}`);
    }
  };
  manager.getOrCreatePage = async () => page;
  const client = new EventEmitter();
  client.readyState = WebSocket.OPEN;
  client.send = () => {};
  client.close = () => {};

  const attaching = manager.attach('pane-1', client);
  client.emit('message', Buffer.from(JSON.stringify({ type: 'resize', width: 640, height: 480 })));
  await attaching;
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(events, ['attach:start', 'attach:end', 'handle:resize']);
  manager.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
});

test('a new browser manager defaults new tabs to the app\'s dark theme background', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-browser-test-'));
  const manager = new BrowserManager({
    root,
    store: { findPane: () => null },
    normalizeWebsite: (value) => value,
    serverPort: 5000,
    networkInterfaces: {}
  });

  assert.equal(manager.themeBackground, '#06111b');

  manager.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
});

test('a download is only served once Chromium reports it complete and the file is actually on disk', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-browser-test-'));
  const manager = new BrowserManager({
    root,
    store: { findPane: () => null },
    normalizeWebsite: (value) => value,
    serverPort: 5000,
    networkInterfaces: {}
  });
  const broadcasts = [];
  const client = { readyState: WebSocket.OPEN, send: (payload) => broadcasts.push(JSON.parse(payload)) };
  manager.paneClients.set('pane-1', new Set([client]));

  manager.beginDownload('pane-1', 'tab-1', { guid: 'abc', suggestedFilename: 'report.pdf', url: 'https://example.com/report.pdf' });
  assert.equal(manager.downloads.get('abc').state, 'inProgress');
  assert.equal(broadcasts.at(-1).download.filename, 'report.pdf');

  // Chromium says it finished, but the bytes have not landed on disk yet.
  manager.updateDownload('pane-1', { guid: 'abc', state: 'completed', receivedBytes: 10, totalBytes: 10 });
  assert.equal(manager.downloads.get('abc').state, 'completed');
  assert.equal(manager.downloadFile('abc'), null);

  fs.writeFileSync(path.join(manager.downloadDir, 'abc'), 'pdf bytes');
  assert.deepEqual(manager.downloadFile('abc'), { path: path.join(manager.downloadDir, 'abc'), filename: 'report.pdf' });

  // An update for a guid nobody started stays a no-op rather than a phantom entry.
  manager.updateDownload('pane-1', { guid: 'unknown', state: 'completed' });
  assert.equal(manager.downloads.has('unknown'), false);

  manager.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
});

test('assertWebsiteAllowed blocks the app\'s own address and lets everything else through', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-browser-test-'));
  const manager = new BrowserManager({
    root,
    store: { findPane: () => null },
    normalizeWebsite: (value) => value,
    serverPort: 5000,
    networkInterfaces: {}
  });

  assert.throws(() => manager.assertWebsiteAllowed('http://localhost:5000/'), /cannot open its own server address/);
  assert.doesNotThrow(() => manager.assertWebsiteAllowed('https://example.com/'));

  manager.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
});

test('killSession tears down every pane across every tab, tolerating a session with no tabs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-browser-test-'));
  const manager = new BrowserManager({
    root,
    store: { findPane: () => null },
    normalizeWebsite: (value) => value,
    serverPort: 5000,
    networkInterfaces: {}
  });
  const killed = [];
  manager.killPane = async (paneId) => { killed.push(paneId); };

  manager.killSession({
    tabs: [
      { panes: [{ id: 'pane-1' }, { id: 'pane-2' }] },
      { panes: [{ id: 'pane-3' }] }
    ]
  });
  assert.deepEqual(killed, ['pane-1', 'pane-2', 'pane-3']);

  assert.doesNotThrow(() => manager.killSession({}));
  assert.doesNotThrow(() => manager.killSession(null));

  manager.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
});
