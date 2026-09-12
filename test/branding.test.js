const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { loadConfig } = require('../src/config');
const { verifyRuntimeControlRequest } = require('../src/runtime-control');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

function storage(entries) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test('the rebrand migrates preferences and tokens once without overwriting newer choices', () => {
  const localStorage = storage({ 'wps7.theme': 'wps-light', 'wps7.sidebarOpen': 'false', 'paneboard.sidebarOpen': 'true', 'wps7.filePathHistory': '["C:\\\\Projects"]' });
  const sessionStorage = storage({ 'wps7.token': 'session-token' });
  const migrate = app.slice(0, app.indexOf('  const themePresets =')) + '}());';
  vm.runInNewContext(migrate, { localStorage, sessionStorage });
  assert.equal(localStorage.getItem('paneboard.theme'), 'paneboard-light');
  assert.equal(localStorage.getItem('paneboard.sidebarOpen'), 'true');
  assert.equal(localStorage.getItem('paneboard.filePathHistory'), '["C:\\\\Projects"]');
  assert.equal(sessionStorage.getItem('paneboard.token'), 'session-token');
  assert.equal(sessionStorage.getItem('wps7.token'), null);
  sessionStorage.removeItem('paneboard.token');
  vm.runInNewContext(migrate, { localStorage, sessionStorage });
  assert.equal(sessionStorage.getItem('paneboard.token'), null, 'logout must not revive the old token');
});

test('the previous locale and plugin translation interface remain usable', () => {
  const localStorage = storage({ 'wps7.locale': 'zh-HK' });
  const context = { localStorage, navigator: { language: 'en' }, document: { documentElement: {}, addEventListener() {} }, window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public', 'i18n.js'), 'utf8'), context);
  assert.equal(context.window.PaneboardI18n.getLocale(), 'zh-HK');
  assert.equal(context.window.PaneboardI18n.t('Paneboard Settings'), 'Paneboard 設定');
  assert.equal(context.window.Wps7I18n, context.window.PaneboardI18n);
  assert.equal(localStorage.getItem('wps7.locale'), null);
  assert.equal(localStorage.getItem('paneboard.locale'), 'zh-HK');
});

test('saved theme selections migrate while custom palette values stay intact', (t) => {
  fs.mkdirSync(path.join(root, 'output'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'output', 'brand-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'config.toml');
  fs.writeFileSync(configPath, '[custom_theme]\nselected_light = "wps-light"\nselected_dark = "wps-dark"\naccent = "#123456"\n');
  const { config } = loadConfig(directory);
  assert.equal(config.custom_theme.selected_light, 'paneboard-light');
  assert.equal(config.custom_theme.selected_dark, 'paneboard-dark');
  assert.equal(config.custom_theme.accent, '#123456');
  const migrated = fs.readFileSync(configPath, 'utf8');
  loadConfig(directory);
  assert.equal(fs.readFileSync(configPath, 'utf8'), migrated);
});

test('both control header names require the same token and loopback address', () => {
  for (const header of ['x-paneboard-control-token', 'x-wps7-control-token']) {
    for (const [address, token, expected] of [['127.0.0.1', 'secret', true], ['127.0.0.1', 'wrong', false], ['10.0.0.2', 'secret', false]]) {
      assert.equal(verifyRuntimeControlRequest({ socket: { remoteAddress: address }, headers: { [header]: token } }, 'secret'), expected);
    }
  }
  assert.equal(verifyRuntimeControlRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-paneboard-control-token': 'wrong', 'x-wps7-control-token': 'secret' } }, 'secret'), false);
});

test('browser and Windows branding assets ship with the Paneboard identity', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Paneboard');
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, 'public', icon.src)));
  const ico = fs.readFileSync(path.join(root, 'assets', 'paneboard.ico'));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 7);
  for (let index = 0; index < 7; index++) {
    const offset = ico.readUInt32LE(6 + index * 16 + 12);
    assert.equal(ico.subarray(offset + 1, offset + 4).toString(), 'PNG');
  }
  assert.doesNotMatch(app, />W7<|>WPS7</);
});
