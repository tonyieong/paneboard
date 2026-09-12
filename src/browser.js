const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const WebSocket = require('ws');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

function findChromiumExecutable(fileSystem = fs) {
  return CHROME_CANDIDATES.find((candidate) => fileSystem.existsSync(candidate)) || '';
}

function chromeArguments(profilePath) {
  return [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profilePath}`,
    '--no-first-run',
    '--no-default-browser-check',
    // Headless Chromium reports navigator.webdriver === true, the first thing
    // every bot check reads. Left on, ordinary browsing in a Browser pane keeps
    // landing on "verify you are human" interstitials.
    '--disable-blink-features=AutomationControlled',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-features=Translate',
    '--auto-accept-this-tab-capture',
    // Required: without it tab capture falls back to JPEG streaming. The capture
    // script no longer renames the page to match, which would have let a site
    // observe the title change; the flag alone still auto-selects the own tab.
    '--auto-select-tab-capture-source-by-title=Paneboard Capture Target',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,720'
  ];
}

function chromiumProfileCleanupCommand(profilePath) {
  const escaped = String(profilePath).replace(/'/g, "''");
  return `Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | ` +
    `Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${escaped}') } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
}

function terminateStaleChromium(profilePath, run = execFile) {
  // A prior Paneboard process that exited without calling shutdown() (crash, forced
  // kill, service restart) can leave its headless Chromium still running.
  // Chromium's own profile lock then refuses every future launch against the
  // same --user-data-dir, so every Browser pane fails forever. Best-effort
  // clear out anything still holding our profile before starting a fresh one.
  return new Promise((resolve) => {
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', chromiumProfileCleanupCommand(profilePath)],
      { windowsHide: true, timeout: 10000 },
      () => resolve());
  });
}

function normalizeEmulationMode(value) {
  return value === 'mobile' ? 'mobile' : 'desktop';
}

function normalizeViewport(width, height, deviceScaleFactor, emulationMode = 'desktop') {
  const rawWidth = Math.round(Number(width) || 1280);
  const rawHeight = Math.round(Number(height) || 720);
  const mobileMaxWidth = rawWidth > rawHeight ? 932 : 480;
  return {
    width: Math.max(320, Math.min(normalizeEmulationMode(emulationMode) === 'mobile' ? mobileMaxWidth : 3840, rawWidth)),
    height: Math.max(240, Math.min(2160, rawHeight)),
    deviceScaleFactor: Math.max(1, Math.min(2, Number(deviceScaleFactor) || 1))
  };
}

// A device model sites actually see in the wild; an invented one ("Paneboard Mobile")
// reads as a forged identity to the same checks the masked UA is there to satisfy.
const MOBILE_DEVICE_MODEL = 'Pixel 7';

function mobileUserAgent(userAgent) {
  const chromeVersion = String(userAgent || '').match(/(?:Chrome|HeadlessChrome)\/(\d+)/)?.[1] || '120';
  return `Mozilla/5.0 (Linux; Android 15; ${MOBILE_DEVICE_MODEL}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Mobile Safari/537.36`;
}

function desktopUserAgent(userAgent) {
  // Chromium's own UA advertises "HeadlessChrome", a fingerprint sites use to flag
  // automated traffic (e.g. Google's "unusual traffic" interstitial). Mask it like a
  // normal desktop Chrome instead of sending a blank User-Agent header.
  return String(userAgent || '').replace('HeadlessChrome', 'Chrome');
}

function userAgentMetadata(emulationMode) {
  // Overriding only the User-Agent string makes Chromium drop its Client Hints:
  // Sec-CH-UA, -Mobile and -Platform stop being sent entirely and
  // navigator.userAgentData goes blank. A Chrome user agent that sends no Client
  // Hints at all is a louder automation signal than the Headless marker it masks,
  // so the metadata has to travel with the string. brands and fullVersionList are
  // left out on purpose: Chromium then fills in its own real values, including the
  // GREASE brand, which no hand-written list can match version for version.
  if (normalizeEmulationMode(emulationMode) === 'mobile') {
    return { platform: 'Android', platformVersion: '15.0.0', architecture: '', model: MOBILE_DEVICE_MODEL, mobile: true };
  }
  return { platform: 'Windows', platformVersion: '19.0.0', architecture: 'x86', model: '', mobile: false };
}

const DEFAULT_BACKGROUND_COLOR = '#06111b';
const JPEG_QUALITY = 90;

// Chromium draws a <select> dropdown in a native popup widget that lives outside
// the page's own compositing surface, so neither Page.startScreencast nor the
// WebRTC tab capture ever records it. In a Browser pane the list simply never
// appeared, and the popup nobody could see went on swallowing the next click.
// Suppress the native popup and draw the options as ordinary page content, which
// both capture paths do see.
const SELECT_POPUP_SCRIPT = `(() => {
  if (window.__paneboardSelectPopup) return;
  window.__paneboardSelectPopup = true;

  let host = null;
  let owner = null;

  const close = () => {
    host?.remove();
    host = null;
    owner = null;
  };

  // Chromium serializes a fully opaque background as rgb(...) and everything else
  // as rgba(...), so the first rgb() up the tree is the nearest color the popup can
  // sit on without the page showing through its options.
  const opaqueBackground = (element) => {
    for (let node = element; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      if (color.startsWith('rgb(')) return color;
    }
    return getComputedStyle(document.documentElement).colorScheme === 'dark' ? '#1f2430' : '#ffffff';
  };

  const open = (select) => {
    const rect = select.getBoundingClientRect();
    const style = getComputedStyle(select);
    const above = rect.top - 8;
    const below = window.innerHeight - rect.bottom - 8;
    // Drop down like every browser does, and only flip up when the space below is
    // too cramped to be worth it and there is genuinely more room overhead.
    const drop = below >= 160 || below >= above;
    const maxHeight = Math.max(96, Math.min(320, drop ? below : above));

    host = document.createElement('div');
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;'
      + ' left: ' + rect.left + 'px; width: ' + rect.width + 'px;'
      + (drop ? ' top: ' + rect.bottom + 'px;' : ' bottom: ' + (window.innerHeight - rect.top) + 'px;');
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = '<style>'
      + '.list { max-height: ' + maxHeight + 'px; overflow-y: auto; box-sizing: border-box;'
      + ' border: 1px solid rgba(127, 127, 127, .45); border-radius: 6px;'
      + ' box-shadow: 0 8px 24px rgba(0, 0, 0, .35);'
      + ' background: ' + opaqueBackground(select) + '; color: ' + style.color + ';'
      + ' font: ' + style.fontSize + '/1.5 ' + style.fontFamily + '; }'
      + '.row { padding: 6px 10px; cursor: pointer; white-space: nowrap;'
      + ' overflow: hidden; text-overflow: ellipsis; }'
      + '.row:hover { background: rgba(127, 127, 127, .25); }'
      + '.row[aria-selected="true"] { background: rgba(127, 127, 127, .35); }'
      + '.row[aria-disabled="true"] { opacity: .5; cursor: default; }'
      + '</style><div class="list" role="listbox"></div>';
    const list = root.querySelector('.list');
    [...select.options].forEach((option, index) => {
      if (option.hidden) return;
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === select.selectedIndex));
      if (option.disabled) row.setAttribute('aria-disabled', 'true');
      row.textContent = option.label || option.text;
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (option.disabled) return;
        const changed = select.selectedIndex !== index;
        close();
        if (!changed) return;
        select.selectedIndex = index;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      list.append(row);
    });
    (document.body || document.documentElement).append(host);
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    owner = select;
  };

  document.addEventListener('mousedown', (event) => {
    // A closed shadow root retargets its own events to the host, so this is a
    // click on an option: leave it to the row's handler.
    if (host && event.target === host) return;
    const select = event.target.closest?.('select');
    const opens = select && !select.disabled && !select.multiple && select.size <= 1;
    const previous = owner;
    close();
    if (!opens) return;
    // The default action of this mousedown is the native popup nobody can see.
    event.preventDefault();
    select.focus({ preventScroll: true });
    if (select !== previous) open(select);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!host) return;
    // Escape only dismisses the list; every other key falls through to the select,
    // which handles it natively once the stale list is gone.
    if (event.key === 'Escape') event.preventDefault();
    close();
  }, true);

  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
})();`;

function parseHexColor(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value || '').trim());
  if (!match) return null;
  const number = parseInt(match[1], 16);
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
}

function normalizedHostname(value) {
  const hostname = String(value || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return hostname.startsWith('::ffff:') ? hostname.slice(7) : hostname;
}

function isOwnServerWebsite(value, serverPort, networkInterfaces = os.networkInterfaces()) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    return false;
  }
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (port !== Number(serverPort)) return false;
  const hostname = normalizedHostname(url.hostname);
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === normalizedHostname(os.hostname())) return true;
  if (hostname === '0.0.0.0' || hostname === '::' || hostname === '::1' || /^127\./.test(hostname)) return true;
  return Object.values(networkInterfaces || {}).flat().some((address) => normalizedHostname(address?.address) === hostname);
}

function requestJson(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Chromium returned HTTP ${response.statusCode}.`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('Chromium returned an invalid response.'));
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

class RemoteBrowserPage {
  constructor(manager, paneId, tabId, target) {
    this.manager = manager;
    this.paneId = paneId;
    this.tabId = tabId;
    this.targetId = target.id;
    this.webSocketUrl = target.webSocketDebuggerUrl;
    this.socket = null;
    this.clients = new Set();
    this.pending = new Map();
    this.nextRequestId = 1;
    this.viewport = normalizeViewport(1280, 720, 1);
    this.viewportOwner = null;
    this.windowId = null;
    this.windowInsets = null;
    this.clientMetadata = new Map();
    this.clientStreamModes = new Map();
    this.rtcClients = new Map();
    this.rtcTimers = new Map();
    this.rtcConnectedPeers = new Set();
    this.rtcTimeoutMs = 3000;
    this.rtcBinding = `__paneboardRtcSignal_${crypto.randomUUID().replaceAll('-', '')}`;
    this.rtcStateKey = `__paneboardRtcState_${crypto.randomUUID().replaceAll('-', '')}`;
    this.emulationMode = 'desktop';
    this.desktopUserAgent = '';
    this.screencasting = false;
    this.zoom = 1;
    this.ready = this.connect();
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl, { maxPayload: 20 * 1024 * 1024 });
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (data) => this.onMessage(data));
    this.socket.on('close', () => this.onClose());
    await this.send('Page.enable');
    await this.applyBackground(this.manager.themeBackground);
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
    await this.installSelectPopup();
    await this.send('Runtime.addBinding', { name: this.rtcBinding });
    await this.send('Fetch.enable', {
      patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }]
    });
    await this.send('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => {});
    await this.send('Browser.setDownloadBehavior', {
      behavior: 'allowAndName',
      downloadPath: this.manager.downloadDir,
      eventsEnabled: true
    }).catch(() => {});
    const found = this.manager.store.findPane(this.paneId);
    const tab = found?.pane.browserTabs?.find((candidate) => candidate.id === this.tabId);
    this.zoom = tab?.zoom || 1;
    this.emulationMode = normalizeEmulationMode(tab?.emulationMode);
    this.viewport = normalizeViewport(this.viewport.width, this.viewport.height, this.viewport.deviceScaleFactor, this.emulationMode);
    this.desktopUserAgent = (await this.send('Browser.getVersion').catch(() => null))?.userAgent || '';
    await this.applyViewport();
    await this.applyZoom();
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Remote browser is not connected.'));
    }
    const id = this.nextRequestId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pending.get(id);
        if (pending) {
          this.pending.delete(id);
          reject(new Error(`Chromium command timed out: ${method}`));
        }
      }, 10000);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  dispatch(method, params = {}) {
    // Input carries no useful reply, and awaiting one costs a renderer round trip
    // (~18ms even on an idle page). A pointer moving at 125Hz then queues events
    // faster than they drain, so the backlog grew until every command hit send()'s
    // 10 second deadline and the pane froze until it emptied. The CDP socket keeps
    // order, so Chromium still receives these in the order the user made them.
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ id: this.nextRequestId++, method, params }));
  }

  onMessage(data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      return;
    }
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
      return;
    }
    if (message.method === 'Page.screencastFrame') {
      this.send('Page.screencastFrameAck', { sessionId: message.params.sessionId }).catch(() => {});
      this.broadcastFrame({
        type: 'frame',
        data: message.params.data,
        viewportWidth: Math.round(message.params.metadata?.deviceWidth || this.viewport.width),
        viewportHeight: Math.round(message.params.metadata?.deviceHeight || this.viewport.height)
      });
      return;
    }
    if (message.method === 'Runtime.bindingCalled' && message.params.name === this.rtcBinding) {
      this.handleRtcSignal(message.params.payload);
      return;
    }
    if (message.method === 'Fetch.requestPaused') {
      this.handlePausedRequest(message.params).catch(() => {});
      return;
    }
    if (message.method === 'Page.frameNavigated' && !message.params.frame.parentId) {
      this.manager.recordNavigation(this.paneId, this.tabId, message.params.frame.url, this);
    }
    if (message.method === 'Page.frameStartedLoading') {
      this.prepareForNavigation();
      this.broadcast({ type: 'status', state: 'loading' });
    }
    if (message.method === 'Page.loadEventFired') {
      this.broadcast({ type: 'status', state: 'ready' });
      this.refreshMetadata();
      this.restartRtcClients();
    }
    if (message.method === 'Page.javascriptDialogOpening') {
      this.broadcast({
        type: 'dialog',
        dialogType: message.params.type,
        message: message.params.message,
        defaultPrompt: message.params.defaultPrompt || ''
      });
    }
    if (message.method === 'Page.windowOpen') this.manager.openWindow(this.paneId, message.params.url, this.tabId);
    if (message.method === 'Page.fileChooserOpened') {
      this.broadcast({
        type: 'fileChooser',
        tabId: this.tabId,
        nodeId: message.params.backendNodeId,
        multiple: message.params.mode === 'selectMultiple'
      });
    }
    if (message.method === 'Browser.downloadWillBegin') {
      this.manager.beginDownload(this.paneId, this.tabId, message.params);
    }
    if (message.method === 'Browser.downloadProgress') {
      this.manager.updateDownload(this.paneId, message.params);
    }
  }

  onClose() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Remote browser closed.'));
    }
    this.pending.clear();
    this.broadcast({ type: 'error', message: 'Remote browser closed unexpectedly.' });
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  broadcastFrame(message) {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (this.clientStreamModes.get(client) !== 'webrtc' && client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  broadcastViewportOwner() {
    for (const client of this.clients) {
      this.sendClient(client, {
        type: 'viewportOwner',
        mine: client === this.viewportOwner,
        clientId: this.clientMetadata.get(this.viewportOwner)?.id || ''
      });
    }
  }

  async updateClientViewport(client, width, height, deviceScaleFactor, applyForOwner = true) {
    const metadata = this.clientMetadata.get(client) || { id: crypto.randomUUID(), webrtc: false };
    metadata.viewport = { width, height, deviceScaleFactor };
    this.clientMetadata.set(client, metadata);
    if (applyForOwner && (!this.viewportOwner || this.viewportOwner === client)) {
      if (!this.viewportOwner) this.viewportOwner = client;
      await this.resize(width, height, deviceScaleFactor);
      this.broadcastViewportOwner();
    }
  }

  async claimViewport(client) {
    const metadata = this.clientMetadata.get(client);
    if (!metadata?.viewport) return;
    const changed = this.viewportOwner !== client;
    this.viewportOwner = client;
    await this.resize(metadata.viewport.width, metadata.viewport.height, metadata.viewport.deviceScaleFactor);
    if (changed) this.broadcastViewportOwner();
  }

  async resolveWindowId() {
    if (!this.windowId) {
      const result = await this.send('Browser.getWindowForTarget', { targetId: this.targetId });
      this.windowId = result.windowId;
    }
    return this.windowId;
  }

  async calibrateWindowInsets() {
    // The screencast captures the window's web-contents area, not the device
    // metrics override. That content area is the window frame minus fixed
    // chrome insets, so measure them once (before any override is active) to
    // later size the window so its content area equals the requested viewport.
    try {
      const windowId = await this.resolveWindowId();
      const probeWidth = 1024;
      const probeHeight = 768;
      await this.send('Browser.setWindowBounds', {
        windowId,
        bounds: { windowState: 'normal', width: probeWidth, height: probeHeight }
      });
      const metrics = await this.send('Page.getLayoutMetrics');
      const viewport = metrics.cssLayoutViewport || metrics.layoutViewport || {};
      const clientWidth = Number(viewport.clientWidth) || probeWidth;
      const clientHeight = Number(viewport.clientHeight) || probeHeight;
      this.windowInsets = {
        width: Math.max(0, Math.round(probeWidth - clientWidth)),
        height: Math.max(0, Math.round(probeHeight - clientHeight))
      };
    } catch (error) {
      this.windowInsets = { width: 0, height: 0 };
    }
  }

  async ensureWindowFits() {
    // If the requested viewport is larger than the window content area, the
    // screencast frame comes back smaller than the pane and gets stretched.
    // Size the window so its content area matches the viewport exactly.
    try {
      if (!this.windowInsets) {
        await this.calibrateWindowInsets();
      }
      const windowId = await this.resolveWindowId();
      const insets = this.windowInsets || { width: 0, height: 0 };
      await this.send('Browser.setWindowBounds', {
        windowId,
        bounds: {
          windowState: 'normal',
          width: this.viewport.width + insets.width,
          height: this.viewport.height + insets.height
        }
      });
    } catch (error) {
      // Older Chromium builds or detached windows can reject window bounds.
    }
  }

  async applyViewport() {
    const mobile = this.emulationMode === 'mobile';
    const landscape = this.viewport.width > this.viewport.height;
    // A phone's screen is its viewport, but a desktop display is always larger
    // than the window drawn on it. Reporting screen.width === innerWidth is a
    // reading no real desktop produces, and bot checks treat it as one.
    const screen = mobile ? this.viewport : {
      width: Math.max(1920, this.viewport.width),
      height: Math.max(1080, this.viewport.height)
    };
    await this.ensureWindowFits();
    await this.send('Emulation.setDeviceMetricsOverride', {
      ...this.viewport,
      mobile,
      screenWidth: screen.width,
      screenHeight: screen.height,
      screenOrientation: {
        type: landscape ? 'landscapePrimary' : 'portraitPrimary',
        // Only a handheld reports a rotated display; a desktop stays at 0.
        angle: mobile && landscape ? 90 : 0
      }
    });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
    if (mobile) {
      await this.send('Emulation.setUserAgentOverride', {
        userAgent: mobileUserAgent(this.desktopUserAgent),
        platform: 'Linux armv8l',
        userAgentMetadata: userAgentMetadata('mobile')
      });
    } else {
      // No platform here: Chromium keeps its genuine navigator.platform ("Win32"),
      // which naming the platform explicitly would replace with a value no Chrome sends.
      await this.send('Emulation.setUserAgentOverride', {
        userAgent: desktopUserAgent(this.desktopUserAgent),
        userAgentMetadata: userAgentMetadata('desktop')
      });
    }
  }

  async installSelectPopup() {
    // The new-document hook covers every later navigation and subframe; the tab
    // already carries the document it was created with, so it needs the script
    // evaluated directly as well.
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: SELECT_POPUP_SCRIPT }).catch(() => {});
    await this.send('Runtime.evaluate', { expression: SELECT_POPUP_SCRIPT }).catch(() => {});
  }

  async applyBackground(hex) {
    const color = parseHexColor(hex);
    if (!color) return;
    // Chromium's own chrome (about:blank, the raw JSON/text viewer, error pages) picks its
    // background from prefers-color-scheme, not from the page background override below --
    // headless Chromium otherwise renders those as dark regardless of the requested color.
    const scheme = (color.r + color.g + color.b) / 3 > 128 ? 'light' : 'dark';
    await this.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: scheme }]
    }).catch(() => {});
    await this.send('Emulation.setDefaultBackgroundColorOverride', { color: { ...color, a: 1 } }).catch(() => {});
  }

  setClientStreamMode(client, mode, reason = '') {
    this.clientStreamModes.set(client, mode);
    this.sendClient(client, { type: 'streamMode', mode, reason, audio: mode === 'webrtc' });
    this.updateScreencast();
  }

  updateScreencast() {
    const needsFrames = [...this.clients].some((client) => this.clientStreamModes.get(client) !== 'webrtc');
    if (needsFrames) this.startScreencast().catch(() => {});
    else this.stopScreencast().catch(() => {});
  }

  prepareForNavigation() {
    for (const timer of this.rtcTimers.values()) clearTimeout(timer);
    this.rtcTimers.clear();
    this.rtcConnectedPeers.clear();
    this.rtcClients.clear();
    for (const client of this.clients) {
      const mode = this.clientMetadata.get(client)?.webrtc ? 'connecting' : 'jpeg';
      this.setClientStreamMode(client, mode, mode === 'jpeg' ? 'WebRTC is unavailable in this browser.' : 'Page navigation');
    }
  }

  restartRtcClients() {
    for (const client of this.clients) {
      if (this.clientMetadata.get(client)?.webrtc) this.startRtcForClient(client);
    }
  }

  rtcCaptureExpression(peerId) {
    const stateKey = JSON.stringify(this.rtcStateKey);
    const binding = JSON.stringify(this.rtcBinding);
    const id = JSON.stringify(peerId);
    return `(async () => {
      const signal = globalThis[${binding}];
      if (!signal || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || !isSecureContext) {
        return { ok: false, error: 'Secure tab capture is unavailable for this page.' };
      }
      const state = globalThis[${stateKey}] ||= { stream: null, streamPromise: null, peers: new Map() };
      const sendSignal = (payload) => signal(JSON.stringify({ peerId: ${id}, ...payload }));
      try {
        if (!state.stream || state.stream.getTracks().some((track) => track.readyState === 'ended')) {
          if (!state.streamPromise) state.streamPromise = (async () => {
            let expired = false;
            const request = navigator.mediaDevices.getDisplayMedia({
              video: { frameRate: { ideal: 30, max: 30 } },
              audio: true,
              preferCurrentTab: true
            });
            request.then((stream) => {
              if (expired) stream.getTracks().forEach((track) => track.stop());
            }, () => {});
            try {
              return await Promise.race([
                request,
                new Promise((resolve, reject) => setTimeout(() => {
                  expired = true;
                  reject(new Error('Tab capture timed out.'));
                }, 2500))
              ]);
            } finally {
              state.streamPromise = null;
            }
          })();
          state.stream = await state.streamPromise;
          const videoTrack = state.stream.getVideoTracks()[0];
          if (videoTrack && globalThis.CropTarget?.fromElement && typeof videoTrack.cropTo === 'function') {
            try {
              const cropTarget = await CropTarget.fromElement(document.documentElement);
              await videoTrack.cropTo(cropTarget);
            } catch (error) {
              // Region Capture is optional; the client still fills the pane when unavailable.
            }
          }
          state.stream.getTracks().forEach((track) => {
            track.addEventListener('ended', () => {
              for (const activePeerId of state.peers.keys()) {
                signal(JSON.stringify({ peerId: activePeerId, type: 'captureEnded' }));
              }
            }, { once: true });
          });
        }
        const previous = state.peers.get(${id});
        if (previous) previous.close();
        const peer = new RTCPeerConnection({ iceServers: [] });
        peer.pendingCandidates = [];
        state.peers.set(${id}, peer);
        state.stream.getTracks().forEach((track) => peer.addTrack(track, state.stream));
        peer.onicecandidate = (event) => sendSignal({ type: 'candidate', candidate: event.candidate });
        peer.onconnectionstatechange = () => sendSignal({ type: 'state', state: peer.connectionState });
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        sendSignal({
          type: 'offer',
          description: peer.localDescription,
          hasAudio: state.stream.getAudioTracks().length > 0
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.name + ': ' + error.message };
      }
    })()`;
  }

  async startRtcForClient(client) {
    if (!this.clients.has(client) || !this.clientMetadata.get(client)?.webrtc) return;
    await this.closeRtcClient(client);
    const peerId = crypto.randomUUID();
    this.rtcClients.set(peerId, client);
    this.setClientStreamMode(client, 'connecting', 'Starting WebRTC');
    await this.send('Page.bringToFront').catch(() => {});
    const response = await this.manager.queueCapture(() => this.send('Runtime.evaluate', {
      expression: this.rtcCaptureExpression(peerId),
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    })).catch((error) => ({ error }));
    if (!this.clients.has(client) || this.rtcClients.get(peerId) !== client) return;
    const result = response.result?.value;
    if (!result?.ok) {
      this.rtcClients.delete(peerId);
      this.setClientStreamMode(client, 'jpeg', result?.error || response.error?.message || 'WebRTC capture failed.');
      return;
    }
    this.scheduleRtcFallback(peerId, client, 'WebRTC negotiation timed out.');
  }

  clearRtcTimer(peerId) {
    const timer = this.rtcTimers.get(peerId);
    if (timer) clearTimeout(timer);
    this.rtcTimers.delete(peerId);
  }

  scheduleRtcFallback(peerId, client, reason) {
    this.clearRtcTimer(peerId);
    if (this.rtcConnectedPeers.has(peerId)) return;
    const timer = setTimeout(async () => {
      this.rtcTimers.delete(peerId);
      if (this.rtcClients.get(peerId) !== client || !this.clients.has(client)) return;
      await this.closeRtcClient(client);
      this.setClientStreamMode(client, 'jpeg', reason);
    }, this.rtcTimeoutMs);
    timer.unref();
    this.rtcTimers.set(peerId, timer);
  }

  async closeRtcClient(client) {
    const entries = [...this.rtcClients.entries()].filter(([, candidate]) => candidate === client);
    for (const [peerId] of entries) {
      this.clearRtcTimer(peerId);
      this.rtcConnectedPeers.delete(peerId);
      this.rtcClients.delete(peerId);
      const expression = `(() => {
        const state = globalThis[${JSON.stringify(this.rtcStateKey)}];
        const peer = state?.peers.get(${JSON.stringify(peerId)});
        if (peer) peer.close();
        state?.peers.delete(${JSON.stringify(peerId)});
        if (state && !state.peers.size && state.stream) {
          state.stream.getTracks().forEach((track) => track.stop());
          state.stream = null;
        }
      })()`;
      await this.send('Runtime.evaluate', { expression }).catch(() => {});
    }
  }

  handleRtcSignal(payload) {
    let message;
    try { message = JSON.parse(payload); } catch (error) { return; }
    const client = this.rtcClients.get(message.peerId);
    if (!client || !this.clients.has(client)) return;
    if (message.type === 'offer') {
      this.sendClient(client, {
        type: 'webrtcOffer',
        peerId: message.peerId,
        description: message.description,
        audio: Boolean(message.hasAudio),
        viewportWidth: this.viewport.width,
        viewportHeight: this.viewport.height
      });
      return;
    }
    if (message.type === 'candidate') {
      this.sendClient(client, { type: 'webrtcIceCandidate', peerId: message.peerId, candidate: message.candidate });
      return;
    }
    if (message.type === 'state') {
      if (message.state === 'connected') {
        this.clearRtcTimer(message.peerId);
        this.rtcConnectedPeers.add(message.peerId);
        this.setClientStreamMode(client, 'webrtc');
      }
      if (message.state === 'disconnected') {
        this.rtcConnectedPeers.delete(message.peerId);
        this.scheduleRtcFallback(message.peerId, client, 'WebRTC disconnected.');
      }
      if (message.state === 'failed' || message.state === 'closed') {
        this.clearRtcTimer(message.peerId);
        this.rtcConnectedPeers.delete(message.peerId);
        this.rtcClients.delete(message.peerId);
        this.setClientStreamMode(client, 'jpeg', `WebRTC ${message.state}.`);
      }
      return;
    }
    if (message.type === 'captureEnded') {
      this.clearRtcTimer(message.peerId);
      this.rtcConnectedPeers.delete(message.peerId);
      this.rtcClients.delete(message.peerId);
      this.setClientStreamMode(client, 'jpeg', 'Tab capture ended.');
    }
  }

  async applyRtcAnswer(peerId, description) {
    const expression = `(async () => {
      const peer = globalThis[${JSON.stringify(this.rtcStateKey)}]?.peers.get(${JSON.stringify(peerId)});
      if (!peer) return;
      await peer.setRemoteDescription(${JSON.stringify(description)});
      for (const candidate of peer.pendingCandidates.splice(0)) await peer.addIceCandidate(candidate);
    })()`;
    await this.send('Runtime.evaluate', { expression, awaitPromise: true });
  }

  async applyRtcCandidate(peerId, candidate) {
    const expression = `(async () => {
      const peer = globalThis[${JSON.stringify(this.rtcStateKey)}]?.peers.get(${JSON.stringify(peerId)});
      if (!peer || !${JSON.stringify(candidate)}) return;
      const candidate = ${JSON.stringify(candidate)};
      if (peer.remoteDescription) await peer.addIceCandidate(candidate);
      else peer.pendingCandidates.push(candidate);
    })()`;
    await this.send('Runtime.evaluate', { expression, awaitPromise: true });
  }

  async startScreencast() {
    if (this.screencasting) return;
    await this.send('Page.startScreencast', {
      format: 'jpeg',
      quality: JPEG_QUALITY,
      maxWidth: this.viewport.width,
      maxHeight: this.viewport.height,
      everyNthFrame: 1
    });
    this.screencasting = true;
  }

  async stopScreencast() {
    if (!this.screencasting) return;
    await this.send('Page.stopScreencast').catch(() => {});
    this.screencasting = false;
  }

  async attachClient(client) {
    this.clients.add(client);
    this.clientMetadata.set(client, { id: crypto.randomUUID(), webrtc: false, viewport: null });
    this.clientStreamModes.set(client, 'jpeg');
    await this.startScreencast();
    const viewport = { ...this.viewport };
    const screenshot = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: JPEG_QUALITY }).catch(() => null);
    if (screenshot?.data) {
      this.sendClient(client, {
        type: 'frame',
        data: screenshot.data,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height
      });
    }
    this.sendClient(client, { type: 'streamMode', mode: 'jpeg', reason: 'Checking WebRTC support.', audio: false });
    this.sendClient(client, { type: 'status', state: 'ready' });
  }

  async detachClient(client) {
    await this.closeRtcClient(client);
    this.clients.delete(client);
    this.clientMetadata.delete(client);
    this.clientStreamModes.delete(client);
    if (this.viewportOwner === client) {
      this.viewportOwner = this.clients.values().next().value || null;
      if (this.viewportOwner) await this.claimViewport(this.viewportOwner);
      this.broadcastViewportOwner();
    }
    if (!this.clients.size) await this.stopScreencast();
    else this.updateScreencast();
  }

  async resize(width, height, deviceScaleFactor) {
    const next = normalizeViewport(width, height, deviceScaleFactor, this.emulationMode);
    if (JSON.stringify(next) === JSON.stringify(this.viewport)) return;
    this.viewport = next;
    await this.stopScreencast();
    await this.applyViewport();
    if (this.clients.size) this.updateScreencast();
  }

  async setEmulationMode(value) {
    const next = normalizeEmulationMode(value);
    if (next === this.emulationMode) return;
    this.emulationMode = next;
    const ownerViewport = this.clientMetadata.get(this.viewportOwner)?.viewport || this.viewport;
    this.viewport = normalizeViewport(ownerViewport.width, ownerViewport.height, ownerViewport.deviceScaleFactor, next);
    this.manager.store.updateBrowserTab(this.paneId, this.tabId, { emulationMode: next });
    this.manager.broadcastTabs(this.paneId);
    this.prepareForNavigation();
    await this.stopScreencast();
    await this.applyViewport();
    await this.send('Page.reload', { ignoreCache: false });
  }

  async navigate(url) {
    this.manager.assertWebsiteAllowed(url);
    this.broadcast({ type: 'status', state: 'loading' });
    const result = await this.send('Page.navigate', { url });
    if (result.errorText && result.errorText !== 'net::ERR_ABORTED') throw new Error(result.errorText);
  }

  async handlePausedRequest(request) {
    if (this.manager.isWebsiteBlocked(request.request.url)) {
      await this.send('Fetch.failRequest', { requestId: request.requestId, errorReason: 'BlockedByClient' });
      this.broadcast({ type: 'error', message: 'Paneboard cannot open its own server address in a Browser pane.' });
      return;
    }
    await this.send('Fetch.continueRequest', { requestId: request.requestId });
  }

  async historyOffset(offset) {
    const history = await this.send('Page.getNavigationHistory');
    const entry = history.entries[history.currentIndex + offset];
    if (entry) await this.send('Page.navigateToHistoryEntry', { entryId: entry.id });
  }

  async selectedText() {
    const result = await this.send('Runtime.evaluate', {
      expression: 'window.getSelection().toString()',
      returnByValue: true
    });
    return String(result.result?.value || '');
  }

  async hasFocusedTextInput() {
    const result = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const active = document.activeElement;
        return Boolean(active?.matches?.('textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="password"], input[type="tel"], input[type="url"], input[type="number"], [contenteditable=""], [contenteditable="true"], [role="textbox"]'));
      })()`,
      returnByValue: true
    }).catch(() => null);
    return Boolean(result?.result?.value);
  }

  async selectAll() {
    await this.send('Runtime.evaluate', {
      expression: `(() => {
        const active = document.activeElement;
        if (active && typeof active.select === 'function' && /^(INPUT|TEXTAREA)$/.test(active.tagName)) {
          active.select();
          return;
        }
        const range = document.createRange();
        range.selectNodeContents(document.body);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      })()`
    });
  }

  async refreshMetadata() {
    const result = await this.send('Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true
    }).catch(() => null);
    this.manager.updateTitle(this.paneId, this.tabId, String(result?.result?.value || 'New tab'));
  }

  async applyZoom() {
    await this.send('Emulation.setPageScaleFactor', { pageScaleFactor: this.zoom });
  }

  async setZoom(value) {
    this.zoom = Math.max(0.25, Math.min(3, Math.round(Number(value) * 10) / 10));
    await this.applyZoom();
    this.manager.store.updateBrowserTab(this.paneId, this.tabId, { zoom: this.zoom });
    this.manager.broadcastTabs(this.paneId);
  }

  async findText(query, backwards = false) {
    const text = String(query || '').slice(0, 500);
    if (!text) {
      this.broadcast({ type: 'findResult', found: false, empty: true });
      return;
    }
    const expression = `window.find(${JSON.stringify(text)}, false, ${backwards ? 'true' : 'false'}, true, false, false, false)`;
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    this.broadcast({ type: 'findResult', found: Boolean(result.result?.value) });
  }

  sendClient(client, message) {
    if (client?.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
  }

  async handle(message, client) {
    if (message.type === 'clientCapabilities') {
      const metadata = this.clientMetadata.get(client) || { id: crypto.randomUUID() };
      metadata.webrtc = Boolean(message.webrtc);
      metadata.deviceMode = normalizeEmulationMode(message.deviceMode);
      this.clientMetadata.set(client, metadata);
      await this.updateClientViewport(client, message.width, message.height, message.deviceScaleFactor, true);
      if (metadata.webrtc) this.startRtcForClient(client);
      return;
    }
    if (message.type === 'theme') {
      if (parseHexColor(message.backgroundColor) && message.backgroundColor !== this.manager.themeBackground) {
        this.manager.themeBackground = message.backgroundColor;
        await this.applyBackground(message.backgroundColor);
      }
      return;
    }
    if (message.type === 'navigate') {
      const url = this.manager.normalizeWebsite(message.url);
      if (!url) throw new Error('Enter a valid HTTP or HTTPS website.');
      return this.navigate(url);
    }
    if (message.type === 'back') return this.historyOffset(-1);
    if (message.type === 'forward') return this.historyOffset(1);
    if (message.type === 'reload') return this.send('Page.reload', { ignoreCache: false });
    if (message.type === 'stop') return this.send('Page.stopLoading');
    if (message.type === 'resize') return this.updateClientViewport(client, message.width, message.height, message.deviceScaleFactor, true);
    if (message.type === 'setEmulationMode') return this.setEmulationMode(message.emulationMode);
    if (message.type === 'rtcAnswer') {
      if (this.rtcClients.get(message.peerId) === client) return this.applyRtcAnswer(message.peerId, message.description);
      return;
    }
    if (message.type === 'rtcIceCandidate') {
      if (this.rtcClients.get(message.peerId) === client) return this.applyRtcCandidate(message.peerId, message.candidate);
      return;
    }
    if (message.type === 'mouse') {
      if (message.event === 'mousePressed' || message.event === 'mouseWheel' || Number(message.buttons)) {
        await this.claimViewport(client);
      }
      return this.dispatch('Input.dispatchMouseEvent', {
        type: message.event,
        x: Number(message.x) || 0,
        y: Number(message.y) || 0,
        button: message.button || 'none',
        buttons: Number(message.buttons) || 0,
        clickCount: Number(message.clickCount) || 0,
        deltaX: Number(message.deltaX) || 0,
        deltaY: Number(message.deltaY) || 0,
        modifiers: Number(message.modifiers) || 0
      });
    }
    if (message.type === 'touch') {
      if (message.event === 'touchStart') await this.claimViewport(client);
      return this.dispatch('Input.dispatchTouchEvent', {
        type: String(message.event || ''),
        touchPoints: Array.isArray(message.touchPoints) ? message.touchPoints.slice(0, 5).map((point) => ({
          x: Number(point.x) || 0,
          y: Number(point.y) || 0,
          radiusX: Math.max(1, Number(point.radiusX) || 1),
          radiusY: Math.max(1, Number(point.radiusY) || 1),
          force: Math.max(0, Math.min(1, Number(point.force) || 0)),
          id: Number(point.id) || 0
        })) : [],
        modifiers: Number(message.modifiers) || 0
      });
    }
    if (message.type === 'key') {
      await this.claimViewport(client);
      return this.dispatch('Input.dispatchKeyEvent', {
        type: message.event,
        key: String(message.key || ''),
        code: String(message.code || ''),
        text: String(message.text || ''),
        unmodifiedText: String(message.text || ''),
        windowsVirtualKeyCode: Number(message.windowsVirtualKeyCode) || 0,
        nativeVirtualKeyCode: Number(message.windowsVirtualKeyCode) || 0,
        modifiers: Number(message.modifiers) || 0
      });
    }
    if (message.type === 'text') {
      await this.claimViewport(client);
      return this.dispatch('Input.insertText', { text: String(message.text || '') });
    }
    if (message.type === 'keyboardFocus') {
      this.sendClient(client, { type: 'keyboardFocus', visible: await this.hasFocusedTextInput() });
      return;
    }
    if (message.type === 'selection' || message.type === 'copy') {
      const text = await this.selectedText();
      this.sendClient(client, { type: message.type, text });
      return;
    }
    if (message.type === 'selectAll') {
      await this.selectAll();
      const text = await this.selectedText();
      this.sendClient(client, { type: 'selection', text });
    }
    if (message.type === 'find') return this.findText(message.query, Boolean(message.backwards));
    if (message.type === 'zoom') {
      const next = message.reset ? 1 : this.zoom + (Number(message.delta) || 0);
      return this.setZoom(next);
    }
    if (message.type === 'dialog') {
      return this.send('Page.handleJavaScriptDialog', {
        accept: Boolean(message.accept),
        promptText: String(message.promptText || '')
      });
    }
  }

  async close(closeClients = false) {
    if (closeClients) {
      for (const client of this.clients) client.close(1001, 'Browser pane closed');
    }
    this.clients.clear();
    this.socket?.close();
    await this.manager.closeTarget(this.targetId).catch(() => {});
  }
}

class BrowserManager {
  constructor({ root, store, normalizeWebsite, onNavigate, serverPort, networkInterfaces }) {
    this.root = root;
    this.store = store;
    this.normalizeWebsite = normalizeWebsite;
    this.onNavigate = onNavigate;
    this.serverPort = Number(serverPort);
    this.networkInterfaces = networkInterfaces || os.networkInterfaces();
    this.downloadDir = path.join(root, 'data', 'browser-downloads');
    fs.mkdirSync(this.downloadDir, { recursive: true });
    this.downloads = new Map();
    this.pages = new Map();
    this.paneClients = new Map();
    this.clientPages = new Map();
    this.chrome = null;
    this.debuggingUrl = '';
    this.starting = null;
    this.captureQueue = Promise.resolve();
    this.themeBackground = DEFAULT_BACKGROUND_COLOR;
  }

  queueCapture(callback) {
    const result = this.captureQueue.then(callback, callback);
    this.captureQueue = result.catch(() => {});
    return result;
  }

  async ensureChromium() {
    if (this.debuggingUrl && this.chrome?.exitCode === null) return this.debuggingUrl;
    if (this.starting) return this.starting;
    this.starting = this.startChromium();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  terminateStaleChromium(profilePath) {
    return terminateStaleChromium(profilePath);
  }

  async startChromium() {
    const executable = findChromiumExecutable();
    if (!executable) return Promise.reject(new Error('Google Chrome or Microsoft Edge is not installed on the Paneboard server.'));
    const profilePath = path.join(this.root, 'data', 'browser-profile');
    fs.mkdirSync(profilePath, { recursive: true });
    await this.terminateStaleChromium(profilePath);
    this.chrome = spawn(executable, chromeArguments(profilePath), {
      cwd: this.root,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    return new Promise((resolve, reject) => {
      let stderr = '';
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.chrome?.kill();
        reject(error);
      };
      const timer = setTimeout(() => fail(new Error('Chromium did not start within 15 seconds.')), 15000);
      this.chrome.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (!match || settled) return;
        settled = true;
        clearTimeout(timer);
        const parsed = new URL(match[1]);
        this.debuggingUrl = `http://${parsed.hostname}:${parsed.port}`;
        resolve(this.debuggingUrl);
      });
      this.chrome.once('error', (error) => {
        fail(error);
      });
      this.chrome.once('exit', () => {
        if (!settled) fail(new Error('Chromium exited before remote browsing was ready.'));
        this.debuggingUrl = '';
        for (const page of this.pages.values()) page.onClose();
        this.pages.clear();
      });
    });
  }

  async getOrCreatePage(paneId, tabId) {
    if (this.pages.has(tabId)) return this.pages.get(tabId);
    const found = this.store.findPane(paneId);
    if (!found || found.pane.type !== 'browser') throw new Error('Browser pane not found.');
    const tab = found.pane.browserTabs.find((candidate) => candidate.id === tabId);
    if (!tab) throw new Error('Browser tab not found.');
    const baseUrl = await this.ensureChromium();
    const normalizedUrl = this.normalizeWebsite(tab.url);
    const initialUrl = normalizedUrl && !this.isWebsiteBlocked(normalizedUrl) ? normalizedUrl : 'about:blank';
    const target = await requestJson(`${baseUrl}/json/new?${encodeURIComponent(initialUrl)}`, 'PUT');
    const page = new RemoteBrowserPage(this, paneId, tabId, target);
    this.pages.set(tabId, page);
    await page.ready;
    return page;
  }

  isWebsiteBlocked(value) {
    return isOwnServerWebsite(value, this.serverPort, this.networkInterfaces);
  }

  assertWebsiteAllowed(value) {
    if (this.isWebsiteBlocked(value)) {
      throw new Error('Paneboard cannot open its own server address in a Browser pane.');
    }
  }

  tabState(paneId) {
    const pane = this.store.findPane(paneId)?.pane;
    if (!pane || pane.type !== 'browser') return { tabs: [], activeTabId: '' };
    return { tabs: pane.browserTabs, activeTabId: pane.activeBrowserTabId };
  }

  broadcastPane(paneId, message) {
    const payload = JSON.stringify(message);
    for (const client of this.paneClients.get(paneId) || []) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  broadcastTabs(paneId) {
    this.broadcastPane(paneId, { type: 'tabs', ...this.tabState(paneId) });
  }

  async switchClients(paneId, tabId) {
    const page = await this.getOrCreatePage(paneId, tabId);
    for (const client of this.paneClients.get(paneId) || []) {
      const previous = this.clientPages.get(client);
      if (previous && previous !== page) await previous.detachClient(client);
      this.clientPages.set(client, page);
      if (!page.clients.has(client)) await page.attachClient(client);
    }
    this.broadcastTabs(paneId);
  }

  async handleClientMessage(paneId, client, message) {
    if (message.type === 'newTab') {
      const url = this.normalizeWebsite(message.url) || '';
      if (url) this.assertWebsiteAllowed(url);
      const tab = this.store.createBrowserTab(paneId, url, message.emulationMode);
      if (!tab) throw new Error('Could not create another browser tab.');
      await this.switchClients(paneId, tab.id);
      return;
    }
    if (message.type === 'activateTab') {
      if (!this.store.activateBrowserTab(paneId, message.tabId)) throw new Error('Browser tab not found.');
      await this.switchClients(paneId, message.tabId);
      return;
    }
    if (message.type === 'closeTab') {
      await this.killTab(message.tabId);
      if (!this.store.closeBrowserTab(paneId, message.tabId)) throw new Error('Browser tab not found.');
      const activeTabId = this.store.findPane(paneId).pane.activeBrowserTabId;
      await this.switchClients(paneId, activeTabId);
      return;
    }
    if (message.type === 'moveTab') {
      await this.moveTab(paneId, message.tabId, message.index, message.targetPaneId);
      return;
    }
    const page = this.clientPages.get(client);
    if (page) await page.handle(message, client);
  }

  // Dragging a browser tab within its strip or onto another browser pane. The
  // CDP page a tab already has open is keyed by tab id, not pane id, so it is
  // simply handed to whichever pane's clients should now see it.
  async moveTab(paneId, tabId, index, targetPaneId) {
    const result = this.store.moveTab('browser', paneId, tabId, index, targetPaneId);
    if (!result) throw new Error('Browser tab not found.');
    if (!result.sourcePane) {
      await this.switchClients(paneId, result.pane.activeBrowserTabId);
      return;
    }
    const page = this.pages.get(tabId);
    if (page) page.paneId = targetPaneId;
    await this.switchClients(paneId, result.sourcePane.activeBrowserTabId);
    await this.switchClients(targetPaneId, tabId);
  }

  async attach(paneId, client) {
    try {
      const found = this.store.findPane(paneId);
      if (!found || found.pane.type !== 'browser') throw new Error('Browser pane not found.');
      if (!this.paneClients.has(paneId)) this.paneClients.set(paneId, new Set());
      this.paneClients.get(paneId).add(client);
      const ready = this.switchClients(paneId, found.pane.activeBrowserTabId);
      let messageQueue = ready;
      client.on('message', (data) => {
        let message;
        try { message = JSON.parse(data.toString()); } catch (error) { return; }
        messageQueue = messageQueue.then(() => this.handleClientMessage(paneId, client, message)).catch((error) => {
          if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'error', message: error.message }));
        });
      });
      client.on('close', () => {
        this.paneClients.get(paneId)?.delete(client);
        const page = this.clientPages.get(client);
        if (page) page.detachClient(client);
        this.clientPages.delete(client);
      });
      await ready;
    } catch (error) {
      client.send(JSON.stringify({ type: 'error', message: error.message }));
      client.close(1011, 'Remote browser unavailable');
    }
  }

  recordNavigation(paneId, tabId, value, page) {
    if (!/^https?:\/\//i.test(value)) return;
    this.store.updateBrowserTab(paneId, tabId, { url: value });
    const history = this.onNavigate ? this.onNavigate(value) : [];
    page.broadcast({ type: 'navigation', tabId, url: value, history });
    this.broadcastTabs(paneId);
  }

  updateTitle(paneId, tabId, title) {
    this.store.updateBrowserTab(paneId, tabId, { title });
    this.broadcastTabs(paneId);
  }

  async openWindow(paneId, value, sourceTabId = '') {
    const url = this.normalizeWebsite(value) || '';
    if (url && this.isWebsiteBlocked(url)) {
      this.broadcastPane(paneId, { type: 'error', message: 'Paneboard cannot open its own server address in a Browser pane.' });
      return;
    }
    const source = this.store.findPane(paneId)?.pane.browserTabs.find((tab) => tab.id === sourceTabId);
    const tab = this.store.createBrowserTab(paneId, url, source?.emulationMode);
    if (tab) await this.switchClients(paneId, tab.id);
  }

  beginDownload(paneId, tabId, value) {
    const download = {
      guid: value.guid,
      paneId,
      tabId,
      filename: path.basename(value.suggestedFilename || 'download'),
      url: value.url,
      state: 'inProgress',
      receivedBytes: 0,
      totalBytes: 0
    };
    this.downloads.set(download.guid, download);
    this.broadcastPane(paneId, { type: 'download', download });
  }

  updateDownload(paneId, value) {
    const download = this.downloads.get(value.guid);
    if (!download) return;
    Object.assign(download, {
      state: value.state,
      receivedBytes: Number(value.receivedBytes) || 0,
      totalBytes: Number(value.totalBytes) || 0
    });
    this.broadcastPane(paneId, { type: 'download', download });
  }

  downloadFile(guid) {
    const download = this.downloads.get(guid);
    const filePath = path.join(this.downloadDir, String(guid || ''));
    if (!download || download.state !== 'completed' || !fs.existsSync(filePath)) return null;
    return { path: filePath, filename: download.filename };
  }

  async setFileInputFiles(tabId, nodeId, paths) {
    const page = this.pages.get(tabId);
    if (!page) throw new Error('Browser tab is not open.');
    await page.send('DOM.setFileInputFiles', {
      files: paths,
      backendNodeId: Number(nodeId)
    });
  }

  async closeTarget(targetId) {
    if (!this.debuggingUrl) return;
    await requestJson(`${this.debuggingUrl}/json/close/${encodeURIComponent(targetId)}`);
  }

  async killPane(paneId) {
    const pages = [...this.pages.values()].filter((page) => page.paneId === paneId);
    for (const page of pages) {
      this.pages.delete(page.tabId);
      await page.close(true);
    }
    this.paneClients.delete(paneId);
  }

  async killTab(tabId) {
    const page = this.pages.get(tabId);
    if (!page) return;
    this.pages.delete(tabId);
    for (const client of [...page.clients]) await page.detachClient(client);
    await page.close();
  }

  killSession(session) {
    for (const tab of session?.tabs || []) {
      for (const pane of tab.panes || []) this.killPane(pane.id);
    }
  }

  shutdown() {
    for (const page of this.pages.values()) page.socket?.close();
    this.pages.clear();
    this.paneClients.clear();
    this.clientPages.clear();
    this.downloads.clear();
    this.chrome?.kill();
    this.chrome = null;
    this.debuggingUrl = '';
  }
}

module.exports = {
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
};
