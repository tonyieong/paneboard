const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

function loadI18n({ savedLocale, language = 'en-US' } = {}) {
  const storage = new Map(savedLocale ? [['paneboard.locale', savedLocale]] : []);
  const documentElement = { lang: '' };
  const document = {
    documentElement,
    body: null,
    addEventListener() {}
  };
  const context = {
    document,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    navigator: { language },
    MutationObserver: class { observe() {} },
    NodeFilter: { SHOW_TEXT: 4 },
    window: {}
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return { i18n: context.PaneboardI18n, documentElement, storage };
}

test('i18n uses the saved locale and updates the document language', () => {
  const { i18n, documentElement, storage } = loadI18n({ savedLocale: 'zh-HK' });

  assert.equal(i18n.getLocale(), 'zh-HK');
  assert.equal(documentElement.lang, 'zh-HK');
  i18n.setLocale('en');
  assert.equal(documentElement.lang, 'en');
  assert.equal(storage.get('paneboard.locale'), 'en');
});

test('i18n falls back to English and translates known interface copy', () => {
  const { i18n } = loadI18n({ language: 'fr-FR' });

  assert.equal(i18n.getLocale(), 'en');
  i18n.setLocale('zh-HK');
  assert.equal(i18n.t('Settings'), '設定');
  assert.equal(i18n.t('Workspace preferences'), '工作區偏好設定');
  assert.equal(i18n.t('Upload files'), '上傳檔案');
  assert.equal(i18n.t('Discard unsaved changes and reload from disk?'), '捨棄未儲存的變更並從磁碟重新載入嗎？');
  assert.equal(i18n.t('Workspace 2'), '工作區 2');
  assert.equal(i18n.t('A string that has no translation'), 'A string that has no translation');
});

test('the image pane sidebar button and its open dialog are translated', () => {
  const { i18n } = loadI18n();
  i18n.setLocale('zh-HK');
  for (const label of [
    'New image',
    'Open image',
    'Open image (O)',
    'Open image…',
    'Folders and images',
    'No folders or images here',
    'No image selected.',
    'Could not load image.'
  ]) {
    assert.notEqual(i18n.t(label), label, `${label} has no zh-HK translation`);
  }
});

test('plugin pane names are interpolated into the translated sidebar label', () => {
  const { i18n } = loadI18n({ savedLocale: 'zh-HK' });

  assert.equal(i18n.t('New {name} pane', { name: 'Private' }), '新增 Private 面板');
  assert.equal(i18n.t('This plugin pane is not installed on this device.'), '此裝置未安裝這個插件面板。');
});

test('every terminal context menu label has a zh-HK translation', () => {
  const { i18n } = loadI18n();
  i18n.setLocale('zh-HK');
  const start = appSource.indexOf('function openTerminalContextMenu(');
  assert.ok(start >= 0, 'openTerminalContextMenu not found in app.js');
  const block = appSource.slice(start, appSource.indexOf('document.body.appendChild(menu)', start));
  const labels = [...block.matchAll(/\{ label: '([^']+)', shortcut:/g)].map((match) => match[1]);
  assert.deepEqual(labels, ['Copy', 'Paste', 'Select all', 'Clear']);
  for (const label of labels) {
    // Lookup is exact, so 'Select All' silently fell through untranslated.
    assert.notEqual(i18n.t(label), label, `${label} has no zh-HK translation`);
  }
});
