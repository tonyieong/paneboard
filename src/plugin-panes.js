const fs = require('fs');
const path = require('path');

const PLUGIN_PANE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PLUGIN_PANE_ICON = /^[a-z0-9][a-z0-9-]{0,31}$/;
const PLUGIN_LOCALE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const PLUGIN_DATA_FIELD = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_MANIFEST_BYTES = 32 * 1024;
const AI_PLUGIN_FILES = ['server.js', 'client.js', 'styles.css'];
const HOST_PLUGIN_FILES = ['client.js', 'styles.css'];

function pluginPanesDir(root) {
  return path.join(root, 'plugin-panes');
}

function pluginTranslations(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const translations = Object.fromEntries(Object.entries(value).flatMap(([locale, name]) => {
    const cleanName = String(name || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 80);
    return PLUGIN_LOCALE.test(locale) && cleanName ? [[locale, cleanName]] : [];
  }));
  return Object.keys(translations).length ? translations : undefined;
}

function safePaneFile(paneDir, relativePath) {
  const value = String(relativePath || '').replace(/\\/g, '/');
  const parts = value.split('/');
  if (!value || value.startsWith('/') || parts.some((part) => !part || part === '.' || part === '..' || part.includes('\0'))) {
    return null;
  }
  try {
    const realPaneDir = fs.realpathSync(paneDir);
    const target = fs.realpathSync(path.resolve(paneDir, ...parts));
    const relative = path.relative(realPaneDir, target);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(target).isFile()) {
      return null;
    }
    return target;
  } catch (error) {
    return null;
  }
}

function getPluginPane(root, id) {
  if (!PLUGIN_PANE_ID.test(String(id || ''))) {
    return null;
  }
  const paneDir = path.join(pluginPanesDir(root), id);
  const manifestPath = path.join(paneDir, 'pane.json');
  try {
    const stat = fs.statSync(manifestPath);
    if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) {
      return null;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const name = String(manifest.name || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 80);
    const iconValue = String(manifest.icon || '').trim();
    const icon = PLUGIN_PANE_ICON.test(iconValue) ? iconValue : 'external';
    if (!name) {
      return null;
    }
    if (manifest.type === 'ai') {
      const provider = String(manifest.provider || '').trim();
      const implementation = String(manifest.implementation || '').trim();
      const complete = AI_PLUGIN_FILES.every((file) => safePaneFile(paneDir, file));
      return provider === id && implementation === id && complete
        ? { id, name, type: 'ai', provider, implementation, icon }
        : null;
    }
    if (manifest.type === 'host') {
      const complete = HOST_PLUGIN_FILES.every((file) => safePaneFile(paneDir, file));
      if (!complete) {
        return null;
      }
      const translations = pluginTranslations(manifest.translations);
      const paneType = String(manifest.legacy?.paneType || '');
      const dataField = String(manifest.legacy?.dataField || '');
      const legacy = PLUGIN_PANE_ID.test(paneType) && PLUGIN_DATA_FIELD.test(dataField)
        ? { paneType, dataField }
        : undefined;
      return {
        id,
        name,
        type: 'host',
        icon,
        ...(translations ? { translations } : {}),
        ...(legacy ? { legacy } : {})
      };
    }
    const entry = String(manifest.entry || 'index.html').replace(/\\/g, '/');
    if (!safePaneFile(paneDir, entry)) {
      return null;
    }
    return { id, name, type: 'iframe', entry, icon };
  } catch (error) {
    return null;
  }
}

function resolveTrustedPluginPaneAsset(root, id, relativePath) {
  const pane = getPluginPane(root, id);
  const browserSource = ['client.js', 'styles.css'].includes(relativePath);
  const hostAsset = pane?.type === 'host' && String(relativePath || '').replace(/\\/g, '/').startsWith('assets/');
  if (!pane || (!browserSource && !hostAsset) || !['ai', 'host'].includes(pane.type)) {
    return null;
  }
  const target = safePaneFile(path.join(pluginPanesDir(root), id), relativePath);
  return target ? { pane, path: target } : null;
}

function loadAiPluginPanes(root) {
  return listPluginPanes(root).filter((pane) => pane.type === 'ai').map((pane) => {
    const paneDir = path.join(pluginPanesDir(root), pane.id);
    const serverPath = safePaneFile(paneDir, 'server.js');
    try {
      const plugin = require(serverPath);
      return typeof plugin.AiManager === 'function' ? { pane, AiManager: plugin.AiManager } : null;
    } catch (error) {
      return null;
    }
  }).filter(Boolean);
}

function listPluginPanes(root) {
  let entries;
  try {
    entries = fs.readdirSync(pluginPanesDir(root), { withFileTypes: true });
  } catch (error) {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => getPluginPane(root, entry.name))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function resolvePluginPaneAsset(root, id, relativePath) {
  const pane = getPluginPane(root, id);
  if (!pane || pane.type !== 'iframe') {
    return null;
  }
  const target = safePaneFile(path.join(pluginPanesDir(root), id), relativePath);
  return target ? { pane, path: target } : null;
}

function pluginPaneUrl(accessToken, pane) {
  if (pane.type !== 'iframe') {
    return '';
  }
  const entry = pane.entry.split('/').map(encodeURIComponent).join('/');
  return `/plugin-panes/${accessToken}/${encodeURIComponent(pane.id)}/${entry}`;
}

module.exports = {
  getPluginPane,
  listPluginPanes,
  loadAiPluginPanes,
  pluginPaneUrl,
  resolveTrustedPluginPaneAsset,
  resolvePluginPaneAsset
};
