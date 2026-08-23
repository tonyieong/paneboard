#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const express = require('express');
const http = require('http');
const https = require('https');
const selfsigned = require('selfsigned');
const { WebSocketServer } = require('ws');
const { appRoot, loadConfig, updateConfigFile } = require('./config');
const { createSessionToken, hashPassword, validatePassword, verifyPassword, verifySessionToken } = require('./auth');
const files = require('./files');
const { resolveShell, normalizeCwd } = require('./shell');
const { listAiSessions } = require('./ai-sessions');
const { StateStore } = require('./state');
const { TerminalManager } = require('./terminal');
const { startTray } = require('./tray');
const { loadOrCreateControlToken, requireRuntimeControl } = require('./runtime-control');
const { createUploadParser } = require('./upload');
const usage = require('./usage');
const { getPluginPane, listPluginPanes, loadAiPluginPanes, pluginPaneUrl, resolvePluginPaneAsset, resolveTrustedPluginPaneAsset } = require('./plugin-panes');
const { BrowserManager, isOwnServerWebsite } = require('./browser');
const { createRateLimiter, isSameOrigin, isTrustedHost } = require('./request-guard');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const REMEMBER_TOKEN_TTL_MS = 30 * TOKEN_TTL_MS;
const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function parseCliArgs(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return [];
  }
  const args = text.split(/\s+/);
  return args.every((arg) => /^[\w.:=@/\\-]+$/.test(arg)) ? args : null;
}

function clientKey(req) {
  return req.socket.remoteAddress || 'unknown';
}

function openBrowser(url) {
  spawn('cmd', ['/c', 'start', '', url], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
}

function publicDir() {
  return path.join(__dirname, '..', 'public');
}

function ensurePackagedIcon(root) {
  if (!process.pkg) {
    return;
  }
  const source = path.join(__dirname, '..', 'assets', 'wps7.ico');
  const targetDir = path.join(root, 'data');
  const target = path.join(targetDir, 'wps7.ico');
  fs.mkdirSync(targetDir, { recursive: true });
  if (!fs.existsSync(target)) {
    fs.copyFileSync(source, target);
  }
}

function appendRuntimeLog(root, message) {
  const targetDir = path.join(root, 'data');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.appendFileSync(path.join(targetDir, 'runtime.log'), `${new Date().toISOString()} ${message}\n`);
}

function writeRuntimeInfo(root, config) {
  const targetDir = path.join(root, 'data');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'runtime.json'), JSON.stringify({
    host: config.server.host,
    port: config.server.port,
    protocol: config.server.protocol,
    pid: process.pid,
    updatedAt: new Date().toISOString()
  }, null, 2));
}

// The certificate is generated once and reused, so a browser only has to
// trust it after the first https launch, not after every restart.
function ensureTlsCredentials(root) {
  const targetDir = path.join(root, 'data');
  fs.mkdirSync(targetDir, { recursive: true });
  const keyPath = path.join(targetDir, 'tls-key.pem');
  const certPath = path.join(targetDir, 'tls-cert.pem');
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    const pems = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
      days: 3650,
      keySize: 2048,
      extensions: [{
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' }
        ]
      }]
    });
    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);
  }
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

function readRuntimeInfo(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'data', 'runtime.json'), 'utf8'));
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user; ESRCH means
    // there is no such process.
    return error.code === 'EPERM';
  }
}

function stateCounts(store) {
  let panes = 0;
  for (const session of store.state.sessions || []) {
    for (const tab of session.tabs || []) {
      panes += (tab.panes || []).length;
    }
  }
  return {
    sessions: (store.state.sessions || []).length,
    panes
  };
}

function requireAuth(config) {
  return (req, res, next) => {
    if (!config.auth.password_hash) {
      next();
      return;
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token || '');
    if (verifySessionToken(token, config.auth.password_hash)) {
      next();
      return;
    }

    res.status(401).json({ error: 'Login required.' });
  };
}

function notepadDefaults(config) {
  return {
    wrap: config.ui.notepad_word_wrap === true,
    indentGuides: config.ui.notepad_indent_guides === true,
    autosave: config.ui.notepad_autosave === true
  };
}

function replaceObject(target, source) {
  for (const key of Object.keys(target)) {
    if (!(key in source)) {
      delete target[key];
    }
  }
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = replaceObject(target[key] || {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function publicConfig(config, shell, restartRequired, reloadError) {
  return {
    server: config.server,
    authRequired: Boolean(config.auth.password_hash),
    shell,
    persistence: config.persistence,
    terminal: {
      ...config.terminal,
      mobile_keybar_buttons: sanitizeMobileKeybarButtons(config.terminal.mobile_keybar_buttons)
    },
    ui: config.ui,
    file_manager: config.file_manager,
    browser: config.browser,
    usage: {
      ...usageVisibility(config),
      ...usageThresholds(config),
      notify_quota: config.usage.notify_quota === true,
      refresh_minutes: usageRefreshMinutes(config),
      minimax_configured: Boolean(process.env.MINIMAX_CODING_API_KEY || process.env.MINIMAX_API_KEY || config.usage.minimax_api_key),
      minimax_region: config.usage.minimax_region
    },
    ai: aiSettings(config),
    custom_theme: config.custom_theme,
    restartRequired,
    reloadError
  };
}

function settingsConfig(config, runtimeConfig) {
  return {
    server: {
      host: typeof config.server.host === 'string' ? config.server.host : runtimeConfig.server.host,
      port: validPort(config.server.port) ? Number(config.server.port) : Number(runtimeConfig.server.port),
      protocol: config.server.protocol === 'https' ? 'https' : 'http',
      open_browser: Boolean(config.server.open_browser),
      allowed_hosts: Array.isArray(config.server.allowed_hosts)
        ? config.server.allowed_hosts.map((entry) => String(entry))
        : []
    },
    auth: {
      password_set: Boolean(config.auth.password_hash)
    },
    shell: config.shell,
    persistence: {
      autosave_minutes: positiveInteger(config.persistence.autosave_minutes, runtimeConfig.persistence.autosave_minutes)
    },
    terminal: {
      auto_scroll_on_resize: Boolean(config.terminal.auto_scroll_on_resize),
      cursor_blink: Boolean(config.terminal.cursor_blink),
      browser_notifications: Boolean(config.terminal.browser_notifications),
      mobile_keybar_buttons: sanitizeMobileKeybarButtons(config.terminal.mobile_keybar_buttons)
    },
    ui: {
      sidebar_width: positiveInteger(config.ui.sidebar_width, runtimeConfig.ui.sidebar_width),
      grid_size: positiveInteger(config.ui.grid_size, runtimeConfig.ui.grid_size),
      vertical_slots: positiveInteger(config.ui.vertical_slots, runtimeConfig.ui.vertical_slots),
      default_pane_width: positiveInteger(config.ui.default_pane_width, runtimeConfig.ui.default_pane_width),
      default_pane_height: positiveInteger(config.ui.default_pane_height, runtimeConfig.ui.default_pane_height),
      terminal_font_family: config.ui.terminal_font_family,
      terminal_font_size: positiveInteger(config.ui.terminal_font_size, runtimeConfig.ui.terminal_font_size),
      mobile_terminal_font_size: positiveInteger(config.ui.mobile_terminal_font_size, runtimeConfig.ui.mobile_terminal_font_size),
      file_pane_font_size: positiveInteger(config.ui.file_pane_font_size, runtimeConfig.ui.file_pane_font_size),
      system_font_size: positiveInteger(config.ui.system_font_size, runtimeConfig.ui.system_font_size),
      notepad_word_wrap: Boolean(config.ui.notepad_word_wrap),
      notepad_indent_guides: Boolean(config.ui.notepad_indent_guides),
      notepad_autosave: Boolean(config.ui.notepad_autosave)
    },
    file_manager: {
      root_mode: config.file_manager.root_mode === 'drives' ? 'drives' : runtimeConfig.file_manager.root_mode,
      max_upload_bytes: nonNegativeInteger(config.file_manager.max_upload_bytes, runtimeConfig.file_manager.max_upload_bytes),
      show_hidden: Boolean(config.file_manager.show_hidden),
      bookmarks: Array.isArray(config.file_manager.bookmarks) ? config.file_manager.bookmarks : []
    },
    browser: {
      bookmarks: Array.isArray(config.browser.bookmarks) ? config.browser.bookmarks : [],
      history: Array.isArray(config.browser.history) ? config.browser.history : []
    },
    usage: {
      ...usageVisibility(config),
      ...usageThresholds(config),
      notify_quota: config.usage.notify_quota === true,
      refresh_minutes: usageRefreshMinutes(config),
      minimax_configured: Boolean(process.env.MINIMAX_CODING_API_KEY || process.env.MINIMAX_API_KEY || config.usage.minimax_api_key),
      minimax_region: config.usage.minimax_region === 'china' ? 'china' : 'global',
      codex_home: typeof config.usage.codex_home === 'string' ? config.usage.codex_home : '',
      claude_home: typeof config.usage.claude_home === 'string' ? config.usage.claude_home : ''
    },
    ai: aiSettings(config),
    custom_theme: config.custom_theme
  };
}

// The folder an AI tab launches its CLI in. It reaches a spawn, so it is
// resolved and checked here rather than trusted; an empty result means "leave
// it as it was".
function aiWorkingFolder(value) {
  const normalized = files.normalizeLocalPath(String(value || ''));
  if (!normalized) {
    return '';
  }
  try {
    return fs.statSync(normalized).isDirectory() ? normalized : '';
  } catch (error) {
    return '';
  }
}

// A tab without its transcript: the messages reach the pane over its own
// socket, so a tab route that carried them would send the same bytes twice.
function aiTabSummary(tab) {
  return {
    id: tab.id,
    title: tab.title,
    provider: tab.provider,
    cwd: tab.cwd,
    showThinking: tab.showThinking,
    showTools: tab.showTools
  };
}

// Both the public config and the settings form report the same AI defaults,
// and both have to be sure the values are ones the CLIs actually accept.
function aiSettings(config) {
  const ai = config.ai || {};
  return {
    default_provider: ai.default_provider === 'codex' ? 'codex' : 'claude',
    show_thinking: ai.show_thinking !== false,
    show_tools: ai.show_tools !== false,
    claude_model: typeof ai.claude_model === 'string' ? ai.claude_model : '',
    claude_effort: typeof ai.claude_effort === 'string' ? ai.claude_effort : '',
    claude_args: typeof ai.claude_args === 'string' ? ai.claude_args : '',
    codex_model: typeof ai.codex_model === 'string' ? ai.codex_model : '',
    codex_effort: typeof ai.codex_effort === 'string' ? ai.codex_effort : '',
    codex_args: typeof ai.codex_args === 'string' ? ai.codex_args : '',
    debug_log: ai.debug_log === true
  };
}

const usageVisibilityKeys = ['show_codex', 'show_claude', 'show_minimax', 'show_five_hour', 'show_weekly', 'show_model_weekly', 'show_credits'];

function usageVisibility(config) {
  return Object.fromEntries(usageVisibilityKeys.map((key) => [key, config.usage[key] !== false]));
}

// Usage pane auto-refresh interval in minutes. 0 turns auto-refresh off.
function usageRefreshMinutes(config) {
  const minutes = Number(config.usage.refresh_minutes);
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 999 ? minutes : 10;
}

function usagePercent(value, fallback) {
  const percent = Number(value);
  return Number.isInteger(percent) && percent >= 0 && percent <= 100 ? percent : fallback;
}

// Amber never sits above red, so a swapped pair still reads sensibly.
function usageThresholds(config) {
  const alert = usagePercent(config.usage.alert_percent, 90);
  return { warn_percent: Math.min(usagePercent(config.usage.warn_percent, 75), alert), alert_percent: alert };
}

function validPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function validHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function sanitizeMobileKeybarButtons(buttons) {
  const actions = new Set(['shortcut', 'modifier', 'text']);
  if (!Array.isArray(buttons)) {
    return [];
  }
  return buttons.slice(0, 24).flatMap((button) => {
    const label = typeof button?.label === 'string' ? button.label.trim().slice(0, 15) : '';
    const action = typeof button?.action === 'string' ? button.action : '';
    const value = typeof button?.value === 'string' ? button.value.slice(0, 256) : '';
    if (!label || !actions.has(action) || !value) {
      return [];
    }
    return [{ label, action, value, enabled: button.enabled !== false }];
  });
}

function sanitizeSettingsUpdates(updates) {
  const next = {};
  if (updates.server) {
    next.server = {};
    if (updates.server.host === '127.0.0.1' || updates.server.host === '0.0.0.0') {
      next.server.host = updates.server.host;
    } else if (Object.prototype.hasOwnProperty.call(updates.server, 'host')) {
      throw new Error('Server access must be Local or LAN.');
    }
    if (validPort(updates.server.port)) {
      next.server.port = Number(updates.server.port);
    }
    if (updates.server.protocol === 'http' || updates.server.protocol === 'https') {
      next.server.protocol = updates.server.protocol;
    } else if (Object.prototype.hasOwnProperty.call(updates.server, 'protocol')) {
      throw new Error('Server protocol must be http or https.');
    }
    if (typeof updates.server.open_browser === 'boolean') {
      next.server.open_browser = updates.server.open_browser;
    }
    // isTrustedHost compares against a lower-cased hostname, so store the names
    // the same way and the saved list reads exactly as it behaves.
    if (Array.isArray(updates.server.allowed_hosts)) {
      next.server.allowed_hosts = updates.server.allowed_hosts
        .map((entry) => String(entry).trim().toLowerCase())
        .filter(Boolean);
    }
  }
  if (updates.auth) {
    next.auth = {};
    if (Object.prototype.hasOwnProperty.call(updates.auth, 'password')) {
      const password = String(updates.auth.password || '');
      if (password) {
        const passwordError = validatePassword(password);
        if (passwordError) {
          throw new Error(passwordError);
        }
        next.auth.password_hash = hashPassword(password);
      }
    }
  }
  if (updates.shell) {
    next.shell = {};
    if (typeof updates.shell.preferred === 'string' && updates.shell.preferred.trim()) {
      next.shell.preferred = updates.shell.preferred.trim();
    }
    if (typeof updates.shell.fallback === 'string' && updates.shell.fallback.trim()) {
      next.shell.fallback = updates.shell.fallback.trim();
    }
    if (Array.isArray(updates.shell.args)) {
      next.shell.args = updates.shell.args.map((arg) => String(arg)).filter(Boolean);
    }
  }
  if (updates.persistence) {
    next.persistence = {};
    if (positiveInteger(updates.persistence.autosave_minutes, 0)) {
      next.persistence.autosave_minutes = Number(updates.persistence.autosave_minutes);
    }
  }
  if (updates.terminal) {
    next.terminal = {};
    if (typeof updates.terminal.auto_scroll_on_resize === 'boolean') {
      next.terminal.auto_scroll_on_resize = updates.terminal.auto_scroll_on_resize;
    }
    if (typeof updates.terminal.cursor_blink === 'boolean') {
      next.terminal.cursor_blink = updates.terminal.cursor_blink;
    }
    if (typeof updates.terminal.browser_notifications === 'boolean') {
      next.terminal.browser_notifications = updates.terminal.browser_notifications;
    }
    if (Array.isArray(updates.terminal.mobile_keybar_buttons)) {
      next.terminal.mobile_keybar_buttons = sanitizeMobileKeybarButtons(updates.terminal.mobile_keybar_buttons);
    }
  }
  if (updates.ui) {
    next.ui = {};
    if (positiveInteger(updates.ui.sidebar_width, 0)) {
      next.ui.sidebar_width = Number(updates.ui.sidebar_width);
    }
    if (positiveInteger(updates.ui.grid_size, 0)) {
      next.ui.grid_size = Number(updates.ui.grid_size);
    }
    if (positiveInteger(updates.ui.vertical_slots, 0)) {
      next.ui.vertical_slots = Number(updates.ui.vertical_slots);
    }
    if (positiveInteger(updates.ui.default_pane_width, 0)) {
      next.ui.default_pane_width = Number(updates.ui.default_pane_width);
    }
    if (positiveInteger(updates.ui.default_pane_height, 0)) {
      next.ui.default_pane_height = Number(updates.ui.default_pane_height);
    }
    if (typeof updates.ui.terminal_font_family === 'string' && updates.ui.terminal_font_family.trim()) {
      next.ui.terminal_font_family = updates.ui.terminal_font_family.trim();
    }
    if (positiveInteger(updates.ui.terminal_font_size, 0)) {
      next.ui.terminal_font_size = Number(updates.ui.terminal_font_size);
    }
    if (positiveInteger(updates.ui.mobile_terminal_font_size, 0)) {
      next.ui.mobile_terminal_font_size = Number(updates.ui.mobile_terminal_font_size);
    }
    if (positiveInteger(updates.ui.file_pane_font_size, 0)) {
      next.ui.file_pane_font_size = Number(updates.ui.file_pane_font_size);
    }
    if (positiveInteger(updates.ui.system_font_size, 0)) {
      next.ui.system_font_size = Number(updates.ui.system_font_size);
    }
    for (const key of ['notepad_word_wrap', 'notepad_indent_guides', 'notepad_autosave']) {
      if (typeof updates.ui[key] === 'boolean') {
        next.ui[key] = updates.ui[key];
      }
    }
  }
  if (updates.file_manager) {
    next.file_manager = {};
    if (updates.file_manager.root_mode === 'drives') {
      next.file_manager.root_mode = updates.file_manager.root_mode;
    }
    if (nonNegativeInteger(updates.file_manager.max_upload_bytes, -1) >= 0) {
      next.file_manager.max_upload_bytes = Number(updates.file_manager.max_upload_bytes);
    }
    if (typeof updates.file_manager.show_hidden === 'boolean') {
      next.file_manager.show_hidden = updates.file_manager.show_hidden;
    }
    if (Array.isArray(updates.file_manager.bookmarks)) {
      next.file_manager.bookmarks = sanitizeBookmarks(updates.file_manager.bookmarks);
    }
  }
  if (updates.browser) {
    next.browser = {};
    if (Array.isArray(updates.browser.bookmarks)) {
      next.browser.bookmarks = sanitizeBrowserBookmarks(updates.browser.bookmarks);
    }
    if (Array.isArray(updates.browser.history)) {
      next.browser.history = updates.browser.history.slice(0, 50).map(normalizeWebsite).filter(Boolean);
    }
  }
  if (updates.usage) {
    next.usage = {};
    for (const key of ['minimax_api_key', 'codex_home', 'claude_home']) {
      if (Object.prototype.hasOwnProperty.call(updates.usage, key)) {
        next.usage[key] = String(updates.usage[key] || '').trim();
      }
    }
    if (updates.usage.minimax_region === 'global' || updates.usage.minimax_region === 'china') {
      next.usage.minimax_region = updates.usage.minimax_region;
    }
    const refreshMinutes = Number(updates.usage.refresh_minutes);
    if (Number.isInteger(refreshMinutes) && refreshMinutes >= 0 && refreshMinutes <= 999) {
      next.usage.refresh_minutes = refreshMinutes;
    }
    for (const key of ['warn_percent', 'alert_percent']) {
      const percent = Number(updates.usage[key]);
      if (Number.isInteger(percent) && percent >= 0 && percent <= 100) {
        next.usage[key] = percent;
      }
    }
    if (typeof updates.usage.notify_quota === 'boolean') {
      next.usage.notify_quota = updates.usage.notify_quota;
    }
    for (const key of usageVisibilityKeys) {
      if (typeof updates.usage[key] === 'boolean') {
        next.usage[key] = updates.usage[key];
      }
    }
  }
  if (updates.ai) {
    next.ai = {};
    if (updates.ai.default_provider === 'claude' || updates.ai.default_provider === 'codex') {
      next.ai.default_provider = updates.ai.default_provider;
    }
    for (const key of ['show_thinking', 'show_tools', 'debug_log']) {
      if (typeof updates.ai[key] === 'boolean') {
        next.ai[key] = updates.ai[key];
      }
    }
    for (const key of ['claude_model', 'claude_effort', 'codex_model', 'codex_effort']) {
      if (Object.prototype.hasOwnProperty.call(updates.ai, key)) {
        next.ai[key] = String(updates.ai[key] || '').trim();
      }
    }
    for (const key of ['claude_args', 'codex_args']) {
      if (Object.prototype.hasOwnProperty.call(updates.ai, key)) {
        const value = String(updates.ai[key] || '').trim().slice(0, 1000);
        if (parseCliArgs(value) === null) {
          throw new Error(`Invalid ${key.replace(/_/g, ' ')}.`);
        }
        next.ai[key] = value;
      }
    }
  }
  if (updates.custom_theme) {
    next.custom_theme = {};
    const lightThemeIds = ['wps-light', 'slate-light', 'ember-light', 'forest-light', 'custom-light'];
    const darkThemeIds = ['wps-dark', 'slate-dark', 'ember-dark', 'forest-dark', 'custom-dark'];
    for (const [key, themeIds] of [['selected_light', lightThemeIds], ['selected_dark', darkThemeIds]]) {
      if (themeIds.includes(updates.custom_theme[key])) {
        next.custom_theme[key] = updates.custom_theme[key];
      } else if (Object.prototype.hasOwnProperty.call(updates.custom_theme, key)) {
        throw new Error(`Unknown ${key === 'selected_light' ? 'light' : 'dark'} theme selection.`);
      }
    }
    if (updates.custom_theme.mode === 'dark' || updates.custom_theme.mode === 'light') {
      next.custom_theme.mode = updates.custom_theme.mode;
    } else if (Object.prototype.hasOwnProperty.call(updates.custom_theme, 'mode')) {
      throw new Error('Custom theme mode must be dark or light.');
    }
    for (const key of ['ink', 'panel', 'rail', 'surface', 'line', 'text', 'muted', 'accent', 'warn', 'danger', 'terminal_bg', 'terminal_fg', 'light_ink', 'light_panel', 'light_rail', 'light_surface', 'light_line', 'light_text', 'light_muted', 'light_accent', 'light_warn', 'light_danger', 'light_terminal_bg', 'light_terminal_fg']) {
      if (Object.prototype.hasOwnProperty.call(updates.custom_theme, key)) {
        if (!validHexColor(updates.custom_theme[key])) {
          throw new Error(`Custom theme ${key} must be a six-digit hex color.`);
        }
        next.custom_theme[key] = updates.custom_theme[key].toLowerCase();
      }
    }
  }
  return next;
}

function sanitizeBookmarks(bookmarks) {
  return bookmarks.map((bookmark) => {
    const bookmarkPath = files.normalizeLocalPath(bookmark.path);
    if (!bookmarkPath) {
      return null;
    }
    return {
      name: String(bookmark.name || bookmarkPath).trim(),
      path: bookmarkPath
    };
  }).filter(Boolean);
}

function normalizeWebsite(value) {
  const input = String(value || '').trim();
  if (!input) {
    return '';
  }
  try {
    const localAddress = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(input);
    const url = new URL(/^https?:\/\//i.test(input) ? input : localAddress ? `http://${input}` : `https://${input}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch (error) {
    return null;
  }
}

function sanitizeBrowserBookmarks(bookmarks) {
  return bookmarks.slice(0, 100).flatMap((bookmark) => {
    const url = normalizeWebsite(bookmark.url);
    if (!url) {
      return [];
    }
    return [{ name: String(bookmark.name || url).trim().slice(0, 120), url }];
  });
}

function handleRouteError(res, error) {
  res.status(error.statusCode || 500).json({ error: error.message || 'Request failed.' });
}

function spawnReplacementProcess(root) {
  const args = process.pkg ? [] : process.argv.slice(1);
  if (process.platform === 'win32') {
    const scriptPath = path.join(root, 'data', 'restart-wps7.ps1');
    fs.writeFileSync(scriptPath, `
param(
  [Parameter(Mandatory=$true)][int]$ParentPid,
  [Parameter(Mandatory=$true)][string]$Executable,
  [Parameter(Mandatory=$true)][string]$WorkingDirectory,
  [string]$ArgumentsJson = '[]'
)

Wait-Process -Id $ParentPid -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 150
$Arguments = @($ArgumentsJson | ConvertFrom-Json)
if ($Arguments.Count -gt 0) {
  Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden
} else {
  Start-Process -FilePath $Executable -WorkingDirectory $WorkingDirectory -WindowStyle Hidden
}
`.trim(), 'utf8');
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      scriptPath,
      '-ParentPid',
      String(process.pid),
      '-Executable',
      process.execPath,
      '-WorkingDirectory',
      root,
      '-ArgumentsJson',
      JSON.stringify(args)
    ], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    appendRuntimeLog(root, `spawned relaunch helper pid=${child.pid || 'unknown'} exe=${process.execPath} args=${JSON.stringify(args)}`);
    child.on('error', (error) => {
      appendRuntimeLog(root, `relaunch helper failed: ${error.message}`);
    });
    child.unref();
    return;
  }
  const child = spawn(process.execPath, args, {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  appendRuntimeLog(root, `spawned replacement pid=${child.pid || 'unknown'} exe=${process.execPath} args=${JSON.stringify(args)}`);
  child.on('error', (error) => {
    appendRuntimeLog(root, `replacement spawn failed: ${error.message}`);
  });
  child.unref();
}

function main() {
  const root = appRoot();
  ensurePackagedIcon(root);
  const config = loadConfig(root).config;
  const startedAt = Date.now();
  const controlToken = loadOrCreateControlToken(root);
  const pluginPaneAccessToken = crypto.randomBytes(32).toString('hex');
  let shell = resolveShell(config);
  let configReloadError = '';
  let restartRequired = false;
  const pluginPaneMigrations = Object.fromEntries(listPluginPanes(root).flatMap((pane) => pane.legacy
    ? [[pane.legacy.paneType, { pluginPaneId: pane.id, dataField: pane.legacy.dataField }]]
    : []));
  const store = new StateStore(root, {
    gridSize: config.ui.grid_size,
    verticalSlots: config.ui.vertical_slots,
    defaultPaneWidth: config.ui.default_pane_width,
    defaultPaneHeight: config.ui.default_pane_height,
    pluginPaneMigrations
  });
  store.load();

  // Without these, one unhandled error drops every pane's WebSocket and leaves
  // nothing in the log explaining why. Persist what we have, record the stack,
  // then exit so the service manager can restart a clean process.
  function handleFatalError(kind) {
    return (error) => {
      appendRuntimeLog(root, `${kind} pid=${process.pid} ${error instanceof Error ? error.stack : String(error)}`);
      try {
        store.save();
      } catch (saveError) {
        appendRuntimeLog(root, `${kind} could not save state: ${saveError.message}`);
      }
      process.exit(1);
    };
  }

  process.on('uncaughtException', handleFatalError('uncaughtException'));
  process.on('unhandledRejection', handleFatalError('unhandledRejection'));

  const app = express();
  const server = config.server.protocol === 'https'
    ? https.createServer(ensureTlsCredentials(root), app)
    : http.createServer(app);
  const terminalManager = new TerminalManager({ config, root, store, shell });
  const loadedAiPlugins = loadAiPluginPanes(root);
  const aiManagers = new Map();
  for (const plugin of loadedAiPlugins) {
    try {
      aiManagers.set(plugin.pane.provider, new plugin.AiManager({ config, root, store }));
    } catch (error) {
      appendRuntimeLog(root, `AI plugin ${plugin.pane.id} failed to start: ${error.message}`);
    }
  }
  const aiManagerForTab = (tabId) => {
    const provider = store.findAiTabById(tabId)?.tab.provider;
    return aiManagers.get(provider);
  };
  const browserManager = new BrowserManager({
    root,
    store,
    normalizeWebsite,
    serverPort: config.server.port,
    onNavigate: (url) => {
      const current = Array.isArray(config.browser.history) ? config.browser.history : [];
      const history = [url, ...current.filter((item) => item !== url)].slice(0, 50);
      const loaded = updateConfigFile(root, { browser: { history } });
      applyLoadedConfig(loaded.config);
      return history;
    }
  });
  let trayController = null;
  let autosaveTimer = startAutosave(store, config);
  let usageCache = null;
  const lastGoodUsage = new Map();
  let stopping = false;

  function applyLoadedConfig(nextConfig) {
    const passwordChanged = nextConfig.auth.password_hash !== config.auth.password_hash;
    restartRequired = nextConfig.server.host !== config.server.host
      || nextConfig.server.port !== config.server.port
      || nextConfig.server.protocol !== config.server.protocol;
    if (restartRequired) {
      nextConfig.server = {
        ...nextConfig.server,
        host: config.server.host,
        port: config.server.port,
        protocol: config.server.protocol
      };
    }
    replaceObject(config, nextConfig);
    shell = resolveShell(config);
    // A new slot count rescales every pane, so the client is told to take the
    // fresh layout rather than repaint the one it already has.
    const layoutChanged = store.applyGrid(config.ui.grid_size, config.ui.vertical_slots, config.ui.default_pane_width, config.ui.default_pane_height);
    terminalManager.updateConfig(config, shell);
    aiManagers.forEach((manager) => manager.updateConfig(config));
    clearInterval(autosaveTimer);
    autosaveTimer = startAutosave(store, config);
    configReloadError = '';
    usageCache = null;
    // New settings can point at different accounts, so nothing read under the
    // previous ones may stand in for a failed lookup.
    lastGoodUsage.clear();
    if (passwordChanged) {
      queueMicrotask(revokeWebSocketSessions);
    }
    return { ...publicConfig(config, shell, restartRequired, configReloadError), layoutChanged };
  }

  function revokeWebSocketSessions() {
    for (const client of wss.clients) {
      client.close(1008, 'Login required');
    }
  }

  function stopRuntime({ restart = false } = {}) {
    if (stopping) {
      return;
    }
    stopping = true;
    appendRuntimeLog(root, `stopping pid=${process.pid} restart=${restart}`);
    // The AI CLIs are grandchildren of this process, so they are stopped before
    // the server goes: an orphan keeps an API session open and holds files the
    // packaged build has to replace on the next upgrade.
    aiManagers.forEach((manager) => manager.shutdown());
    store.save();
    terminalManager.shutdown();
    browserManager.shutdown();
    if (trayController) {
      trayController.kill(false);
      trayController = null;
    }
    clearInterval(autosaveTimer);
    wss.close(() => {});
    server.close(() => {
      if (restart) {
        spawnReplacementProcess(root);
      }
      process.exit(0);
    });
    setTimeout(() => {
      if (restart) {
        spawnReplacementProcess(root);
      }
      process.exit(0);
    }, 1500).unref();
  }

  const loginLimiter = createRateLimiter({ limit: LOGIN_ATTEMPT_LIMIT, windowMs: LOGIN_ATTEMPT_WINDOW_MS });

  app.disable('x-powered-by');
  // A DNS rebinding page resolves its own name to this address, so its requests
  // carry that name in Host. Rejecting unknown names keeps such a page from
  // reaching any route, including the ones that spawn a shell.
  app.use((req, res, next) => {
    if (!isTrustedHost(req.headers.host, config.server.allowed_hosts)) {
      res.status(403).type('text/plain').send('Untrusted Host header.');
      return;
    }
    next();
  });
  app.use(express.json({ limit: '12mb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; frame-src http: https:;");
    next();
  });
  app.use(express.static(publicDir(), {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store');
    }
  }));

  app.get('/api/plugin-panes', requireAuth(config), (req, res) => {
    const panes = listPluginPanes(root).filter((pane) => pane.type !== 'ai' || aiManagers.has(pane.provider)).map((pane) => pane.type === 'ai'
      ? {
          id: pane.id,
          name: pane.name,
          type: pane.type,
          provider: pane.provider,
          implementation: pane.implementation,
          icon: pane.icon,
          clientUrl: `/plugin-panes/${encodeURIComponent(pane.id)}/client.js`,
          styleUrl: `/plugin-panes/${encodeURIComponent(pane.id)}/styles.css`
        }
      : pane.type === 'host'
        ? {
            id: pane.id,
            name: pane.name,
            type: pane.type,
            icon: pane.icon,
            translations: pane.translations,
            clientUrl: `/plugin-panes/${encodeURIComponent(pane.id)}/client.js`,
            styleUrl: `/plugin-panes/${encodeURIComponent(pane.id)}/styles.css`,
            assetBaseUrl: `/plugin-panes/${encodeURIComponent(pane.id)}/assets/`
          }
        : { id: pane.id, name: pane.name, type: pane.type, url: pluginPaneUrl(pluginPaneAccessToken, pane), icon: pane.icon });
    res.json({ panes });
  });

  app.get('/plugin-panes/:paneId/:assetName', (req, res, next) => {
    const asset = resolveTrustedPluginPaneAsset(root, req.params.paneId, req.params.assetName);
    if (!asset && !['client.js', 'styles.css', 'server.js'].includes(req.params.assetName)) {
      next();
      return;
    }
    if (!asset) {
      res.status(404).type('text/plain').send('Plugin pane asset not found.');
      return;
    }
    res.sendFile(asset.path, (error) => {
      if (error && !res.headersSent) {
        res.status(error.statusCode || 404).type('text/plain').send('Plugin pane asset not found.');
      }
    });
  });

  app.get('/plugin-panes/:paneId/*assetPath', (req, res, next) => {
    const assetPath = Array.isArray(req.params.assetPath)
      ? req.params.assetPath.join('/')
      : req.params.assetPath;
    const asset = resolveTrustedPluginPaneAsset(root, req.params.paneId, assetPath);
    if (!asset) {
      next();
      return;
    }
    res.sendFile(asset.path, (error) => {
      if (error && !res.headersSent) {
        res.status(error.statusCode || 404).type('text/plain').send('Plugin pane asset not found.');
      }
    });
  });

  app.get('/plugin-panes/:accessToken/:paneId/*assetPath', (req, res) => {
    const assetPath = Array.isArray(req.params.assetPath)
      ? req.params.assetPath.join('/')
      : req.params.assetPath;
    const asset = req.params.accessToken === pluginPaneAccessToken
      ? resolvePluginPaneAsset(root, req.params.paneId, assetPath)
      : null;
    if (!asset) {
      res.status(404).type('text/plain').send('Plugin pane asset not found.');
      return;
    }
    res.sendFile(asset.path, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'inline',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts allow-forms",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'no-referrer'
      }
    }, (error) => {
      if (error && !res.headersSent) {
        handleRouteError(res, error);
      }
    });
  });

  app.get('/api/config', (req, res) => {
    res.json(publicConfig(config, shell, restartRequired, configReloadError));
  });

  app.post('/api/config/reload', requireAuth(config), (req, res) => {
    try {
      res.json(applyLoadedConfig(loadConfig(root).config));
    } catch (error) {
      configReloadError = error.message;
      res.status(400).json({ error: configReloadError });
    }
  });

  app.get('/api/settings', requireAuth(config), (req, res) => {
    try {
      res.json(settingsConfig(loadConfig(root).config, config));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/usage', requireAuth(config), async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === '1';
      if (!forceRefresh && usageCache && Date.now() - usageCache.createdAt < 60000) {
        res.json(usageCache.value);
        return;
      }
      const minimaxApiKey = process.env.MINIMAX_CODING_API_KEY || process.env.MINIMAX_API_KEY || config.usage.minimax_api_key;
      const usageLog = (message) => appendRuntimeLog(root, `usage ${message}`);
      const overview = await usage.fetchUsageOverview({
        codex: config.usage.show_codex !== false ? () => usage.fetchCodexUsage({ codexHome: config.usage.codex_home || undefined, log: usageLog }) : null,
        claude: config.usage.show_claude !== false ? () => usage.fetchClaudeUsage({ claudeHome: config.usage.claude_home || undefined, log: usageLog }) : null,
        minimax: config.usage.show_minimax !== false
          ? () => usage.fetchMiniMaxUsage({ apiKey: minimaxApiKey, region: config.usage.minimax_region })
          : null,
        content: {
          five_hour: config.usage.show_five_hour !== false,
          weekly: config.usage.show_weekly !== false,
          model_weekly: config.usage.show_model_weekly !== false,
          credits: config.usage.show_credits !== false
        }
      });
      for (const provider of overview.providers || []) {
        if (provider.error) {
          usageLog(`${provider.provider} reported: ${provider.error}`);
        }
      }
      const value = { ...overview, providers: usage.keepLastGoodUsage(overview.providers || [], lastGoodUsage) };
      usageCache = { createdAt: Date.now(), value };
      res.json(value);
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post('/api/settings', requireAuth(config), (req, res) => {
    try {
      const updates = sanitizeSettingsUpdates(req.body || {});
      const runtimeHost = config.server.host;
      const loaded = updateConfigFile(root, updates);
      const shouldRestart = req.body?.restart_after_save === true
        && loaded.config.server.host === '0.0.0.0'
        && loaded.config.server.host !== runtimeHost;
      const response = applyLoadedConfig(loaded.config);
      res.json({ ...response, restarting: shouldRestart });
      if (shouldRestart) {
        setTimeout(() => stopRuntime({ restart: true }), 250).unref();
      }
    } catch (error) {
      configReloadError = error.message;
      res.status(400).json({ error: configReloadError });
    }
  });

  function rejectWhenRateLimited(req, res) {
    const limit = loginLimiter.check(clientKey(req));
    if (limit.allowed) {
      return false;
    }
    res.set('Retry-After', String(Math.ceil(limit.retryAfterMs / 1000)));
    res.status(429).json({ error: 'Too many attempts. Try again later.' });
    return true;
  }

  // Hashing is deliberately expensive, so an anonymous caller may only reach it
  // while no password exists yet, which is the first-run setup case. Otherwise
  // it is an unauthenticated way to burn 120k PBKDF2 rounds per request.
  app.post('/api/auth/hash', (req, res, next) => {
    if (config.auth.password_hash) {
      requireAuth(config)(req, res, next);
      return;
    }
    next();
  }, (req, res) => {
    if (rejectWhenRateLimited(req, res)) {
      return;
    }
    loginLimiter.record(clientKey(req));
    const passwordError = validatePassword(req.body.password || '');
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }
    res.json({ password_hash: hashPassword(req.body.password || '') });
  });

  app.post('/api/login', (req, res) => {
    if (rejectWhenRateLimited(req, res)) {
      return;
    }
    if (!verifyPassword(req.body.password || '', config.auth.password_hash)) {
      loginLimiter.record(clientKey(req));
      res.status(401).json({ error: 'Invalid password.' });
      return;
    }
    loginLimiter.reset(clientKey(req));
    const ttlMs = req.body.remember ? REMEMBER_TOKEN_TTL_MS : TOKEN_TTL_MS;
    const token = createSessionToken(config.auth.password_hash, Date.now(), ttlMs);
    res.json({ token, expires_in: Math.floor(ttlMs / 1000) });
  });

  app.get('/api/state', requireAuth(config), (req, res) => {
    res.json(store.getPublicState());
  });

  app.post('/api/sessions', requireAuth(config), (req, res) => {
    res.status(201).json(store.createSession(req.body.name));
  });

  app.post('/api/sessions/:sessionId/activate', requireAuth(config), (req, res) => {
    if (!store.setActiveSession(req.params.sessionId)) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/sessions/:sessionId/move', requireAuth(config), (req, res) => {
    if (!store.moveSession(req.params.sessionId, req.body?.index)) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.delete('/api/sessions/:sessionId', requireAuth(config), (req, res) => {
    const session = store.state.sessions.find((candidate) => candidate.id === req.params.sessionId);
    const ok = store.closeSession(req.params.sessionId);
    if (ok) {
      terminalManager.killSession(session);
      browserManager.killSession(session);
      aiManagers.forEach((manager) => manager.killSession(session));
    }
    res.json({ ok });
  });

  app.patch('/api/sessions/:sessionId', requireAuth(config), (req, res) => {
    if (!store.renameSession(req.params.sessionId, req.body.name)) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    const session = store.state.sessions.find((candidate) => candidate.id === req.params.sessionId);
    res.json({ id: session.id, name: session.name });
  });

  app.post('/api/panes/:paneId/activate', requireAuth(config), (req, res) => {
    if (!store.setActivePane(req.params.paneId)) {
      res.status(404).json({ error: 'Pane not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.patch('/api/panes/:paneId', requireAuth(config), (req, res) => {
    const hasTitle = typeof req.body.title === 'string';
    const hasFontSize = req.body.fontSize !== undefined;
    if (!hasTitle && !hasFontSize) {
      res.status(400).json({ error: 'No pane changes supplied.' });
      return;
    }
    if (hasTitle && !store.renamePane(req.params.paneId, req.body.title)) {
      res.status(404).json({ error: 'Pane not found.' });
      return;
    }
    if (hasFontSize && !store.setPaneFontSize(req.params.paneId, req.body.fontSize)) {
      res.status(400).json({ error: 'Pane font size must be between 8 and 32.' });
      return;
    }
    const { pane } = store.findPane(req.params.paneId);
    res.json({ id: pane.id, title: pane.title, cwd: pane.cwd, fontSize: pane.fontSize, split: pane.split });
  });

  app.get('/api/panes/:paneId/status', requireAuth(config), (req, res) => {
    const status = terminalManager.getPaneStatus(req.params.paneId);
    if (!status) {
      res.status(404).json({ error: 'Pane not found.' });
      return;
    }
    res.json(status);
  });

  app.post('/api/panes/:paneId/split', requireAuth(config), (req, res) => {
    const found = store.findPane(req.params.paneId);
    if (!found) {
      res.status(404).json({ error: 'Pane not found.' });
      return;
    }
    const pane = store.splitPane(req.params.paneId, req.body.direction, req.body.shell);
    if (!pane) {
      res.status(400).json({ error: 'Unable to create pane.' });
      return;
    }
    res.status(201).json({
      ...pane,
      paneLayouts: found.tab.panes.map((candidate) => ({ id: candidate.id, layout: candidate.layout })),
      columns: found.tab.columns
    });
  });

  app.post('/api/panes/:paneId/files', requireAuth(config), (req, res) => {
    const found = store.findPane(req.params.paneId);
    if (!found) {
      res.status(404).json({ error: 'Pane not found.' });
      return;
    }
    const pane = store.createFilesPane(req.params.paneId, req.body.path);
    if (!pane) {
      res.status(400).json({ error: 'Unable to create pane.' });
      return;
    }
    res.status(201).json({
      ...pane,
      paneLayouts: found.tab.panes.map((candidate) => ({ id: candidate.id, layout: candidate.layout })),
      columns: found.tab.columns
    });
  });

  app.post('/api/panes/:paneId/image', requireAuth(config), (req, res) => {
    const found = store.findPane(req.params.paneId);
    if (!found) {
      res.status(404).json({ error: 'Pane not found.' });
      return;
    }
    const targetPath = req.body.path ? files.normalizeLocalPath(req.body.path) : '';
    if (req.body.path && !targetPath) {
      res.status(400).json({ error: 'Invalid local path.' });
      return;
    }
    const pane = store.createImagePane(req.params.paneId, targetPath);
    if (!pane) {
      res.status(400).json({ error: 'Unable to create pane.' });
      return;
    }
    res.status(201).json({
      ...pane,
      paneLayouts: found.tab.panes.map((candidate) => ({ id: candidate.id, layout: candidate.layout })),
      columns: found.tab.columns
    });
  });

  app.patch('/api/panes/:paneId/image/path', requireAuth(config), (req, res) => {
    const nextPath = req.body.path ? files.normalizeLocalPath(req.body.path) : '';
    if (req.body.path && !nextPath) {
      res.status(400).json({ error: 'Invalid local path.' });
      return;
    }
    if (!store.setImagePanePath(req.params.paneId, nextPath)) {
      res.status(404).json({ error: 'Image pane not found.' });
      return;
    }
    const { pane } = store.findPane(req.params.paneId);
    res.json({ id: pane.id, path: pane.path });
  });

  app.post('/api/panes/:paneId/usage', requireAuth(config), (req, res) => {
    const found = store.findPane(req.params.paneId);
    if (!found) {
      res.status(404).json({ error: 'Pane not found.' });
      return;
    }
    const pane = store.createUsagePane(req.params.paneId);
    if (!pane) {
      res.status(400).json({ error: 'Unable to create pane.' });
      return;
    }
    res.status(201).json({
      ...pane,
      paneLayouts: found.tab.panes.map((candidate) => ({ id: candidate.id, layout: candidate.layout })),
      columns: found.tab.columns
    });
  });

  app.post('/api/panes/:paneId/plugin', requireAuth(config), (req, res) => {
    const found = store.findPane(req.params.paneId);
    if (!found) {
      res.status(404).json({ error: 'Pane not found.' });
      return;
    }
    const definition = getPluginPane(root, req.body.pluginPaneId);
    if (!definition) {
      res.status(404).json({ error: 'Plugin pane not found.' });
      return;
    }
    if (definition.type === 'ai' && !aiManagers.has(definition.provider)) {
      res.status(404).json({ error: 'AI plugin is not available.' });
      return;
    }
    const pane = definition.type === 'ai'
      ? store.createAiPane(req.params.paneId, definition.provider, aiWorkingFolder(req.body.cwd))
      : store.createPluginPane(req.params.paneId, definition.id, definition.name);
    if (!pane) {
      res.status(400).json({ error: 'Unable to create pane.' });
      return;
    }
    res.status(201).json({
      ...pane,
      paneLayouts: found.tab.panes.map((candidate) => ({ id: candidate.id, layout: candidate.layout })),
      columns: found.tab.columns
    });
  });

  app.patch('/api/panes/:paneId/plugin-data', requireAuth(config), (req, res) => {
    if (!store.setPluginPaneData(req.params.paneId, req.body.pluginData)) {
      res.status(404).json({ error: 'Plugin pane not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/panes/:paneId/ai', requireAuth(config), (req, res) => {
    const found = store.findPane(req.params.paneId);
    if (!found) {
      res.status(404).json({ error: 'Pane not found.' });
      return;
    }
    const provider = req.body.provider || config.ai.default_provider;
    if (!aiManagers.has(provider)) {
      res.status(404).json({ error: 'AI plugin is not available.' });
      return;
    }
    const pane = store.createAiPane(
      req.params.paneId,
      provider,
      aiWorkingFolder(req.body.cwd)
    );
    if (!pane) {
      res.status(400).json({ error: 'Unable to create pane.' });
      return;
    }
    res.status(201).json({
      ...pane,
      paneLayouts: found.tab.panes.map((candidate) => ({ id: candidate.id, layout: candidate.layout })),
      columns: found.tab.columns
    });
  });

  // The tab routes mirror the terminal ones, which is what lets the pane reuse
  // the existing tab strip wiring unchanged.
  app.post('/api/panes/:paneId/ai/tabs', requireAuth(config), (req, res) => {
    const found = store.findPane(req.params.paneId);
    const active = found?.pane.aiTabs?.find((tab) => tab.id === found.pane.activeAiTabId);
    const provider = req.body.provider || active?.provider;
    if (!aiManagers.has(provider)) {
      res.status(404).json({ error: 'AI plugin is not available.' });
      return;
    }
    const tab = store.createAiTab(req.params.paneId, provider, aiWorkingFolder(req.body.cwd));
    if (!tab) {
      res.status(404).json({ error: 'AI pane not found.' });
      return;
    }
    res.status(201).json({ tab: aiTabSummary(tab) });
  });

  app.post('/api/panes/:paneId/ai/tabs/:tabId/activate', requireAuth(config), (req, res) => {
    if (!store.activateAiTab(req.params.paneId, req.params.tabId)) {
      res.status(404).json({ error: 'AI tab not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.patch('/api/panes/:paneId/ai/tabs/:tabId', requireAuth(config), (req, res) => {
    const { title, showThinking, showTools, cwd } = req.body || {};
    let ok = false;
    let folder = '';
    if (title !== undefined) {
      ok = store.renameAiTab(req.params.paneId, req.params.tabId, title);
    }
    if (showThinking !== undefined || showTools !== undefined) {
      ok = store.setAiVisibility(req.params.paneId, req.params.tabId, { showThinking, showTools }) || ok;
    }
    if (cwd !== undefined) {
      folder = aiWorkingFolder(cwd);
      if (!folder) {
        res.status(400).json({ error: 'That folder does not exist on this machine.' });
        return;
      }
      ok = store.setAiTabCwd(req.params.paneId, req.params.tabId, folder) || ok;
    }
    if (!ok) {
      res.status(404).json({ error: 'AI tab not found.' });
      return;
    }
    if (folder) {
      // The working folder is fixed when the process is spawned, so the CLI has
      // to be restarted for the change to mean anything.
      aiManagerForTab(req.params.tabId)?.restartTab(req.params.tabId, `The working folder is now ${folder}. The agent was restarted there.`);
    }
    res.json({ ok: true, cwd: folder || undefined });
  });

  app.delete('/api/panes/:paneId/ai/tabs/:tabId', requireAuth(config), (req, res) => {
    const manager = aiManagerForTab(req.params.tabId);
    const result = store.closeAiTab(req.params.paneId, req.params.tabId);
    if (!result) {
      res.status(404).json({ error: 'AI tab not found.' });
      return;
    }
    manager?.killTab(req.params.tabId);
    res.json({ ok: true, tab: result.replacement ? aiTabSummary(result.replacement) : null });
  });

  // The conversations this CLI has already recorded for the tab's folder. They
  // are read from the CLI's own session files, so the list is there whether or
  // not the tab is running.
  app.get('/api/panes/:paneId/ai/tabs/:tabId/sessions', requireAuth(config), (req, res) => {
    const found = store.findAiTab(req.params.paneId, req.params.tabId);
    if (!found) {
      res.status(404).json({ error: 'AI tab not found.' });
      return;
    }
    const cwd = normalizeCwd(found.tab.cwd || found.pane.cwd, root);
    res.json({ sessions: listAiSessions(found.tab.provider, cwd), cwd });
  });

  app.post('/api/panes/:paneId/ai/tabs/:tabId/session', requireAuth(config), (req, res) => {
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) {
      res.status(400).json({ error: 'A session id is required.' });
      return;
    }
    const label = String(req.body?.title || '').trim().slice(0, 120);
    if (!aiManagerForTab(req.params.tabId)?.resumeSession(req.params.paneId, req.params.tabId, sessionId, label)) {
      res.status(404).json({ error: 'AI tab not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.delete('/api/panes/:paneId/ai/tabs/:tabId/messages', requireAuth(config), (req, res) => {
    if (!aiManagerForTab(req.params.tabId)?.clearTab(req.params.paneId, req.params.tabId)) {
      res.status(404).json({ error: 'AI tab not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.patch('/api/panes/:paneId/files/path', requireAuth(config), (req, res) => {
    const nextPath = req.body.path ? files.normalizeLocalPath(req.body.path) : '';
    if (req.body.path && !nextPath) {
      res.status(400).json({ error: 'Invalid local path.' });
      return;
    }
    if (!store.setFilesPanePath(req.params.paneId, nextPath)) {
      res.status(404).json({ error: 'Files pane not found.' });
      return;
    }
    const { pane } = store.findPane(req.params.paneId);
    res.json({ id: pane.id, path: pane.path });
  });

  app.post('/api/panes/:paneId/files/tabs', requireAuth(config), (req, res) => {
    const targetPath = req.body.path ? files.normalizeLocalPath(req.body.path) : '';
    if (req.body.path && !targetPath) {
      res.status(400).json({ error: 'Invalid local path.' });
      return;
    }
    const tab = store.createFilesTab(req.params.paneId, targetPath);
    if (!tab) {
      res.status(404).json({ error: 'Files pane not found.' });
      return;
    }
    res.status(201).json({ tab });
  });

  app.post('/api/panes/:paneId/files/tabs/:tabId/activate', requireAuth(config), (req, res) => {
    if (!store.activateFilesTab(req.params.paneId, req.params.tabId)) {
      res.status(404).json({ error: 'Files tab not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.delete('/api/panes/:paneId/files/tabs/:tabId', requireAuth(config), (req, res) => {
    if (!store.closeFilesTab(req.params.paneId, req.params.tabId)) {
      res.status(404).json({ error: 'Files tab not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/panes/:paneId/terminal/tabs', requireAuth(config), (req, res) => {
    const tab = store.createTerminalTab(req.params.paneId);
    if (!tab) {
      res.status(404).json({ error: 'Terminal pane not found.' });
      return;
    }
    res.status(201).json({ tab: { id: tab.id, title: tab.title, cwd: tab.cwd, shell: tab.shell } });
  });

  app.post('/api/panes/:paneId/terminal/tabs/:tabId/activate', requireAuth(config), (req, res) => {
    if (!store.activateTerminalTab(req.params.paneId, req.params.tabId)) {
      res.status(404).json({ error: 'Terminal tab not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // Two different senders reach this route: the user renaming a tab, and the
  // shell announcing its own title. Only the first one pins the name.
  app.patch('/api/panes/:paneId/terminal/tabs/:tabId', requireAuth(config), (req, res) => {
    const found = store.findTerminalTab(req.params.tabId);
    if (!found || found.pane.id !== req.params.paneId) {
      res.status(404).json({ error: 'Terminal tab not found.' });
      return;
    }
    const applied = typeof req.body.processTitle === 'string'
      ? store.setTerminalTabProcessTitle(req.params.paneId, req.params.tabId, req.body.processTitle)
      : store.renameTerminalTab(req.params.paneId, req.params.tabId, req.body.title);
    res.json({ ok: true, applied, title: found.terminalTab.title, titlePinned: Boolean(found.terminalTab.titlePinned) });
  });

  app.get('/api/panes/:paneId/terminal/busy', requireAuth(config), async (req, res) => {
    const found = store.findPane(req.params.paneId);
    if (!found || found.pane.type !== 'terminal') {
      res.status(404).json({ error: 'Terminal pane not found.' });
      return;
    }
    let busy = [];
    try {
      busy = await terminalManager.busyTerminalTabs(req.params.paneId);
    } catch (error) {
      // A probe that fails must not stop the pane from closing.
      appendRuntimeLog(root, `terminal busy check failed for ${req.params.paneId}: ${error.message}`);
    }
    res.json({ busy });
  });

  app.delete('/api/panes/:paneId/terminal/tabs/:tabId', requireAuth(config), (req, res) => {
    const result = store.closeTerminalTab(req.params.paneId, req.params.tabId);
    if (!result) {
      res.status(404).json({ error: 'Terminal tab not found.' });
      return;
    }
    terminalManager.killTerminal(req.params.tabId);
    const { replacement } = result;
    res.json({
      ok: true,
      tab: replacement ? { id: replacement.id, title: replacement.title, cwd: replacement.cwd, shell: replacement.shell } : null
    });
  });

  app.post('/api/panes/:paneId/browser', requireAuth(config), (req, res) => {
    const found = store.findPane(req.params.paneId);
    const url = normalizeWebsite(req.body.url);
    if (!found) {
      res.status(404).json({ error: 'Pane not found.' });
      return;
    }
    if (req.body.url && !url) {
      res.status(400).json({ error: 'Website must use HTTP or HTTPS.' });
      return;
    }
    if (url && isOwnServerWebsite(url, config.server.port)) {
      res.status(400).json({ error: 'WPS7 cannot open its own server address in a Browser pane.' });
      return;
    }
    const pane = store.createBrowserPane(req.params.paneId, url || '', req.body.emulationMode);
    if (!pane) {
      res.status(400).json({ error: 'Unable to create pane.' });
      return;
    }
    res.status(201).json({
      ...pane,
      paneLayouts: found.tab.panes.map((candidate) => ({ id: candidate.id, layout: candidate.layout })),
      columns: found.tab.columns
    });
  });

  app.patch('/api/panes/:paneId/browser/url', requireAuth(config), (req, res) => {
    const url = normalizeWebsite(req.body.url);
    if (req.body.url && !url) {
      res.status(400).json({ error: 'Website must use HTTP or HTTPS.' });
      return;
    }
    if (url && isOwnServerWebsite(url, config.server.port)) {
      res.status(400).json({ error: 'WPS7 cannot open its own server address in a Browser pane.' });
      return;
    }
    if (!store.setBrowserPaneUrl(req.params.paneId, url || '')) {
      res.status(404).json({ error: 'Browser pane not found.' });
      return;
    }
    res.json({ id: req.params.paneId, url: url || '' });
  });

  app.post('/api/panes/:paneId/notepad', requireAuth(config), (req, res) => {
    const found = store.findPane(req.params.paneId);
    const targetPath = req.body.path ? files.normalizeLocalPath(req.body.path) : '';
    if (!found) {
      res.status(404).json({ error: 'Pane not found.' });
      return;
    }
    if (req.body.path && !targetPath) {
      res.status(400).json({ error: 'Invalid local path.' });
      return;
    }
    const pane = store.createNotepadPane(req.params.paneId, targetPath, notepadDefaults(config));
    if (!pane) {
      res.status(400).json({ error: 'Unable to create pane.' });
      return;
    }
    res.status(201).json({
      ...pane,
      paneLayouts: found.tab.panes.map((candidate) => ({ id: candidate.id, layout: candidate.layout })),
      columns: found.tab.columns
    });
  });

  app.post('/api/panes/:paneId/notepad/tabs', requireAuth(config), (req, res) => {
    const targetPath = req.body.path ? files.normalizeLocalPath(req.body.path) : '';
    if (req.body.path && !targetPath) {
      res.status(400).json({ error: 'Invalid local path.' });
      return;
    }
    const tab = store.createNotepadTab(req.params.paneId, targetPath, notepadDefaults(config));
    if (!tab) {
      res.status(404).json({ error: 'Notepad pane not found.' });
      return;
    }
    res.status(201).json({ tab });
  });

  app.post('/api/panes/:paneId/notepad/tabs/:tabId/activate', requireAuth(config), (req, res) => {
    if (!store.activateNotepadTab(req.params.paneId, req.params.tabId)) {
      res.status(404).json({ error: 'Notepad tab not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.patch('/api/panes/:paneId/notepad/tabs/:tabId', requireAuth(config), (req, res) => {
    const updates = {};
    if (req.body.path !== undefined) {
      const targetPath = req.body.path ? files.normalizeLocalPath(req.body.path) : '';
      if (req.body.path && !targetPath) {
        res.status(400).json({ error: 'Invalid local path.' });
        return;
      }
      updates.path = targetPath;
    }
    if (req.body.title !== undefined) {
      updates.title = req.body.title;
    }
    if (req.body.content !== undefined) {
      if (typeof req.body.content !== 'string' || Buffer.byteLength(req.body.content, 'utf8') > 10 * 1024 * 1024) {
        res.status(413).json({ error: 'Notepad draft exceeds the 10 MB limit.' });
        return;
      }
      updates.content = req.body.content;
    }
    if (req.body.encoding !== undefined) {
      if (!['utf8', 'utf8-bom', 'utf16le', 'utf16be', 'latin1'].includes(req.body.encoding)) {
        res.status(400).json({ error: 'Unsupported text encoding.' });
        return;
      }
      updates.encoding = req.body.encoding;
    }
    if (req.body.eol !== undefined) {
      if (!['crlf', 'lf', 'cr'].includes(req.body.eol)) {
        res.status(400).json({ error: 'Unsupported line ending.' });
        return;
      }
      updates.eol = req.body.eol;
    }
    if (req.body.language !== undefined) {
      updates.language = String(req.body.language || '').slice(0, 40);
    }
    for (const key of ['readOnly', 'wrap', 'indentGuides', 'autosave']) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] !== 'boolean') {
          res.status(400).json({ error: `${key} must be a boolean.` });
          return;
        }
        updates[key] = req.body[key];
      }
    }
    if (req.body.fontFamily !== undefined) {
      updates.fontFamily = String(req.body.fontFamily || '').slice(0, 200);
    }
    if (!store.updateNotepadTab(req.params.paneId, req.params.tabId, updates)) {
      res.status(404).json({ error: 'Notepad tab not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.delete('/api/panes/:paneId/notepad/tabs/:tabId', requireAuth(config), (req, res) => {
    if (!store.closeNotepadTab(req.params.paneId, req.params.tabId)) {
      res.status(404).json({ error: 'Notepad tab not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.patch('/api/panes/:paneId/layout', requireAuth(config), (req, res) => {
    if (!store.findPane(req.params.paneId)) {
      res.status(404).json({ error: 'Pane not found.' });
      return;
    }
    if (!store.placePane(req.params.paneId, req.body.layout)) {
      res.status(409).json({ error: 'That space is taken by another pane.' });
      return;
    }
    const { tab, pane } = store.findPane(req.params.paneId);
    res.json({ id: pane.id, layout: pane.layout, columns: tab.columns });
  });

  app.patch('/api/tabs/:tabId/columns/:index', requireAuth(config), (req, res) => {
    const { width, slots } = req.body || {};
    const index = req.params.index;
    const updated = width !== undefined
      ? store.setColumnWidth(req.params.tabId, index, width)
      : store.setColumnSlots(req.params.tabId, index, slots);
    if (!updated) {
      res.status(404).json({ error: 'Column not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/panes/:paneId/move', requireAuth(config), (req, res) => {
    if (!store.movePane(req.params.paneId, req.body.beforePaneId)) {
      res.status(404).json({ error: 'Pane not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.delete('/api/panes/:paneId', requireAuth(config), (req, res) => {
    // Read before closing: an AI pane's CLI processes are keyed by its tabs,
    // which are gone once the pane is removed from the store.
    const pane = store.findPane(req.params.paneId)?.pane;
    const ok = store.closePane(req.params.paneId);
    if (ok) {
      terminalManager.killPane(req.params.paneId);
      browserManager.killPane(req.params.paneId);
      aiManagers.forEach((manager) => manager.killPane(pane));
    }
    res.json({ ok });
  });

  app.post('/api/save', requireAuth(config), (req, res) => {
    store.save();
    res.json({ ok: true, updatedAt: store.state.updatedAt });
  });

  app.post('/api/runtime/save', requireRuntimeControl(controlToken), (req, res) => {
    store.save();
    res.json({ ok: true, updatedAt: store.state.updatedAt });
  });

  app.get('/api/runtime/status', requireRuntimeControl(controlToken), (req, res) => {
    res.json({
      ok: true,
      pid: process.pid,
      host: config.server.host,
      port: config.server.port,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      configLoaded: !configReloadError,
      configReloadError,
      stateUpdatedAt: store.state.updatedAt,
      ...stateCounts(store)
    });
  });

  app.post('/api/runtime/restart', requireRuntimeControl(controlToken), (req, res) => {
    res.json({ ok: true });
    setTimeout(() => stopRuntime({ restart: true }), 100).unref();
  });

  app.post('/api/runtime/shutdown', requireRuntimeControl(controlToken), (req, res) => {
    res.json({ ok: true });
    setTimeout(() => stopRuntime(), 100).unref();
  });

  app.get('/api/files/drives', requireAuth(config), (req, res) => {
    try {
      res.json({ drives: files.listDrives() });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get('/api/files/bookmarks', requireAuth(config), (req, res) => {
    res.json({ bookmarks: Array.isArray(config.file_manager.bookmarks) ? config.file_manager.bookmarks : [] });
  });

  app.post('/api/files/bookmarks', requireAuth(config), (req, res) => {
    try {
      const bookmarkPath = files.normalizeLocalPath(req.body.path);
      if (!bookmarkPath) {
        res.status(400).json({ error: 'Invalid local path.' });
        return;
      }
      const bookmarks = Array.isArray(config.file_manager.bookmarks) ? config.file_manager.bookmarks : [];
      const nextBookmark = { name: String(req.body.name || bookmarkPath).trim(), path: bookmarkPath };
      const nextBookmarks = bookmarks.filter((bookmark) => bookmark.path.toLowerCase() !== bookmarkPath.toLowerCase());
      nextBookmarks.push(nextBookmark);
      const loaded = updateConfigFile(root, { file_manager: { bookmarks: nextBookmarks } });
      applyLoadedConfig(loaded.config);
      res.status(201).json({ bookmarks: config.file_manager.bookmarks });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.delete('/api/files/bookmarks', requireAuth(config), (req, res) => {
    try {
      const bookmarkPath = files.normalizeLocalPath(req.body.path);
      if (!bookmarkPath) {
        res.status(400).json({ error: 'Invalid local path.' });
        return;
      }
      const bookmarks = Array.isArray(config.file_manager.bookmarks) ? config.file_manager.bookmarks : [];
      const nextBookmarks = bookmarks.filter((bookmark) => bookmark.path.toLowerCase() !== bookmarkPath.toLowerCase());
      const loaded = updateConfigFile(root, { file_manager: { bookmarks: nextBookmarks } });
      applyLoadedConfig(loaded.config);
      res.json({ bookmarks: config.file_manager.bookmarks });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get('/api/files', requireAuth(config), (req, res) => {
    try {
      res.json(files.listDirectory(req.query.path));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get('/api/files/text', requireAuth(config), (req, res) => {
    try {
      res.json(files.readTextFile(req.query.path));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get('/api/files/image', requireAuth(config), (req, res) => {
    let image;
    try {
      image = files.imageInfo(req.query.path);
    } catch (error) {
      handleRouteError(res, error);
      return;
    }
    // SVG is served as its own type so it renders, and locked down so a direct
    // visit cannot run scripts embedded in the file.
    res.sendFile(image.path, {
      headers: {
        'Content-Type': image.contentType,
        'Content-Disposition': 'inline',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache'
      }
    }, (error) => {
      if (error && !res.headersSent) {
        handleRouteError(res, error);
      }
    });
  });

  app.get('/api/files/image-siblings', requireAuth(config), (req, res) => {
    try {
      res.json(files.listImageSiblings(req.query.path));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.put('/api/files/text', requireAuth(config), (req, res) => {
    try {
      res.json(files.writeTextFile(req.body.path, req.body.content, req.body.encoding));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post('/api/browser/upload', requireAuth(config), (req, res) => {
    const tabId = String(req.query.tabId || '');
    const nodeId = Number(req.query.nodeId);
    const uploadRoot = path.join(root, 'data', 'browser-uploads', crypto.randomUUID());
    fs.mkdirSync(uploadRoot, { recursive: true });
    const paths = [];
    const writes = [];
    try {
      const uploadLimit = Number(config.file_manager.max_upload_bytes) || 0;
      const busboy = createUploadParser(req.headers, uploadLimit);
      let uploadError = null;
      busboy.on('file', (field, stream, info) => {
        const filename = path.basename(info.filename || 'upload').replace(/[<>:"/\\|?*]/g, '_');
        const target = path.join(uploadRoot, filename);
        paths.push(target);
        const output = fs.createWriteStream(target);
        writes.push(new Promise((resolve, reject) => {
          output.on('finish', resolve);
          output.on('error', reject);
          stream.on('error', reject);
        }));
        stream.on('limit', () => { uploadError = new Error('Upload exceeds configured size limit.'); });
        stream.pipe(output);
      });
      busboy.on('error', (error) => { uploadError = error; });
      busboy.on('finish', async () => {
        try {
          await Promise.all(writes);
          if (uploadError) throw uploadError;
          await browserManager.setFileInputFiles(tabId, nodeId, paths);
          res.status(201).json({ ok: true, count: paths.length });
          setTimeout(() => fs.rm(uploadRoot, { recursive: true, force: true }, () => {}), 10 * 60 * 1000).unref();
        } catch (error) {
          fs.rm(uploadRoot, { recursive: true, force: true }, () => {});
          handleRouteError(res, error);
        }
      });
      req.pipe(busboy);
    } catch (error) {
      fs.rm(uploadRoot, { recursive: true, force: true }, () => {});
      handleRouteError(res, error);
    }
  });

  app.get('/api/browser/downloads/:guid', requireAuth(config), (req, res) => {
    const download = browserManager.downloadFile(req.params.guid);
    if (!download) {
      res.status(404).json({ error: 'Download is not ready.' });
      return;
    }
    res.download(download.path, download.filename);
  });

  app.get('/api/browser/bookmarks', requireAuth(config), (req, res) => {
    res.json({ bookmarks: Array.isArray(config.browser.bookmarks) ? config.browser.bookmarks : [] });
  });

  app.post('/api/browser/bookmarks', requireAuth(config), (req, res) => {
    const url = normalizeWebsite(req.body.url);
    if (!url) {
      res.status(400).json({ error: 'Website must use HTTP or HTTPS.' });
      return;
    }
    const bookmarks = Array.isArray(config.browser.bookmarks) ? config.browser.bookmarks : [];
    const next = bookmarks.filter((bookmark) => bookmark.url !== url);
    next.push({ name: String(req.body.name || url).trim().slice(0, 120), url });
    const loaded = updateConfigFile(root, { browser: { bookmarks: next } });
    applyLoadedConfig(loaded.config);
    res.status(201).json({ bookmarks: config.browser.bookmarks });
  });

  app.delete('/api/browser/bookmarks', requireAuth(config), (req, res) => {
    const url = normalizeWebsite(req.body.url);
    const bookmarks = Array.isArray(config.browser.bookmarks) ? config.browser.bookmarks : [];
    const loaded = updateConfigFile(root, {
      browser: { bookmarks: url ? bookmarks.filter((bookmark) => bookmark.url !== url) : bookmarks }
    });
    applyLoadedConfig(loaded.config);
    res.json({ bookmarks: config.browser.bookmarks });
  });

  app.post('/api/files/folder', requireAuth(config), (req, res) => {
    try {
      res.status(201).json(files.createFolder(req.body.path, req.body.name));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post('/api/files/file', requireAuth(config), (req, res) => {
    try {
      res.status(201).json(files.createFile(req.body.path, req.body.name));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get('/api/files/download', requireAuth(config), async (req, res) => {
    try {
      const download = await files.prepareDownload(req.query.path);
      res.download(download.path, download.name, (error) => {
        if (download.temporary) {
          fs.unlink(download.path, () => {});
        }
        if (error && !res.headersSent) {
          handleRouteError(res, error);
        }
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post('/api/files/download-archive', requireAuth(config), async (req, res) => {
    try {
      const download = await files.prepareBulkDownload(req.body.paths);
      res.download(download.path, download.name, (error) => {
        if (download.temporary) {
          fs.unlink(download.path, () => {});
        }
        if (error && !res.headersSent) {
          handleRouteError(res, error);
        }
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.patch('/api/files/rename', requireAuth(config), (req, res) => {
    try {
      res.json(files.renameItem(req.body.path, req.body.name));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.patch('/api/files/move', requireAuth(config), (req, res) => {
    try {
      res.json(files.moveItem(req.body.path, req.body.destination));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post('/api/files/copy', requireAuth(config), (req, res) => {
    try {
      res.status(201).json(files.copyItem(req.body.path, req.body.destination));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.delete('/api/files', requireAuth(config), (req, res) => {
    try {
      res.json(files.deleteItem(req.body.path));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post('/api/files/delete-bulk', requireAuth(config), (req, res) => {
    try {
      res.json(files.deleteItems(req.body.paths));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post('/api/files/upload', requireAuth(config), (req, res) => {
    const targetPath = req.query.path;
    let finished = false;
    let uploadError = null;
    let pending = Promise.resolve([]);
    try {
      files.listDirectory(targetPath);
      const uploadLimit = Number(config.file_manager.max_upload_bytes) || 0;
      const busboy = createUploadParser(req.headers, uploadLimit);
      const uploaded = [];
      busboy.on('file', (field, stream, info) => {
        stream.on('limit', () => {
          uploadError = new Error('Upload exceeds configured size limit.');
          uploadError.statusCode = 413;
        });
        pending = pending.then(async () => {
          const saved = await files.saveUploadedFile(targetPath, info.filename, stream);
          uploaded.push(saved);
        }).catch((error) => {
          uploadError = error;
          stream.resume();
        });
      });
      busboy.on('error', (error) => {
        uploadError = error;
      });
      busboy.on('finish', async () => {
        if (finished) {
          return;
        }
        finished = true;
        try {
          await pending;
          if (uploadError) {
            throw uploadError;
          }
          res.status(201).json({ files: uploaded });
        } catch (error) {
          handleRouteError(res, error);
        }
      });
      req.pipe(busboy);
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  // Express renders the stack trace into the response body for anything that
  // reaches its built-in handler, which hands the caller absolute paths from
  // this machine. A malformed JSON body is enough to trigger it. Log the detail
  // and give the client only the status.
  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const status = error.status || error.statusCode || 500;
    appendRuntimeLog(root, `request error ${req.method} ${req.originalUrl} ${status} ${error.message}`);
    res.status(status).json({ error: status === 400 ? 'Invalid request body.' : 'Request failed.' });
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    // Upgrades bypass the Express middleware stack, and WebSocket is exempt from
    // the same-origin policy, so both checks have to be repeated here.
    if (!isTrustedHost(req.headers.host, config.server.allowed_hosts)) {
      ws.close(1008, 'Untrusted host');
      return;
    }
    if (!isSameOrigin(req.headers.origin, req.headers.host)) {
      ws.close(1008, 'Cross-origin upgrade rejected');
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const paneId = url.searchParams.get('paneId');
    const token = url.searchParams.get('token');
    if (config.auth.password_hash && !verifySessionToken(token, config.auth.password_hash)) {
      ws.close(1008, 'Login required');
      return;
    }
    const mode = url.searchParams.get('mode');
    if (mode === 'browser') {
      browserManager.attach(paneId, ws);
    } else if (mode === 'ai') {
      // As with terminals, paneId carries the tab id: one conversation, one
      // CLI process, one socket.
      const manager = aiManagerForTab(paneId);
      if (manager) {
        manager.attach(paneId, ws);
      } else {
        ws.close(1008, 'AI plugin is not installed.');
      }
    } else {
      terminalManager.attach(paneId, ws);
    }
  });

  // The ws library re-emits the underlying http.Server's own 'error' event as
  // its own, so every EADDRINUSE the port-fallback retry below produces (and
  // already handles) arrives here too. Only a genuinely different error is
  // ours to treat as fatal.
  wss.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      return;
    }
    appendRuntimeLog(root, `websocket server error: ${error.message}`);
    throw error;
  });

  const requestedPort = config.server.port;

  function listenOnPort(port) {
    const onListenError = (error) => {
      server.removeListener('error', onListenError);
      if (error.code !== 'EADDRINUSE') {
        throw error;
      }
      // Only the originally requested port can be this same data directory's
      // own already-running process: reopening its browser tab instead of
      // starting a second writer avoids two processes racing state.json.
      const runtimeInfo = port === requestedPort ? readRuntimeInfo(root) : null;
      const sameInstanceAlreadyRunning = runtimeInfo
        && runtimeInfo.host === config.server.host
        && runtimeInfo.port === port
        && runtimeInfo.pid !== process.pid
        && isProcessAlive(runtimeInfo.pid);
      if (sameInstanceAlreadyRunning) {
        const runningProtocol = runtimeInfo.protocol === 'https' ? 'https' : 'http';
        const url = `${runningProtocol}://${config.server.host === '0.0.0.0' ? '127.0.0.1' : config.server.host}:${port}`;
        if (config.server.open_browser) {
          openBrowser(url);
        }
        process.exit(1);
        return;
      }
      if (port >= 65535) {
        throw error;
      }
      appendRuntimeLog(root, `port ${port} unavailable, trying ${port + 1}`);
      listenOnPort(port + 1);
    };

    server.once('error', onListenError);
    server.listen(port, config.server.host, () => {
      server.removeListener('error', onListenError);
      config.server.port = port;
      browserManager.serverPort = port;
      if (port !== requestedPort) {
        appendRuntimeLog(root, `requested port ${requestedPort} unavailable, listening on ${port} instead`);
      }
      writeRuntimeInfo(root, config);
      appendRuntimeLog(root, `listening pid=${process.pid} host=${config.server.host} port=${port} protocol=${config.server.protocol}`);
      const url = `${config.server.protocol === 'https' ? 'https' : 'http'}://${config.server.host === '0.0.0.0' ? '127.0.0.1' : config.server.host}:${port}`;
      trayController = startTray({
        root,
        url,
        save: () => store.save(),
        openBrowser,
        restart: () => stopRuntime({ restart: true }),
        shutdown: () => stopRuntime(),
        // The packaged exe is on the windows subsystem and has no console, so
        // anything the tray writes to stderr would otherwise be lost.
        log: (message) => appendRuntimeLog(root, `tray ${message}`)
      });
      if (config.server.open_browser) {
        openBrowser(url);
      }
    });
  }

  listenOnPort(requestedPort);
}

function startAutosave(store, config) {
  const minutes = Math.max(1, Number(config.persistence.autosave_minutes) || 15);
  const timer = setInterval(() => store.save(), minutes * 60 * 1000);
  timer.unref();
  return timer;
}

main();
