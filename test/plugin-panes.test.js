const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listPluginPanes, loadAiPluginPanes, resolvePluginPaneAsset, resolveTrustedPluginPaneAsset } = require('../src/plugin-panes');

const aiFiles = {
  'server.js': 'module.exports = { AiManager: class AiManager {} };',
  'client.js': 'window.Wps7AiPanePlugins = window.Wps7AiPanePlugins || {};',
  'styles.css': '.drop-in-agent {}'
};
const hostFiles = {
  'client.js': 'window.Wps7HostPanePlugins = window.Wps7HostPanePlugins || {};',
  'styles.css': '.host-chart {}'
};

function writePane(root, id, manifest, files = {}) {
  const paneDir = path.join(root, 'plugin-panes', id);
  fs.mkdirSync(paneDir, { recursive: true });
  fs.writeFileSync(path.join(paneDir, 'pane.json'), JSON.stringify(manifest));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(paneDir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

test('discovers sandboxed and built-in plugin pane manifests', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-plugin-panes-'));
  writePane(root, 'private-dashboard', { name: 'Private dashboard', entry: 'ui/index.html' }, {
    'ui/index.html': '<h1>Private</h1>'
  });
  writePane(root, 'claude', { name: 'Claude', type: 'ai', provider: 'claude', implementation: 'claude', icon: 'ai' }, aiFiles);
  writePane(root, 'drop-in-agent', { name: 'Drop-in agent', type: 'ai', provider: 'drop-in-agent', implementation: 'drop-in-agent' }, aiFiles);
  writePane(root, 'host-chart', { name: 'Host chart', type: 'host', icon: 'line' }, hostFiles);
  writePane(root, 'missing-entry', { name: 'Missing entry', entry: 'missing.html' });
  writePane(root, 'missing-ai-source', { name: 'Missing source', type: 'ai', provider: 'missing-ai-source', implementation: 'missing-ai-source' });
  writePane(root, 'bad-provider', { name: 'Bad provider', type: 'ai', provider: 'other', implementation: 'bad-provider' }, aiFiles);
  writePane(root, 'bad-implementation', { name: 'Bad implementation', type: 'ai', provider: 'bad-implementation', implementation: 'other' }, aiFiles);

  assert.deepEqual(listPluginPanes(root), [
    { id: 'claude', name: 'Claude', type: 'ai', provider: 'claude', implementation: 'claude', icon: 'ai' },
    { id: 'drop-in-agent', name: 'Drop-in agent', type: 'ai', provider: 'drop-in-agent', implementation: 'drop-in-agent', icon: 'external' },
    { id: 'host-chart', name: 'Host chart', type: 'host', icon: 'line' },
    { id: 'private-dashboard', name: 'Private dashboard', type: 'iframe', entry: 'ui/index.html', icon: 'external' }
  ]);
});

test('loads a copied AI plugin backend and exposes only its browser assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-ai-plugin-'));
  writePane(root, 'drop-in-agent', { name: 'Drop-in agent', type: 'ai', provider: 'drop-in-agent', implementation: 'drop-in-agent' }, aiFiles);

  const plugins = loadAiPluginPanes(root);
  assert.equal(plugins.length, 1);
  assert.equal(plugins[0].pane.id, 'drop-in-agent');
  assert.equal(typeof plugins[0].AiManager, 'function');
  assert.equal(resolveTrustedPluginPaneAsset(root, 'drop-in-agent', 'client.js').path,
    path.join(root, 'plugin-panes', 'drop-in-agent', 'client.js'));
  assert.equal(resolveTrustedPluginPaneAsset(root, 'drop-in-agent', 'styles.css').path,
    path.join(root, 'plugin-panes', 'drop-in-agent', 'styles.css'));
  assert.equal(resolveTrustedPluginPaneAsset(root, 'drop-in-agent', 'server.js'), null);
});

test('resolves files inside one sandboxed plugin without allowing traversal', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-plugin-panes-'));
  writePane(root, 'private-dashboard', { name: 'Private dashboard' }, {
    'index.html': '<script src="app.js"></script>',
    'app.js': 'document.body.dataset.ready = "true";'
  });
  fs.writeFileSync(path.join(root, 'secret.txt'), 'not public');

  assert.equal(resolvePluginPaneAsset(root, 'private-dashboard', 'app.js').path,
    path.join(root, 'plugin-panes', 'private-dashboard', 'app.js'));
  assert.equal(resolvePluginPaneAsset(root, 'private-dashboard', '../pane.json'), null);
  assert.equal(resolvePluginPaneAsset(root, 'private-dashboard', '../../../secret.txt'), null);
  assert.equal(resolvePluginPaneAsset(root, 'unknown', 'index.html'), null);
});

test('a trusted host plugin exposes only its browser source and assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-host-plugin-'));
  writePane(root, 'host-chart', { name: 'Host chart', type: 'host' }, {
    ...hostFiles,
    'assets/chart.js': 'window.Chart = {};',
    'server.js': 'throw new Error("must stay private");'
  });

  assert.equal(resolveTrustedPluginPaneAsset(root, 'host-chart', 'client.js').path,
    path.join(root, 'plugin-panes', 'host-chart', 'client.js'));
  assert.equal(resolveTrustedPluginPaneAsset(root, 'host-chart', 'assets/chart.js').path,
    path.join(root, 'plugin-panes', 'host-chart', 'assets', 'chart.js'));
  assert.equal(resolveTrustedPluginPaneAsset(root, 'host-chart', 'server.js'), null);
  assert.equal(resolveTrustedPluginPaneAsset(root, 'host-chart', '../pane.json'), null);
});

test('Claude and Codex source lives entirely under plugin-panes', () => {
  const root = path.join(__dirname, '..');
  for (const provider of ['claude', 'codex']) {
    for (const file of ['pane.json', 'server.js', 'client.js', 'styles.css']) {
      const relative = `plugin-panes/${provider}/${file}`;
      assert.equal(fs.existsSync(path.join(root, relative)), true, `${relative} should exist`);
    }
  }
  assert.equal(fs.existsSync(path.join(root, 'plugin-panes', 'ai')), false);
  assert.equal(fs.existsSync(path.join(root, 'src', 'plugin-panes.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'src', 'ai.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'src', 'local-panes.js')), false);

  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  assert.doesNotMatch(app, /function renderAiSurface\(/);
  assert.doesNotMatch(app, /function mountAiTab\(/);
  assert.doesNotMatch(styles, /\.ai-surface\s*\{/);
  for (const provider of ['claude', 'codex']) {
    const server = fs.readFileSync(path.join(root, 'plugin-panes', provider, 'server.js'), 'utf8');
    assert.doesNotMatch(index, new RegExp(`/plugin-panes/${provider}/`));
    assert.doesNotMatch(main, new RegExp(`plugin-panes/${provider}/server`));
    assert.doesNotMatch(server, /\.\.\/\.\.\/src\//);
  }
  assert.match(app, /loadAiPanePlugins\(state\.pluginPanes\)/);
  assert.match(main, /loadAiPluginPanes\(root\)/);
});

test('Whiteboard source and its complete offline runtime live under one plugin folder', () => {
  const root = path.join(__dirname, '..');
  const folder = path.join(root, 'plugin-panes', 'whiteboard');
  for (const file of [
    'pane.json',
    'client.js',
    'styles.css',
    'assets/excalidraw/excalidraw.js',
    'assets/excalidraw/react.js',
    'assets/excalidraw/react-dom.js',
    'assets/excalidraw/jsx-runtime.js'
  ]) {
    assert.equal(fs.existsSync(path.join(folder, file)), true, `plugin-panes/whiteboard/${file} should exist`);
  }
  assert.equal(fs.existsSync(path.join(root, 'public', 'vendor', 'excalidraw')), false);

  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const state = fs.readFileSync(path.join(root, 'src', 'state.js'), 'utf8');
  const client = fs.readFileSync(path.join(folder, 'client.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'pane.json'), 'utf8'));
  assert.doesNotMatch(app, /mountWhiteboard|loadExcalidraw|state\.whiteboards/);
  assert.doesNotMatch(styles, /\.whiteboard\s*\{/);
  assert.doesNotMatch(main, /\/api\/panes\/:paneId\/whiteboard/);
  assert.doesNotMatch(state, /createWhiteboardPane|setWhiteboard/);
  assert.match(app, /loadHostPanePlugins\(state\.pluginPanes\)/);
  assert.match(client, /Wps7HostPanePlugins\.whiteboard/);
  assert.deepEqual(manifest.legacy, { paneType: 'whiteboard', dataField: 'whiteboard' });
});

test('plugin-panes ignores private plugins but tracks the bundled implementations', () => {
  const root = path.join(__dirname, '..');
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /^plugin-panes\/\*$/m);
  for (const id of ['claude', 'codex', 'whiteboard']) {
    assert.match(ignore, new RegExp(`^!plugin-panes/${id}/\\*\\*$`, 'm'));
  }
  assert.doesNotMatch(ignore, /^!plugin-panes\/ai\//m);
  assert.match(ignore, /^local-panes\/$/m);
});
