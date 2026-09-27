(function () {
  // Move browser preferences once, without overwriting choices saved under the new name.
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of ['token', 'sidebarOpen', 'sidebarPinned', 'sidebarWidth', 'browserAudioEnabled', 'displayMode', 'mobileTerminalDensity', 'theme', 'filePathHistory']) {
      const value = storage.getItem(`wps7.${key}`);
      if (value !== null) {
        if (storage.getItem(`paneboard.${key}`) === null) storage.setItem(`paneboard.${key}`, value);
        storage.removeItem(`wps7.${key}`);
      }
    }
  }
  const oldTheme = localStorage.getItem('paneboard.theme');
  if (oldTheme === 'wps-dark' || oldTheme === 'wps-light') {
    localStorage.setItem('paneboard.theme', oldTheme.replace('wps-', 'paneboard-'));
  }

  function brandIcon() {
    return '<svg class="paneboard-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M11 3v18m0-10h10"/></svg>';
  }

  const themePresets = {
    'paneboard-dark': { label: 'Paneboard Dark', mode: 'dark', ink: '#08131f', panel: '#0e1c2a', rail: '#0b1926', terminal: '#07131e', surfaceRaised: '#142536', surfaceSoft: '#102131', line: '#25394a', lineStrong: '#385064', text: '#f2f6f7', muted: '#91a3b2', accent: '#48d6b2', accentStrong: '#22b993', warn: '#f1b84b', danger: '#ff7474', shadow: 'rgba(0, 0, 0, .34)', terminalBg: '#06111b', terminalFg: '#eef5f4' },
    'paneboard-light': { label: 'Paneboard Light', mode: 'light', ink: '#f5f7f8', panel: '#ffffff', rail: '#f2f5f6', terminal: '#f8fafb', surfaceRaised: '#ffffff', surfaceSoft: '#edf3f3', line: '#d7e0e4', lineStrong: '#b9c8cf', text: '#14202b', muted: '#5d6b78', accent: '#0b7561', accentStrong: '#0d806a', warn: '#8a4f00', danger: '#c43d4b', shadow: 'rgba(31, 49, 61, .14)', terminalBg: '#ffffff', terminalFg: '#17232d' },
    'slate-dark': { label: 'Slate Dark', mode: 'dark', ink: '#101114', panel: '#1c1c1e', rail: '#161618', terminal: '#0b0c0f', surfaceRaised: '#242428', surfaceSoft: '#202024', line: '#38383d', lineStrong: '#54545b', text: '#f5f5f7', muted: '#a1a1a6', accent: '#0a84ff', accentStrong: '#409cff', warn: '#ffd60a', danger: '#ff453a', shadow: 'rgba(0, 0, 0, .34)', terminalBg: '#0b0c0f', terminalFg: '#f5f5f7' },
    'slate-light': { label: 'Slate Light', mode: 'light', ink: '#f2f2f7', panel: '#ffffff', rail: '#f7f7fa', terminal: '#fbfbfd', surfaceRaised: '#ffffff', surfaceSoft: '#e9e9ee', line: '#d1d1d6', lineStrong: '#aeaeb2', text: '#1c1c1e', muted: '#636366', accent: '#0066cc', accentStrong: '#004f9e', warn: '#7a4b00', danger: '#c9342f', shadow: 'rgba(31, 31, 35, .14)', terminalBg: '#ffffff', terminalFg: '#1c1c1e' },
    'ember-dark': { label: 'Ember Dark', mode: 'dark', ink: '#1f1b18', panel: '#29231f', rail: '#241f1b', terminal: '#171411', surfaceRaised: '#342c27', surfaceSoft: '#302823', line: '#4a3e36', lineStrong: '#685548', text: '#f5eee8', muted: '#b5a79b', accent: '#e58b55', accentStrong: '#f0a36d', warn: '#f2c14e', danger: '#ff7a70', shadow: 'rgba(20, 12, 7, .38)', terminalBg: '#171411', terminalFg: '#f5eee8' },
    'ember-light': { label: 'Ember Light', mode: 'light', ink: '#f7f3ee', panel: '#fffaf5', rail: '#f1ebe4', terminal: '#fffdf9', surfaceRaised: '#ffffff', surfaceSoft: '#eee5dc', line: '#d8cbc0', lineStrong: '#bca99b', text: '#2d2723', muted: '#6f6258', accent: '#b84f23', accentStrong: '#963d1c', warn: '#7f4d00', danger: '#b93434', shadow: 'rgba(72, 49, 34, .14)', terminalBg: '#fffdf9', terminalFg: '#2d2723' },
    'forest-dark': { label: 'Forest Dark', mode: 'dark', ink: '#111311', panel: '#181b18', rail: '#141714', terminal: '#0b0d0c', surfaceRaised: '#202420', surfaceSoft: '#1c201c', line: '#303730', lineStrong: '#465046', text: '#edf3ee', muted: '#9aa79d', accent: '#52d273', accentStrong: '#2fbd56', warn: '#f2b84b', danger: '#ff6b6b', shadow: 'rgba(0, 0, 0, .36)', terminalBg: '#0b0d0c', terminalFg: '#edf3ee' },
    'forest-light': { label: 'Forest Light', mode: 'light', ink: '#f3f5f2', panel: '#ffffff', rail: '#eef1ed', terminal: '#fcfdfb', surfaceRaised: '#ffffff', surfaceSoft: '#e7ece6', line: '#d0d7cf', lineStrong: '#aeb9ad', text: '#182019', muted: '#5d6b60', accent: '#147a36', accentStrong: '#0c652a', warn: '#7c4d00', danger: '#b7333e', shadow: 'rgba(28, 45, 31, .14)', terminalBg: '#fcfdfb', terminalFg: '#182019' }
  };
  const customThemeDefaults = {
    selected_light: 'paneboard-light', selected_dark: 'paneboard-dark', mode: 'dark',
    ink: '#0c1017', panel: '#161b24', rail: '#111721', surface: '#202735', line: '#394354', text: '#f4f7fa', muted: '#9aa7b8', accent: '#6ee7c2', warn: '#f0b35a', danger: '#ff7676', terminal_bg: '#080c12', terminal_fg: '#f4f7fa',
    light_ink: '#f5f7f8', light_panel: '#ffffff', light_rail: '#f2f5f6', light_surface: '#edf3f3', light_line: '#d7e0e4', light_text: '#14202b', light_muted: '#5d6b78', light_accent: '#0b7561', light_warn: '#8a4f00', light_danger: '#c43d4b', light_terminal_bg: '#ffffff', light_terminal_fg: '#17232d'
  };
  const customThemePaletteKeys = ['ink', 'panel', 'rail', 'surface', 'line', 'text', 'muted', 'accent', 'warn', 'danger', 'terminal_bg', 'terminal_fg'];
  const defaultMobileKeybarButtons = [
    { label: 'Esc', action: 'shortcut', value: 'Escape', enabled: true },
    { label: 'Tab', action: 'shortcut', value: 'Tab', enabled: true },
    { label: 'Ctrl', action: 'modifier', value: 'Control', enabled: true },
    { label: 'Alt', action: 'modifier', value: 'Alt', enabled: true },
    { label: 'Shift', action: 'modifier', value: 'Shift', enabled: true },
    { label: '⏎', action: 'shortcut', value: 'Enter', enabled: true },
    { label: '←', action: 'shortcut', value: 'ArrowLeft', enabled: true },
    { label: '↓', action: 'shortcut', value: 'ArrowDown', enabled: true },
    { label: '↑', action: 'shortcut', value: 'ArrowUp', enabled: true },
    { label: '→', action: 'shortcut', value: 'ArrowRight', enabled: true },
    { label: '^C', action: 'shortcut', value: 'Ctrl+C', enabled: true },
    { label: '^D', action: 'shortcut', value: 'Ctrl+D', enabled: true },
    { label: '^Z', action: 'shortcut', value: 'Ctrl+Z', enabled: true },
    { label: '^L', action: 'shortcut', value: 'Ctrl+L', enabled: true },
    { label: '^R', action: 'shortcut', value: 'Ctrl+R', enabled: true }
  ];
  const TERMINAL_SCROLLBACK_LINES = 100000;
  // Long enough to coalesce a drag-resize, short enough that the reflow still
  // feels attached to the drag. Never worth a setting.
  const RESIZE_DEBOUNCE_MS = 100;
  const savedSidebarOpen = localStorage.getItem('paneboard.sidebarOpen');
  const savedSidebarPinned = localStorage.getItem('paneboard.sidebarPinned');
  const state = {
    token: localStorage.getItem('paneboard.token') || sessionStorage.getItem('paneboard.token') || '',
    config: null,
    pluginPanes: [],
    sessions: [],
    activeSessionId: '',
    activePaneId: '',
    sidebarOpen: savedSidebarOpen === null
      ? !window.matchMedia('(max-width: 760px)').matches
      : savedSidebarOpen === 'true',
    sidebarWidth: Number(localStorage.getItem('paneboard.sidebarWidth')) || 0,
    sidebarPinned: savedSidebarPinned === 'true',
    terminals: new Map(),
    browserConnections: new Map(),
    browserZoomTimers: new Map(),
    browserAudioEnabled: localStorage.getItem('paneboard.browserAudioEnabled') === 'true',
    terminalTitleTimers: new Map(),
    paneFontSizeTimers: new Map(),
    notepadAutosaveTimers: new Map(),
    themeTransitionFrame: 0,
    clickTimer: null,
    selectedFiles: {},
    filePaneData: {},
    filePathHistory: loadFilePathHistory(),
    notepadTabData: {},
    imagePaneData: {},
    displayMode: localStorage.getItem('paneboard.displayMode') || 'auto',
    dismissedDesktopBanner: false,
    fileClipboard: null,
    mobileTerminalDensity: localStorage.getItem('paneboard.mobileTerminalDensity') || 'readable',
    swipeStart: null,
    toastTimer: 0,
    shortcutsInstalled: false,
    lastSessionTap: null,
    suppressSessionClickUntil: 0,
    suppressPaneTabClickUntil: 0,
    theme: ({ dark: 'paneboard-dark', light: 'paneboard-light', custom: 'custom-dark' })[localStorage.getItem('paneboard.theme')] || localStorage.getItem('paneboard.theme') || 'paneboard-dark',
    customThemeDraft: null,
    focusedPaneId: '',
    paneFocusEscapeAt: 0,
    workspaceStripScroll: 0
  };

  const app = document.getElementById('app');
  const aiPaneContext = {
    app,
    api,
    showToast,
    clearToken,
    renderLogin,
    paneTabs,
    activePaneTabId,
    findPaneState,
    confirmDialog,
    escapeHtml,
    escapeAttr,
    fileActionIcon,
    getToken: () => state.token
  };
  const aiPanes = {};
  const hostPanes = {};
  const pluginAssetLoads = new Map();
  const unavailableAiPane = {
    renderSurface: (pane, tab, active) => `<div class="plugin-pane-unavailable" data-ai-tab="${escapeAttr(tab.id)}" ${active ? '' : 'hidden'} role="status">This AI plugin is not installed on this device.</div>`,
    mountTab() {},
    wire() {},
    disposeAll() {},
    disposeTab() {},
    surface: (tabId) => document.querySelector(`[data-ai-tab="${CSS.escape(tabId)}"]`)
  };

  function loadPluginAsset(type, url) {
    if (pluginAssetLoads.has(url)) {
      return pluginAssetLoads.get(url);
    }
    const loading = new Promise((resolve, reject) => {
      const element = document.createElement(type === 'style' ? 'link' : 'script');
      if (type === 'style') {
        element.rel = 'stylesheet';
        element.href = url;
      } else {
        element.src = url;
      }
      element.onload = resolve;
      element.onerror = () => reject(new Error(`Unable to load plugin asset: ${url}`));
      document.head.appendChild(element);
    });
    pluginAssetLoads.set(url, loading);
    return loading;
  }

  async function loadAiPanePlugins(definitions) {
    window.PaneboardAiPanePlugins = window.PaneboardAiPanePlugins || window.Wps7AiPanePlugins || {};
    window.Wps7AiPanePlugins = window.PaneboardAiPanePlugins;
    await Promise.all(definitions.filter((definition) => definition.type === 'ai').map(async (definition) => {
      try {
        await Promise.all([
          loadPluginAsset('style', definition.styleUrl),
          loadPluginAsset('script', definition.clientUrl)
        ]);
        const plugin = window.PaneboardAiPanePlugins[definition.provider];
        if (typeof plugin?.create !== 'function') {
          throw new Error(`AI plugin ${definition.id} did not register its renderer.`);
        }
        aiPanes[definition.provider] = plugin.create({ ...aiPaneContext, provider: definition.provider });
      } catch (error) {
        console.error(error);
      }
    }));
  }

  async function loadHostPanePlugins(definitions) {
    window.PaneboardHostPanePlugins = window.PaneboardHostPanePlugins || window.Wps7HostPanePlugins || {};
    window.Wps7HostPanePlugins = window.PaneboardHostPanePlugins;
    await Promise.all(definitions.filter((definition) => definition.type === 'host').map(async (definition) => {
      try {
        await Promise.all([
          loadPluginAsset('style', definition.styleUrl),
          loadPluginAsset('script', definition.clientUrl)
        ]);
        const plugin = window.PaneboardHostPanePlugins[definition.id];
        if (typeof plugin?.create !== 'function') {
          throw new Error(`Host plugin ${definition.id} did not register its renderer.`);
        }
        hostPanes[definition.id] = plugin.create({
          assetBaseUrl: definition.assetBaseUrl,
          getTheme: themeMode,
          saveData: savePluginPaneData
        });
      } catch (error) {
        console.error(error);
      }
    }));
  }

  async function savePluginPaneData(paneId, data) {
    const pluginData = typeof data === 'string' ? data : JSON.stringify(data ?? {});
    const found = findPaneState(paneId);
    if (found?.pane.type === 'plugin') {
      found.pane.pluginData = pluginData;
    }
    await api(`/api/panes/${paneId}/plugin-data`, {
      method: 'PATCH',
      body: JSON.stringify({ pluginData })
    });
  }

  const hostPane = {
    render: (pane) => hostPanes[pane.pluginPaneId]?.render(pane),
    mount: (pane) => hostPanes[pane.pluginPaneId]?.mount(pane),
    disposeAll: () => Object.values(hostPanes).forEach((pane) => pane.disposeAll?.()),
    refreshOffsets: () => Object.values(hostPanes).forEach((pane) => pane.refreshOffsets?.()),
    setTheme: () => Object.values(hostPanes).forEach((pane) => pane.setTheme?.(themeMode()))
  };

  const aiPaneFor = (pane, tab) => aiPanes[tab?.provider || paneTabs(pane)[0]?.provider] || unavailableAiPane;
  const aiPane = {
    renderSurfaces: (pane) => {
      const activeId = activePaneTabId(pane);
      return paneTabs(pane).map((tab) => aiPaneFor(pane, tab).renderSurface(pane, tab, tab.id === activeId)).join('');
    },
    renderSurface: (pane, tab, active) => aiPaneFor(pane, tab).renderSurface(pane, tab, active),
    mountPane: (pane) => paneTabs(pane).forEach((tab) => aiPaneFor(pane, tab).mountTab(pane.id, tab.id)),
    mountTab: (paneId, tabId) => {
      const pane = findPaneState(paneId)?.pane;
      const tab = paneTabs(pane).find((candidate) => candidate.id === tabId);
      aiPaneFor(pane, tab).mountTab(paneId, tabId);
    },
    wire: (root) => Object.values(aiPanes).forEach((pane) => pane.wire(root)),
    disposeAll: () => Object.values(aiPanes).forEach((pane) => pane.disposeAll()),
    disposeTab: (tabId) => Object.values(aiPanes).forEach((pane) => pane.disposeTab(tabId)),
    surface: (tabId) => Object.values(aiPanes).map((pane) => pane.surface(tabId)).find(Boolean) || unavailableAiPane.surface(tabId)
  };
  document.addEventListener('pointerdown', closeFloatingSidebarFromOutside);
  document.addEventListener('pointerdown', closeNotepadPopoversFromOutside);
  document.addEventListener('pointerdown', closePaneFocusFromOutside);
  window.visualViewport?.addEventListener('resize', updateVisualViewport);
  window.visualViewport?.addEventListener('scroll', updateVisualViewport);
  window.addEventListener('resize', updateVisualViewport);
  updateVisualViewport();

  function saveToken(token, remember) {
    localStorage.removeItem('paneboard.token');
    sessionStorage.removeItem('paneboard.token');
    (remember ? localStorage : sessionStorage).setItem('paneboard.token', token);
  }

  function clearToken() {
    localStorage.removeItem('paneboard.token');
    sessionStorage.removeItem('paneboard.token');
    state.token = '';
  }

  function loadFilePathHistory() {
    try {
      const value = JSON.parse(localStorage.getItem('paneboard.filePathHistory') || '[]');
      return Array.isArray(value) ? value.filter((path) => typeof path === 'string' && path) : [];
    } catch (error) {
      return [];
    }
  }

  function rememberFilePath(path) {
    if (!path) {
      return;
    }
    state.filePathHistory = [path, ...state.filePathHistory.filter((item) => item.toLowerCase() !== path.toLowerCase())];
    localStorage.setItem('paneboard.filePathHistory', JSON.stringify(state.filePathHistory));
  }

  function friendlyFileError(message) {
    const raw = String(message || '').trim();
    if (!raw) {
      return '';
    }
    if (/ENOENT|no such file/i.test(raw)) {
      return 'This location does not exist or was moved.';
    }
    if (/EPERM|EACCES|denied|permission/i.test(raw)) {
      return 'Access to this location was denied.';
    }
    if (/ENOTDIR|not a directory/i.test(raw)) {
      return 'This path is not a folder.';
    }
    if (/EBUSY|resource busy|in use/i.test(raw)) {
      return 'This location is in use by another program.';
    }
    return raw.replace(/^[A-Z]+:\s*/, '');
  }

  function hexToRgba(hex, alpha) {
    const value = Number.parseInt(hex.slice(1), 16);
    return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }

  function customThemePalette(mode) {
    const custom = { ...customThemeDefaults, ...(state.config?.custom_theme || {}), ...(state.customThemeDraft || {}) };
    const prefix = mode === 'light' ? 'light_' : '';
    return {
      label: `Custom ${mode === 'light' ? 'Light' : 'Dark'}`, mode,
      ink: custom[`${prefix}ink`], panel: custom[`${prefix}panel`], rail: custom[`${prefix}rail`],
      terminal: custom[`${prefix}terminal_bg`], surfaceRaised: custom[`${prefix}panel`], surfaceSoft: custom[`${prefix}surface`],
      line: custom[`${prefix}line`], lineStrong: custom[`${prefix}line`], text: custom[`${prefix}text`], muted: custom[`${prefix}muted`],
      accent: custom[`${prefix}accent`], accentStrong: custom[`${prefix}accent`], warn: custom[`${prefix}warn`], danger: custom[`${prefix}danger`],
      shadow: mode === 'light' ? 'rgba(31, 49, 61, .14)' : 'rgba(0, 0, 0, .34)',
      terminalBg: custom[`${prefix}terminal_bg`], terminalFg: custom[`${prefix}terminal_fg`]
    };
  }

  function activeTheme() {
    if (state.theme === 'custom-light' || state.theme === 'custom-dark') {
      return customThemePalette(state.theme.endsWith('light') ? 'light' : 'dark');
    }
    return themePresets[state.theme] || themePresets['paneboard-dark'];
  }

  function themeMode() {
    return activeTheme().mode;
  }

  function selectedThemeForMode(mode) {
    const custom = { ...customThemeDefaults, ...(state.config?.custom_theme || {}), ...(state.customThemeDraft || {}) };
    const selected = custom[`selected_${mode}`];
    return themePresets[selected]?.mode === mode || selected === `custom-${mode}` ? selected : `paneboard-${mode}`;
  }

  function pairedThemeId() {
    return selectedThemeForMode(themeMode() === 'dark' ? 'light' : 'dark');
  }

  function applyTheme(theme = state.theme) {
    state.theme = themePresets[theme] || theme === 'custom-light' || theme === 'custom-dark' ? theme : 'paneboard-dark';
    localStorage.setItem('paneboard.theme', state.theme);
    const palette = activeTheme();
    const root = document.documentElement;
    root.classList.add('theme-changing');
    window.cancelAnimationFrame(state.themeTransitionFrame);
    root.dataset.theme = palette.mode;
    root.dataset.themeId = state.theme;
    const variables = {
      ink: palette.ink, panel: palette.panel, rail: palette.rail, terminal: palette.terminal,
      'terminal-bg': palette.terminalBg, 'terminal-fg': palette.terminalFg,
      'surface-raised': palette.surfaceRaised, 'surface-soft': palette.surfaceSoft,
      line: palette.line, 'line-strong': palette.lineStrong, text: palette.text, muted: palette.muted,
      accent: palette.accent, 'accent-strong': palette.accentStrong,
      'accent-soft': hexToRgba(palette.accent, .12), warn: palette.warn, danger: palette.danger, shadow: palette.shadow
    };
    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(`--${name}`, value);
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.ink);
    if (state.lastBrowserThemeBackground !== palette.terminalBg) {
      state.lastBrowserThemeBackground = palette.terminalBg;
      for (const connection of state.browserConnections.values()) {
        connection.send({ type: 'theme', backgroundColor: palette.terminalBg });
      }
    }
    state.themeTransitionFrame = window.requestAnimationFrame(() => {
      state.themeTransitionFrame = window.requestAnimationFrame(() => {
        root.classList.remove('theme-changing');
        state.themeTransitionFrame = 0;
      });
    });
  }

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }
    const response = await fetch(path, { ...options, headers });
    if (!response.ok) {
      let message = await response.text();
      try {
        message = JSON.parse(message).error || message;
      } catch (error) {
        // Keep the raw response text.
      }
      if (response.status === 401 && path !== '/api/login') {
        clearToken();
        showToast(message || 'Login expired. Please log in again.');
        renderLogin();
      }
      const requestError = new Error(message || `Request failed (${response.status}).`);
      requestError.status = response.status;
      throw requestError;
    }
    return response.json();
  }

  function showToast(message, type = 'error') {
    if (!message) {
      return;
    }
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.className = `toast ${type}`;
    toast.textContent = message;
    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
    }
    state.toastTimer = window.setTimeout(() => toast.remove(), 4200);
  }

  function browserNotificationCapability() {
    if (window.isSecureContext === false) {
      return { available: false, state: 'insecure', message: 'Unavailable: this browser requires HTTPS or localhost for notifications.' };
    }
    if (!('Notification' in window)) {
      return { available: false, state: 'unsupported', message: 'Unavailable: this browser does not support notifications.' };
    }
    if (Notification.permission === 'denied') {
      return { available: false, state: 'denied', message: 'Blocked: allow notifications in this browser\'s site settings.' };
    }
    if (Notification.permission === 'granted') {
      return { available: true, state: 'granted', message: 'Available and allowed in this browser.' };
    }
    return { available: true, state: 'default', message: 'Available. The browser will ask for permission when enabled.' };
  }

  function requestBrowserNotificationPermission() {
    const capability = browserNotificationCapability();
    if (!capability.available) {
      return Promise.resolve(capability.state);
    }
    if (Notification.permission !== 'default') {
      return Promise.resolve(Notification.permission);
    }
    return Notification.requestPermission();
  }

  function showTerminalNotification(paneId, message = '', notificationTitle = '') {
    const found = findPaneState(paneId);
    if (!found) {
      return;
    }
    const label = `${found.session.name} / ${found.pane.title}`;
    const detail = String(message || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 180);
    const title = String(notificationTitle || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 80);
    showToast(detail ? `${label}: ${detail}` : `${label} needs attention.`, 'success');
    if (!state.config.terminal?.browser_notifications || !('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }
    const notification = new Notification(title || 'Paneboard terminal', {
      body: detail ? `${label}\n${detail}` : label,
      icon: '/icon.svg',
      tag: `paneboard-terminal-${paneId}`
    });
    notification.onclick = () => {
      window.focus();
      setActivePane(paneId);
      notification.close();
    };
  }

  function handleTerminalOscNotification(paneId, code, data) {
    const payload = String(data || '').trim();
    if (code === 9 && (/^4;/.test(payload) || /^9;/.test(payload))) {
      return true;
    }
    let title = '';
    let message = payload;
    if (code === 777 && payload.startsWith('notify;')) {
      const parts = payload.split(';');
      title = parts[1] || '';
      message = parts.slice(2).join(';');
    } else if (code === 99) {
      message = payload.split(';').at(-1) || payload;
    }
    showTerminalNotification(paneId, message, title);
    return true;
  }

  // The shell announces a title on nearly every prompt, usually its cwd. That is
  // the tab's name only while the user has not chosen one; a manual rename pins
  // the tab and this stream stops touching it.
  function updatePaneTitleFromTerminal(paneId, terminalTabId, title) {
    const nextTitle = String(title || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 80);
    const found = findPaneState(paneId);
    const tab = found?.pane.terminalTabs?.find((candidate) => candidate.id === terminalTabId);
    if (!nextTitle || !tab || tab.titlePinned || tab.title === nextTitle) {
      return;
    }
    window.clearTimeout(state.terminalTitleTimers.get(terminalTabId));
    state.terminalTitleTimers.set(terminalTabId, window.setTimeout(async () => {
      state.terminalTitleTimers.delete(terminalTabId);
      try {
        const result = await api(`/api/panes/${paneId}/terminal/tabs/${terminalTabId}`, {
          method: 'PATCH',
          body: JSON.stringify({ processTitle: nextTitle })
        });
        const current = findPaneState(paneId);
        const currentTab = current?.pane.terminalTabs?.find((candidate) => candidate.id === terminalTabId);
        if (!currentTab) {
          return;
        }
        if (!result.applied) {
          // The tab was pinned elsewhere; keep the name the server still holds.
          currentTab.titlePinned = true;
          return;
        }
        currentTab.title = nextTitle;
        updatePaneTabStrip(paneId);
      } catch (error) {
        // A title sequence must not interrupt the terminal session.
      }
    }, 250));
  }

  function applyUiTypography() {
    const systemFontSize = Number(state.config?.ui?.system_font_size) || 13;
    const filePaneFontSize = Number(state.config?.ui?.file_pane_font_size) || 13;
    document.documentElement.style.setProperty('--system-font-size', `${systemFontSize}px`);
    document.documentElement.style.setProperty('--file-pane-font-size', `${filePaneFontSize}px`);
  }

  function renderLogin() {
    disposeTerminals();
    document.querySelectorAll('.settings-overlay').forEach((element) => {
      element._disposeModal?.();
      element.remove();
    });
    applyTheme();
    applyUiTypography();
    app.innerHTML = `
      <main class="login">
        <div class="login-brand"><span class="brand-mark">${brandIcon()}</span><span>Paneboard</span></div>
        <button class="theme-toggle login-theme-toggle" type="button" data-theme-toggle aria-label="Switch to ${themeMode() === 'dark' ? 'light' : 'dark'} mode" title="Switch theme">${themeMode() === 'dark' ? '☀' : '☾'}</button>
        <form class="login-panel">
          <div class="login-shield">⌾</div>
          <h1>Welcome back</h1>
          <p>Sign in to your terminal workspace</p>
          <label class="login-label">Password
            <span class="password-field"><input type="password" name="password" autocomplete="current-password" autofocus><span aria-hidden="true">●</span></span>
          </label>
          <label class="login-remember"><input name="remember" type="checkbox"> Keep me signed in for 30 days</label>
          <div class="login-error" data-login-error></div>
          <button class="primary login-submit" type="submit">Sign in</button>
          <div class="login-hint"><kbd>Enter</kbd><span>Press Enter to continue</span></div>
          <div class="restore-note">↻ <span>Your workspaces will be restored</span></div>
        </form>
        <div class="login-status"><span class="protected">◇ <b>Protected terminal access</b></span></div>
      </main>
    `;
    app.querySelector('[data-theme-toggle]').onclick = () => {
      applyTheme(pairedThemeId());
      renderLogin();
    };
    app.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const password = form.get('password');
      const remember = form.get('remember') === 'on';
      const error = app.querySelector('[data-login-error]');
      error.textContent = '';
      try {
        const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ password, remember: form.get('remember') === 'on' }) });
        state.token = result.token;
        saveToken(state.token, remember);
        await load();
      } catch (loginError) {
        error.textContent = loginError.message || 'Login failed.';
      }
    });
  }

  function renderConnectionError(error) {
    disposeTerminals();
    applyTheme();
    applyUiTypography();
    app.innerHTML = `
      <main class="login">
        <section class="login-panel connection-error" role="alert">
          <div class="login-shield">!</div>
          <h1>Service unavailable</h1>
          <p>${escapeHtml(error?.message || 'Paneboard could not connect to the local service.')}</p>
          <button class="primary" type="button" data-retry>Retry connection</button>
        </section>
      </main>
    `;
    app.querySelector('[data-retry]').onclick = load;
  }

  function activeSession() {
    return state.sessions.find((session) => session.id === state.activeSessionId) ||
      state.sessions.find((session) => session.id === state.persistedActiveSessionId) ||
      state.sessions[0];
  }

  function activeTab(session) {
    return session && session.tabs[0];
  }

  function sidebarPaneTabs(pane) {
    if (pane.type === 'terminal' || pane.type === 'files' || pane.type === 'ai') {
      return paneTabs(pane).map((tab) => ({ tabId: tab.id, tabKind: paneTabKind(pane), label: paneTabLabel(pane, tab) }));
    }
    if (pane.type === 'browser') {
      return (pane.browserTabs || []).map((tab) => ({ tabId: tab.id, tabKind: 'browser', label: tab.title || 'New tab' }));
    }
    if (pane.type === 'notepad') {
      return (pane.notepadTabs || []).map((tab) => ({ tabId: tab.id, tabKind: 'notepad', label: notepadTabLabel(tab) }));
    }
    return [{ tabId: '', tabKind: '', label: pane.title }];
  }

  // One flat row per pane tab: every row names its own workspace, so no row
  // depends on the one above it to be read.
  function sidebarPaneRows() {
    return state.sessions.flatMap((session) => session.tabs
      .flatMap((tab) => tab.panes)
      .flatMap((pane) => sidebarPaneTabs(pane)
        .map(({ tabId, tabKind, label }) => ({ session, pane, tabId, tabKind, label: `${session.name}/${label}` }))));
  }

  function sidebarPaneRowActive(pane, tabId) {
    if (pane.id !== state.activePaneId) return false;
    if (!tabId) return true;
    if (pane.type === 'browser') return pane.activeBrowserTabId === tabId;
    if (pane.type === 'notepad') return pane.activeNotepadTabId === tabId;
    return activePaneTabId(pane) === tabId;
  }

  function sidebarPaneIcon(pane, tabId) {
    if (pane.type === 'plugin') return fileActionIcon(pluginPaneDefinition(pane)?.icon || 'external');
    if (pane.type === 'files') return fileActionIcon('file');
    if (pane.type === 'ai') return providerIcon(pane.aiTabs?.find((tab) => tab.id === tabId)?.provider);
    if ((pane.type || 'terminal') === 'terminal') return fileActionIcon(paneShell(pane) === 'cmd' ? 'cmd' : 'terminal');
    return fileActionIcon(pane.type);
  }

  function renderSidebarPaneItem({ session, pane, tabId, tabKind, label }) {
    return `
      <button class="session-item ${sidebarPaneRowActive(pane, tabId) ? 'active' : ''}" data-pane-link="${pane.id}" data-session="${session.id}" data-sidebar-pane-tab="${tabId}" data-sidebar-pane-tab-kind="${tabKind}">
        ${sidebarPaneIcon(pane, tabId)}
        <span data-pane-label>${escapeHtml(label)}</span>
      </button>
    `;
  }

  function renderSidebarPaneList() {
    const list = app.querySelector('.session-list');
    if (!list) {
      return;
    }
    list.innerHTML = sidebarPaneRows().map(renderSidebarPaneItem).join('');
    wirePaneLinks(list);
  }

  function paneItemStyle(pane) {
    const layout = normalizePaneLayout(pane.layout);
    const fontSize = Number(pane.fontSize);
    const fontStyle = Number.isInteger(fontSize) ? ` --pane-font-size: ${fontSize}px;` : '';
    return `grid-column: ${layout.x + 1} / span ${layout.w}; grid-row: ${layout.y + 1} / span ${layout.h};${fontStyle}`;
  }

  function paneFontSize(pane) {
    const savedSize = Number(pane?.fontSize);
    if (Number.isInteger(savedSize) && savedSize >= 8 && savedSize <= 32) {
      return savedSize;
    }
    return pane?.type === 'files'
      ? Number(state.config.ui?.file_pane_font_size) || 13
      : terminalFontSize();
  }

  function changePaneFontSize(paneId, delta) {
    const found = findPaneState(paneId);
    const paneElement = document.querySelector(`[data-pane="${paneId}"]`);
    if (!found || !paneElement) {
      return;
    }
    const previousSize = Math.round(paneFontSize(found.pane));
    const nextSize = Math.max(8, Math.min(32, previousSize + delta));
    if (nextSize === previousSize) {
      return;
    }
    found.pane.fontSize = nextSize;
    paneElement.style.setProperty('--pane-font-size', `${nextSize}px`);
    for (const terminal of paneTerminals(paneId)) {
      terminal.term.options.fontSize = nextSize;
      terminal.sendResize();
    }
    const notepadFontSizeValue = paneElement.querySelector('[data-notepad-font-size-value]');
    if (notepadFontSizeValue) notepadFontSizeValue.textContent = nextSize;
    const notepadFontSizeOutput = paneElement.querySelector('[data-notepad-font-size-output]');
    if (notepadFontSizeOutput) notepadFontSizeOutput.textContent = nextSize;
    const notepadPane = paneElement.querySelector('.notepad-pane');
    if (notepadPane) {
      syncNotepadRows(
        notepadPane,
        notepadPane.querySelector('.notepad-editor'),
        notepadPane.querySelector('.notepad-gutter'),
        notepadPane.querySelector('.notepad-indent-guides')
      );
    }
    window.clearTimeout(state.paneFontSizeTimers.get(paneId));
    state.paneFontSizeTimers.set(paneId, window.setTimeout(async () => {
      state.paneFontSizeTimers.delete(paneId);
      try {
        await api(`/api/panes/${paneId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fontSize: nextSize })
        });
      } catch (error) {
        showToast(error.message);
      }
    }, 180));
  }

  function isMobileLayout() {
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const narrow = window.matchMedia('(max-width: 760px)').matches;
    const touchDevice = window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
    return state.displayMode === 'mobile' || (state.displayMode === 'auto' && (narrow || (touchDevice && viewportWidth <= 1024)));
  }

  // window.innerHeight covers the collapsible URL bar on a phone, so anything
  // clamped to it can land off screen. visualViewport reports what is visible.
  function viewportHeight() {
    return window.visualViewport?.height || window.innerHeight;
  }

  function terminalFontSize() {
    if (!isMobileLayout()) {
      return Number(state.config.ui?.terminal_font_size) || 13;
    }
    const mobileSize = Number(state.config.ui?.mobile_terminal_font_size) || 12;
    const viewportWidth = window.visualViewport?.width || window.innerWidth || 390;
    const widthScale = Math.max(.9, Math.min(1.1, viewportWidth / 390));
    const densityScale = Math.max(.96, Math.min(1.04, Math.sqrt(window.devicePixelRatio || 1) / Math.sqrt(2)));
    const baseSize = state.mobileTerminalDensity === 'dense' ? Math.max(8, mobileSize - 2) : mobileSize;
    return Math.round(baseSize * widthScale * densityScale * 10) / 10;
  }

  function updateVisualViewport() {
    const viewport = window.visualViewport;
    const height = Math.round(viewport?.height || window.innerHeight);
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    app.querySelector('.app')?.classList.toggle('mobile-device', isMobileLayout());
    updateDesktopModeBanner();
    if (!state.config) {
      return;
    }
    // A shrinking viewport can leave the active pane's column off screen.
    ensureActivePaneVisible('auto');
    if (!isMobileLayout()) {
      return;
    }
    // Narrowing a focused desktop window would otherwise strand the pane in a
    // mode mobile cannot enter or leave.
    exitPaneFocus();
    const terminal = paneTerminal(state.activePaneId);
    if (!terminal) {
      return;
    }
    terminal.term.options.fontSize = paneFontSize(findPaneState(state.activePaneId)?.pane);
    terminal.sendResize();
    if (viewport && viewport.height < window.innerHeight * .8) {
      terminal.term.scrollToBottom();
    }
  }

  function terminalTheme() {
    const palette = activeTheme();
    return {
      background: palette.terminalBg,
      foreground: palette.terminalFg,
      cursor: palette.accent,
      selectionBackground: hexToRgba(palette.accent, .28),
      scrollbarSliderBackground: hexToRgba(palette.accent, .3),
      scrollbarSliderHoverBackground: hexToRgba(palette.accent, .45),
      scrollbarSliderActiveBackground: hexToRgba(palette.accent, .62),
      black: palette.mode === 'light' ? palette.text : '#111111',
      brightBlack: palette.muted,
      red: palette.danger,
      brightRed: palette.danger,
      green: palette.accentStrong,
      brightGreen: palette.accent,
      yellow: palette.warn,
      brightYellow: palette.warn,
      blue: palette.accent,
      brightBlue: palette.accentStrong
    };
  }

  function mobileKeybarButtons() {
    const configured = state.config?.terminal?.mobile_keybar_buttons;
    return (Array.isArray(configured) ? configured : defaultMobileKeybarButtons).filter((button) => button.enabled !== false);
  }

  function renderToolbarPageButton(direction) {
    const previous = direction === 'previous';
    const label = previous ? 'Previous toolbar buttons' : 'Next toolbar buttons';
    return `<button class="paged-toolbar-button" type="button" data-toolbar-page="${direction}" aria-label="${label}" title="${label}" hidden>${previous ? '&lt;&lt;' : '&gt;&gt;'}</button>`;
  }

  function mobileKeybarButtonName(button) {
    if (button.action === 'text') {
      return `Type ${button.value}`;
    }
    if (button.action === 'modifier') {
      return `${button.value}, double-click to lock`;
    }
    return button.value;
  }

  function renderMobileKeybar() {
    return `<div class="mobile-keybar" data-paged-toolbar aria-label="Terminal keys">${renderToolbarPageButton('previous')}${mobileKeybarButtons().map((button) => `
      <button type="button" data-toolbar-item data-terminal-action="${escapeAttr(button.action)}" data-terminal-value="${escapeAttr(button.value)}" aria-label="${escapeAttr(mobileKeybarButtonName(button))}" title="${escapeAttr(mobileKeybarButtonName(button))}" ${button.action === 'modifier' ? 'aria-pressed="false" data-modifier-state=""' : ''}>${escapeHtml(button.label)}</button>
    `).join('')}${renderToolbarPageButton('next')}</div>`;
  }

  function paneTabs(pane) {
    if (pane.type === 'files') return pane.filesTabs || [];
    if (pane.type === 'ai') return pane.aiTabs || [];
    return pane.terminalTabs || [];
  }

  // A Linux server runs one configured shell and has no cmd.exe.
  function serverOnWindows() {
    return (state.config?.platform ?? 'win32') === 'win32';
  }

  // Which shell a terminal pane runs, taken from the tab on screen: every tab in
  // a pane is opened with the pane's own shell.
  function paneShell(pane) {
    const tabs = paneTabs(pane);
    return (tabs.find((tab) => tab.id === activePaneTabId(pane)) || tabs[0])?.shell === 'cmd' ? 'cmd' : 'powershell';
  }

  function paneTerminal(paneId) {
    const pane = findPaneState(paneId)?.pane;
    return pane ? state.terminals.get(activePaneTabId(pane)) : undefined;
  }

  function paneTerminals(paneId) {
    const pane = findPaneState(paneId)?.pane;
    return pane ? paneTabs(pane).map((tab) => state.terminals.get(tab.id)).filter(Boolean) : [];
  }

  function activePaneTabId(pane) {
    const tabs = paneTabs(pane);
    const activeId = pane.type === 'files' ? pane.activeFilesTabId
      : pane.type === 'ai' ? pane.activeAiTabId
        : pane.activeTerminalTabId;
    return tabs.some((tab) => tab.id === activeId) ? activeId : tabs[0]?.id || '';
  }

  function paneTabLabel(pane, tab) {
    if (pane.type === 'ai') {
      const plugin = state.pluginPanes.find((candidate) => candidate.type === 'ai' && candidate.provider === tab.provider);
      return tab.title || plugin?.name || tab.provider || 'AI';
    }
    if (pane.type !== 'files') {
      return tab.title || (!serverOnWindows() ? 'Terminal' : tab.shell === 'cmd' ? 'CMD' : 'PowerShell');
    }
    const trimmed = String(tab.path || '').replace(/[\\/]+$/, '');
    return trimmed ? trimmed.split(/[\\/]/).pop() || trimmed : 'This PC';
  }

  function renderPaneTabs(pane) {
    const tabs = paneTabs(pane);
    const activeId = activePaneTabId(pane);
    const uploadStatus = pane.type === 'files'
      ? `<span class="pane-upload-status" data-pane-upload-status="${pane.id}" aria-live="polite"></span>`
      : '';
    const activeAiTab = pane.type === 'ai' ? tabs.find((tab) => tab.id === activeId) : null;
    return `
      <span class="pane-kind-icon" aria-hidden="true">${pane.type === 'ai' ? providerIcon(activeAiTab?.provider) : fileActionIcon(pane.type === 'files' ? 'file' : paneShell(pane) === 'cmd' ? 'cmd' : 'terminal')}</span>
      <div class="pane-tab-list" role="tablist">
        ${tabs.map((tab) => {
          const label = paneTabLabel(pane, tab);
          return `
          <div class="pane-tab ${tab.id === activeId ? 'active' : ''}" role="tab" tabindex="0" aria-selected="${tab.id === activeId}" data-pane-tab="${tab.id}" title="${escapeAttr(pane.type === 'files' ? (tab.path || 'This PC') : label)}">
            <span class="pane-tab-label">${escapeHtml(label)}</span>
            <button class="pane-tab-close" type="button" aria-label="Close ${escapeAttr(label)}" data-pane-close-tab="${tab.id}">${fileActionIcon('close')}</button>
          </div>`;
        }).join('')}
      </div>
      ${uploadStatus}
      <button class="pane-new-tab" type="button" data-pane-new-tab aria-label="New tab" title="New tab">${fileActionIcon('add')}</button>`;
  }

  function renderTerminalSurfaces(pane) {
    const activeId = activePaneTabId(pane);
    return paneTabs(pane).map((tab) => `
      <div class="terminal" id="terminal-${tab.id}" data-terminal-tab="${tab.id}" ${tab.id === activeId ? '' : 'hidden'}></div>`).join('');
  }

  function renderPluginPane(pane) {
    const definition = pluginPaneDefinition(pane);
    if (!definition) {
      return '<div class="plugin-pane-unavailable" role="status">This plugin pane is not installed on this device.</div>';
    }
    if (definition.type === 'host') {
      return hostPane.render(pane) || '<div class="plugin-pane-unavailable" role="status">This plugin pane could not be loaded.</div>';
    }
    return `<iframe class="plugin-pane-frame" src="${escapeAttr(definition.url)}" sandbox="allow-scripts allow-forms" title="${escapeAttr(definition.name)}"></iframe>`;
  }

  function pluginPaneDefinition(pane) {
    return state.pluginPanes.find((candidate) => candidate.id === pane?.pluginPaneId);
  }

  function paneKindIcon(pane) {
    if (pane.type === 'plugin') return pluginPaneDefinition(pane)?.icon || 'external';
    return pane.type === 'usage' ? 'usage' : pane.type;
  }

  function pluginPaneLabel(pluginPane) {
    const key = 'New {name} pane';
    const locale = window.PaneboardI18n?.getLocale();
    const translatedName = pluginPane.translations?.[locale] || pluginPane.name;
    return window.PaneboardI18n?.t(key, { name: translatedName }) ?? key.replace('{name}', translatedName);
  }

  function renderPane(pane) {
    const body = pane.type === 'files' ? renderFilesPane(pane)
      : pane.type === 'browser' ? renderBrowserPane(pane)
        : pane.type === 'notepad' ? renderNotepadPane(pane)
          : pane.type === 'image' ? renderImagePane(pane)
            : pane.type === 'usage' ? renderUsagePane(pane)
              : pane.type === 'ai' ? aiPane.renderSurfaces(pane)
                : pane.type === 'plugin' ? renderPluginPane(pane) : `
          ${renderMobileKeybar()}
          ${renderTerminalSurfaces(pane)}`;
    const header = pane.type === 'browser'
      ? `<div class="browser-tab-strip" data-browser-tab-strip data-pane-title="${pane.id}">
          ${renderBrowserTabs(pane)}
        </div>`
      : pane.type === 'notepad'
        ? `<div class="notepad-tab-strip" data-notepad-tab-strip data-pane-title="${pane.id}">
          <span class="pane-kind-icon" aria-hidden="true">${fileActionIcon('notepad')}</span>
          ${renderNotepadTabs(pane)}
        </div>`
        : pane.type === 'image'
          ? `<div class="pane-title" data-pane-title="${pane.id}">
            <span class="pane-kind-icon" aria-hidden="true">${fileActionIcon('image')}</span>
            <span data-image-title title="${escapeAttr(pane.path)}">${escapeHtml(imageFileName(pane.path) || pane.title)}</span>
          </div>`
          : pane.type === 'usage' || pane.type === 'plugin'
            ? `<div class="pane-title" data-pane-title="${pane.id}">
            <span class="pane-kind-icon" aria-hidden="true">${fileActionIcon(paneKindIcon(pane))}</span>
            <span data-rename-pane="${pane.id}">${escapeHtml(pane.title)}</span>
          </div>`
            : `<div class="pane-tab-strip" data-pane-tab-strip data-pane-title="${pane.id}">
          ${renderPaneTabs(pane)}
          </div>`;
    return `
      <section class="pane ${pane.id === state.activePaneId ? 'active' : ''}" data-pane="${pane.id}" data-pane-type="${pane.type || 'terminal'}" style="${paneItemStyle(pane)}">
        ${header}
        ${pane.type === 'usage' ? `<button class="pane-usage-refresh" type="button" data-usage-refresh aria-label="Refresh usage" title="Refresh usage">${fileActionIcon('refresh')}</button>` : ''}
        <button class="pane-close" data-close-pane="${pane.id}" title="Close pane">${fileActionIcon('close')}</button>
        ${body}
        ${['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map((direction) => `
        <div class="pane-resize pane-resize-${direction}" data-pane-resize="${pane.id}" data-pane-resize-direction="${direction}"></div>`).join('')}
      </section>
    `;
  }

  function filesPaneData(paneId) {
    if (!state.filePaneData[paneId]) {
      state.filePaneData[paneId] = {
        drives: [],
        entries: [],
        parent: '',
        error: '',
        showHidden: Boolean(state.config.file_manager?.show_hidden),
        selectionAnchor: -1,
        filter: '',
        filterOpen: false,
        sortKey: 'name',
        sortDirection: 'asc',
        columnWidths: { name: 150, modified: 130, size: 72 },
        bookmarks: []
      };
    }
    return state.filePaneData[paneId];
  }

  const fileActionIcons = {
    add: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    'chevron-down': '<path d="m7 10 5 5 5-5"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
    cmd: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m8 10 3 2-3 2"/>',
    appearance: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    workspace: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
    persistence: '<path d="M4 5h13l3 3v11H4z"/><path d="M8 5v6h8V5M8 19v-5h8v5"/>',
    shell: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
    server: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M7 7h.01M7 17h.01M11 7h7M11 17h7"/>',
    security: '<path d="M12 3 5 6v5c0 4.6 2.9 8.1 7 10 4.1-1.9 7-5.4 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    usage: '<path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/>',
    ai: '<path d="M20 4H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3v4l5-4h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z"/><path d="M9 10h.01M12 10h.01M15 10h.01"/>',
    codex: '<path d="M20 4H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3v4l5-4h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z"/><path d="m10 8-2 2 2 2M14 8l2 2-2 2"/>',
    thinking: '<path d="M9 18h6M10 21h4"/><path d="M8.5 15.5a7 7 0 1 1 7 0c-.7.5-1.1 1.2-1.3 2.5H9.8c-.2-1.3-.6-2-1.3-2.5z"/>',
    tools: '<path d="M14.7 6.3a4 4 0 0 0-5-5L12 4 9 7 6.3 4.3a4 4 0 0 0 5 5L18 15.6a2.8 2.8 0 1 1-4 4l-6.3-6.3a4 4 0 0 1-5-5L5 11l3-3-2.7-2.7"/>',
    send: '<path d="M4 12h13M12 6l6 6-6 6"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/><path d="M12 8v4l3 2"/>',
    interrupt: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
    pin: '<path d="M9 3h6l1 7 3 3v2H5v-2l3-3zM12 15v6"/>',
    'pin-off': '<path d="M9 3h6l1 7 3 3v2H8M12 15v6M4 4l16 16"/>',
    up: '<path d="M9 6 4 11l5 5"/><path d="M4 11h10a6 6 0 0 1 6 6v1"/>',
    refresh: '<g class="refresh-shape"><path class="refresh-arc" d="M4 9a8.5 8.5 0 0 1 14.4-3.7v3.1h-3.1"/><path class="refresh-arc" d="M20 15a8.5 8.5 0 0 1-14.4 3.7v-3.1h3.1"/></g>',
    'new-folder': '<path d="M3 6h7l2 2h9v11H3z"/><path d="M12 11v5M9.5 13.5h5"/>',
    'upload-file': '<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 14v6h14v-6"/>',
    'upload-folder': '<path d="M3 7h7l2 2h9v10H3z"/><path d="M12 17v-6M9.5 13.5 12 11l2.5 2.5"/>',
    download: '<path d="M12 4v12M7.5 11.5 12 16l4.5-4.5"/><path d="M5 20h14"/>',
    copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/>',
    'copy-path': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    rename: '<path d="m4 20 4.2-1 10.9-10.9-3.2-3.2L5 15.8z"/><path d="m14.5 6.5 3 3"/>',
    delete: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
    'select-all': '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 2.5 2.5L16 9"/>',
    'deselect-all': '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12h8"/>',
    hidden: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.5"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
    drive: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 14h18M16 17h2"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>',
    folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
    browser: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.3 3 14.7 0 18M12 3c-3 3.3-3 14.7 0 18"/>',
    desktop: '<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/>',
    mobile: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4M11 19h2"/>',
    volume: '<path d="M5 10v4h4l5 4V6l-5 4zM17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
    'volume-off': '<path d="M5 10v4h4l5 4V6l-5 4zM17 10l4 4M21 10l-4 4"/>',
    'browser-back': '<path d="m10 6-6 6 6 6M4 12h16"/>',
    'browser-forward': '<path d="m14 6 6 6-6 6M20 12H4"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
    zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/><path d="M7.5 10.5h6"/>',
    subtract: '<path d="M5 12h14"/>',
    reset: '<path d="M4 8V4h4M4.8 5.2A8 8 0 1 1 4 15"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
    notepad: '<path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v7H4V6h7"/>',
    save: '<path d="M5 3h12l2 2v16H5zM8 3v6h8V3M8 21v-8h8v8"/>',
    cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8.5 20 20M8.5 15.5 20 4"/>',
    paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/>',
    replace: '<path d="M7 7h10M7 7l3-3M7 7l3 3M17 17H7M17 17l-3-3M17 17l-3 3"/>',
    'replace-all': '<path d="M5 6h10M5 6l3-3M5 6l3 3M19 11H9M19 11l-3-3M19 11l-3 3M5 18h10M5 18l3-3M5 18l3 3"/>',
    wrap: '<path d="M4 7h16M4 12h11a3 3 0 1 1 0 6h-3M4 17h5"/><path d="m14 15 3 3-3 3"/>',
    indent: '<path d="M4 4v16M9 4v16M4 8h5M4 16h5"/>',
    autosave: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    font: '<path d="M6 20 11 4h2l5 16M8 14h8"/>',
    undo: '<path d="M4 9h11a5 5 0 0 1 0 10h-6"/><path d="m8 5-4 4 4 4"/>',
    redo: '<path d="M20 9H9a5 5 0 0 0 0 10h6"/><path d="m16 5 4 4-4 4"/>',
    bookmark: '<path d="M7 3h10v18l-5-4-5 4z"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    line: '<path d="M4 20 20 4"/>',
    text: '<path d="M5 7V4h14v3M12 4v16M9 20h6"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m5 17 4.5-4.5L13 16l3-2.5 3 3"/>',
    'rotate-left': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    'rotate-right': '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    'zoom-in': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/><path d="M7.5 10.5h6M10.5 7.5v6"/>',
    fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>'
  };

  function fileActionIcon(name) {
    return `<svg class="file-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${fileActionIcons[name] || ''}</svg>`;
  }

  // The AI providers' own brand marks, used in place of a fileActionIcon()
  // single-stroke glyph so the Codex/Claude panes are identifiable at a
  // glance. Full colour and their own viewBox, so they render standalone
  // rather than through the shared .file-action-icon (stroke: currentColor)
  // styling every other icon here uses.
  const providerIcons = {
    codex: {
      viewBox: '0 0 512 509.639',
      markup: '<path fill="#fff" d="M115.612 0h280.775C459.974 0 512 52.026 512 115.612v278.415c0 63.587-52.026 115.613-115.613 115.613H115.612C52.026 509.64 0 457.614 0 394.027V115.612C0 52.026 52.026 0 115.612 0z"/><path fill-rule="nonzero" d="M412.037 221.764a90.834 90.834 0 004.648-28.67 90.79 90.79 0 00-12.443-45.87c-16.37-28.496-46.738-46.089-79.605-46.089-6.466 0-12.943.683-19.264 2.04a90.765 90.765 0 00-67.881-30.515h-.576c-.059.002-.149.002-.216.002-39.807 0-75.108 25.686-87.346 63.554-25.626 5.239-47.748 21.31-60.682 44.03a91.873 91.873 0 00-12.407 46.077 91.833 91.833 0 0023.694 61.553 90.802 90.802 0 00-4.649 28.67 90.804 90.804 0 0012.442 45.87c16.369 28.504 46.74 46.087 79.61 46.087a91.81 91.81 0 0019.253-2.04 90.783 90.783 0 0067.887 30.516h.576l.234-.001c39.829 0 75.119-25.686 87.357-63.588 25.626-5.242 47.748-21.312 60.682-44.033a91.718 91.718 0 0012.383-46.035 91.83 91.83 0 00-23.693-61.553l-.004-.005zM275.102 413.161h-.094a68.146 68.146 0 01-43.611-15.8 56.936 56.936 0 002.155-1.221l72.54-41.901a11.799 11.799 0 005.962-10.251V241.651l30.661 17.704c.326.163.55.479.596.84v84.693c-.042 37.653-30.554 68.198-68.21 68.273h.001zm-146.689-62.649a68.128 68.128 0 01-9.152-34.085c0-3.904.341-7.817 1.005-11.663.539.323 1.48.897 2.155 1.285l72.54 41.901a11.832 11.832 0 0011.918-.002l88.563-51.137v35.408a1.1 1.1 0 01-.438.94l-73.33 42.339a68.43 68.43 0 01-34.11 9.12 68.359 68.359 0 01-59.15-34.11l-.001.004zm-19.083-158.36a68.044 68.044 0 0135.538-29.934c0 .625-.036 1.731-.036 2.5v83.801l-.001.07a11.79 11.79 0 005.954 10.242l88.564 51.13-30.661 17.704a1.096 1.096 0 01-1.034.093l-73.337-42.375a68.36 68.36 0 01-34.095-59.143 68.412 68.412 0 019.112-34.085l-.004-.003zm251.907 58.621l-88.563-51.137 30.661-17.697a1.097 1.097 0 011.034-.094l73.337 42.339c21.109 12.195 34.132 34.746 34.132 59.132 0 28.604-17.849 54.199-44.686 64.078v-86.308c.004-.032.004-.065.004-.096 0-4.219-2.261-8.119-5.919-10.217zm30.518-45.93c-.539-.331-1.48-.898-2.155-1.286l-72.54-41.901a11.842 11.842 0 00-5.958-1.611c-2.092 0-4.15.558-5.957 1.611l-88.564 51.137v-35.408l-.001-.061a1.1 1.1 0 01.44-.88l73.33-42.303a68.301 68.301 0 0134.108-9.129c37.704 0 68.281 30.577 68.281 68.281a68.69 68.69 0 01-.984 11.545v.005zm-191.843 63.109l-30.668-17.704a1.09 1.09 0 01-.596-.84v-84.692c.016-37.685 30.593-68.236 68.281-68.236a68.332 68.332 0 0143.689 15.804 63.09 63.09 0 00-2.155 1.222l-72.54 41.9a11.794 11.794 0 00-5.961 10.248v.068l-.05 102.23zm16.655-35.91l39.445-22.782 39.444 22.767v45.55l-39.444 22.767-39.445-22.767v-45.535z"/>'
    },
    claude: {
      viewBox: '0 0 512 509.64',
      markup: '<path fill="#D77655" d="M115.612 0h280.775C459.974 0 512 52.026 512 115.612v278.415c0 63.587-52.026 115.612-115.613 115.612H115.612C52.026 509.639 0 457.614 0 394.027V115.612C0 52.026 52.026 0 115.612 0z"/><path fill="#FCF2EE" fill-rule="nonzero" d="M142.27 316.619l73.655-41.326 1.238-3.589-1.238-1.996-3.589-.001-12.31-.759-42.084-1.138-36.498-1.516-35.361-1.896-8.897-1.895-8.34-10.995.859-5.484 7.482-5.03 10.717.935 23.683 1.617 35.537 2.452 25.782 1.517 38.193 3.968h6.064l.86-2.451-2.073-1.517-1.618-1.517-36.776-24.922-39.81-26.338-20.852-15.166-11.273-7.683-5.687-7.204-2.451-15.721 10.237-11.273 13.75.935 3.513.936 13.928 10.716 29.749 23.027 38.848 28.612 5.687 4.727 2.275-1.617.278-1.138-2.553-4.271-21.13-38.193-22.546-38.848-10.035-16.101-2.654-9.655c-.935-3.968-1.617-7.304-1.617-11.374l11.652-15.823 6.445-2.073 15.545 2.073 6.547 5.687 9.655 22.092 15.646 34.78 24.265 47.291 7.103 14.028 3.791 12.992 1.416 3.968 2.449-.001v-2.275l1.997-26.641 3.69-32.707 3.589-42.084 1.239-11.854 5.863-14.206 11.652-7.683 9.099 4.348 7.482 10.716-1.036 6.926-4.449 28.915-8.72 45.294-5.687 30.331h3.313l3.792-3.791 15.342-20.372 25.782-32.227 11.374-12.789 13.27-14.129 8.517-6.724 16.1-.001 11.854 17.617-5.307 18.199-16.581 21.029-13.75 17.819-19.716 26.54-12.309 21.231 1.138 1.694 2.932-.278 44.536-9.479 24.062-4.347 28.714-4.928 12.992 6.066 1.416 6.167-5.106 12.613-30.71 7.583-36.018 7.204-53.636 12.689-.657.48.758.935 24.164 2.275 10.337.556h25.301l47.114 3.514 12.309 8.139 7.381 9.959-1.238 7.583-18.957 9.655-25.579-6.066-59.702-14.205-20.474-5.106-2.83-.001v1.694l17.061 16.682 31.266 28.233 39.152 36.397 1.997 8.999-5.03 7.102-5.307-.758-34.401-25.883-13.27-11.651-30.053-25.302-1.996-.001v2.654l6.926 10.136 36.574 54.975 1.895 16.859-2.653 5.485-9.479 3.311-10.414-1.895-21.408-30.054-22.092-33.844-17.819-30.331-2.173 1.238-10.515 113.261-4.929 5.788-11.374 4.348-9.478-7.204-5.03-11.652 5.03-23.027 6.066-30.052 4.928-23.886 4.449-29.674 2.654-9.858-.177-.657-2.173.278-22.37 30.71-34.021 45.977-26.919 28.815-6.445 2.553-11.173-5.789 1.037-10.337 6.243-9.2 37.257-47.392 22.47-29.371 14.508-16.961-.101-2.451h-.859l-98.954 64.251-17.618 2.275-7.583-7.103.936-11.652 3.589-3.791 29.749-20.474-.101.102.024.101z"/>'
    }
  };

  function providerIcon(name) {
    const icon = providerIcons[name];
    if (!icon) {
      return fileActionIcon('ai');
    }
    return `<svg class="provider-icon" viewBox="${icon.viewBox}" aria-hidden="true" focusable="false">${icon.markup}</svg>`;
  }

  function renderFilePathOption(path, kind, bookmarkPaths) {
    const bookmarked = Boolean(path) && bookmarkPaths.has(path.toLowerCase());
    return `
      <div class="file-path-option ${kind === 'Current' ? 'current' : ''}" role="option" data-path-kind="${kind}" aria-selected="${kind === 'Current'}">
        <button class="file-path-choice" type="button" data-file-path-choice="${escapeAttr(path)}" title="${escapeAttr(path || 'This PC')}">
          <span class="file-path-value">${escapeHtml(path || 'This PC')}</span>
        </button>
        <button class="file-path-star ${bookmarked ? 'bookmarked' : ''}" type="button" data-path-bookmark="${escapeAttr(path)}" aria-label="${bookmarked ? 'Remove' : 'Add'} bookmark ${escapeAttr(path || 'This PC')}" title="${bookmarked ? 'Remove bookmark' : 'Add bookmark'}" ${path ? '' : 'disabled'}>${fileActionIcon('star')}</button>
      </div>
    `;
  }

  function renderFilePathOptions(pane) {
    const bookmarks = filesPaneData(pane.id).bookmarks || [];
    const bookmarkPaths = new Set(bookmarks.map((bookmark) => bookmark.path.toLowerCase()));
    const currentPath = (pane.path || '').toLowerCase();
    const history = state.filePathHistory
      .filter((path) => path.toLowerCase() !== currentPath)
      .slice(0, 5);
    return `
      <div class="file-path-group" role="group" aria-labelledby="file-path-current-${pane.id}">
        <div class="file-path-heading" id="file-path-current-${pane.id}">Current</div>
        ${renderFilePathOption(pane.path || '', 'Current', bookmarkPaths)}
      </div>
      <div class="file-path-divider" role="separator"></div>
      <div class="file-path-group" role="group" aria-labelledby="file-path-history-${pane.id}">
        <div class="file-path-heading" id="file-path-history-${pane.id}">History</div>
        ${history.map((path) => renderFilePathOption(path, 'History', bookmarkPaths)).join('')}
      </div>
      <div class="file-path-divider" role="separator"></div>
      <div class="file-path-group" role="group" aria-labelledby="file-path-bookmark-${pane.id}">
        <div class="file-path-heading" id="file-path-bookmark-${pane.id}">Bookmark</div>
        ${bookmarks.map((bookmark) => renderFilePathOption(bookmark.path, 'Bookmark', bookmarkPaths)).join('')}
      </div>
    `;
  }

  function sortedFileEntries(paneId) {
    const paneData = filesPaneData(paneId);
    const direction = paneData.sortDirection === 'desc' ? -1 : 1;
    const filterText = (paneData.filter || '').toLowerCase();
    return paneData.entries
      .filter((entry) => paneData.showHidden || !entry.hidden)
      .filter((entry) => !filterText || entry.name.toLowerCase().includes(filterText))
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        let comparison;
        if (paneData.sortKey === 'modified') {
          comparison = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime();
        } else if (paneData.sortKey === 'size') {
          comparison = Number(a.size) - Number(b.size);
        } else {
          comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        }
        return comparison === 0 ? a.name.localeCompare(b.name) : comparison * direction;
      });
  }

  function fileSortIndicator(paneData, key) {
    return paneData.sortKey === key ? `<span aria-hidden="true">${paneData.sortDirection === 'asc' ? '↑' : '↓'}</span>` : '';
  }

  function formatModified(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short', hour12: false });
  }

  function renderFilesPane(pane) {
    const paneData = filesPaneData(pane.id);
    const columnWidths = { name: 150, modified: 130, size: 72, ...paneData.columnWidths };
    const tableWidth = columnWidths.name + columnWidths.modified + columnWidths.size;
    const showingDrives = !pane.path;
    const selectedPaths = selectedFileList(pane.id);
    const entries = sortedFileEntries(pane.id);
    const allSelected = allVisibleFilesSelected(pane.id);
    return `
      <div class="files-pane" data-files-pane="${pane.id}" style="--file-column-template: ${columnWidths.name}px ${columnWidths.modified}px ${columnWidths.size}px; --file-table-width: ${tableWidth}px">
        <form class="file-toolbar" data-file-path-form>
          <div class="file-location-row">
            <button class="file-command-button" type="button" data-file-up aria-label="Up one level" title="Up one level" ${pane.path ? '' : 'disabled'}>${fileActionIcon('up')}</button>
            <div class="file-path-control" data-file-path-control>
              <input class="file-path-input" name="path" value="${escapeAttr(pane.path)}" placeholder="${serverOnWindows() ? 'This PC or C:\\path' : 'This PC or /path'}" autocomplete="off" aria-label="Folder path" aria-controls="file-path-menu-${pane.id}" aria-expanded="false">
              <button class="file-path-toggle" type="button" data-file-path-toggle aria-label="Show path history and bookmarks" aria-expanded="false" aria-controls="file-path-menu-${pane.id}">${fileActionIcon('chevron-down')}</button>
              <div class="file-path-menu" id="file-path-menu-${pane.id}" data-file-path-menu role="listbox" aria-label="Current, recent and bookmarked paths" hidden>
                ${renderFilePathOptions(pane)}
              </div>
            </div>
            <button class="file-command-button" type="button" data-file-refresh aria-label="Refresh" title="Refresh">${fileActionIcon('refresh')}</button>
          </div>
          <div class="file-command-bar" data-paged-toolbar aria-label="File actions">
            ${renderToolbarPageButton('previous')}
            <button class="file-command-button" type="button" data-toolbar-item data-file-new-file aria-label="New file" title="New file" ${pane.path ? '' : 'disabled'}>${fileActionIcon('file')}</button>
            <button class="file-command-button" type="button" data-toolbar-item data-file-new-folder aria-label="New folder" title="New folder" ${pane.path ? '' : 'disabled'}>${fileActionIcon('new-folder')}</button>
            <label class="file-command-button file-upload" data-toolbar-item data-file-upload-trigger role="button" tabindex="${pane.path ? '0' : '-1'}" aria-disabled="${pane.path ? 'false' : 'true'}" title="Upload files" aria-label="Upload files">${fileActionIcon('upload-file')}<input type="file" multiple tabindex="-1" data-file-upload ${pane.path ? '' : 'disabled'}></label>
            <label class="file-command-button file-upload" data-toolbar-item data-file-upload-trigger role="button" tabindex="${pane.path ? '0' : '-1'}" aria-disabled="${pane.path ? 'false' : 'true'}" title="Upload folder" aria-label="Upload folder">${fileActionIcon('upload-folder')}<input type="file" multiple webkitdirectory directory tabindex="-1" data-folder-upload ${pane.path ? '' : 'disabled'}></label>
            <button class="file-command-button" type="button" data-toolbar-item data-file-download-selected aria-label="Download selected" title="Download selected" ${selectedPaths.length ? '' : 'disabled'}>${fileActionIcon('download')}</button>
            <button class="file-command-button" type="button" data-toolbar-item data-file-duplicate-selected aria-label="Copy selected" title="Copy selected" ${selectedPaths.length ? '' : 'disabled'}>${fileActionIcon('copy')}</button>
            <button class="file-command-button" type="button" data-toolbar-item data-file-copy-selected aria-label="Copy selected paths" title="Copy selected paths" ${selectedPaths.length ? '' : 'disabled'}>${fileActionIcon('copy-path')}</button>
            <button class="file-command-button" type="button" data-toolbar-item data-file-paste aria-label="Paste" title="Paste" ${state.fileClipboard?.paths?.length && pane.path ? '' : 'disabled'}>${fileActionIcon('paste')}</button>
            <button class="file-command-button" type="button" data-toolbar-item data-file-rename-selected aria-label="Rename selected" title="Rename selected" ${selectedPaths.length === 1 ? '' : 'disabled'}>${fileActionIcon('rename')}</button>
            <button class="file-command-button" type="button" data-toolbar-item data-file-delete-selected aria-label="Delete selected" title="Delete selected" ${selectedPaths.length ? '' : 'disabled'}>${fileActionIcon('delete')}</button>
            <button class="file-command-button ${allSelected ? 'active' : ''}" type="button" data-toolbar-item data-file-select-all aria-label="${allSelected ? 'Deselect all' : 'Select all'}" aria-pressed="${allSelected}" title="${allSelected ? 'Deselect all' : 'Select all'}">${fileActionIcon(allSelected ? 'deselect-all' : 'select-all')}</button>
            <button class="file-command-button ${paneData.filterOpen ? 'active' : ''}" type="button" data-toolbar-item data-file-filter-toggle aria-label="Search this folder" aria-pressed="${paneData.filterOpen}" title="Search this folder" ${pane.path ? '' : 'disabled'}>${fileActionIcon('search')}</button>
            <button class="file-command-button ${paneData.showHidden ? 'active' : ''}" type="button" data-toolbar-item data-file-show-hidden aria-label="Show hidden files" aria-pressed="${paneData.showHidden}" title="Show hidden files">${fileActionIcon('hidden')}</button>
            ${renderToolbarPageButton('next')}
          </div>
          <div class="file-filter-row" data-file-filter-row ${paneData.filterOpen && pane.path ? '' : 'hidden'}>
            ${fileActionIcon('search')}
            <input class="file-filter-input" type="search" data-file-filter placeholder="Filter by name" aria-label="Filter files by name" value="${escapeAttr(paneData.filter)}" autocomplete="off">
            <button class="file-command-button" type="button" data-file-filter-clear aria-label="Clear filter" title="Clear filter">×</button>
          </div>
        </form>
        <div class="file-list" role="listbox" aria-label="Files" aria-multiselectable="true">
          ${showingDrives ? paneData.drives.map((drive) => `
            <button class="file-row file-row-button" role="option" aria-selected="false" data-file-open="${escapeAttr(drive.path)}">
              ${fileActionIcon('drive')}<span>${escapeHtml(drive.name)}</span>
            </button>
          `).join('') : `
            <div class="file-column-header" role="row" aria-label="Sort files">
              <div class="file-column-heading"><button type="button" data-file-sort="name" aria-label="Sort by name" aria-pressed="${paneData.sortKey === 'name'}">Name ${fileSortIndicator(paneData, 'name')}</button><span class="file-column-resizer" data-file-column-resize="name" role="separator" aria-label="Resize Name column" aria-orientation="vertical" tabindex="0"></span></div>
              <div class="file-column-heading"><button type="button" data-file-sort="modified" aria-label="Sort by modified date" aria-pressed="${paneData.sortKey === 'modified'}">Modified ${fileSortIndicator(paneData, 'modified')}</button><span class="file-column-resizer" data-file-column-resize="modified" role="separator" aria-label="Resize Modified column" aria-orientation="vertical" tabindex="0"></span></div>
              <div class="file-column-heading"><button type="button" data-file-sort="size" aria-label="Sort by size" aria-pressed="${paneData.sortKey === 'size'}">Size ${fileSortIndicator(paneData, 'size')}</button><span class="file-column-resizer" data-file-column-resize="size" role="separator" aria-label="Resize Size column" aria-orientation="vertical" tabindex="0"></span></div>
            </div>
            <button class="file-row compact-file-row file-parent-row" type="button" role="option" aria-selected="false" data-file-parent="${escapeAttr(paneData.parent)}" aria-label="Up one level, ${entries.length} ${entries.length === 1 ? 'item' : 'items'} in current directory">
              <span class="file-name">${fileActionIcon('up')}<span>..</span></span>
              <small></small>
              <small class="file-item-count">${selectedPaths.length ? `${selectedPaths.length}/${entries.length} items` : `${entries.length} items`}</small>
            </button>
          ${entries.map((entry, index) => `
            <div class="file-row compact-file-row ${selectedPaths.includes(entry.path) ? 'selected' : ''} ${entry.hidden ? 'hidden-entry' : ''} ${state.fileClipboard?.mode === 'cut' && state.fileClipboard?.paths?.includes(entry.path) ? 'cut-pending' : ''}" role="option" aria-selected="${selectedPaths.includes(entry.path)}" data-file-row="${escapeAttr(entry.path)}" data-file-index="${index}" tabindex="0">
              <div class="file-name" data-file-open="${escapeAttr(entry.path)}" data-file-type="${entry.type}">
                ${entry.type === 'directory' ? fileActionIcon('folder') : fileActionIcon('file')}<span>${escapeHtml(entry.name)}</span>
              </div>
              <small class="file-modified">${escapeHtml(formatModified(entry.modifiedAt))}</small>
              <small class="file-size">${entry.type === 'file' ? formatBytes(entry.size) : 'Folder'}</small>
            </div>
          `).join('')}
          ${entries.length ? '' : `
            <div class="file-empty-state" role="note">
              ${fileActionIcon(paneData.error ? 'hidden' : (paneData.filter ? 'search' : 'folder'))}
              <p>${escapeHtml(paneData.error || (paneData.filter ? 'No files match your search.' : 'This folder is empty.'))}</p>
            </div>`}`}
        </div>
        <div class="file-drop-overlay" aria-hidden="true">Drop files or folders to upload</div>
      </div>
    `;
  }

  function renderBrowserUrlOption(url, kind, bookmarkUrls) {
    const bookmarked = Boolean(url) && bookmarkUrls.has(url);
    return `
      <div class="file-path-option ${kind === 'Current' ? 'current' : ''}" role="option">
        <button class="file-path-choice" type="button" data-browser-url-choice="${escapeAttr(url)}" title="${escapeAttr(url)}"><span class="file-path-value">${escapeHtml(url || 'Enter a website')}</span></button>
        <button class="file-path-star ${bookmarked ? 'bookmarked' : ''}" type="button" data-browser-bookmark="${escapeAttr(url)}" aria-label="${bookmarked ? 'Remove' : 'Add'} bookmark" ${url ? '' : 'disabled'}>${fileActionIcon('star')}</button>
      </div>`;
  }

  function renderBrowserUrlOptions(pane) {
    const currentUrl = activeBrowserTab(pane).url || '';
    const bookmarks = state.config.browser?.bookmarks || [];
    const bookmarkUrls = new Set(bookmarks.map((bookmark) => bookmark.url));
    const history = (state.config.browser?.history || []).slice(0, 5);
    return `
      <div class="file-path-group"><div class="file-path-heading">Current</div>${renderBrowserUrlOption(currentUrl, 'Current', bookmarkUrls)}</div>
      <div class="file-path-divider" role="separator"></div>
      <div class="file-path-group"><div class="file-path-heading">History</div>${history.length ? history.map((url) => renderBrowserUrlOption(url, 'History', bookmarkUrls)).join('') : '<div class="browser-menu-empty">No history yet</div>'}</div>
      <div class="file-path-divider" role="separator"></div>
      <div class="file-path-group"><div class="file-path-heading">Bookmark</div>${bookmarks.length ? bookmarks.map((bookmark) => renderBrowserUrlOption(bookmark.url, 'Bookmark', bookmarkUrls)).join('') : '<div class="browser-menu-empty">No bookmarks yet</div>'}</div>`;
  }

  function activeBrowserTab(pane) {
    const tabs = pane.browserTabs || [];
    return tabs.find((tab) => tab.id === pane.activeBrowserTabId) || tabs[0] || {
      id: '', title: 'New tab', url: pane.url || '', zoom: 1, emulationMode: 'desktop'
    };
  }

  function renderBrowserTabs(pane) {
    const active = activeBrowserTab(pane);
    return `
      <span class="pane-kind-icon" aria-hidden="true">${fileActionIcon('browser')}</span>
      <div class="browser-tab-list" role="tablist">
        ${(pane.browserTabs || [active]).map((tab) => `
          <div class="browser-tab ${tab.id === active.id ? 'active' : ''}" role="tab" tabindex="0" aria-selected="${tab.id === active.id}" data-browser-tab="${tab.id}" title="${escapeAttr(tab.title || tab.url || 'New tab')}">
            <span class="browser-tab-label">${escapeHtml(tab.title || 'New tab')}</span>
            <button class="browser-tab-close" type="button" aria-label="Close ${escapeAttr(tab.title || 'tab')}" data-browser-close-tab="${tab.id}">${fileActionIcon('close')}</button>
          </div>`).join('')}
      </div>
      <button class="browser-new-tab" type="button" data-browser-new-tab aria-label="New tab" title="New tab">${fileActionIcon('add')}</button>`;
  }

  function renderBrowserPane(pane) {
    const active = activeBrowserTab(pane);
    return `
      <div class="browser-pane" data-browser-pane="${pane.id}">
        <form class="file-toolbar browser-toolbar" data-browser-url-form>
          <div class="file-location-row">
            <button class="file-command-button" type="button" data-browser-back aria-label="Back" title="Back">${fileActionIcon('browser-back')}</button>
            <button class="file-command-button" type="button" data-browser-forward aria-label="Forward" title="Forward">${fileActionIcon('browser-forward')}</button>
            <div class="file-path-control" data-browser-url-control>
              <input class="file-path-input" name="url" type="text" inputmode="url" value="${escapeAttr(active.url || '')}" placeholder="Search or enter website" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Address or search">
              <button class="file-path-toggle" type="button" data-browser-url-toggle aria-label="Show website history and bookmarks" aria-expanded="false">${fileActionIcon('chevron-down')}</button>
              <div class="file-path-menu" data-browser-url-menu role="listbox" aria-label="Current, recent and bookmarked websites" hidden>${renderBrowserUrlOptions(pane)}</div>
            </div>
            <button class="file-command-button" type="button" data-browser-refresh aria-label="Refresh" title="Refresh">${fileActionIcon('refresh')}</button>
            <button class="file-command-button" type="button" data-browser-stop aria-label="Stop loading" title="Stop loading" hidden>${fileActionIcon('stop')}</button>
            <button class="file-command-button" type="button" data-browser-find aria-label="Find in page" title="Find in page">${fileActionIcon('search')}</button>
            <div class="browser-zoom-control" data-browser-zoom-control>
              <button class="file-command-button" type="button" data-browser-zoom-toggle aria-label="Zoom controls" aria-expanded="false" title="Zoom controls">${fileActionIcon('zoom')}</button>
              <div class="browser-zoom-popover" data-browser-zoom-popover role="dialog" aria-label="Page zoom" hidden>
                <button type="button" data-browser-zoom-out aria-label="Zoom out" title="Zoom out">${fileActionIcon('subtract')}</button>
                <output data-browser-zoom-value>${Math.round((active.zoom || 1) * 100)}%</output>
                <button type="button" data-browser-zoom-in aria-label="Zoom in" title="Zoom in">${fileActionIcon('add')}</button>
                <button type="button" data-browser-zoom-reset aria-label="Reset zoom" title="Reset zoom">${fileActionIcon('reset')}</button>
              </div>
            </div>
            <button class="file-command-button ${active.emulationMode === 'mobile' ? 'active' : ''}" type="button" data-browser-emulation-mode aria-label="${active.emulationMode === 'mobile' ? 'Switch to desktop mode' : 'Switch to mobile mode'}" aria-pressed="${active.emulationMode === 'mobile'}" title="${active.emulationMode === 'mobile' ? 'Mobile mode' : 'Desktop mode'}">${fileActionIcon(active.emulationMode === 'mobile' ? 'mobile' : 'desktop')}</button>
            <button class="file-command-button" type="button" data-browser-audio-toggle aria-label="Enable browser audio" aria-pressed="false" title="Audio unavailable while checking stream" disabled>${fileActionIcon('volume-off')}</button>
            <button class="file-command-button" type="button" data-browser-external aria-label="Open in new tab" title="Open in new tab" ${active.url ? '' : 'disabled'}>${fileActionIcon('external')}</button>
          </div>
        </form>
        <div class="browser-find-bar" data-browser-find-bar hidden>
          <input type="search" data-browser-find-input placeholder="Find in page" aria-label="Find in page">
          <span data-browser-find-result aria-live="polite"></span>
          <button type="button" data-browser-find-previous aria-label="Previous match">↑</button>
          <button type="button" data-browser-find-next aria-label="Next match">↓</button>
          <button type="button" data-browser-find-close aria-label="Close find">×</button>
        </div>
        <div class="browser-viewport" data-browser-viewport>
          <canvas class="browser-surface" data-browser-surface aria-hidden="true"></canvas>
          <video class="browser-video" data-browser-video autoplay playsinline muted hidden></video>
          <div class="browser-input-surface" data-browser-input-surface tabindex="0" role="application" aria-label="Remote browser"></div>
          <textarea class="browser-keyboard-capture" data-browser-keyboard aria-label="Browser keyboard input" autocomplete="off" autocapitalize="none" spellcheck="false"></textarea>
          <input type="file" data-browser-file-input hidden>
          <div class="browser-context-menu" data-browser-context-menu role="menu" hidden>
            <button type="button" role="menuitem" data-browser-copy>Copy</button>
            <button type="button" role="menuitem" data-browser-paste>Paste</button>
            <button type="button" role="menuitem" data-browser-select-all>Select all</button>
          </div>
          <div class="browser-status" data-browser-status>${active.url ? 'Connecting…' : 'Enter a website above'}</div>
          <div class="browser-download-status" data-browser-download-status hidden></div>
        </div>
      </div>`;
  }

  const notepadFontOptions = [
    { label: 'Consolas', value: 'Consolas, "Cascadia Mono", monospace' },
    { label: 'Cascadia Mono', value: '"Cascadia Mono", Consolas, monospace' },
    { label: 'Cascadia Code', value: '"Cascadia Code", Consolas, monospace' },
    { label: 'JetBrains Mono', value: '"JetBrains Mono", Consolas, monospace' },
    { label: 'Fira Code', value: '"Fira Code", Consolas, monospace' },
    { label: 'Lucida Console', value: '"Lucida Console", monospace' }
  ];

  // Highlight rules are scanned as a single alternation, so every pattern must use
  // non-capturing groups: the matched group index maps back to the rule's class.
  const notepadLanguages = {
    plain: { label: 'Plain text', extensions: ['txt', 'log'] },
    clike: {
      label: 'C-like',
      extensions: ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'java', 'go', 'rs', 'php', 'swift', 'kt', 'dart', 'scala'],
      line: '//',
      rules: [
        ['comment', '//[^\\n]*'],
        ['comment', '/\\*[\\s\\S]*?(?:\\*/|$)'],
        ['string', '"(?:\\\\.|[^"\\\\\\n])*"'],
        ['string', "'(?:\\\\.|[^'\\\\\\n])*'"],
        ['string', '`(?:\\\\.|[^`\\\\])*`'],
        ['keyword', '\\b(?:abstract|as|async|await|bool|break|byte|case|catch|char|class|const|continue|debugger|default|defer|delete|do|double|else|enum|export|extends|extern|false|final|finally|float|fn|for|foreach|from|func|function|get|goto|if|impl|implements|import|in|instanceof|int|interface|internal|is|let|lock|long|match|mod|module|mut|namespace|new|null|nullptr|of|operator|override|package|private|protected|public|pub|readonly|ref|return|sealed|set|short|sizeof|static|string|struct|super|switch|this|throw|throws|trait|true|try|type|typedef|typeof|union|unsafe|use|using|var|virtual|void|volatile|when|where|while|with|yield)\\b'],
        ['number', '\\b(?:0[xXbBoO][\\da-fA-F_]+|\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b']
      ]
    },
    python: {
      label: 'Python',
      extensions: ['py', 'pyw', 'rb'],
      line: '#',
      rules: [
        ['comment', '#[^\\n]*'],
        ['string', '(?:"""[\\s\\S]*?(?:"""|$)|\'\'\'[\\s\\S]*?(?:\'\'\'|$))'],
        ['string', '"(?:\\\\.|[^"\\\\\\n])*"'],
        ['string', "'(?:\\\\.|[^'\\\\\\n])*'"],
        ['keyword', '\\b(?:and|as|assert|async|await|begin|break|class|continue|def|del|elif|else|end|except|False|finally|for|from|global|if|import|in|is|lambda|module|next|None|nonlocal|not|or|pass|raise|require|return|self|True|try|unless|until|while|with|yield)\\b'],
        ['number', '\\b(?:0[xXbBoO][\\da-fA-F_]+|\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b']
      ]
    },
    shell: {
      label: 'Shell',
      extensions: ['sh', 'bash', 'zsh', 'bashrc', 'profile'],
      line: '#',
      rules: [
        ['comment', '#[^\\n]*'],
        ['string', '"(?:\\\\.|[^"\\\\])*"'],
        ['string', "'[^']*'"],
        ['keyword', '\\b(?:case|do|done|elif|else|esac|export|fi|for|function|if|in|local|readonly|return|select|then|until|while)\\b'],
        ['attr', '\\$(?:\\{[^}]*\\}|[A-Za-z_]\\w*)'],
        ['number', '\\b\\d+\\b']
      ]
    },
    powershell: {
      label: 'PowerShell',
      extensions: ['ps1', 'psm1', 'psd1'],
      line: '#',
      rules: [
        ['comment', '<#[\\s\\S]*?(?:#>|$)'],
        ['comment', '#[^\\n]*'],
        ['string', '"(?:`.|[^"`])*"'],
        ['string', "'[^']*'"],
        ['keyword', '\\b(?:begin|break|catch|continue|do|dynamicparam|else|elseif|end|exit|filter|finally|for|foreach|function|if|in|param|process|return|switch|throw|trap|try|until|while)\\b'],
        ['attr', '\\$(?:\\{[^}]*\\}|[A-Za-z_][\\w:]*)'],
        ['number', '\\b\\d+(?:\\.\\d+)?\\b']
      ]
    },
    sql: {
      label: 'SQL',
      extensions: ['sql'],
      line: '--',
      flags: 'gi',
      rules: [
        ['comment', '--[^\\n]*'],
        ['comment', '/\\*[\\s\\S]*?(?:\\*/|$)'],
        ['string', "'(?:''|[^'])*'"],
        ['keyword', '\\b(?:add|all|alter|and|as|asc|begin|between|by|case|cast|column|commit|constraint|create|cross|delete|desc|distinct|drop|else|end|exists|foreign|from|full|group|having|in|index|inner|insert|into|is|join|key|left|like|limit|not|null|on|or|order|outer|primary|references|right|rollback|select|set|table|then|top|union|unique|update|values|view|when|where|with)\\b'],
        ['number', '\\b\\d+(?:\\.\\d+)?\\b']
      ]
    },
    css: {
      label: 'CSS',
      extensions: ['css', 'scss', 'sass', 'less'],
      line: '//',
      rules: [
        ['comment', '/\\*[\\s\\S]*?(?:\\*/|$)'],
        ['string', '"(?:\\\\.|[^"\\\\\\n])*"'],
        ['string', "'(?:\\\\.|[^'\\\\\\n])*'"],
        ['keyword', '@[\\w-]+'],
        ['attr', '[.#][A-Za-z_][\\w-]*'],
        ['number', '(?:#[\\da-fA-F]{3,8}\\b|\\b\\d+(?:\\.\\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr|ch)?\\b)']
      ]
    },
    markup: {
      label: 'HTML / XML',
      extensions: ['html', 'htm', 'xhtml', 'xml', 'svg', 'vue', 'xaml', 'csproj'],
      block: ['<!--', '-->'],
      rules: [
        ['comment', '<!--[\\s\\S]*?(?:-->|$)'],
        ['tag', '</?[A-Za-z][\\w:.-]*'],
        ['tag', '/?>'],
        ['string', '"[^"]*"'],
        ['string', "'[^']*'"],
        ['attr', '[A-Za-z_:][\\w:.-]*(?=\\s*=)']
      ]
    },
    markdown: {
      label: 'Markdown',
      extensions: ['md', 'markdown'],
      flags: 'gm',
      rules: [
        ['comment', '^(?:>[^\\n]*)'],
        ['string', '(?:```[\\s\\S]*?(?:```|$)|`[^`\\n]+`)'],
        ['keyword', '^#{1,6} [^\\n]*'],
        ['tag', '(?:\\*\\*[^*\\n]+\\*\\*|__[^_\\n]+__)'],
        ['attr', '\\[[^\\]\\n]*\\]\\([^)\\n]*\\)'],
        ['number', '^\\s*(?:[-*+]|\\d+\\.)(?= )']
      ]
    },
    ini: {
      label: 'INI / TOML',
      extensions: ['ini', 'toml', 'cfg', 'conf', 'properties', 'env', 'gitconfig', 'editorconfig'],
      line: '#',
      flags: 'gm',
      rules: [
        ['comment', '(?:#|;)[^\\n]*'],
        ['string', '"[^"\\n]*"'],
        ['string', "'[^'\\n]*'"],
        ['keyword', '^\\s*\\[[^\\]\\n]*\\]'],
        ['attr', '^\\s*[\\w.-]+(?=\\s*=)'],
        ['number', '\\b(?:true|false|\\d+(?:\\.\\d+)?)\\b']
      ]
    },
    yaml: {
      label: 'YAML',
      extensions: ['yml', 'yaml'],
      line: '#',
      flags: 'gm',
      rules: [
        ['comment', '#[^\\n]*'],
        ['string', '(?:"[^"\\n]*"|\'[^\'\\n]*\')'],
        ['attr', '^\\s*(?:- )?[\\w.$-]+(?=\\s*:)'],
        ['keyword', '\\b(?:true|false|null|yes|no|on|off)\\b'],
        ['number', '\\b\\d+(?:\\.\\d+)?\\b']
      ]
    }
  };

  const notepadLanguageByExtension = new Map();
  for (const [id, spec] of Object.entries(notepadLanguages)) {
    for (const extension of spec.extensions || []) notepadLanguageByExtension.set(extension, id);
  }

  // Very large buffers are left unhighlighted so typing never stalls on a repaint.
  const MAX_NOTEPAD_HIGHLIGHT_LENGTH = 400000;
  const MAX_NOTEPAD_MATCHES = 5000;

  function notepadLanguageId(tab, data) {
    if (data?.language) return data.language;
    const name = String(tab?.path || '').split(/[\\/]/).pop() || '';
    const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : name.toLowerCase();
    return notepadLanguageByExtension.get(extension) || 'plain';
  }

  function notepadTokens(text, spec) {
    if (!spec?.rules) return [];
    if (!spec.pattern) {
      spec.pattern = new RegExp(spec.rules.map(([, source]) => `(${source})`).join('|'), spec.flags || 'g');
    }
    const pattern = spec.pattern;
    pattern.lastIndex = 0;
    const tokens = [];
    let match = pattern.exec(text);
    while (match) {
      const index = match.slice(1).findIndex((value) => value !== undefined);
      if (index !== -1 && match[0]) {
        tokens.push({ start: match.index, end: match.index + match[0].length, className: `code-${spec.rules[index][0]}` });
      }
      if (pattern.lastIndex === match.index) pattern.lastIndex += 1;
      match = pattern.exec(text);
    }
    return tokens;
  }

  // Tokens and decorations are both sorted, so the segments between their boundaries
  // can be emitted in one pass instead of re-scanning per character.
  function notepadHighlightHtml(text, spec, decorations = []) {
    const tokens = notepadTokens(text, spec);
    const marks = decorations.slice().sort((a, b) => a.start - b.start);
    const points = new Set([0, text.length]);
    for (const token of tokens) points.add(token.start).add(token.end);
    for (const mark of marks) points.add(mark.start).add(mark.end);
    const cuts = Array.from(points).filter((point) => point >= 0 && point <= text.length).sort((a, b) => a - b);
    let html = '';
    let tokenIndex = 0;
    let markIndex = 0;
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const start = cuts[i];
      while (tokenIndex < tokens.length && tokens[tokenIndex].end <= start) tokenIndex += 1;
      while (markIndex < marks.length && marks[markIndex].end <= start) markIndex += 1;
      const token = tokens[tokenIndex]?.start <= start ? tokens[tokenIndex] : null;
      const mark = marks[markIndex]?.start <= start ? marks[markIndex] : null;
      const className = [token?.className, mark?.className].filter(Boolean).join(' ');
      const body = escapeHtml(text.slice(start, cuts[i + 1]));
      html += className ? `<span class="${className}">${body}</span>` : body;
    }
    // A trailing newline is dropped when a <pre> is rendered, so re-add the row the textarea keeps.
    return `${html}\n`;
  }

  function notepadSearchPattern(options) {
    if (!options.query) return null;
    let source = options.regex ? options.query : options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (options.wholeWord) source = `\\b(?:${source})\\b`;
    try {
      return new RegExp(source, options.matchCase ? 'g' : 'gi');
    } catch (error) {
      return null;
    }
  }

  function notepadMatches(text, options) {
    const pattern = notepadSearchPattern(options);
    if (!pattern) return [];
    const matches = [];
    let match = pattern.exec(text);
    while (match && matches.length < MAX_NOTEPAD_MATCHES) {
      if (match[0]) matches.push({ start: match.index, end: match.index + match[0].length });
      if (pattern.lastIndex === match.index) pattern.lastIndex += 1;
      match = pattern.exec(text);
    }
    return matches;
  }

  const NOTEPAD_BRACKETS = { '(': ')', '[': ']', '{': '}' };

  // Counts nesting outward from the bracket under the caret; `partner` is the character
  // that closes it, searched forwards for an opener and backwards for a closer.
  function notepadBracketPartner(text, index) {
    const char = text[index];
    const forward = Boolean(NOTEPAD_BRACKETS[char]);
    const partner = forward
      ? NOTEPAD_BRACKETS[char]
      : Object.keys(NOTEPAD_BRACKETS).find((key) => NOTEPAD_BRACKETS[key] === char);
    if (!partner) return null;
    const step = forward ? 1 : -1;
    let depth = 0;
    for (let i = index; i >= 0 && i < text.length; i += step) {
      if (text[i] === char) depth += 1;
      else if (text[i] === partner && (depth -= 1) === 0) return i;
    }
    return null;
  }

  function notepadBracketRanges(text, caret) {
    for (const index of [caret, caret - 1]) {
      if (index < 0 || index >= text.length) continue;
      const partner = notepadBracketPartner(text, index);
      if (partner === null) continue;
      return [
        { start: index, end: index + 1, className: 'notepad-bracket' },
        { start: partner, end: partner + 1, className: 'notepad-bracket' }
      ];
    }
    return [];
  }

  const notepadEolLabels = { crlf: 'Windows (CRLF)', lf: 'Unix (LF)', cr: 'Macintosh (CR)' };
  const notepadEncodingLabels = {
    utf8: 'UTF-8', 'utf8-bom': 'UTF-8-BOM', utf16le: 'UTF-16 LE', utf16be: 'UTF-16 BE', latin1: 'ANSI'
  };

  function detectNotepadEol(text) {
    if (/\r\n/.test(text)) return 'crlf';
    if (/\n/.test(text)) return 'lf';
    if (/\r/.test(text)) return 'cr';
    return 'crlf';
  }

  function applyNotepadEol(text, eol) {
    const body = String(text).replace(/\r\n|\r|\n/g, '\n');
    if (eol === 'lf') return body;
    return body.replaceAll('\n', eol === 'cr' ? '\r' : '\r\n');
  }

  function findNotepadTab(tabId) {
    for (const session of state.sessions) {
      for (const tab of session.tabs || []) {
        for (const pane of tab.panes || []) {
          const notepadTab = pane.notepadTabs?.find((candidate) => candidate.id === tabId);
          if (notepadTab) return notepadTab;
        }
      }
    }
    return null;
  }

  const NOTEPAD_WATCH_INTERVAL = 2000;

  function notepadTabData(tabId) {
    if (!state.notepadTabData[tabId]) {
      const tab = findNotepadTab(tabId);
      state.notepadTabData[tabId] = {
        content: tab?.content || '', encoding: tab?.encoding || 'utf8', dirty: false, loadedPath: '', error: '',
        stamp: null, externalChange: false,
        wrap: Boolean(tab?.wrap), indentGuides: Boolean(tab?.indentGuides),
        autosave: Boolean(tab?.autosave), fontFamily: tab?.fontFamily || '',
        eol: tab?.eol || 'crlf', language: tab?.language || '', readOnly: Boolean(tab?.readOnly),
        bookmarks: new Set(),
        find: { query: '', replace: '', matchCase: false, wholeWord: false, regex: false, wrapAround: true, markAll: true }
      };
    }
    return state.notepadTabData[tabId];
  }

  function notepadActiveTab(pane) {
    const tabs = pane.notepadTabs || [];
    return tabs.find((tab) => tab.id === pane.activeNotepadTabId) || tabs[0];
  }

  function lineCount(content) {
    return String(content || '').split(/\r\n|\r|\n/).length;
  }

  function lineNumbers(content) {
    const count = lineCount(content);
    return Array.from({ length: count }, (_, index) => index + 1).join('\n');
  }

  function renderNotepadIndentGuides(content) {
    return String(content || '').split(/\r\n|\r|\n/).map((line) => {
      const spaces = line.match(/^( +)(?=\S)/)?.[1].length || 0;
      const columns = Math.floor(spaces / 4) * 4;
      return `<span class="notepad-indent-guide-line" style="--notepad-guide-columns:${columns}"></span>`;
    }).join('');
  }

  function notepadTabLabel(tab) {
    const pathLabel = String(tab?.path || '').split(/[\\/]/).filter(Boolean).pop();
    return pathLabel || tab?.title || 'Untitled';
  }

  function renderNotepadTabs(pane) {
    const tabs = pane.notepadTabs || [];
    return `
      <div class="notepad-tab-list" role="tablist">
        ${tabs.map((tab) => {
          const data = notepadTabData(tab.id);
          const label = notepadTabLabel(tab);
          return `
          <div class="notepad-tab ${tab.id === pane.activeNotepadTabId ? 'active' : ''}" role="tab" tabindex="0" aria-selected="${tab.id === pane.activeNotepadTabId}" data-notepad-tab="${tab.id}" title="${escapeAttr(tab.path || label)}">
            <span class="notepad-tab-label">${data.dirty ? '<span class="notepad-tab-modified">*</span>' : ''}${escapeHtml(label)}</span>
            <button class="notepad-tab-close" type="button" aria-label="Close ${escapeAttr(label)}" data-notepad-close-tab="${tab.id}">${fileActionIcon('close')}</button>
          </div>`;
        }).join('')}
      </div>
      <button class="notepad-new-tab" type="button" data-notepad-new-tab aria-label="New file" title="New file (Ctrl+N)">${fileActionIcon('add')}</button>`;
  }

  function renderNotepadCommand(command, label, hint = '', checked = null) {
    const role = checked === null ? '' : ` role="menuitemradio" aria-checked="${checked}"`;
    return `<button type="button" data-notepad-command="${command}"${role}><span>${escapeHtml(label)}</span>${hint ? `<kbd>${escapeHtml(hint)}</kbd>` : ''}</button>`;
  }

  const NOTEPAD_MENU_SEPARATOR = '<div class="notepad-menu-separator" role="separator"></div>';

  function renderNotepadEditMenu() {
    return [
      renderNotepadCommand('duplicate-line', 'Duplicate line', 'Ctrl+D'),
      renderNotepadCommand('delete-line', 'Delete line', 'Ctrl+L'),
      renderNotepadCommand('move-line-up', 'Move line up', 'Ctrl+Shift+Up'),
      renderNotepadCommand('move-line-down', 'Move line down', 'Ctrl+Shift+Down'),
      NOTEPAD_MENU_SEPARATOR,
      renderNotepadCommand('upper-case', 'UPPERCASE', 'Ctrl+Shift+U'),
      renderNotepadCommand('lower-case', 'lowercase', 'Ctrl+U'),
      renderNotepadCommand('toggle-comment', 'Toggle comment', 'Ctrl+Q'),
      NOTEPAD_MENU_SEPARATOR,
      renderNotepadCommand('sort-ascending', 'Sort lines ascending'),
      renderNotepadCommand('sort-descending', 'Sort lines descending'),
      renderNotepadCommand('remove-duplicates', 'Remove duplicate lines'),
      NOTEPAD_MENU_SEPARATOR,
      renderNotepadCommand('trim-trailing', 'Trim trailing space'),
      renderNotepadCommand('tabs-to-spaces', 'Tabs to spaces'),
      renderNotepadCommand('spaces-to-tabs', 'Spaces to tabs')
    ].join('');
  }

  function renderNotepadSearchMenu() {
    return `
      <div class="notepad-goto-row">
        <input type="number" min="1" step="1" data-notepad-goto-input placeholder="Line" aria-label="Go to line">
        <button type="button" data-notepad-command="go-to-line">Go</button>
      </div>
      ${NOTEPAD_MENU_SEPARATOR}
      ${renderNotepadCommand('toggle-bookmark', 'Toggle bookmark', 'Ctrl+F2')}
      ${renderNotepadCommand('next-bookmark', 'Next bookmark', 'F2')}
      ${renderNotepadCommand('previous-bookmark', 'Previous bookmark', 'Shift+F2')}
      ${renderNotepadCommand('clear-bookmarks', 'Clear bookmarks')}`;
  }

  function renderNotepadDocumentMenu(data, languageId) {
    return [
      Object.entries(notepadEolLabels)
        .map(([value, label]) => renderNotepadCommand(`eol:${value}`, label, '', data.eol === value))
        .join(''),
      NOTEPAD_MENU_SEPARATOR,
      Object.entries(notepadEncodingLabels)
        .map(([value, label]) => renderNotepadCommand(`encoding:${value}`, label, '', data.encoding === value))
        .join(''),
      NOTEPAD_MENU_SEPARATOR,
      renderNotepadCommand('language:', 'Language: auto', '', !data.language),
      Object.entries(notepadLanguages)
        .map(([id, spec]) => renderNotepadCommand(`language:${id}`, spec.label, '', data.language === id || (!data.language && languageId === id)))
        .join(''),
      NOTEPAD_MENU_SEPARATOR,
      renderNotepadCommand('reload', 'Reload from disk'),
      renderNotepadCommand('toggle-read-only', 'Read only', '', data.readOnly),
      NOTEPAD_MENU_SEPARATOR,
      renderNotepadCommand('close-others', 'Close other tabs'),
      renderNotepadCommand('close-all', 'Close all tabs')
    ].join('');
  }

  function renderNotepadSearchOptions(find) {
    const toggle = (key, label, title) => `<button type="button" class="notepad-search-option" data-notepad-search-option="${key}" aria-pressed="${Boolean(find[key])}" aria-label="${escapeAttr(title)}" title="${escapeAttr(title)}">${label}</button>`;
    return `
      <div class="notepad-search-options" data-notepad-search-options>
        ${toggle('matchCase', 'Aa', 'Match case')}
        ${toggle('wholeWord', 'W', 'Whole word only')}
        ${toggle('regex', '.*', 'Regular expression')}
        ${toggle('wrapAround', '↻', 'Wrap around')}
        ${toggle('markAll', '≡', 'Highlight all matches')}
        <output class="notepad-search-count" data-notepad-search-count>0 of 0</output>
      </div>`;
  }

  function renderNotepadStatusBar(data, languageId) {
    return `
      <div class="notepad-status-bar" data-notepad-status-bar>
        <span data-notepad-status-language>${escapeHtml(notepadLanguages[languageId]?.label || 'Plain text')}</span>
        <span data-notepad-status-length>length: ${data.content.length}  lines: ${lineCount(data.content)}</span>
        <span data-notepad-status-caret>Ln 1, Col 1, Sel 0</span>
        <span data-notepad-status-eol>${escapeHtml(notepadEolLabels[data.eol] || notepadEolLabels.crlf)}</span>
        <span data-notepad-status-encoding>${escapeHtml(notepadEncodingLabels[data.encoding] || 'UTF-8')}</span>
        <span data-notepad-status-mode>${data.readOnly ? 'Read only' : 'INS'}</span>
        <span class="notepad-status-external" data-notepad-status-external>${data.externalChange ? 'Changed on disk' : ''}</span>
      </div>`;
  }

  function renderNotepadPane(pane) {
    const tab = notepadActiveTab(pane);
    const data = notepadTabData(tab.id);
    const fontFamily = data.fontFamily || notepadFontOptions[0].value;
    const languageId = notepadLanguageId(tab, data);
    return `
      <div class="notepad-pane" data-notepad-pane="${pane.id}" data-notepad-active-tab="${tab.id}">
        <div class="notepad-toolbar" data-paged-toolbar>
          ${renderToolbarPageButton('previous')}
          <button class="file-command-button" type="button" data-toolbar-item data-notepad-new aria-label="New file" title="New file (Ctrl+N)">${fileActionIcon('add')}</button>
          <button class="file-command-button" type="button" data-toolbar-item data-notepad-save aria-label="Save" title="Save (Ctrl+S)">${fileActionIcon('save')}</button>
          <button class="file-command-button" type="button" data-toolbar-item data-notepad-command="undo" aria-label="Undo" title="Undo (Ctrl+Z)">${fileActionIcon('undo')}</button>
          <button class="file-command-button" type="button" data-toolbar-item data-notepad-command="redo" aria-label="Redo" title="Redo (Ctrl+Y)">${fileActionIcon('redo')}</button>
          <div class="notepad-popover-control" data-toolbar-item>
            <button class="file-command-button" type="button" data-notepad-font-toggle aria-label="Font" aria-expanded="false" title="Font">${fileActionIcon('font')}</button>
            <div class="notepad-popover notepad-font-popover" data-notepad-font-popover role="dialog" aria-label="Choose font" hidden>
              ${notepadFontOptions.map((option) => `<button type="button" data-notepad-font="${escapeAttr(option.value)}" aria-pressed="${option.value === fontFamily}">${escapeHtml(option.label)}</button>`).join('')}
            </div>
          </div>
          <div class="notepad-popover-control" data-toolbar-item>
            <button class="file-command-button notepad-font-size-toggle" type="button" data-notepad-font-size-toggle aria-label="Font size" aria-expanded="false" title="Font size (Ctrl+scroll or Ctrl+/-)"><span class="notepad-font-size-value" data-notepad-font-size-value>${paneFontSize(pane)}</span></button>
            <div class="notepad-popover notepad-font-size-popover" data-notepad-font-size-popover role="dialog" aria-label="Font size" hidden>
              <button type="button" data-notepad-font-size-out aria-label="Decrease font size">−</button>
              <output data-notepad-font-size-output>${paneFontSize(pane)}</output>
              <button type="button" data-notepad-font-size-in aria-label="Increase font size">+</button>
              <button type="button" data-notepad-font-size-reset aria-label="Reset font size" title="Reset font size">${fileActionIcon('reset')}</button>
            </div>
          </div>
          <button class="file-command-button" type="button" data-toolbar-item data-notepad-cut aria-label="Cut" title="Cut (Ctrl+X)">${fileActionIcon('cut')}</button>
          <button class="file-command-button" type="button" data-toolbar-item data-notepad-copy aria-label="Copy" title="Copy (Ctrl+C)">${fileActionIcon('copy')}</button>
          <button class="file-command-button" type="button" data-toolbar-item data-notepad-paste aria-label="Paste" title="Paste (Ctrl+V)">${fileActionIcon('paste')}</button>
          <div class="notepad-popover-control notepad-find-control" data-toolbar-item>
            <button class="file-command-button" type="button" data-notepad-find aria-label="Find" aria-expanded="false" title="Find (Ctrl+F)">${fileActionIcon('search')}</button>
            <div class="notepad-popover notepad-find-popover" data-notepad-find-popover role="dialog" aria-label="Find" hidden>
              <div class="notepad-popover-header" data-notepad-popover-drag>
                <span class="notepad-popover-title">Find</span>
                <button type="button" class="notepad-popover-close" data-notepad-popover-close aria-label="Close find">×</button>
              </div>
              <input type="text" data-notepad-find-input placeholder="Find" aria-label="Find" value="${escapeAttr(data.find.query)}">
              <button class="notepad-input-clear" type="button" data-notepad-find-clear aria-label="Clear find" title="Clear find">×</button>
              <button type="button" data-notepad-find-prev aria-label="Previous match" title="Previous match">${fileActionIcon('browser-back')}</button>
              <button type="button" data-notepad-find-next aria-label="Next match" title="Next match">${fileActionIcon('browser-forward')}</button>
              ${renderNotepadSearchOptions(data.find)}
            </div>
          </div>
          <div class="notepad-popover-control notepad-replace-control" data-toolbar-item>
            <button class="file-command-button" type="button" data-notepad-replace aria-label="Replace" aria-expanded="false" title="Replace (Ctrl+H)">${fileActionIcon('replace')}</button>
            <div class="notepad-popover notepad-replace-popover" data-notepad-replace-popover role="dialog" aria-label="Replace" hidden>
              <div class="notepad-popover-header" data-notepad-popover-drag>
                <span class="notepad-popover-title">Replace</span>
                <button type="button" class="notepad-popover-close" data-notepad-popover-close aria-label="Close replace">×</button>
              </div>
              <input type="text" data-notepad-replace-find-input placeholder="Find" aria-label="Find" value="${escapeAttr(data.find.query)}">
              <button class="notepad-input-clear" type="button" data-notepad-find-clear aria-label="Clear find" title="Clear find">×</button>
              <button type="button" data-notepad-replace-prev aria-label="Previous match" title="Previous match">${fileActionIcon('browser-back')}</button>
              <button type="button" data-notepad-replace-next aria-label="Next match" title="Next match">${fileActionIcon('browser-forward')}</button>
              <input type="text" data-notepad-replace-input placeholder="Replace" aria-label="Replace" value="${escapeAttr(data.find.replace)}">
              <button type="button" data-notepad-replace-one aria-label="Replace" title="Replace">${fileActionIcon('replace')}</button>
              <button type="button" data-notepad-replace-all aria-label="Replace all" title="Replace all (Ctrl+Alt+Enter)">${fileActionIcon('replace-all')}</button>
              ${renderNotepadSearchOptions(data.find)}
            </div>
          </div>
          <div class="notepad-popover-control" data-toolbar-item>
            <button class="file-command-button" type="button" data-notepad-edit-menu-toggle aria-label="Edit commands" aria-expanded="false" title="Edit commands">${fileActionIcon('rename')}</button>
            <div class="notepad-popover notepad-menu" data-notepad-edit-menu role="menu" aria-label="Edit commands" hidden>${renderNotepadEditMenu()}</div>
          </div>
          <div class="notepad-popover-control" data-toolbar-item>
            <button class="file-command-button" type="button" data-notepad-search-menu-toggle aria-label="Go to line and bookmarks" aria-expanded="false" title="Go to line and bookmarks (Ctrl+G)">${fileActionIcon('bookmark')}</button>
            <div class="notepad-popover notepad-menu" data-notepad-search-menu role="menu" aria-label="Go to line and bookmarks" hidden>${renderNotepadSearchMenu()}</div>
          </div>
          <div class="notepad-popover-control" data-toolbar-item>
            <button class="file-command-button" type="button" data-notepad-document-menu-toggle aria-label="Document" aria-expanded="false" title="Line endings, encoding, and language">${fileActionIcon('file')}</button>
            <div class="notepad-popover notepad-menu" data-notepad-document-menu role="menu" aria-label="Document" hidden>${renderNotepadDocumentMenu(data, languageId)}</div>
          </div>
          <button class="file-command-button ${data.wrap ? 'active' : ''}" type="button" data-toolbar-item data-notepad-wrap aria-label="Word wrap" aria-pressed="${data.wrap}" title="Word wrap">${fileActionIcon('wrap')}</button>
          <button class="file-command-button ${data.indentGuides ? 'active' : ''}" type="button" data-toolbar-item data-notepad-indent aria-label="Indent guides" aria-pressed="${data.indentGuides}" title="Indent guides">${fileActionIcon('indent')}</button>
          <button class="file-command-button ${data.autosave ? 'active' : ''}" type="button" data-toolbar-item data-notepad-autosave aria-label="Auto save" aria-pressed="${data.autosave}" title="Auto save">${fileActionIcon('autosave')}</button>
          <span class="notepad-status" data-notepad-status>${escapeHtml(data.error)}</span>
          ${renderToolbarPageButton('next')}
        </div>
        <div class="notepad-editor-shell ${data.wrap ? 'wrap-on' : ''} ${data.indentGuides ? 'indent-guides-on' : ''}">
          <pre class="notepad-gutter" aria-hidden="true" style="font-family: ${escapeAttr(fontFamily)};">${lineNumbers(data.content)}</pre>
          <div class="notepad-editor-stage">
            <div class="notepad-current-line" data-notepad-current-line aria-hidden="true"></div>
            <div class="notepad-indent-guides" aria-hidden="true" style="font-family: ${escapeAttr(fontFamily)};">${renderNotepadIndentGuides(data.content)}</div>
            <pre class="notepad-highlight" aria-hidden="true" style="font-family: ${escapeAttr(fontFamily)};"><code data-notepad-highlight></code></pre>
            <div class="notepad-wrap-measure" aria-hidden="true"></div>
            <textarea class="notepad-editor" aria-label="Text editor" spellcheck="false" wrap="${data.wrap ? 'soft' : 'off'}" ${data.readOnly ? 'readonly' : ''} style="font-family: ${escapeAttr(fontFamily)};">${escapeHtml(data.content)}</textarea>
          </div>
        </div>
        ${renderNotepadStatusBar(data, languageId)}
      </div>`;
  }

  const MIN_IMAGE_SCALE = 0.05;
  const MAX_IMAGE_SCALE = 16;
  const IMAGE_STAGE_PADDING = 16;

  function imagePaneData(paneId) {
    if (!state.imagePaneData[paneId]) {
      state.imagePaneData[paneId] = {
        entries: [],
        loadedPath: '',
        naturalWidth: 0,
        naturalHeight: 0,
        scale: 1,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        fitted: true,
        error: ''
      };
    }
    return state.imagePaneData[paneId];
  }

  function imageFileName(path) {
    return String(path || '').split(/[\\/]/).pop() || '';
  }

  function imageSourceUrl(path) {
    const token = state.token ? `&token=${encodeURIComponent(state.token)}` : '';
    return `/api/files/image?path=${encodeURIComponent(path)}${token}`;
  }

  function renderImagePane(pane) {
    const data = imagePaneData(pane.id);
    const name = imageFileName(pane.path);
    return `
      <div class="image-pane" data-image-pane="${pane.id}">
        <div class="image-toolbar" data-paged-toolbar>
          ${renderToolbarPageButton('previous')}
          <button class="file-command-button" type="button" data-toolbar-item data-image-open aria-label="Open image" title="Open image (O)">${fileActionIcon('folder')}</button>
          <button class="file-command-button" type="button" data-toolbar-item data-image-step="-1" aria-label="Previous image" title="Previous image (Left arrow)">${fileActionIcon('browser-back')}</button>
          <button class="file-command-button" type="button" data-toolbar-item data-image-step="1" aria-label="Next image" title="Next image (Right arrow)">${fileActionIcon('browser-forward')}</button>
          <button class="file-command-button" type="button" data-toolbar-item data-image-zoom="out" aria-label="Zoom out" title="Zoom out (Ctrl+-)">${fileActionIcon('zoom')}</button>
          <span class="image-zoom-value" data-toolbar-item data-image-zoom-value>100%</span>
          <button class="file-command-button" type="button" data-toolbar-item data-image-zoom="in" aria-label="Zoom in" title="Zoom in (Ctrl++)">${fileActionIcon('zoom-in')}</button>
          <button class="file-command-button" type="button" data-toolbar-item data-image-fit aria-label="Fit to pane" title="Fit to pane (0)">${fileActionIcon('fit')}</button>
          <button class="file-command-button image-actual-size" type="button" data-toolbar-item data-image-actual aria-label="Actual size" title="Actual size (1)">1:1</button>
          <button class="file-command-button" type="button" data-toolbar-item data-image-rotate="-90" aria-label="Rotate left" title="Rotate left (Ctrl+Left)">${fileActionIcon('rotate-left')}</button>
          <button class="file-command-button" type="button" data-toolbar-item data-image-rotate="90" aria-label="Rotate right" title="Rotate right (Ctrl+Right)">${fileActionIcon('rotate-right')}</button>
          <button class="file-command-button" type="button" data-toolbar-item data-image-download aria-label="Download image" title="Download image">${fileActionIcon('download')}</button>
          <button class="file-command-button" type="button" data-toolbar-item data-image-delete aria-label="Delete image" title="Delete image (Delete)">${fileActionIcon('delete')}</button>
          <span class="image-status" data-image-status>${escapeHtml(data.error)}</span>
          ${renderToolbarPageButton('next')}
        </div>
        <div class="image-stage" data-image-stage tabindex="0" role="group" aria-label="Image viewer">
          <img class="image-canvas" data-image-canvas alt="${escapeAttr(name)}" draggable="false" hidden>
          <div class="image-empty" data-image-empty>
            <p data-image-empty-text>No image selected.</p>
            <button type="button" class="primary" data-image-open>Open image…</button>
          </div>
        </div>
        <div class="image-status-bar">
          <span class="image-status-name" data-image-name title="${escapeAttr(pane.path)}">${escapeHtml(name)}</span>
          <span data-image-position></span>
          <span data-image-dimensions></span>
        </div>
      </div>`;
  }

  function imagePaneElement(paneId) {
    return document.querySelector(`[data-image-pane="${paneId}"]`);
  }

  function imageFitScale(paneId) {
    const data = imagePaneData(paneId);
    const stage = imagePaneElement(paneId)?.querySelector('[data-image-stage]');
    if (!stage || !data.naturalWidth || !data.naturalHeight) {
      return 1;
    }
    // A quarter turn swaps which image edge has to fit which stage edge.
    const quarterTurned = Math.abs(data.rotation % 180) === 90;
    const width = quarterTurned ? data.naturalHeight : data.naturalWidth;
    const height = quarterTurned ? data.naturalWidth : data.naturalHeight;
    const stageWidth = Math.max(stage.clientWidth - IMAGE_STAGE_PADDING, 1);
    const stageHeight = Math.max(stage.clientHeight - IMAGE_STAGE_PADDING, 1);
    return Math.min(stageWidth / width, stageHeight / height);
  }

  function applyImageTransform(paneId) {
    const paneElement = imagePaneElement(paneId);
    const data = imagePaneData(paneId);
    if (!paneElement) {
      return;
    }
    if (data.fitted) {
      data.scale = imageFitScale(paneId);
    }
    const image = paneElement.querySelector('[data-image-canvas]');
    if (image) {
      image.style.transform = `translate(${data.offsetX}px, ${data.offsetY}px) scale(${data.scale}) rotate(${data.rotation}deg) translate(-50%, -50%)`;
    }
    const zoomValue = paneElement.querySelector('[data-image-zoom-value]');
    if (zoomValue) {
      zoomValue.textContent = `${Math.round(data.scale * 100)}%`;
    }
  }

  function updateImageStatus(paneId) {
    const paneElement = imagePaneElement(paneId);
    const found = findPaneState(paneId);
    const data = imagePaneData(paneId);
    if (!paneElement || !found) {
      return;
    }
    const path = found.pane.path || '';
    const index = data.entries.findIndex((entry) => samePath(entry, path));
    const status = paneElement.querySelector('[data-image-status]');
    const name = paneElement.querySelector('[data-image-name]');
    const position = paneElement.querySelector('[data-image-position]');
    const dimensions = paneElement.querySelector('[data-image-dimensions]');
    if (status) status.textContent = data.error;
    if (name) {
      name.textContent = imageFileName(path);
      name.title = path;
    }
    if (position) position.textContent = index === -1 ? '' : `${index + 1} / ${data.entries.length}`;
    const paneTitle = document.querySelector(`[data-pane="${paneId}"] [data-image-title]`);
    if (paneTitle) {
      paneTitle.textContent = imageFileName(path) || found.pane.title;
      paneTitle.title = path;
    }
    if (dimensions) {
      dimensions.textContent = data.naturalWidth ? `${data.naturalWidth} × ${data.naturalHeight}` : '';
    }
    paneElement.querySelectorAll('[data-image-step]').forEach((button) => {
      button.disabled = data.entries.length < 2;
    });
    paneElement.querySelectorAll('[data-image-download], [data-image-delete]').forEach((button) => {
      button.disabled = !path;
    });
  }

  function showImage(paneId, path, { resetView = true } = {}) {
    const paneElement = imagePaneElement(paneId);
    const data = imagePaneData(paneId);
    if (!paneElement) {
      return;
    }
    const image = paneElement.querySelector('[data-image-canvas]');
    const empty = paneElement.querySelector('[data-image-empty]');
    const emptyText = paneElement.querySelector('[data-image-empty-text]');
    if (!image) {
      return;
    }
    if (resetView) {
      data.rotation = 0;
      data.offsetX = 0;
      data.offsetY = 0;
      data.fitted = true;
      data.naturalWidth = 0;
      data.naturalHeight = 0;
    }
    data.loadedPath = path || '';
    // The picture stays hidden until it is scaled, so a large file never
    // flashes at full size before the fit is applied.
    image.hidden = true;
    if (empty) {
      empty.hidden = Boolean(path);
    }
    if (emptyText) {
      emptyText.textContent = 'No image selected.';
    }
    if (!path) {
      updateImageStatus(paneId);
      return;
    }
    image.alt = imageFileName(path);
    image.onload = () => {
      data.naturalWidth = image.naturalWidth;
      data.naturalHeight = image.naturalHeight;
      data.error = '';
      applyImageTransform(paneId);
      image.hidden = false;
      updateImageStatus(paneId);
    };
    image.onerror = () => {
      data.error = 'Could not load image.';
      image.hidden = true;
      if (empty) {
        empty.hidden = false;
      }
      if (emptyText) {
        emptyText.textContent = 'Could not load image.';
      }
      updateImageStatus(paneId);
    };
    image.src = imageSourceUrl(path);
    updateImageStatus(paneId);
  }

  async function loadImagePane(pane) {
    const data = imagePaneData(pane.id);
    data.error = '';
    if (!pane.path) {
      data.entries = [];
      showImage(pane.id, '');
      return;
    }
    try {
      const siblings = await api(`/api/files/image-siblings?path=${encodeURIComponent(pane.path)}`);
      data.entries = siblings.entries || [];
    } catch (error) {
      // The image itself may still load even when its folder cannot be listed.
      data.entries = [pane.path];
      data.error = error.message;
    }
    showImage(pane.id, pane.path);
  }

  function mountImagePane(pane) {
    const data = imagePaneData(pane.id);
    if (data.entries.length && samePath(data.loadedPath, pane.path)) {
      // A re-render replaced the <img>, so restore the picture without
      // discarding the zoom and rotation the user already set.
      showImage(pane.id, pane.path, { resetView: false });
      return;
    }
    loadImagePane(pane);
  }

  function setImageScale(paneId, nextScale, origin) {
    const data = imagePaneData(paneId);
    const clamped = Math.min(Math.max(nextScale, MIN_IMAGE_SCALE), MAX_IMAGE_SCALE);
    if (origin) {
      const ratio = clamped / data.scale;
      data.offsetX = origin.x - (origin.x - data.offsetX) * ratio;
      data.offsetY = origin.y - (origin.y - data.offsetY) * ratio;
    }
    data.scale = clamped;
    data.fitted = false;
    applyImageTransform(paneId);
  }

  function zoomImage(paneId, direction, origin) {
    const data = imagePaneData(paneId);
    setImageScale(paneId, data.scale * (direction > 0 ? 1.25 : 1 / 1.25), origin);
  }

  function fitImage(paneId) {
    const data = imagePaneData(paneId);
    data.fitted = true;
    data.offsetX = 0;
    data.offsetY = 0;
    applyImageTransform(paneId);
  }

  function actualSizeImage(paneId) {
    const data = imagePaneData(paneId);
    data.offsetX = 0;
    data.offsetY = 0;
    setImageScale(paneId, 1);
  }

  function rotateImage(paneId, degrees) {
    const data = imagePaneData(paneId);
    data.rotation = (data.rotation + degrees + 360) % 360;
    data.offsetX = 0;
    data.offsetY = 0;
    applyImageTransform(paneId);
  }

  async function setImagePanePath(paneId, path) {
    const found = findPaneState(paneId);
    if (!found) {
      return;
    }
    found.pane.path = path;
    try {
      await api(`/api/panes/${paneId}/image/path`, {
        method: 'PATCH',
        body: JSON.stringify({ path })
      });
    } catch (error) {
      showToast(error.message);
    }
  }

  async function stepImage(paneId, offset) {
    const found = findPaneState(paneId);
    const data = imagePaneData(paneId);
    if (!found || data.entries.length < 2) {
      return;
    }
    const index = data.entries.findIndex((entry) => samePath(entry, found.pane.path));
    const nextPath = data.entries[(index + offset + data.entries.length) % data.entries.length];
    if (!nextPath) {
      return;
    }
    showImage(paneId, nextPath);
    await setImagePanePath(paneId, nextPath);
  }

  async function deleteImage(paneId) {
    const found = findPaneState(paneId);
    const data = imagePaneData(paneId);
    const target = found?.pane.path;
    if (!target) {
      return;
    }
    const confirmed = await confirmDialog('Delete image', `Delete ${imageFileName(target)} permanently? This cannot be undone.`, { danger: true });
    if (!confirmed) {
      return;
    }
    try {
      const { results } = await api('/api/files/delete-bulk', {
        method: 'POST',
        body: JSON.stringify({ paths: [target] })
      });
      if ((results || []).some((item) => !item.ok)) {
        throw new Error('Could not delete the image.');
      }
    } catch (error) {
      data.error = error.message;
      showToast(error.message);
      updateImageStatus(paneId);
      return;
    }
    const index = data.entries.findIndex((entry) => samePath(entry, target));
    data.entries = data.entries.filter((entry) => !samePath(entry, target));
    const nextPath = data.entries[Math.min(Math.max(index, 0), data.entries.length - 1)] || '';
    showImage(paneId, nextPath);
    await setImagePanePath(paneId, nextPath);
    showToast(`${imageFileName(target)} deleted.`, 'success');
  }

  function wireImagePane(root) {
    wirePagedToolbars(root);
    findAll(root, '[data-image-pane]').forEach((paneElement) => wireImagePaneElement(paneElement, paneElement.dataset.imagePane));
  }

  function wireImagePaneElement(paneElement, paneId) {
    const stage = paneElement.querySelector('[data-image-stage]');
    paneElement.querySelectorAll('[data-image-open]').forEach((button) => {
      button.onclick = () => chooseImageForPane(paneId);
    });
    paneElement.querySelectorAll('[data-image-step]').forEach((button) => {
      button.onclick = () => stepImage(paneId, Number(button.dataset.imageStep));
    });
    paneElement.querySelectorAll('[data-image-zoom]').forEach((button) => {
      button.onclick = () => zoomImage(paneId, button.dataset.imageZoom === 'in' ? 1 : -1);
    });
    paneElement.querySelectorAll('[data-image-rotate]').forEach((button) => {
      button.onclick = () => rotateImage(paneId, Number(button.dataset.imageRotate));
    });
    const fitButton = paneElement.querySelector('[data-image-fit]');
    if (fitButton) fitButton.onclick = () => fitImage(paneId);
    const actualButton = paneElement.querySelector('[data-image-actual]');
    if (actualButton) actualButton.onclick = () => actualSizeImage(paneId);
    const downloadButton = paneElement.querySelector('[data-image-download]');
    if (downloadButton) {
      downloadButton.onclick = () => {
        const path = findPaneState(paneId)?.pane.path;
        if (path) downloadFile(path);
      };
    }
    const deleteButton = paneElement.querySelector('[data-image-delete]');
    if (deleteButton) deleteButton.onclick = () => deleteImage(paneId);
    if (!stage) {
      return;
    }
    stage.addEventListener('wheel', (event) => {
      event.preventDefault();
      const bounds = stage.getBoundingClientRect();
      zoomImage(paneId, event.deltaY < 0 ? 1 : -1, {
        x: event.clientX - bounds.left - bounds.width / 2,
        y: event.clientY - bounds.top - bounds.height / 2
      });
    }, { passive: false });
    stage.onpointerdown = (event) => {
      // The empty state's Open button sits inside the stage. Capturing the
      // pointer for panning retargets the pointerup, and with it the click, to
      // the stage, so the button would never fire.
      if (event.button !== 0 || event.target.closest?.('[data-image-open]')) {
        return;
      }
      const data = imagePaneData(paneId);
      const startX = event.clientX - data.offsetX;
      const startY = event.clientY - data.offsetY;
      stage.setPointerCapture(event.pointerId);
      stage.classList.add('panning');
      stage.onpointermove = (move) => {
        data.offsetX = move.clientX - startX;
        data.offsetY = move.clientY - startY;
        data.fitted = false;
        applyImageTransform(paneId);
      };
      const release = () => {
        stage.onpointermove = null;
        stage.onpointerup = null;
        stage.onpointercancel = null;
        stage.classList.remove('panning');
      };
      stage.onpointerup = release;
      stage.onpointercancel = release;
    };
    stage.ondblclick = () => {
      const data = imagePaneData(paneId);
      if (data.fitted) actualSizeImage(paneId);
      else fitImage(paneId);
    };
    stage.onkeydown = (event) => {
      const handlers = {
        ArrowLeft: () => (event.ctrlKey ? rotateImage(paneId, -90) : stepImage(paneId, -1)),
        ArrowRight: () => (event.ctrlKey ? rotateImage(paneId, 90) : stepImage(paneId, 1)),
        '0': () => fitImage(paneId),
        '1': () => actualSizeImage(paneId),
        o: () => chooseImageForPane(paneId),
        Delete: () => deleteImage(paneId)
      };
      const handler = handlers[event.key];
      if (handler) {
        event.preventDefault();
        handler();
      }
    };
    // Fitting depends on the stage size, so a resized pane has to refit.
    stage._imageResizeObserver?.disconnect();
    stage._imageResizeObserver = new ResizeObserver(() => applyImageTransform(paneId));
    stage._imageResizeObserver.observe(stage);
  }

  function mountPaneContent(pane) {
    if ((pane.type || 'terminal') === 'terminal') mountTerminal(pane.id, activePaneTabId(pane));
    else if (pane.type === 'browser') mountRemoteBrowser(pane.id);
    else if (pane.type === 'notepad') {
      const tab = notepadActiveTab(pane);
      loadNotepadTab(pane.id, tab?.id, tab?.path || '');
    }
    else if (pane.type === 'image') mountImagePane(pane);
    else if (pane.type === 'usage') loadUsagePane(pane.id);
    else if (pane.type === 'ai') aiPane.mountPane(pane);
    else if (pane.type === 'plugin') hostPane.mount(pane);
    else {
      loadFilesPane(pane);
    }
  }

  let hostPaneOffsetFrame = 0;
  function refreshHostPaneOffsets() {
    if (hostPaneOffsetFrame) {
      return;
    }
    hostPaneOffsetFrame = window.requestAnimationFrame(() => {
      hostPaneOffsetFrame = 0;
      hostPane.refreshOffsets();
    });
  }

  function render() {
    const session = activeSession();
    const tab = activeTab(session);
    if (!session || !tab) {
      return;
    }
    state.activeSessionId = session.id;
    state.activePaneId = state.activePaneId || tab.activePaneId || tab.panes[0].id;
    state.focusedPaneId = '';
    const sidebarWidth = state.sidebarWidth || Number(state.config.ui?.sidebar_width) || 286;

    applyTheme();
    applyUiTypography();
    disposeTerminals();
    disposeBrowsers();
    hostPane.disposeAll();
    aiPane.disposeAll();
    app.innerHTML = `
      <main class="app ${state.sidebarOpen ? '' : 'sidebar-closed'} ${state.sidebarPinned ? 'sidebar-pinned' : ''} ${isMobileLayout() ? 'mobile-device' : ''} mode-${state.displayMode} density-${state.mobileTerminalDensity}" style="--sidebar-width: ${sidebarWidth}px">
        <aside class="sidebar">
          <nav class="menu-rail" aria-label="Workspace navigation">
            <div class="sidebar-brand-row">
              <button class="rail-button sidebar-brand" data-action="toggle" aria-label="Toggle sidebar" aria-expanded="${state.sidebarOpen}" title="${state.sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}"><span class="rail-brand-mark" aria-hidden="true">${brandIcon()}</span><span class="rail-label">Paneboard</span></button>
              <button class="sidebar-pin" type="button" data-sidebar-pin aria-label="${state.sidebarPinned ? 'Unpin' : 'Pin'} sidebar" aria-pressed="${state.sidebarPinned}" title="${state.sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}"><span class="rail-icon" aria-hidden="true">${fileActionIcon(state.sidebarPinned ? 'pin-off' : 'pin')}</span></button>
            </div>
            ${serverOnWindows() ? `<button class="rail-button" data-action="new-powershell" aria-label="New PowerShell pane" title="New PowerShell pane">
              <span class="rail-icon" aria-hidden="true">${fileActionIcon('terminal')}</span><span class="rail-label">New PowerShell pane</span>
            </button>
            <button class="rail-button" data-action="new-cmd" aria-label="New CMD pane" title="New CMD pane">
              <span class="rail-icon" aria-hidden="true">${fileActionIcon('cmd')}</span><span class="rail-label">New CMD pane</span>
            </button>` : `<button class="rail-button" data-action="new-powershell" aria-label="New terminal pane" title="New terminal pane">
              <span class="rail-icon" aria-hidden="true">${fileActionIcon('terminal')}</span><span class="rail-label">New terminal pane</span>
            </button>`}
            <button class="rail-button" data-action="files" aria-label="New file pane" title="New file pane">
              <span class="rail-icon" aria-hidden="true">${fileActionIcon('file')}</span><span class="rail-label">New file pane</span>
            </button>
            <button class="rail-button" data-action="browser" aria-label="New browser pane" title="New browser pane">
              <span class="rail-icon" aria-hidden="true">${fileActionIcon('browser')}</span><span class="rail-label">New browser pane</span>
            </button>
            <button class="rail-button" data-action="notepad" aria-label="New notepad pane" title="New notepad pane">
              <span class="rail-icon" aria-hidden="true">${fileActionIcon('notepad')}</span><span class="rail-label">New notepad pane</span>
            </button>
            <button class="rail-button" data-action="image" aria-label="New image pane" title="New image pane">
              <span class="rail-icon" aria-hidden="true">${fileActionIcon('image')}</span><span class="rail-label">New image pane</span>
            </button>
            <button class="rail-button" data-action="usage" aria-label="New usage pane" title="New usage pane"><span class="rail-icon" aria-hidden="true">${fileActionIcon('usage')}</span><span class="rail-label">New usage pane</span></button>
            ${state.pluginPanes.map((pluginPane) => {
              const label = pluginPaneLabel(pluginPane);
              const icon = pluginPane.type === 'ai' ? providerIcon(pluginPane.provider) : fileActionIcon(pluginPane.icon || 'external');
              return `<button class="rail-button" data-plugin-pane-id="${escapeAttr(pluginPane.id)}" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}"><span class="rail-icon" aria-hidden="true">${icon}</span><span class="rail-label">${escapeHtml(label)}</span></button>`;
            }).join('')}
          </nav>
          <div class="sidebar-inner">
            <div class="sidebar-divider" aria-hidden="true"></div>
            <div class="session-list" aria-label="Workspace list">
              ${sidebarPaneRows().map(renderSidebarPaneItem).join('')}
            </div>
          </div>
          <footer class="sidebar-footer">
            <button class="rail-button" data-action="settings" aria-label="Settings" title="Settings"><span class="rail-icon">⚙</span><span class="rail-label">Settings</span></button>
            <button class="rail-button" type="button" data-theme-toggle role="switch" aria-checked="${themeMode() === 'dark'}" aria-label="${themeMode() === 'dark' ? 'Dark mode' : 'Light mode'}" title="Switch to ${themeMode() === 'dark' ? 'light' : 'dark'} mode"><span class="rail-icon" aria-hidden="true">${themeMode() === 'dark' ? '☾' : '☀'}</span><span class="rail-label">${themeMode() === 'dark' ? 'Dark mode' : 'Light mode'}</span></button>
          </footer>
          <div class="sidebar-resizer" data-action="resize-sidebar"></div>
        </aside>
        <section class="workspace">
          <div class="desktop-mode-banner" data-desktop-mode-banner role="status" hidden>
            <span class="desktop-mode-banner-text">Panes are cramped on this narrow screen.</span>
            <button type="button" class="primary" data-switch-mobile>Switch to mobile</button>
            <button type="button" class="desktop-mode-banner-dismiss" data-dismiss-banner aria-label="Keep desktop layout" title="Keep desktop layout">×</button>
          </div>
          <div class="pane-grid" data-pane-grid style="${boardStyle()}">
            ${tab.panes.map((pane) => renderPane(pane)).join('')}
            <div class="board-reserve" aria-hidden="true" style="grid-column: ${boardExtent(tab.panes) + BOARD_RESERVE_COLUMNS} / span 1; grid-row: 1 / span 1;"></div>
          </div>
          <header class="tabs">
            <div class="workspace-bar">
              <div class="mobile-actions">
                <button class="mobile-brand" data-action="toggle" aria-label="Toggle sidebar" aria-expanded="${state.sidebarOpen}" title="${state.sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}"><span class="rail-brand-mark" aria-hidden="true">${brandIcon()}</span></button>
              </div>
              <button type="button" class="workspace-nav" data-workspace-nav="-1" aria-label="Scroll workspaces left" title="Scroll workspaces left" disabled>${fileActionIcon('browser-back')}</button>
              <button type="button" class="workspace-nav" data-workspace-nav="1" aria-label="Scroll workspaces right" title="Scroll workspaces right" disabled>${fileActionIcon('browser-forward')}</button>
              <div class="workspace-strip-wrap">
                <div class="workspace-strip" data-workspace-strip>
                  ${state.sessions.map((item) => `
                    <button class="tab ${item.id === session.id ? 'active' : ''}" data-tab-session="${item.id}" data-workspace-drag>
                      <span class="tab-label" data-rename-session="${item.id}">${escapeHtml(item.name)}</span>
                      <span class="tab-close" data-close-session="${item.id}" title="Close workspace">×</span>
                    </button>
                  `).join('')}
                </div>
              </div>
              <button class="tab tab-add" data-action="new-session" title="New workspace" aria-label="New workspace">${fileActionIcon('add')}</button>
            </div>
            <div class="tabs-gap">${state.config.shell.usingFallback ? `<span class="shell-warning">${serverOnWindows() ? 'PowerShell 7 not found' : 'Preferred shell not found'}</span>` : ''}</div>
            <div class="board-hscroll" data-board-hscroll>
              <button type="button" class="board-hscroll-arrow" data-board-scroll-dir="-1" aria-label="Scroll board left" title="Scroll board left">${fileActionIcon('browser-back')}</button>
              <div class="board-hscroll-track" data-board-hscroll-track>
                <div class="board-hscroll-thumb" data-board-hscroll-thumb></div>
              </div>
              <button type="button" class="board-hscroll-arrow" data-board-scroll-dir="1" aria-label="Scroll board right" title="Scroll board right">${fileActionIcon('browser-forward')}</button>
            </div>
          </header>
        </section>
      </main>
    `;

    wireControls();
    ensureActivePaneVisible('auto');
    restoreWorkspaceStripScroll();
    updateDesktopModeBanner();
    for (const pane of tab.panes) {
      mountPaneContent(pane);
    }
  }

  // Workspaces read left to right in their own order and the view never chases
  // the active one, so where the strip sits is the user's business alone. A
  // re-render rebuilds the strip from scratch, which would silently snap it back
  // to the first workspace; carrying the offset across keeps it put.
  function restoreWorkspaceStripScroll() {
    const strip = app.querySelector('[data-workspace-strip]');
    if (!strip) {
      return;
    }
    strip.scrollLeft = state.workspaceStripScroll;
    updateWorkspaceStripOverflow();
  }

  // Ellipses at either end say more workspaces are parked off that side, and
  // the arrows that scroll there stop once nothing is left.
  function updateWorkspaceStripOverflow() {
    const strip = app.querySelector('[data-workspace-strip]');
    if (!strip) {
      return;
    }
    state.workspaceStripScroll = strip.scrollLeft;
    const remaining = strip.scrollWidth - strip.clientWidth - strip.scrollLeft;
    strip.parentElement.classList.toggle('overflow-left', strip.scrollLeft > 1);
    strip.parentElement.classList.toggle('overflow-right', remaining > 1);
    app.querySelector('[data-workspace-nav="-1"]').disabled = strip.scrollLeft <= 1;
    app.querySelector('[data-workspace-nav="1"]').disabled = remaining <= 1;
  }

  // One workspace per press, so a narrow title is never skipped over: scroll to
  // the nearest tab edge that is still off the side being scrolled towards.
  function scrollWorkspaceStrip(direction) {
    const strip = app.querySelector('[data-workspace-strip]');
    if (!strip) {
      return;
    }
    const tabs = [...strip.querySelectorAll('.tab')];
    const edges = direction < 0
      ? tabs.map((tab) => tab.offsetLeft).filter((left) => left < strip.scrollLeft - 1)
      : tabs.map((tab) => tab.offsetLeft).filter((left) => left > strip.scrollLeft + 1);
    const target = direction < 0 ? Math.max(...edges) : Math.min(...edges);
    strip.scrollTo({ left: Number.isFinite(target) ? target : strip.scrollLeft, behavior: 'smooth' });
  }

  const WORKSPACE_DRAG_HOLD_MS = 300;
  const EDGE_SCROLL_PX = 6;

  // Dragging a workspace title to reorder it. A touch has to hold still first,
  // because the same sideways swipe is how the strip is scrolled by hand; a
  // mouse has no such conflict and starts as soon as it has clearly moved.
  function startWorkspaceTabDrag(event) {
    if (event.button > 0 || event.target.closest('[data-close-session], input')) {
      return;
    }
    const tab = event.currentTarget;
    const strip = tab.parentElement;
    let startX = event.clientX;
    let pointerX = event.clientX;
    let anchor = 0;
    let scrolling = 0;
    let dragging = false;
    let hold = 0;

    const begin = () => {
      dragging = true;
      hold = 0;
      cancelClick();
      anchor = strip.scrollLeft;
      tab.classList.add('dragging');
      strip.classList.add('reordering');
      scrolling = requestAnimationFrame(edgeScroll);
    };

    // The strip clips what overflows it, so a tab dragged past either edge would
    // simply vanish. Held inside the visible run it stays under the pointer for
    // as far as it can go, and reordering follows where it is actually drawn.
    const offset = (pointerX) => {
      const min = anchor - tab.offsetLeft;
      const max = anchor + strip.clientWidth - tab.offsetWidth - tab.offsetLeft;
      return Math.max(min, Math.min(max, pointerX - startX));
    };

    // A swap moves the title being passed by a whole width at once. Putting it
    // back where it was and letting its own transform transition carry it over
    // reads as making room; jumping there reads as a glitch.
    const slideAside = (wasAt) => {
      for (const [item, from] of wasAt) {
        const shift = from - item.offsetLeft;
        if (!shift) {
          continue;
        }
        item.style.transition = 'none';
        item.style.transform = `translateX(${shift}px)`;
        requestAnimationFrame(() => {
          item.style.transition = '';
          item.style.transform = '';
        });
      }
    };

    const reorder = (pointerX) => {
      const others = [...strip.querySelectorAll('.tab')].filter((item) => item !== tab);
      const centre = tab.offsetLeft + tab.offsetWidth / 2 + offset(pointerX);
      const before = others.find((item) => centre < item.offsetLeft + item.offsetWidth / 2);
      const settled = tab.offsetLeft;
      if (before === tab.nextElementSibling || (!before && !tab.nextElementSibling)) {
        return;
      }
      const wasAt = new Map(others.map((item) => [item, item.offsetLeft]));
      strip.insertBefore(tab, before || null);
      // Taking the new slot moves the tab by the width of whatever it just
      // passed. The pointer did not move, so its own origin has to travel the
      // same distance, or the tab leaps that far ahead and lands on the next
      // title, and the next, until it fetches up against the far edge.
      startX += tab.offsetLeft - settled;
      slideAside(wasAt);
    };

    // Held past either end, the strip keeps coming at a fixed distance per
    // frame, so how fast it travels owes nothing to how often the pointer
    // happens to report. Driving this from the pointer instead is what sent an
    // earlier version bolting to the far end: a mouse reports dozens of times a
    // second, and each one moved the strip again.
    const edgeScroll = () => {
      scrolling = requestAnimationFrame(edgeScroll);
      const bounds = strip.getBoundingClientRect();
      const past = Math.max(pointerX - bounds.right, 0) - Math.max(bounds.left - pointerX, 0);
      const next = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, anchor + Math.sign(past) * EDGE_SCROLL_PX));
      if (!past || next === anchor) {
        return;
      }
      // Every slot slides under the tab, so the pointer's origin travels with
      // them; otherwise the tab drifts off the edge it is being held against.
      startX -= next - anchor;
      anchor = next;
      strip.scrollLeft = anchor;
      reorder(pointerX);
      tab.style.transform = `translateX(${offset(pointerX)}px)`;
    };

    const onMove = (moveEvent) => {
      pointerX = moveEvent.clientX;
      const travelled = Math.abs(moveEvent.clientX - startX);
      if (!dragging) {
        // A touch that moves before the hold elapses is scrolling, not dragging.
        if (hold && travelled > 6) {
          finish();
          return;
        }
        if (hold || travelled <= 6) {
          return;
        }
        begin();
      }
      // A dragging touch is still a swipe to the strip, which would scroll out
      // from under the tab being dragged. Pinning it holds every slot still, so
      // the tab goes exactly where it is dragged and nowhere on its own.
      strip.scrollLeft = anchor;
      // Reordering first, because taking a new slot changes both the tab's own
      // position and the offset it has to be drawn at. Drawn before that, the
      // tab would spend a frame at the new slot with the old offset still on it.
      reorder(moveEvent.clientX);
      tab.style.transform = `translateX(${offset(moveEvent.clientX)}px)`;
    };

    const finish = () => {
      clearTimeout(hold);
      cancelAnimationFrame(scrolling);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', finish);
      tab.classList.remove('dragging');
      strip.classList.remove('reordering');
      // Including any title still mid-slide, so a drag that ends on top of one
      // does not strand it away from its slot.
      for (const item of strip.querySelectorAll('.tab')) {
        item.style.transition = '';
        item.style.transform = '';
      }
    };

    const onUp = async () => {
      const moved = dragging;
      const index = [...strip.querySelectorAll('.tab')].indexOf(tab);
      finish();
      if (!moved) {
        return;
      }
      // The pointer that finished a drag must not also select the workspace.
      state.suppressSessionClickUntil = Date.now() + 300;
      await api(`/api/sessions/${tab.dataset.tabSession}/move`, {
        method: 'POST',
        body: JSON.stringify({ index })
      });
      await loadState();
    };

    // On the window, not the tab: reordering re-inserts the tab into the strip,
    // which drops any pointer capture it held and cancels the drag mid-flight.
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', finish);
    if (event.pointerType === 'touch') {
      hold = setTimeout(begin, WORKSPACE_DRAG_HOLD_MS);
    }
  }

  // Picking up one of a pane's own tabs: it lifts out of the strip and
  // follows the pointer freely (both axes), leaving a placeholder behind to
  // mark where it would land. Hovering the origin pane reorders the
  // placeholder in place; hovering a different pane of the same kind offers
  // a hand-over instead. Releasing over neither (outside every pane, or over
  // a pane of a different kind) is not a valid drop, so the tab animates
  // back to the exact slot it started in. tabSelector picks out sibling tabs
  // (".pane-tab", ".browser-tab" or ".notepad-tab"); onDrop(index,
  // targetPaneId) performs the move once a valid drop is confirmed.
  function startPaneTabDrag(event, tabSelector, onDrop) {
    if (event.button > 0) {
      return;
    }
    const tab = event.currentTarget;
    const list = tab.parentElement;
    const originPane = tab.closest('[data-pane]');
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    let pointerX = event.clientX;
    let pointerY = event.clientY;
    let grabOffsetX = 0;
    let grabOffsetY = 0;
    let originRect = null;
    let scrolling = 0;
    let dragging = false;
    let hold = 0;
    let dropPane = null;
    let placeholder = null;
    let target = 'invalid';

    const setDropPane = (pane) => {
      if (dropPane === pane) return;
      dropPane?.classList.remove('pane-tab-drop-target');
      dropPane = pane;
      dropPane?.classList.add('pane-tab-drop-target');
    };

    const begin = () => {
      dragging = true;
      hold = 0;
      cancelClick();
      originRect = tab.getBoundingClientRect();
      grabOffsetX = startClientX - originRect.left;
      grabOffsetY = startClientY - originRect.top;
      placeholder = document.createElement('div');
      placeholder.className = 'pane-tab-placeholder';
      placeholder.style.width = `${originRect.width}px`;
      placeholder.style.height = `${originRect.height}px`;
      list.insertBefore(placeholder, tab);
      tab.style.position = 'fixed';
      tab.style.left = `${originRect.left}px`;
      tab.style.top = `${originRect.top}px`;
      tab.style.width = `${originRect.width}px`;
      tab.style.height = `${originRect.height}px`;
      tab.style.margin = '0';
      tab.style.zIndex = '1000';
      tab.style.pointerEvents = 'none';
      tab.classList.add('dragging');
      list.classList.add('reordering');
      // The tab is fixed-position, but panes are themselves stacking contexts
      // (position + z-index), so it still only paints above whatever its own
      // pane paints above. Without this it can vanish under a higher-stacked
      // pane, like the active one, while floating across the board.
      originPane.classList.add('pane-tab-lifted');
      scrolling = requestAnimationFrame(edgeScroll);
    };

    const moveTabTo = (x, y) => {
      tab.style.left = `${x - grabOffsetX}px`;
      tab.style.top = `${y - grabOffsetY}px`;
    };

    // Slots the placeholder in wherever the pointer's x-position puts it
    // among the origin list's other tabs; the floating tab itself never
    // moves in the DOM, so it always has an exact slot to return to.
    const reorderPlaceholder = (x) => {
      const others = [...list.querySelectorAll(tabSelector)].filter((item) => item !== tab);
      const before = others.find((item) => {
        const rect = item.getBoundingClientRect();
        return x < rect.left + rect.width / 2;
      });
      if (before === placeholder.nextElementSibling || (!before && !placeholder.nextElementSibling)) {
        return;
      }
      list.insertBefore(placeholder, before || null);
    };

    const edgeScroll = () => {
      scrolling = requestAnimationFrame(edgeScroll);
      if (target !== 'same') {
        return;
      }
      const bounds = list.getBoundingClientRect();
      const past = Math.max(pointerX - bounds.right, 0) - Math.max(bounds.left - pointerX, 0);
      if (!past) {
        return;
      }
      const before = list.scrollLeft;
      list.scrollLeft = Math.max(0, Math.min(list.scrollWidth - list.clientWidth, before + Math.sign(past) * EDGE_SCROLL_PX));
      if (list.scrollLeft !== before) {
        reorderPlaceholder(pointerX);
      }
    };

    // A pane only becomes a drop target when the pointer sits over a
    // different pane of the exact same kind; the pane's own data-pane-type
    // is already what the render side uses to decide which tab family (and
    // so which array and route) a pane's tabs belong to. Anywhere else
    // (outside every pane, or over a pane of a different kind) is invalid.
    const classify = (x, y) => {
      const hovered = document.elementFromPoint(x, y)?.closest('[data-pane]');
      if (!hovered) return { kind: 'invalid', pane: null };
      if (hovered === originPane) return { kind: 'same', pane: null };
      if (hovered.dataset.paneType === originPane.dataset.paneType) return { kind: 'other', pane: hovered };
      return { kind: 'invalid', pane: null };
    };

    const onMove = (moveEvent) => {
      pointerX = moveEvent.clientX;
      pointerY = moveEvent.clientY;
      const travelled = Math.hypot(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY);
      if (!dragging) {
        if (hold && travelled > 6) {
          finish();
          return;
        }
        if (hold || travelled <= 6) {
          return;
        }
        begin();
      }
      const { kind, pane } = classify(pointerX, pointerY);
      target = kind;
      setDropPane(kind === 'other' ? pane : null);
      tab.classList.toggle('invalid', kind === 'invalid');
      moveTabTo(pointerX, pointerY);
      // Only the origin pane's own strip reorders live; a hand-over target or
      // an invalid one freezes the placeholder at its last reordered spot.
      if (kind === 'same') {
        reorderPlaceholder(pointerX);
      }
    };

    const cleanup = () => {
      tab.style.position = '';
      tab.style.left = '';
      tab.style.top = '';
      tab.style.width = '';
      tab.style.height = '';
      tab.style.margin = '';
      tab.style.zIndex = '';
      tab.style.pointerEvents = '';
      tab.style.transition = '';
      tab.classList.remove('dragging', 'invalid');
      list.classList.remove('reordering');
      originPane.classList.remove('pane-tab-lifted');
      placeholder?.remove();
      placeholder = null;
    };

    // Not a valid drop: slide the floating tab back to the exact spot it was
    // lifted from, then restore it there (it never actually left the DOM).
    const snapBack = () => new Promise((resolve) => {
      const targetLeft = `${originRect.left}px`;
      const targetTop = `${originRect.top}px`;
      if (tab.style.left === targetLeft && tab.style.top === targetTop) {
        cleanup();
        resolve();
        return;
      }
      tab.style.transition = 'left 0.15s ease, top 0.15s ease';
      tab.style.left = targetLeft;
      tab.style.top = targetTop;
      tab.addEventListener('transitionend', () => {
        cleanup();
        resolve();
      }, { once: true });
    });

    const finish = () => {
      clearTimeout(hold);
      cancelAnimationFrame(scrolling);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      setDropPane(null);
    };

    const onUp = async () => {
      const moved = dragging;
      const finalTarget = target;
      const targetPane = dropPane;
      const index = placeholder ? [...list.querySelectorAll(tabSelector)].indexOf(placeholder) : -1;
      finish();
      if (!moved) {
        return;
      }
      if (finalTarget === 'invalid') {
        await snapBack();
        return;
      }
      placeholder.replaceWith(tab);
      cleanup();
      // The pointer that finished a drag must not also activate the tab.
      state.suppressPaneTabClickUntil = Date.now() + 300;
      await onDrop(index, finalTarget === 'other' ? targetPane.dataset.pane : '');
    };

    const onCancel = () => {
      const moved = dragging;
      finish();
      if (moved) {
        snapBack();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    if (event.pointerType === 'touch') {
      hold = setTimeout(begin, WORKSPACE_DRAG_HOLD_MS);
    }
  }

  function narrowViewport() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  function updateDesktopModeBanner() {
    const banner = app.querySelector('[data-desktop-mode-banner]');
    if (!banner) {
      return;
    }
    banner.hidden = !(state.displayMode === 'desktop' && narrowViewport() && !state.dismissedDesktopBanner);
  }

  function setDisplayMode(mode, persist = true) {
    state.displayMode = mode;
    if (persist) {
      localStorage.setItem('paneboard.displayMode', mode);
    }
    state.dismissedDesktopBanner = false;
    const appElement = document.querySelector('.app');
    appElement?.classList.remove('mode-auto', 'mode-mobile', 'mode-desktop');
    appElement?.classList.add(`mode-${mode}`);
    updateVisualViewport();
    applyConfigLive();
    updateDesktopModeBanner();
  }

  function setTerminalDensity(density, persist = true) {
    state.mobileTerminalDensity = density;
    if (persist) {
      localStorage.setItem('paneboard.mobileTerminalDensity', density);
    }
    const appElement = document.querySelector('.app');
    appElement?.classList.remove('density-readable', 'density-dense');
    appElement?.classList.add(`density-${density}`);
    applyConfigLive();
  }

  function wireControls() {
    app.querySelectorAll('[data-action="toggle"]').forEach((button) => button.onclick = () => setSidebarOpen(!state.sidebarOpen));
    app.querySelector('[data-sidebar-pin]').onclick = () => setSidebarPinned(!state.sidebarPinned);
    app.querySelectorAll('[data-workspace-nav]').forEach((button) => {
      button.onclick = () => scrollWorkspaceStrip(Number(button.dataset.workspaceNav));
    });
    app.querySelector('[data-workspace-strip]')?.addEventListener('scroll', updateWorkspaceStripOverflow);
    app.querySelectorAll('[data-workspace-drag]').forEach((tab) => {
      tab.onpointerdown = startWorkspaceTabDrag;
    });
    app.querySelectorAll('[data-action="new-session"]').forEach((button) => button.onclick = async () => {
      const session = await api('/api/sessions', { method: 'POST', body: JSON.stringify({}) });
      state.activeSessionId = session.id;
      state.activePaneId = '';
      await loadState();
    });
    app.querySelectorAll('[data-action="new-powershell"]').forEach((button) => button.onclick = () => createPane());
    app.querySelectorAll('[data-action="new-cmd"]').forEach((button) => button.onclick = () => createPane(null, 'cmd'));
    app.querySelectorAll('[data-action="files"]').forEach((button) => button.onclick = openFilesPane);
    app.querySelectorAll('[data-action="browser"]').forEach((button) => button.onclick = openBrowserPane);
    app.querySelectorAll('[data-action="notepad"]').forEach((button) => button.onclick = () => openNotepadPane());
    app.querySelectorAll('[data-action="image"]').forEach((button) => button.onclick = () => openImagePane());
    app.querySelectorAll('[data-action="usage"]').forEach((button) => button.onclick = openUsagePane);
    app.querySelectorAll('[data-plugin-pane-id]').forEach((button) => button.onclick = () => openPluginPane(button.dataset.pluginPaneId));
    app.querySelectorAll('[data-action="settings"]').forEach((button) => button.onclick = openSettings);
    app.querySelector('[data-action="resize-sidebar"]').onpointerdown = startSidebarResize;
    app.querySelector('[data-switch-mobile]')?.addEventListener('click', () => setDisplayMode('mobile'));
    app.querySelector('[data-dismiss-banner]')?.addEventListener('click', () => {
      state.dismissedDesktopBanner = true;
      updateDesktopModeBanner();
    });
    app.querySelector('[data-theme-toggle]').onclick = () => setThemeLive(pairedThemeId(), true);
    app.querySelector('.sidebar').addEventListener('click', closeMobileSidebarAfterAction);
    wireMobileKeybarButtons(app);
    wirePaneGrid(app);
    wireBoardScroll(app);
    app.querySelectorAll('[data-tab-session]').forEach((button) => {
      button.onclick = (event) => {
        if (Date.now() < state.suppressSessionClickUntil) {
          event.preventDefault();
          return;
        }
        scheduleClick(event, async () => {
          state.activeSessionId = button.dataset.tabSession;
          state.activePaneId = '';
          await api(`/api/sessions/${state.activeSessionId}/activate`, { method: 'POST' });
          await loadState();
        });
      };
      button.onauxclick = async (event) => {
        if (event.button !== 1) {
          return;
        }
        event.preventDefault();
        await closeSession(button.dataset.tabSession);
      };
      button.ondblclick = (event) => {
        cancelClick();
        event.stopPropagation();
        const label = button.querySelector('[data-rename-session]');
        if (label) {
          renameSession(button.dataset.tabSession, label.textContent);
        }
      };
      installSessionTabTouchRename(button);
    });
    app.querySelectorAll('[data-close-session]').forEach((button) => {
      button.onclick = async (event) => {
        event.stopPropagation();
        await closeSession(button.dataset.closeSession);
      };
    });
    wirePaneControls(app);
    wirePaneLinks(app);
    wireFilesPane(app);
    wireBrowserPane(app);
    wireNotepadPane(app);
    wireImagePane(app);
    aiPane.wire(app);
    wirePaneTabStrips(app);
    app.querySelectorAll('[data-rename-session]').forEach((label) => {
      label.ondblclick = (event) => {
        cancelClick();
        event.stopPropagation();
        renameSession(label.dataset.renameSession, label.textContent);
      };
    });
  }

  function wireMobileKeybarButtons(root) {
    wirePagedToolbars(root);
    findAll(root, '.mobile-keybar').forEach((keybar) => {
      keybar.querySelectorAll('button').forEach((button) => {
        button.onpointerdown = (event) => event.preventDefault();
      });
    });
    root.querySelectorAll('[data-terminal-action]').forEach((button) => {
      button.onclick = () => sendMobileTerminalKey(button);
    });
    root.querySelectorAll('[data-terminal-action="modifier"]').forEach((button) => {
      // The two clicks of the double-click already ran, so this lands last and
      // leaves the modifier locked whatever state they cycled it through.
      button.ondblclick = () => {
        setKeybarModifierState(button, 'locked');
        paneTerminal(button.closest('[data-pane]')?.dataset.pane)?.term.focus();
      };
    });
  }

  function updatePagedToolbar(toolbar) {
    const items = Array.from(toolbar.children).filter((child) => child.hasAttribute('data-toolbar-item'));
    const previous = toolbar.querySelector('[data-toolbar-page="previous"]');
    const next = toolbar.querySelector('[data-toolbar-page="next"]');
    if (!items.length || !previous || !next || !toolbar.clientWidth) {
      return;
    }
    // Below the file pane's narrow-column breakpoint the toolbar wraps onto a
    // second row (styles.css) instead of paging, so every action stays reachable.
    const filesPane = toolbar.closest('.files-pane');
    if (filesPane && filesPane.clientWidth <= 360) {
      items.forEach((item) => item.hidden = false);
      previous.hidden = true;
      next.hidden = true;
      delete toolbar.dataset.toolbarPageIndex;
      return;
    }
    const fixed = Array.from(toolbar.children).filter((child) => !child.hasAttribute('data-toolbar-item') && !child.hasAttribute('data-toolbar-page'));
    const gap = Number.parseFloat(getComputedStyle(toolbar).gap) || 0;
    items.forEach((item) => item.hidden = false);
    previous.hidden = true;
    next.hidden = true;
    const visibleWithoutPaging = [...items, ...fixed];
    const fullWidth = visibleWithoutPaging.reduce((total, item) => total + item.offsetWidth, 0)
      + Math.max(0, visibleWithoutPaging.length - 1) * gap;
    if (fullWidth <= toolbar.clientWidth) {
      toolbar.dataset.toolbarPageIndex = '0';
      return;
    }
    previous.hidden = false;
    next.hidden = false;
    const fixedWidth = fixed.reduce((total, item) => total + item.offsetWidth, 0);
    const availableWidth = toolbar.clientWidth - previous.offsetWidth - next.offsetWidth
      - fixedWidth - (fixed.length + 2) * gap;
    const pages = [];
    let page = [];
    let usedWidth = 0;
    items.forEach((item) => {
      const itemWidth = item.offsetWidth + (page.length ? gap : 0);
      if (page.length && usedWidth + itemWidth > availableWidth) {
        pages.push(page);
        page = [];
        usedWidth = 0;
      }
      page.push(item);
      usedWidth += item.offsetWidth + (page.length > 1 ? gap : 0);
    });
    if (page.length) {
      pages.push(page);
    }
    const pageIndex = Math.min(Number(toolbar.dataset.toolbarPageIndex) || 0, pages.length - 1);
    toolbar.dataset.toolbarPageIndex = String(pageIndex);
    const visibleItems = new Set(pages[pageIndex]);
    items.forEach((item) => item.hidden = !visibleItems.has(item));
    previous.disabled = pageIndex === 0;
    next.disabled = pageIndex === pages.length - 1;
  }

  function activatePagedToolbarPane(toolbar, event) {
    event.stopPropagation();
    const pane = toolbar.closest('[data-pane]');
    if (pane && pane.dataset.pane !== state.activePaneId) {
      setActivePane(pane.dataset.pane, false);
    }
  }

  function wirePagedToolbars(root) {
    if (!root) {
      return;
    }
    findAll(root, '[data-paged-toolbar]').forEach((toolbar) => {
      const previous = toolbar.querySelector('[data-toolbar-page="previous"]');
      const next = toolbar.querySelector('[data-toolbar-page="next"]');
      previous.onclick = (event) => {
        activatePagedToolbarPane(toolbar, event);
        toolbar.dataset.toolbarPageIndex = String(Math.max(0, (Number(toolbar.dataset.toolbarPageIndex) || 0) - 1));
        updatePagedToolbar(toolbar);
      };
      next.onclick = (event) => {
        activatePagedToolbarPane(toolbar, event);
        toolbar.dataset.toolbarPageIndex = String((Number(toolbar.dataset.toolbarPageIndex) || 0) + 1);
        updatePagedToolbar(toolbar);
      };
      toolbar._pagedToolbarObserver?.disconnect();
      toolbar._pagedToolbarObserver = new ResizeObserver(() => updatePagedToolbar(toolbar));
      toolbar._pagedToolbarObserver.observe(toolbar);
      requestAnimationFrame(() => updatePagedToolbar(toolbar));
    });
  }

  function installKeyboardShortcuts() {
    if (state.shortcutsInstalled) {
      return;
    }
    state.shortcutsInstalled = true;
    document.addEventListener('keydown', async (event) => {
      const key = event.key.toLowerCase();
      if (event.ctrlKey && !event.altKey && !event.metaKey && (key === '+' || key === '=' || key === '-')) {
        event.preventDefault();
        changePaneFontSize(state.activePaneId, key === '-' ? -1 : 1);
        return;
      }
      if (event.target.closest?.('input, textarea, select, .inline-rename')) {
        return;
      }
      if (event.ctrlKey && event.shiftKey && key === 't') {
        event.preventDefault();
        app.querySelector('[data-action="new-session"]')?.click();
      } else if (event.ctrlKey && event.shiftKey && key === 'n') {
        event.preventDefault();
        await createPane();
      } else if (event.ctrlKey && event.shiftKey && key === 'w') {
        event.preventDefault();
        await closePane(state.activePaneId);
      } else if (event.ctrlKey && event.altKey && key === 'arrowright') {
        event.preventDefault();
        switchPaneByOffset(1);
      } else if (event.ctrlKey && event.altKey && key === 'arrowleft') {
        event.preventDefault();
        switchPaneByOffset(-1);
      } else if (event.key === 'F2') {
        event.preventDefault();
        const found = findPaneState(state.activePaneId);
        if (found?.pane.type === 'terminal') {
          renamePaneTab(found.pane.id, activePaneTabId(found.pane));
        } else if (found) {
          renamePane(found.pane.id, found.pane.title);
        }
      }
    });
  }

  // Shared modal behaviour: labelled dialog semantics, Escape to close, focus
  // moved into the panel and trapped there, focus restored to the opener.
  // Returns the disposer the caller must run when it actually closes.
  function wireModal(panel, requestClose, labelledBy) {
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    if (labelledBy) {
      panel.setAttribute('aria-labelledby', labelledBy);
    }
    const opener = document.activeElement;
    const focusable = () => [...panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.offsetWidth || element.offsetHeight);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const items = focusable();
      if (!items.length) {
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    requestAnimationFrame(() => focusable()[0]?.focus());
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (opener?.isConnected) {
        opener.focus();
      }
    };
  }

  function discardOverlay(selector) {
    const existing = document.querySelector(selector);
    if (!existing) {
      return;
    }
    existing._disposeModal?.();
    existing.remove();
  }

  async function openFilesPane() {
    const session = activeSession();
    const tab = activeTab(session);
    const basePaneId = state.activePaneId || tab?.activePaneId || tab?.panes[0]?.id;
    if (!session || !tab || !basePaneId) {
      return;
    }
    try {
      const pane = await api(`/api/panes/${basePaneId}/files`, {
        method: 'POST',
        body: JSON.stringify({ path: '' })
      });
      appendPaneToWorkspace(session, tab, pane);
    } catch (error) {
      showToast(error.message);
    }
  }

  async function openUsagePane() {
    const session = activeSession();
    const tab = activeTab(session);
    const basePaneId = state.activePaneId || tab?.activePaneId || tab?.panes[0]?.id;
    if (!session || !tab || !basePaneId) return;
    try {
      const pane = await api(`/api/panes/${basePaneId}/usage`, { method: 'POST' });
      appendPaneToWorkspace(session, tab, pane);
    } catch (error) {
      showToast(error.message);
    }
  }

  async function openPluginPane(pluginPaneId) {
    const session = activeSession();
    const tab = activeTab(session);
    const basePaneId = state.activePaneId || tab?.activePaneId || tab?.panes[0]?.id;
    if (!session || !tab || !basePaneId) return;
    try {
      const pane = await api(`/api/panes/${basePaneId}/plugin`, {
        method: 'POST',
        body: JSON.stringify({ pluginPaneId })
      });
      appendPaneToWorkspace(session, tab, pane);
    } catch (error) {
      showToast(error.message);
    }
  }

  async function openBrowserPane() {
    const session = activeSession();
    const tab = activeTab(session);
    const basePaneId = state.activePaneId || tab?.activePaneId || tab?.panes[0]?.id;
    if (!session || !tab || !basePaneId) return;
    try {
      const pane = await api(`/api/panes/${basePaneId}/browser`, {
        method: 'POST', body: JSON.stringify({ url: '', emulationMode: isMobileLayout() ? 'mobile' : 'desktop' })
      });
      appendPaneToWorkspace(session, tab, pane);
    } catch (error) {
      showToast(error.message);
    }
  }

  async function openNotepadPane(path = '') {
    const session = activeSession();
    const tab = activeTab(session);
    const basePaneId = state.activePaneId || tab?.activePaneId || tab?.panes[0]?.id;
    if (!session || !tab || !basePaneId) return;
    try {
      const pane = await api(`/api/panes/${basePaneId}/notepad`, {
        method: 'POST', body: JSON.stringify({ path })
      });
      appendPaneToWorkspace(session, tab, pane);
    } catch (error) {
      showToast(error.message);
    }
  }

  async function openImagePane(path = '') {
    const session = activeSession();
    const tab = activeTab(session);
    const basePaneId = state.activePaneId || tab?.activePaneId || tab?.panes[0]?.id;
    if (!session || !tab || !basePaneId) return;
    try {
      const pane = await api(`/api/panes/${basePaneId}/image`, {
        method: 'POST', body: JSON.stringify({ path })
      });
      appendPaneToWorkspace(session, tab, pane);
    } catch (error) {
      showToast(error.message);
    }
  }

  async function setBrowserPaneUrl(paneId, value) {
    const connection = state.browserConnections.get(paneId);
    if (!connection) {
      showToast('Remote browser is still connecting.');
      return;
    }
    connection.send({ type: 'navigate', url: String(value || '').trim() });
  }

  function updateBrowserMenu(paneId) {
    const found = findPaneState(paneId);
    const paneElement = document.querySelector(`[data-browser-pane="${paneId}"]`);
    const menu = paneElement?.querySelector('[data-browser-url-menu]');
    if (found && menu) menu.innerHTML = renderBrowserUrlOptions(found.pane);
    if (paneElement) wireBrowserMenu(paneElement, paneId);
  }

  function updateBrowserTabStrip(paneId) {
    const found = findPaneState(paneId);
    const paneElement = document.querySelector(`[data-pane="${paneId}"]`);
    const strip = paneElement?.querySelector('[data-browser-tab-strip]');
    if (!found || !strip) return;
    strip.innerHTML = renderBrowserTabs(found.pane);
    renderSidebarPaneList();
    wireBrowserTabs(paneElement, paneId);
    wirePaneKindIcon(strip);
    const active = activeBrowserTab(found.pane);
    const input = paneElement.querySelector('[name="url"]');
    const zoom = paneElement.querySelector('[data-browser-zoom-value]');
    const external = paneElement.querySelector('[data-browser-external]');
    const modeButton = paneElement.querySelector('[data-browser-emulation-mode]');
    if (input) input.value = active.url || '';
    if (zoom) zoom.textContent = `${Math.round((active.zoom || 1) * 100)}%`;
    if (external) external.disabled = !active.url;
    if (modeButton) {
      const mobile = active.emulationMode === 'mobile';
      modeButton.classList.toggle('active', mobile);
      modeButton.setAttribute('aria-pressed', String(mobile));
      modeButton.setAttribute('aria-label', mobile ? 'Switch to desktop mode' : 'Switch to mobile mode');
      modeButton.title = mobile ? 'Mobile mode' : 'Desktop mode';
      modeButton.innerHTML = fileActionIcon(mobile ? 'mobile' : 'desktop');
    }
    updateBrowserMenu(paneId);
  }

  async function toggleBrowserBookmark(url, paneId) {
    if (!url) return;
    const bookmarked = (state.config.browser?.bookmarks || []).some((bookmark) => bookmark.url === url);
    try {
      const result = await api('/api/browser/bookmarks', {
        method: bookmarked ? 'DELETE' : 'POST',
        body: JSON.stringify({ url })
      });
      state.config.browser = { ...state.config.browser, bookmarks: result.bookmarks || [] };
      updateBrowserMenu(paneId);
    } catch (error) {
      showToast(error.message);
    }
  }

  function setBrowserZoomPopover(paneId, open) {
    const paneElement = document.querySelector(`[data-browser-pane="${paneId}"]`);
    const popover = paneElement?.querySelector('[data-browser-zoom-popover]');
    const toggle = paneElement?.querySelector('[data-browser-zoom-toggle]');
    if (!popover || !toggle) return;
    popover.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  function showBrowserZoomPopover(paneId) {
    window.clearTimeout(state.browserZoomTimers.get(paneId));
    setBrowserZoomPopover(paneId, true);
    state.browserZoomTimers.set(paneId, window.setTimeout(() => {
      setBrowserZoomPopover(paneId, false);
      state.browserZoomTimers.delete(paneId);
    }, 1000));
  }

  function wireBrowserPane(root) {
    const browserPane = root?.querySelector?.('.browser-pane') || (root?.matches?.('.browser-pane') ? root : null);
    if (!browserPane) return;
    const paneElement = browserPane.closest('[data-pane]') || browserPane;
    const paneId = browserPane.dataset.browserPane;
    const found = findPaneState(paneId);
    if (!found) return;
    const menu = paneElement.querySelector('[data-browser-url-menu]');
    const toggle = paneElement.querySelector('[data-browser-url-toggle]');
    const control = paneElement.querySelector('[data-browser-url-control]');
    const zoomControl = paneElement.querySelector('[data-browser-zoom-control]');
    const zoomToggle = paneElement.querySelector('[data-browser-zoom-toggle]');
    const zoomPopover = paneElement.querySelector('[data-browser-zoom-popover]');
    const setMenuOpen = (open) => {
      if (!menu || !toggle) return;
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle?.addEventListener('click', () => {
      setMenuOpen(menu.hidden);
    });
    control?.addEventListener('focusout', (event) => {
      if (!control.contains(event.relatedTarget)) setMenuOpen(false);
    });
    const setZoomOpen = (open) => {
      window.clearTimeout(state.browserZoomTimers.get(paneId));
      state.browserZoomTimers.delete(paneId);
      setBrowserZoomPopover(paneId, open);
    };
    zoomToggle?.addEventListener('click', () => setZoomOpen(zoomPopover.hidden));
    zoomControl?.addEventListener('focusout', (event) => {
      if (!zoomControl.contains(event.relatedTarget)) setZoomOpen(false);
    });
    zoomControl?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setZoomOpen(false);
        zoomToggle.focus();
      }
    });
    paneElement.querySelector('[data-browser-url-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      setBrowserPaneUrl(paneId, new FormData(event.currentTarget).get('url'));
    });
    wireBrowserMenu(paneElement, paneId, setMenuOpen);
    paneElement.querySelector('[data-browser-refresh]')?.addEventListener('click', () => {
      state.browserConnections.get(paneId)?.send({ type: 'reload' });
    });
    paneElement.querySelector('[data-browser-stop]')?.addEventListener('click', () => {
      state.browserConnections.get(paneId)?.send({ type: 'stop' });
    });
    paneElement.querySelector('[data-browser-find]')?.addEventListener('click', () => showBrowserFind(paneElement));
    paneElement.querySelector('[data-browser-zoom-out]')?.addEventListener('click', () => {
      state.browserConnections.get(paneId)?.send({ type: 'zoom', delta: -0.1 });
    });
    paneElement.querySelector('[data-browser-zoom-in]')?.addEventListener('click', () => {
      state.browserConnections.get(paneId)?.send({ type: 'zoom', delta: 0.1 });
    });
    paneElement.querySelector('[data-browser-zoom-reset]')?.addEventListener('click', () => {
      state.browserConnections.get(paneId)?.send({ type: 'zoom', reset: true });
    });
    paneElement.querySelector('[data-browser-external]')?.addEventListener('click', () => {
      const url = activeBrowserTab(found.pane).url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
    paneElement.querySelector('[data-browser-back]')?.addEventListener('click', () => {
      state.browserConnections.get(paneId)?.send({ type: 'back' });
    });
    paneElement.querySelector('[data-browser-forward]')?.addEventListener('click', () => {
      state.browserConnections.get(paneId)?.send({ type: 'forward' });
    });
    paneElement.querySelector('[data-browser-emulation-mode]')?.addEventListener('click', () => {
      const active = activeBrowserTab(findPaneState(paneId)?.pane || {});
      state.browserConnections.get(paneId)?.send({
        type: 'setEmulationMode',
        emulationMode: active.emulationMode === 'mobile' ? 'desktop' : 'mobile'
      });
    });
    paneElement.querySelector('[data-browser-audio-toggle]')?.addEventListener('click', () => {
      state.browserAudioEnabled = !state.browserAudioEnabled;
      localStorage.setItem('paneboard.browserAudioEnabled', String(state.browserAudioEnabled));
      state.browserConnections.get(paneId)?.setAudio(state.browserAudioEnabled);
    });
    wireBrowserTabs(paneElement, paneId);
    wireBrowserFind(paneElement, paneId);
  }

  function wireBrowserTabs(paneElement, paneId) {
    paneElement.querySelectorAll('[data-browser-tab]').forEach((button) => {
      button.onclick = (event) => {
        if (event.target.closest('[data-browser-close-tab]') || Date.now() < state.suppressPaneTabClickUntil) return;
        state.browserConnections.get(paneId)?.send({ type: 'activateTab', tabId: button.dataset.browserTab });
      };
      button.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          state.browserConnections.get(paneId)?.send({ type: 'activateTab', tabId: button.dataset.browserTab });
        }
      };
      button.onpointerdown = (event) => {
        if (event.target.closest('[data-browser-close-tab]')) return;
        startPaneTabDrag(event, '.browser-tab', (index, targetPaneId) => {
          state.browserConnections.get(paneId)?.send({ type: 'moveTab', tabId: button.dataset.browserTab, index, targetPaneId });
        });
      };
    });
    paneElement.querySelectorAll('[data-browser-close-tab]').forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        state.browserConnections.get(paneId)?.send({ type: 'closeTab', tabId: button.dataset.browserCloseTab });
      };
    });
    paneElement.querySelector('[data-browser-new-tab]')?.addEventListener('click', () => {
      state.browserConnections.get(paneId)?.send({ type: 'newTab', emulationMode: isMobileLayout() ? 'mobile' : 'desktop' });
    });
  }

  function showBrowserFind(paneElement) {
    const bar = paneElement.querySelector('[data-browser-find-bar]');
    if (!bar) return;
    bar.hidden = false;
    const input = bar.querySelector('[data-browser-find-input]');
    input.focus();
    input.select();
  }

  // Focus mode zooms a pane: its painted box grows while its layout box stays
  // put. Viewport pixels therefore have to be divided by this factor before
  // they mean anything inside the pane.
  function paneZoomFactor(element) {
    return element.getBoundingClientRect().width / (element.offsetWidth || 1) || 1;
  }

  // Sized from the layout box, so a zoomed pane scales the remote page up
  // instead of handing it more room. The zoom rides on the scale factor
  // instead, which keeps the stream sharp at its painted size.
  function browserViewportSize(viewport) {
    return {
      width: Math.max(320, Math.min(3840, viewport.offsetWidth || 1280)),
      height: Math.max(240, Math.min(2160, viewport.offsetHeight || 720))
    };
  }

  function browserScaleFactor(viewport) {
    return Math.max(1, Math.min(2, (window.devicePixelRatio || 1) * paneZoomFactor(viewport)));
  }

  function wireBrowserFind(paneElement, paneId) {
    const bar = paneElement.querySelector('[data-browser-find-bar]');
    const input = bar?.querySelector('[data-browser-find-input]');
    const find = (backwards = false) => {
      state.browserConnections.get(paneId)?.send({ type: 'find', query: input.value, backwards });
    };
    input?.addEventListener('input', () => find(false));
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        find(event.shiftKey);
      } else if (event.key === 'Escape') {
        bar.hidden = true;
        paneElement.querySelector('[data-browser-input-surface]')?.focus();
      }
    });
    bar?.querySelector('[data-browser-find-previous]')?.addEventListener('click', () => find(true));
    bar?.querySelector('[data-browser-find-next]')?.addEventListener('click', () => find(false));
    bar?.querySelector('[data-browser-find-close]')?.addEventListener('click', () => { bar.hidden = true; });
  }

  function wireBrowserMenu(paneElement, paneId, closeMenu = () => {}) {
    paneElement.querySelectorAll('[data-browser-url-choice]').forEach((button) => {
      button.onclick = () => {
        closeMenu(false);
        setBrowserPaneUrl(paneId, button.dataset.browserUrlChoice);
      };
    });
    paneElement.querySelectorAll('[data-browser-bookmark]').forEach((button) => {
      button.onclick = () => toggleBrowserBookmark(button.dataset.browserBookmark, paneId);
    });
  }

  function browserKeyCode(event) {
    const known = { Enter: 13, Backspace: 8, Tab: 9, Escape: 27, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, PageUp: 33, PageDown: 34 };
    return known[event.key] || (event.key.length === 1 ? event.key.toUpperCase().charCodeAt(0) : 0);
  }

  function browserModifiers(event) {
    return (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
  }

  function mountRemoteBrowser(paneId) {
    const paneElement = document.querySelector(`[data-browser-pane="${paneId}"]`);
    const canvas = paneElement?.querySelector('[data-browser-surface]');
    const video = paneElement?.querySelector('[data-browser-video]');
    const inputSurface = paneElement?.querySelector('[data-browser-input-surface]');
    const viewport = paneElement?.querySelector('[data-browser-viewport]');
    const keyboard = paneElement?.querySelector('[data-browser-keyboard]');
    const contextMenu = paneElement?.querySelector('[data-browser-context-menu]');
    const status = paneElement?.querySelector('[data-browser-status]');
    const fileInput = paneElement?.querySelector('[data-browser-file-input]');
    if (!paneElement || !canvas || !video || !inputSurface || !viewport || state.browserConnections.has(paneId)) return;
    const context = canvas.getContext('2d', { alpha: false });
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket;
    let disposed = false;
    let reconnectTimer = 0;
    let reconnectDelay = 500;
    let frameNumber = 0;
    let pendingNavigation = '';
    let pendingTabActivation = '';
    let selectedText = '';
    let hasFrame = false;
    let resizeFrame = 0;
    let pointerMoveFrame = 0;
    let pendingPointerMove = null;
    let paneZoomKeydown = null;
    let rtcPeer = null;
    let rtcPeerId = '';
    let streamMode = 'jpeg';
    let remoteViewport = browserViewportSize(viewport);
    let pendingRtcCandidates = [];
    let pendingRtcPeerId = '';
    const activeTouches = new Map();
    const hideContextMenu = () => { if (contextMenu) contextMenu.hidden = true; };
    const closeContextMenu = (event) => {
      if (!contextMenu?.contains(event.target)) hideContextMenu();
    };
    document.addEventListener('pointerdown', closeContextMenu);
    const updateAudio = (enabled = state.browserAudioEnabled) => {
      const button = paneElement.querySelector('[data-browser-audio-toggle]');
      const available = streamMode === 'webrtc' && video.srcObject && video.srcObject.getAudioTracks().length > 0;
      video.muted = !enabled;
      if (!button) return;
      button.disabled = !available;
      button.classList.toggle('active', available && enabled);
      button.setAttribute('aria-pressed', String(available && enabled));
      button.setAttribute('aria-label', available && enabled ? 'Mute browser audio' : 'Enable browser audio');
      button.title = available ? (enabled ? 'Browser audio on' : 'Browser audio off') : 'Audio unavailable in JPEG fallback';
      button.innerHTML = fileActionIcon(available && enabled ? 'volume' : 'volume-off');
      if (available && enabled) video.play().catch(() => {});
    };
    const closeRtcPeer = () => {
      rtcPeer?.close();
      rtcPeer = null;
      rtcPeerId = '';
      pendingRtcCandidates = [];
      pendingRtcPeerId = '';
      if (video.srcObject) {
        video.srcObject = null;
      }
    };
    const connection = {
      send(message) {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
        else if (message.type === 'navigate') pendingNavigation = message.url;
        else if (message.type === 'activateTab') pendingTabActivation = message.tabId;
      },
      setAudio(enabled) {
        updateAudio(enabled);
      },
      // Zooming a pane leaves its layout box alone, so the remote browser only
      // hears about focus mode when something asks for a resize.
      refreshViewport() {
        sendResize();
      },
      dispose() {
        disposed = true;
        clearTimeout(reconnectTimer);
        window.clearTimeout(state.browserZoomTimers.get(paneId));
        state.browserZoomTimers.delete(paneId);
        cancelAnimationFrame(resizeFrame);
        cancelAnimationFrame(pointerMoveFrame);
        document.removeEventListener('pointerdown', closeContextMenu);
        paneElement.removeEventListener('keydown', paneZoomKeydown, true);
        resizeObserver.disconnect();
        closeRtcPeer();
        socket?.close();
      }
    };
    state.browserConnections.set(paneId, connection);

    paneZoomKeydown = (event) => {
      const shortcut = (event.ctrlKey || event.metaKey) ? event.key.toLowerCase() : '';
      const delta = shortcut === '+' || shortcut === '=' ? 0.1 : shortcut === '-' ? -0.1 : 0;
      if (!delta && shortcut !== '0') return;
      event.preventDefault();
      event.stopPropagation();
      connection.send(shortcut === '0' ? { type: 'zoom', reset: true } : { type: 'zoom', delta });
      showBrowserZoomPopover(paneId);
    };
    paneElement.addEventListener('keydown', paneZoomKeydown, true);

    const sendResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const size = browserViewportSize(viewport);
        connection.send({
          type: 'resize',
          width: size.width,
          height: size.height,
          deviceScaleFactor: browserScaleFactor(viewport)
        });
      });
    };
    const resizeObserver = new ResizeObserver(sendResize);
    resizeObserver.observe(viewport);

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(`${protocol}//${location.host}/ws?mode=browser&paneId=${encodeURIComponent(paneId)}&token=${encodeURIComponent(state.token)}`);
      socket.onopen = () => {
        reconnectDelay = 500;
        status.textContent = 'Loading…';
        const size = browserViewportSize(viewport);
        connection.send({ type: 'theme', backgroundColor: activeTheme().terminalBg });
        connection.send({
          type: 'clientCapabilities',
          webrtc: typeof RTCPeerConnection === 'function',
          deviceMode: isMobileLayout() ? 'mobile' : 'desktop',
          width: size.width,
          height: size.height,
          deviceScaleFactor: browserScaleFactor(viewport)
        });
        if (pendingNavigation) {
          connection.send({ type: 'navigate', url: pendingNavigation });
          pendingNavigation = '';
        }
        if (pendingTabActivation) {
          connection.send({ type: 'activateTab', tabId: pendingTabActivation });
          pendingTabActivation = '';
        }
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'frame') {
          remoteViewport = {
            width: Number(message.viewportWidth) || remoteViewport.width,
            height: Number(message.viewportHeight) || remoteViewport.height
          };
          const currentFrame = ++frameNumber;
          const image = new Image();
          image.onload = () => {
            if (disposed || currentFrame !== frameNumber) return;
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            context.drawImage(image, 0, 0);
            hasFrame = true;
            status.hidden = true;
            if (streamMode !== 'webrtc') {
              canvas.hidden = false;
              video.hidden = true;
            }
          };
          image.src = `data:image/jpeg;base64,${message.data}`;
        } else if (message.type === 'webrtcOffer') {
          const queuedCandidates = pendingRtcPeerId === message.peerId ? pendingRtcCandidates.slice() : [];
          closeRtcPeer();
          rtcPeerId = message.peerId;
          pendingRtcPeerId = message.peerId;
          pendingRtcCandidates = queuedCandidates;
          remoteViewport = {
            width: Number(message.viewportWidth) || remoteViewport.width,
            height: Number(message.viewportHeight) || remoteViewport.height
          };
          rtcPeer = new RTCPeerConnection({ iceServers: [] });
          rtcPeer.onicecandidate = (candidateEvent) => {
            if (candidateEvent.candidate) connection.send({
              type: 'rtcIceCandidate', peerId: rtcPeerId, candidate: candidateEvent.candidate
            });
          };
          rtcPeer.ontrack = (trackEvent) => {
            const stream = trackEvent.streams[0] || new MediaStream([trackEvent.track]);
            if (video.srcObject !== stream) video.srcObject = stream;
            video.hidden = false;
            canvas.hidden = true;
            video.play().catch(() => {});
            updateAudio();
          };
          rtcPeer.setRemoteDescription(message.description).then(async () => {
            for (const candidate of pendingRtcCandidates.splice(0)) await rtcPeer.addIceCandidate(candidate);
            const answer = await rtcPeer.createAnswer();
            await rtcPeer.setLocalDescription(answer);
            connection.send({ type: 'rtcAnswer', peerId: rtcPeerId, description: rtcPeer.localDescription });
          }).catch(() => {});
        } else if (message.type === 'webrtcIceCandidate') {
          if (!message.candidate || (rtcPeerId && message.peerId !== rtcPeerId)) return;
          if (!rtcPeerId) pendingRtcPeerId = message.peerId;
          if (rtcPeer?.remoteDescription) rtcPeer.addIceCandidate(message.candidate).catch(() => {});
          else pendingRtcCandidates.push(message.candidate);
        } else if (message.type === 'streamMode') {
          streamMode = message.mode;
          paneElement.dataset.streamMode = streamMode;
          if (streamMode === 'webrtc') {
            video.hidden = false;
            canvas.hidden = true;
            status.hidden = true;
          } else if (streamMode === 'jpeg') {
            closeRtcPeer();
            video.hidden = true;
            canvas.hidden = false;
            if (message.reason && message.reason !== 'Checking WebRTC support.') {
              status.title = message.reason;
            }
          }
          updateAudio();
        } else if (message.type === 'viewportOwner') {
          paneElement.dataset.viewportOwner = message.mine ? 'true' : 'false';
        } else if (message.type === 'navigation') {
          const found = findPaneState(paneId);
          if (found) {
            const tab = found.pane.browserTabs?.find((candidate) => candidate.id === message.tabId);
            if (tab) tab.url = message.url;
            if (found.pane.activeBrowserTabId === message.tabId) found.pane.url = message.url;
          }
          state.config.browser = { ...state.config.browser, history: message.history || [] };
          const input = paneElement.querySelector('[name="url"]');
          if (input) input.value = message.url;
          updateBrowserMenu(paneId);
        } else if (message.type === 'status') {
          const loading = message.state === 'loading';
          paneElement.classList.toggle('browser-loading', loading);
          paneElement.querySelector('[data-browser-refresh]').hidden = loading;
          paneElement.querySelector('[data-browser-stop]').hidden = !loading;
          status.hidden = hasFrame || loading;
          status.textContent = loading ? 'Loading…' : 'Connected';
        } else if (message.type === 'error') {
          status.hidden = false;
          status.textContent = message.message;
        } else if (message.type === 'selection') {
          selectedText = message.text || '';
        } else if (message.type === 'keyboardFocus') {
          if (!isMobileLayout()) return;
          if (message.visible) keyboard.focus({ preventScroll: true });
          else keyboard.blur();
        } else if (message.type === 'copy') {
          selectedText = message.text || '';
          copyBrowserText(selectedText);
        } else if (message.type === 'tabs') {
          const found = findPaneState(paneId);
          if (found) {
            found.pane.browserTabs = message.tabs || [];
            found.pane.activeBrowserTabId = message.activeTabId;
            found.pane.url = activeBrowserTab(found.pane).url || '';
            updateBrowserTabStrip(paneId);
            sendResize();
          }
        } else if (message.type === 'findResult') {
          const result = paneElement.querySelector('[data-browser-find-result]');
          if (result) result.textContent = message.empty ? '' : message.found ? 'Match' : 'No match';
        } else if (message.type === 'dialog') {
          handleBrowserDialog(connection, message);
        } else if (message.type === 'fileChooser') {
          fileInput.multiple = Boolean(message.multiple);
          fileInput.dataset.tabId = message.tabId;
          fileInput.dataset.nodeId = message.nodeId;
          fileInput.value = '';
          fileInput.click();
        } else if (message.type === 'download') {
          updateBrowserDownload(paneElement, message.download);
        }
      };
      socket.onclose = (event) => {
        if (disposed) return;
        closeRtcPeer();
        streamMode = 'jpeg';
        updateAudio();
        if (event.code === 1008 && event.reason === 'Login required') {
          clearToken();
          renderLogin();
          return;
        }
        status.hidden = false;
        status.textContent = 'Reconnecting…';
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      };
    };

    const pointerPosition = (event) => {
      const rect = inputSurface.getBoundingClientRect();
      const contentWidth = Math.max(1, remoteViewport.width);
      const contentHeight = Math.max(1, remoteViewport.height);
      return {
        x: Math.max(0, Math.min(contentWidth, (event.clientX - rect.left) / Math.max(1, rect.width) * contentWidth)),
        y: Math.max(0, Math.min(contentHeight, (event.clientY - rect.top) / Math.max(1, rect.height) * contentHeight))
      };
    };
    const sendMouse = (eventName, event, extra = {}) => {
      const point = pointerPosition(event);
      connection.send({ type: 'mouse', event: eventName, ...point, modifiers: browserModifiers(event), ...extra });
    };
    // Also called directly before a press, release or wheel, so a queued move can
    // never arrive after the event that followed it.
    const flushPointerMove = () => {
      cancelAnimationFrame(pointerMoveFrame);
      pointerMoveFrame = 0;
      const event = pendingPointerMove;
      pendingPointerMove = null;
      if (event) sendMouse('mouseMoved', event, { button: event.buttons & 1 ? 'left' : 'none', buttons: event.buttons });
    };
    const touchPoints = () => [...activeTouches.values()];
    const updateTouch = (event) => {
      const point = pointerPosition(event);
      activeTouches.set(event.pointerId, {
        id: event.pointerId,
        ...point,
        radiusX: Math.max(1, event.width / 2),
        radiusY: Math.max(1, event.height / 2),
        force: event.pressure || .5
      });
    };
    inputSurface.onpointerdown = (event) => {
      event.preventDefault();
      hideContextMenu();
      inputSurface.setPointerCapture(event.pointerId);
      inputSurface.focus({ preventScroll: true });
      if (event.button === 2) return;
      if (event.pointerType === 'touch') {
        updateTouch(event);
        connection.send({ type: 'touch', event: 'touchStart', touchPoints: touchPoints(), modifiers: browserModifiers(event) });
        return;
      }
      flushPointerMove();
      sendMouse('mousePressed', event, { button: event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left', buttons: event.buttons, clickCount: event.detail || 1 });
    };
    inputSurface.onpointermove = (event) => {
      if (event.pointerType === 'touch') {
        if (!activeTouches.has(event.pointerId)) return;
        updateTouch(event);
        connection.send({ type: 'touch', event: 'touchMove', touchPoints: touchPoints(), modifiers: browserModifiers(event) });
        return;
      }
      // One move per frame: a 125Hz pointer otherwise sends moves faster than the
      // remote page consumes them, and the user ends up waiting on the backlog.
      pendingPointerMove = event;
      if (!pointerMoveFrame) pointerMoveFrame = requestAnimationFrame(flushPointerMove);
    };
    inputSurface.onpointerup = (event) => {
      if (event.pointerType === 'touch') {
        activeTouches.delete(event.pointerId);
        connection.send({ type: 'touch', event: 'touchEnd', touchPoints: touchPoints(), modifiers: browserModifiers(event) });
        if (isMobileLayout()) connection.send({ type: 'keyboardFocus' });
        return;
      }
      if (event.button !== 2) {
        flushPointerMove();
        sendMouse('mouseReleased', event, { button: event.button === 1 ? 'middle' : 'left', buttons: 0, clickCount: event.detail || 1 });
        connection.send({ type: 'selection' });
      }
    };
    inputSurface.onpointercancel = (event) => {
      if (event.pointerType !== 'touch') return;
      activeTouches.delete(event.pointerId);
      connection.send({ type: 'touch', event: 'touchCancel', touchPoints: touchPoints(), modifiers: browserModifiers(event) });
    };
    inputSurface.oncontextmenu = (event) => {
      event.preventDefault();
      if (!contextMenu) return;
      const rect = viewport.getBoundingClientRect();
      // The menu is positioned inside the pane, so pointer pixels have to come
      // back out of the pane's zoom first.
      const zoom = paneZoomFactor(viewport);
      contextMenu.style.left = `${Math.max(4, Math.min((event.clientX - rect.left) / zoom, viewport.offsetWidth - 120))}px`;
      contextMenu.style.top = `${Math.max(4, Math.min((event.clientY - rect.top) / zoom, viewport.offsetHeight - 104))}px`;
      contextMenu.hidden = false;
    };
    inputSurface.onwheel = (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        connection.send({ type: 'zoom', delta: event.deltaY < 0 ? 0.1 : -0.1 });
        showBrowserZoomPopover(paneId);
        return;
      }
      flushPointerMove();
      sendMouse('mouseWheel', event, { button: 'none', deltaX: event.deltaX, deltaY: event.deltaY });
    };
    const sendKey = (type, event, text = '') => connection.send({
      type: 'key', event: type, key: event.key, code: event.code, text,
      windowsVirtualKeyCode: browserKeyCode(event), modifiers: browserModifiers(event)
    });
    const keydown = (event) => {
      const shortcut = (event.ctrlKey || event.metaKey) ? event.key.toLowerCase() : '';
      if (shortcut === 'l') {
        event.preventDefault();
        const input = paneElement.querySelector('[name="url"]');
        input.focus();
        input.select();
        return;
      }
      if (shortcut === 'f') {
        event.preventDefault();
        showBrowserFind(paneElement);
        return;
      }
      if (shortcut === 't') {
        event.preventDefault();
        connection.send({ type: 'newTab', emulationMode: isMobileLayout() ? 'mobile' : 'desktop' });
        return;
      }
      if (shortcut === 'w') {
        event.preventDefault();
        const found = findPaneState(paneId);
        connection.send({ type: 'closeTab', tabId: found?.pane.activeBrowserTabId });
        return;
      }
      if (shortcut === 'tab') {
        event.preventDefault();
        const found = findPaneState(paneId);
        const tabs = found?.pane.browserTabs || [];
        const index = tabs.findIndex((tab) => tab.id === found?.pane.activeBrowserTabId);
        const offset = event.shiftKey ? -1 : 1;
        const next = tabs[(index + offset + tabs.length) % tabs.length];
        if (next) connection.send({ type: 'activateTab', tabId: next.id });
        return;
      }
      if (shortcut === 'c') {
        event.preventDefault();
        if (selectedText) copyBrowserText(selectedText);
        else connection.send({ type: 'copy' });
        return;
      }
      if (shortcut === 'v') {
        if (pasteBrowserText(connection, keyboard)) event.preventDefault();
        return;
      }
      if (shortcut === 'a') {
        event.preventDefault();
        connection.send({ type: 'selectAll' });
        return;
      }
      event.preventDefault();
      sendKey('keyDown', event, event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey ? event.key : '');
    };
    const keyup = (event) => {
      event.preventDefault();
      sendKey('keyUp', event);
    };
    inputSurface.onkeydown = keydown;
    inputSurface.onkeyup = keyup;
    keyboard.onkeydown = (event) => {
      if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) return;
      keydown(event);
    };
    keyboard.onkeyup = keyup;
    keyboard.onbeforeinput = (event) => {
      if (event.data) connection.send({ type: 'text', text: event.data });
      event.preventDefault();
    };
    keyboard.onpaste = (event) => {
      const text = event.clipboardData?.getData('text/plain') || '';
      if (text) connection.send({ type: 'text', text });
      event.preventDefault();
    };
    keyboard.oninput = () => { keyboard.value = ''; };
    contextMenu?.querySelector('[data-browser-copy]')?.addEventListener('click', () => {
      hideContextMenu();
      if (selectedText) copyBrowserText(selectedText);
      else connection.send({ type: 'copy' });
    });
    contextMenu?.querySelector('[data-browser-paste]')?.addEventListener('click', () => {
      hideContextMenu();
      pasteBrowserText(connection, keyboard);
    });
    contextMenu?.querySelector('[data-browser-select-all]')?.addEventListener('click', () => {
      hideContextMenu();
      connection.send({ type: 'selectAll' });
      inputSurface.focus();
    });
    fileInput.onchange = () => uploadBrowserFiles(fileInput);
    fileInput.oncancel = () => uploadBrowserFiles(fileInput);
    connect();
  }

  function copyBrowserText(text) {
    if (!text) {
      showToast('No text selected.');
      return;
    }
    const fallback = () => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) showToast('Clipboard access is unavailable.');
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
  }

  function pasteBrowserText(connection, keyboard) {
    if (navigator.clipboard?.readText) {
      navigator.clipboard.readText().then(
        (text) => { if (text) connection.send({ type: 'text', text }); },
        () => keyboard.focus()
      );
      return true;
    }
    const needsFocus = document.activeElement !== keyboard;
    keyboard.focus();
    if (needsFocus) showToast('Press Ctrl+V again to paste.');
    return false;
  }

  function handleBrowserDialog(connection, message) {
    if (message.dialogType === 'alert') {
      window.alert(message.message);
      connection.send({ type: 'dialog', accept: true });
      return;
    }
    if (message.dialogType === 'confirm') {
      connection.send({ type: 'dialog', accept: window.confirm(message.message) });
      return;
    }
    const value = window.prompt(message.message, message.defaultPrompt || '');
    connection.send({ type: 'dialog', accept: value !== null, promptText: value || '' });
  }

  async function uploadBrowserFiles(input) {
    const form = new FormData();
    for (const file of input.files || []) form.append('files', file, file.name);
    try {
      const response = await fetch(`/api/browser/upload?tabId=${encodeURIComponent(input.dataset.tabId)}&nodeId=${encodeURIComponent(input.dataset.nodeId)}`, {
        method: 'POST',
        headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
        body: form
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Upload failed.');
    } catch (error) {
      showToast(error.message);
    }
  }

  function updateBrowserDownload(paneElement, download) {
    const status = paneElement.querySelector('[data-browser-download-status]');
    if (!status || !download) return;
    const percent = download.totalBytes > 0
      ? `${Math.min(100, Math.round(download.receivedBytes / download.totalBytes * 100))}%`
      : 'Downloading';
    status.hidden = false;
    status.textContent = download.state === 'completed' ? `${download.filename} · Ready` : `${download.filename} · ${percent}`;
    if (download.state === 'completed') {
      fetchBrowserDownload(download).finally(() => setTimeout(() => { status.hidden = true; }, 2400));
    } else if (download.state === 'canceled') {
      status.textContent = `${download.filename} · Canceled`;
    }
  }

  async function fetchBrowserDownload(download) {
    try {
      const response = await fetch(`/api/browser/downloads/${encodeURIComponent(download.guid)}`, {
        headers: state.token ? { Authorization: `Bearer ${state.token}` } : {}
      });
      if (!response.ok) throw new Error('Download is not ready.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = download.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      showToast(error.message);
    }
  }

  function disposeBrowsers() {
    for (const connection of state.browserConnections.values()) connection.dispose();
    state.browserConnections.clear();
  }

  async function loadNotepadTab(paneId, tabId, filePath) {
    const container = document.querySelector(`[data-pane="${paneId}"]`);
    if (!filePath) {
      wireNotepadPane(container);
      return;
    }
    const data = notepadTabData(tabId);
    if (data.loadedPath === filePath && !data.error) {
      wireNotepadPane(container);
      return;
    }
    try {
      const result = await api(`/api/files/text?path=${encodeURIComponent(filePath)}`);
      // A textarea normalizes every line ending to LF, so the file's own ending is
      // remembered here and restored on save instead of silently rewriting the file.
      Object.assign(data, {
        content: result.content.replace(/\r\n|\r|\n/g, '\n'),
        encoding: result.encoding,
        eol: detectNotepadEol(result.content),
        loadedPath: result.path,
        stamp: { mtimeMs: result.mtimeMs, size: result.size },
        dirty: false,
        externalChange: false,
        error: ''
      });
      const found = findPaneState(paneId);
      const tab = found?.pane.notepadTabs?.find((candidate) => candidate.id === tabId);
      if (tab) tab.path = result.path;
    } catch (error) {
      data.error = error.message;
    }
    updateNotepadPane(paneId);
  }

  function updateNotepadPane(paneId) {
    const found = findPaneState(paneId);
    const container = document.querySelector(`[data-pane="${paneId}"]`);
    const existing = container?.querySelector('.notepad-pane');
    if (!found || !existing) return;
    existing._notepadResizeObserver?.disconnect();
    existing.outerHTML = renderNotepadPane(found.pane);
    updateNotepadTabStrip(paneId);
    wireNotepadPane(container);
  }

  function updateNotepadTabStrip(paneId) {
    const found = findPaneState(paneId);
    const container = document.querySelector(`[data-pane="${paneId}"]`);
    const strip = container?.querySelector('[data-notepad-tab-strip]');
    if (!found || !strip) return;
    strip.innerHTML = `<span class="pane-kind-icon" aria-hidden="true">${fileActionIcon('notepad')}</span>${renderNotepadTabs(found.pane)}`;
    renderSidebarPaneList();
    wireNotepadTabs(container, paneId);
    wirePaneKindIcon(strip);
  }

  async function activateNotepadTabClient(paneId, tabId) {
    const found = findPaneState(paneId);
    if (!found || found.pane.activeNotepadTabId === tabId) return;
    try {
      await api(`/api/panes/${paneId}/notepad/tabs/${tabId}/activate`, { method: 'POST' });
    } catch (error) {
      showToast(error.message);
      return;
    }
    found.pane.activeNotepadTabId = tabId;
    const tab = found.pane.notepadTabs.find((candidate) => candidate.id === tabId);
    updateNotepadPane(paneId);
    if (tab?.path) await loadNotepadTab(paneId, tabId, tab.path);
  }

  async function addNotepadTab(paneId, filePath = '') {
    try {
      const result = await api(`/api/panes/${paneId}/notepad/tabs`, {
        method: 'POST', body: JSON.stringify({ path: filePath })
      });
      const found = findPaneState(paneId);
      if (!found) return;
      found.pane.notepadTabs.push(result.tab);
      found.pane.activeNotepadTabId = result.tab.id;
      updateNotepadPane(paneId);
      if (result.tab.path) await loadNotepadTab(paneId, result.tab.id, result.tab.path);
    } catch (error) {
      showToast(error.message);
    }
  }

  async function closeNotepadTabClient(paneId, tabId) {
    const found = findPaneState(paneId);
    if (!found) return;
    if (notepadTabData(tabId).dirty && !window.confirm('This file has unsaved changes. Close anyway?')) {
      return;
    }
    try {
      await api(`/api/panes/${paneId}/notepad/tabs/${tabId}`, { method: 'DELETE' });
    } catch (error) {
      showToast(error.message);
      return;
    }
    const tabs = found.pane.notepadTabs;
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;
    window.clearTimeout(state.notepadAutosaveTimers.get(tabId));
    state.notepadAutosaveTimers.delete(tabId);
    if (tabs.length === 1) {
      tabs[0] = { id: tabId, title: 'Untitled', path: '' };
      delete state.notepadTabData[tabId];
    } else {
      tabs.splice(index, 1);
      delete state.notepadTabData[tabId];
    }
    if (!tabs.some((tab) => tab.id === found.pane.activeNotepadTabId)) {
      found.pane.activeNotepadTabId = tabs[Math.min(index, tabs.length - 1)].id;
    }
    updateNotepadPane(paneId);
  }

  async function setNotepadTabPath(paneId, tabId, filePath) {
    try {
      await api(`/api/panes/${paneId}/notepad/tabs/${tabId}`, {
        method: 'PATCH', body: JSON.stringify({ path: filePath })
      });
      const found = findPaneState(paneId);
      const tab = found?.pane.notepadTabs?.find((candidate) => candidate.id === tabId);
      if (tab) tab.path = filePath;
      notepadTabData(tabId).loadedPath = '';
      if (found?.pane.activeNotepadTabId === tabId) {
        await loadNotepadTab(paneId, tabId, filePath);
      } else {
        updateNotepadTabStrip(paneId);
      }
    } catch (error) {
      showToast(error.message);
    }
  }

  function editNotepadTabPath(paneId, tabId) {
    const tabElement = document.querySelector(`[data-notepad-tab="${tabId}"]`);
    const found = findPaneState(paneId);
    const tab = found?.pane.notepadTabs?.find((candidate) => candidate.id === tabId);
    const label = tabElement?.querySelector('.notepad-tab-label');
    if (!label || !tab || tabElement.querySelector('input')) return;
    const input = document.createElement('input');
    input.className = 'notepad-tab-path-input';
    input.setAttribute('aria-label', 'Notepad file path');
    input.value = tab.path || tab.title;
    label.replaceWith(input);
    input.focus();
    input.select();
    input.addEventListener('click', (event) => event.stopPropagation());
    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const filePath = input.value.trim();
      if (filePath && filePath !== (tab.path || tab.title)) {
        await setNotepadTabPath(paneId, tabId, filePath);
      } else {
        updateNotepadTabStrip(paneId);
      }
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        committed = true;
        updateNotepadTabStrip(paneId);
      }
    });
    input.addEventListener('blur', commit);
  }

  async function moveNotepadTabClient(paneId, tabId, index, targetPaneId) {
    let result;
    try {
      result = await api(`/api/panes/${paneId}/notepad/tabs/${tabId}/move`, {
        method: 'POST', body: JSON.stringify({ index, targetPaneId })
      });
    } catch (error) {
      showToast(error.message);
      await loadState();
      return;
    }

    const crossPane = Boolean(result.sourcePane);
    const source = findPaneState(paneId);
    if (source) {
      const sourceResult = crossPane ? result.sourcePane : result.pane;
      source.pane.notepadTabs = sourceResult.notepadTabs;
      source.pane.activeNotepadTabId = sourceResult.activeNotepadTabId;
      updateNotepadPane(paneId);
    }
    if (crossPane) {
      const target = findPaneState(targetPaneId);
      if (target) {
        target.pane.notepadTabs = result.pane.notepadTabs;
        target.pane.activeNotepadTabId = result.pane.activeNotepadTabId;
        updateNotepadPane(targetPaneId);
      }
    }
  }

  function wireNotepadTabs(paneElement, paneId) {
    paneElement.querySelectorAll('[data-notepad-tab]').forEach((tabElement) => {
      tabElement.onclick = (event) => {
        if (event.target.closest('[data-notepad-close-tab]') || Date.now() < state.suppressPaneTabClickUntil) return;
        activateNotepadTabClient(paneId, tabElement.dataset.notepadTab);
      };
      tabElement.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activateNotepadTabClient(paneId, tabElement.dataset.notepadTab);
        }
      };
      tabElement.ondblclick = (event) => {
        event.stopPropagation();
        editNotepadTabPath(paneId, tabElement.dataset.notepadTab);
      };
      tabElement.onpointerdown = (event) => {
        if (event.target.closest('[data-notepad-close-tab]')) return;
        startPaneTabDrag(event, '.notepad-tab', (index, targetPaneId) => moveNotepadTabClient(paneId, tabElement.dataset.notepadTab, index, targetPaneId));
      };
    });
    paneElement.querySelectorAll('[data-notepad-close-tab]').forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        closeNotepadTabClient(paneId, button.dataset.notepadCloseTab);
      };
    });
    const newTabButton = paneElement.querySelector('[data-notepad-new-tab]');
    if (newTabButton) newTabButton.onclick = () => addNotepadTab(paneId, '');
  }

  // Names the /api/panes/:paneId/<kind>/tabs family, which is why an AI pane
  // gets tab add/close/activate for free.
  function paneTabKind(pane) {
    if (pane.type === 'files') return 'files';
    if (pane.type === 'ai') return 'ai';
    return 'terminal';
  }

  // The state field names a pane's own tab array/active-id live under, keyed
  // by paneTabKind() — used to patch a moved tab's local pane objects from
  // the move route's response without a full state reload.
  const PANE_TAB_FIELDS = {
    files: { tabs: 'filesTabs', active: 'activeFilesTabId' },
    ai: { tabs: 'aiTabs', active: 'activeAiTabId' },
    terminal: { tabs: 'terminalTabs', active: 'activeTerminalTabId' }
  };

  function updatePaneTabStrip(paneId) {
    const found = findPaneState(paneId);
    const strip = document.querySelector(`[data-pane="${paneId}"] [data-pane-tab-strip]`);
    if (!found || !strip) return;
    strip.innerHTML = renderPaneTabs(found.pane);
    renderSidebarPaneList();
    wirePaneTabs(strip, paneId);
    wirePaneKindIcon(strip);
  }

  function showActiveTerminalTab(paneId) {
    const found = findPaneState(paneId);
    const paneElement = document.querySelector(`[data-pane="${paneId}"]`);
    if (!found || !paneElement) return;
    const activeId = activePaneTabId(found.pane);
    paneElement.querySelectorAll('[data-terminal-tab]').forEach((element) => {
      element.hidden = element.dataset.terminalTab !== activeId;
    });
    mountTerminal(paneId, activeId);
    const terminal = state.terminals.get(activeId);
    terminal?.sendResize();
    terminal?.term.focus();
  }

  async function activatePaneTabClient(paneId, tabId) {
    const found = findPaneState(paneId);
    if (!found || activePaneTabId(found.pane) === tabId) return;
    try {
      await api(`/api/panes/${paneId}/${paneTabKind(found.pane)}/tabs/${tabId}/activate`, { method: 'POST' });
    } catch (error) {
      showToast(error.message);
      return;
    }
    if (found.pane.type === 'files') {
      found.pane.activeFilesTabId = tabId;
      found.pane.path = found.pane.filesTabs.find((tab) => tab.id === tabId)?.path || '';
      updatePaneTabStrip(paneId);
      await loadFilesPane(found.pane);
    } else if (found.pane.type === 'ai') {
      found.pane.activeAiTabId = tabId;
      updatePaneTabStrip(paneId);
      showActiveAiTab(paneId);
    } else {
      found.pane.activeTerminalTabId = tabId;
      updatePaneTabStrip(paneId);
      showActiveTerminalTab(paneId);
    }
  }

  function showActiveAiTab(paneId) {
    const found = findPaneState(paneId);
    if (!found) return;
    const activeId = activePaneTabId(found.pane);
    app.querySelectorAll(`[data-pane="${paneId}"] .ai-surface`).forEach((surface) => {
      surface.hidden = surface.dataset.aiTab !== activeId;
    });
    const scroller = aiPane.surface(activeId)?.querySelector('[data-ai-scroll]');
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }

  async function addPaneTab(paneId) {
    const found = findPaneState(paneId);
    if (!found) return;
    let result;
    try {
      result = await api(`/api/panes/${paneId}/${paneTabKind(found.pane)}/tabs`, {
        method: 'POST', body: JSON.stringify({})
      });
    } catch (error) {
      showToast(error.message);
      return;
    }
    if (found.pane.type === 'files') {
      found.pane.filesTabs.push(result.tab);
      found.pane.activeFilesTabId = result.tab.id;
      found.pane.path = result.tab.path;
      updatePaneTabStrip(paneId);
      await loadFilesPane(found.pane);
      return;
    }
    if (found.pane.type === 'ai') {
      found.pane.aiTabs.push(result.tab);
      found.pane.activeAiTabId = result.tab.id;
      const surfaces = app.querySelectorAll(`[data-pane="${paneId}"] .ai-surface`);
      surfaces[surfaces.length - 1]?.insertAdjacentHTML('afterend', aiPane.renderSurface(found.pane, result.tab, true));
      const added = aiPane.surface(result.tab.id);
      if (added) {
        // Only the new surface: the others are already wired.
        aiPane.wire(added);
      }
      updatePaneTabStrip(paneId);
      showActiveAiTab(paneId);
      aiPane.mountTab(paneId, result.tab.id);
      return;
    }
    found.pane.terminalTabs.push(result.tab);
    found.pane.activeTerminalTabId = result.tab.id;
    const surfaces = document.querySelectorAll(`[data-pane="${paneId}"] [data-terminal-tab]`);
    surfaces[surfaces.length - 1]?.insertAdjacentHTML('afterend', `<div class="terminal" id="terminal-${result.tab.id}" data-terminal-tab="${result.tab.id}" hidden></div>`);
    updatePaneTabStrip(paneId);
    showActiveTerminalTab(paneId);
  }

  async function closePaneTabClient(paneId, tabId) {
    const found = findPaneState(paneId);
    if (!found) return;
    let result;
    try {
      result = await api(`/api/panes/${paneId}/${paneTabKind(found.pane)}/tabs/${tabId}`, { method: 'DELETE' });
    } catch (error) {
      showToast(error.message);
      return;
    }
    const tabs = paneTabs(found.pane);
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;
    if (found.pane.type === 'files') {
      if (tabs.length === 1) {
        tabs[0] = { id: tabId, path: '' };
      } else {
        tabs.splice(index, 1);
      }
      if (!tabs.some((tab) => tab.id === found.pane.activeFilesTabId)) {
        found.pane.activeFilesTabId = tabs[Math.min(index, tabs.length - 1)].id;
      }
      found.pane.path = tabs.find((tab) => tab.id === found.pane.activeFilesTabId)?.path || '';
      updatePaneTabStrip(paneId);
      await loadFilesPane(found.pane);
      return;
    }
    if (found.pane.type === 'ai') {
      // The socket goes with the tab; the server has already stopped its CLI.
      aiPane.disposeTab(tabId);
      if (result.tab) {
        tabs[index] = result.tab;
      } else {
        tabs.splice(index, 1);
      }
      if (!tabs.some((tab) => tab.id === found.pane.activeAiTabId)) {
        found.pane.activeAiTabId = tabs[Math.min(index, tabs.length - 1)].id;
      }
      const surface = aiPane.surface(tabId);
      if (result.tab && surface) {
        // Closing the last tab replaces it with an empty conversation rather
        // than leaving the pane blank.
        surface.outerHTML = aiPane.renderSurface(found.pane, result.tab, true);
        const replaced = aiPane.surface(result.tab.id);
        if (replaced) aiPane.wire(replaced);
        aiPane.mountTab(paneId, result.tab.id);
      } else {
        surface?.remove();
      }
      updatePaneTabStrip(paneId);
      showActiveAiTab(paneId);
      return;
    }
    if (result.tab) {
      tabs[index] = result.tab;
    } else {
      tabs.splice(index, 1);
    }
    if (!tabs.some((tab) => tab.id === found.pane.activeTerminalTabId)) {
      found.pane.activeTerminalTabId = tabs[Math.min(index, tabs.length - 1)].id;
    }
    disposeTerminal(tabId);
    const surface = document.getElementById(`terminal-${tabId}`);
    if (result.tab && surface) {
      surface.id = `terminal-${result.tab.id}`;
      surface.dataset.terminalTab = result.tab.id;
      surface.innerHTML = '';
    } else {
      surface?.remove();
    }
    updatePaneTabStrip(paneId);
    showActiveTerminalTab(paneId);
  }

  function renamePaneTab(paneId, tabId) {
    const found = findPaneState(paneId);
    if (!found) return;
    const tabKind = paneTabKind(found.pane);
    if (tabKind === 'files') return;
    const tab = paneTabs(found.pane).find((candidate) => candidate.id === tabId);
    const tabElement = document.querySelector(`[data-pane="${paneId}"] [data-pane-tab="${tabId}"]`);
    const label = tabElement?.querySelector('.pane-tab-label');
    if (!label || !tab || tabElement.querySelector('input')) return;
    const input = document.createElement('input');
    input.className = 'pane-tab-rename-input';
    input.setAttribute('aria-label', `${tabKind === 'ai' ? 'AI' : 'Terminal'} tab name`);
    input.value = tab.title;
    label.replaceWith(input);
    input.focus();
    input.select();
    input.addEventListener('click', (event) => event.stopPropagation());
    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const title = input.value.trim();
      if (title && title !== tab.title) {
        try {
          await api(`/api/panes/${paneId}/${tabKind}/tabs/${tabId}`, {
            method: 'PATCH', body: JSON.stringify({ title })
          });
          tab.title = title;
          // A typed name outranks whatever the shell announces from now on.
          tab.titlePinned = true;
          if (tabKind === 'terminal') {
            window.clearTimeout(state.terminalTitleTimers.get(tabId));
            state.terminalTitleTimers.delete(tabId);
          }
        } catch (error) {
          showToast(error.message);
        }
      }
      updatePaneTabStrip(paneId);
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        committed = true;
        updatePaneTabStrip(paneId);
      }
    });
    input.addEventListener('blur', commit);
  }

  // Patches the local pane tree and DOM directly from the move route's
  // response instead of reloading the whole app: a terminal/AI tab's live
  // surface (its xterm instance or its WebSocket) is relocated in place
  // rather than torn down and reconnected, and unrelated panes are never
  // touched at all.
  async function movePaneTabClient(paneId, tabId, index, targetPaneId) {
    const found = findPaneState(paneId);
    if (!found) return;
    let result;
    try {
      result = await api(`/api/panes/${paneId}/${paneTabKind(found.pane)}/tabs/${tabId}/move`, {
        method: 'POST', body: JSON.stringify({ index, targetPaneId })
      });
    } catch (error) {
      showToast(error.message);
      await loadState();
      return;
    }

    const kind = paneTabKind(found.pane);
    const fields = PANE_TAB_FIELDS[kind];
    const crossPane = Boolean(result.sourcePane);
    const sourceResult = crossPane ? result.sourcePane : result.pane;
    found.pane[fields.tabs] = sourceResult[fields.tabs];
    found.pane[fields.active] = sourceResult[fields.active];
    const target = crossPane ? findPaneState(targetPaneId) : null;
    if (target) {
      target.pane[fields.tabs] = result.pane[fields.tabs];
      target.pane[fields.active] = result.pane[fields.active];
    }

    if (kind === 'files') {
      updatePaneTabStrip(paneId);
      if (crossPane) {
        await loadFilesPane(found.pane); // source's active tab may have changed to a sibling
        if (target) {
          updatePaneTabStrip(targetPaneId);
          await loadFilesPane(target.pane); // target's active tab is now the moved tab
        }
      }
      return;
    }

    if (kind === 'ai') {
      if (target) {
        const surface = aiPane.surface(tabId);
        const targetElement = document.querySelector(`[data-pane="${targetPaneId}"]`);
        if (surface && targetElement) targetElement.appendChild(surface);
        updatePaneTabStrip(targetPaneId);
        showActiveAiTab(targetPaneId);
      }
      updatePaneTabStrip(paneId);
      showActiveAiTab(paneId);
      return;
    }

    if (target) {
      const surface = document.getElementById(`terminal-${tabId}`);
      const targetElement = document.querySelector(`[data-pane="${targetPaneId}"]`);
      if (surface && targetElement) targetElement.appendChild(surface);
      updatePaneTabStrip(targetPaneId);
      showActiveTerminalTab(targetPaneId);
    }
    updatePaneTabStrip(paneId);
    showActiveTerminalTab(paneId);
  }

  function wirePaneTabs(root, paneId) {
    root.querySelectorAll('[data-pane-tab]').forEach((tabElement) => {
      tabElement.onclick = (event) => {
        if (event.target.closest('[data-pane-close-tab]') || Date.now() < state.suppressPaneTabClickUntil) return;
        activatePaneTabClient(paneId, tabElement.dataset.paneTab);
      };
      tabElement.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activatePaneTabClient(paneId, tabElement.dataset.paneTab);
        }
      };
      tabElement.ondblclick = (event) => {
        event.stopPropagation();
        renamePaneTab(paneId, tabElement.dataset.paneTab);
      };
      tabElement.onpointerdown = (event) => {
        if (event.target.closest('[data-pane-close-tab], input')) return;
        startPaneTabDrag(event, '.pane-tab', (index, targetPaneId) => movePaneTabClient(paneId, tabElement.dataset.paneTab, index, targetPaneId));
      };
    });
    root.querySelectorAll('[data-pane-close-tab]').forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        closePaneTabClient(paneId, button.dataset.paneCloseTab);
      };
    });
    root.querySelector('[data-pane-new-tab]')?.addEventListener('click', () => addPaneTab(paneId));
  }

  function wirePaneTabStrips(root) {
    findAll(root, '[data-pane-tab-strip]').forEach((strip) => wirePaneTabs(strip, strip.dataset.paneTitle));
  }

  function localPathDirectory(filePath) {
    const value = String(filePath || '').replace(/[\\/]+$/, '');
    const separator = Math.max(value.lastIndexOf('\\'), value.lastIndexOf('/'));
    if (separator < 0) return '';
    if (separator === 2 && /^[A-Za-z]:/.test(value)) return value.slice(0, 3);
    if (separator === 0) return '/';
    return value.slice(0, separator);
  }

  function joinLocalPath(directory, name) {
    return `${String(directory || '').replace(/[\\/]+$/, '')}${serverOnWindows() ? '\\' : '/'}${name}`;
  }

  function openNotepadSaveDialog(paneId, tabId) {
    return new Promise((resolve) => {
      document.querySelector('.app-modal-overlay')?.remove();
      const found = findPaneState(paneId);
      const tab = found?.pane.notepadTabs?.find((candidate) => candidate.id === tabId);
      if (!found || !tab) {
        resolve(null);
        return;
      }
      const previousFocus = document.activeElement;
      const startLocation = tab.path ? localPathDirectory(tab.path) : found.pane.cwd;
      const startName = notepadTabLabel(tab) === 'Untitled' ? 'Untitled.txt' : notepadTabLabel(tab);
      const overlay = document.createElement('div');
      overlay.className = 'app-modal-overlay';
      overlay.innerHTML = `
        <div class="app-modal notepad-save-dialog" role="dialog" aria-modal="true" aria-label="Save file">
          <header class="app-modal-header">Save file</header>
          <div class="app-modal-body">
            <div class="notepad-save-location">
              <button class="file-command-button" type="button" data-notepad-save-up aria-label="Up one level" title="Up one level">${fileActionIcon('up')}</button>
              <input type="text" data-notepad-save-location value="${escapeAttr(startLocation)}" aria-label="Save location" autocomplete="off" autocapitalize="off" spellcheck="false">
              <button class="file-command-button" type="button" data-notepad-save-refresh aria-label="Refresh" title="Refresh">${fileActionIcon('refresh')}</button>
            </div>
            <div class="notepad-save-directory-list" data-notepad-save-directories role="listbox" aria-label="Folders"></div>
            <label class="app-modal-field">
              <span>File name</span>
              <input data-notepad-save-name value="${escapeAttr(startName)}" autocomplete="off" autocapitalize="off" spellcheck="false">
            </label>
            <div class="app-modal-error" data-modal-error role="alert"></div>
          </div>
          <footer class="app-modal-footer">
            <button type="button" class="secondary" data-modal-cancel>Cancel</button>
            <button type="button" class="primary" data-modal-confirm>Save</button>
          </footer>
        </div>`;
      document.body.appendChild(overlay);
      const locationInput = overlay.querySelector('[data-notepad-save-location]');
      const nameInput = overlay.querySelector('[data-notepad-save-name]');
      const list = overlay.querySelector('[data-notepad-save-directories]');
      const errorElement = overlay.querySelector('[data-modal-error]');
      const confirmButton = overlay.querySelector('[data-modal-confirm]');
      const upButton = overlay.querySelector('[data-notepad-save-up]');
      let currentLocation = startLocation;
      let parentLocation = '';
      let loading = false;
      let locationError = '';

      const validate = () => {
        const error = locationError || validateFileName(nameInput.value) || (!currentLocation ? 'Choose a folder.' : '');
        errorElement.textContent = error;
        confirmButton.disabled = Boolean(error) || loading;
        return !error && !loading;
      };
      const close = (result) => {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        previousFocus?.focus?.();
        resolve(result);
      };
      const renderLocations = (items) => {
        list.innerHTML = items.length ? items.map((item) => `
          <button type="button" role="option" data-notepad-save-directory="${escapeAttr(item.path)}" title="${escapeAttr(item.path)}">
            ${fileActionIcon(item.drive ? 'drive' : 'folder')}
            <span>${escapeHtml(item.name)}</span>
          </button>`).join('') : '<div class="notepad-save-empty">No folders here</div>';
        list.querySelectorAll('[data-notepad-save-directory]').forEach((button) => {
          button.onclick = () => loadLocation(button.dataset.notepadSaveDirectory);
        });
      };
      const loadLocation = async (location) => {
        loading = true;
        locationError = '';
        list.innerHTML = '<div class="notepad-save-empty">Loading…</div>';
        validate();
        try {
          if (!location) {
            const result = await api('/api/files/drives');
            currentLocation = '';
            parentLocation = '';
            locationInput.value = '';
            renderLocations((result.drives || []).map((drive) => ({ ...drive, drive: true })));
          } else {
            const result = await api(`/api/files?path=${encodeURIComponent(location)}`);
            currentLocation = result.path;
            parentLocation = result.parent || '';
            locationInput.value = currentLocation;
            renderLocations((result.entries || []).filter((entry) => entry.type === 'directory'));
          }
        } catch (error) {
          currentLocation = '';
          parentLocation = '';
          locationError = error.message;
          list.innerHTML = '<div class="notepad-save-empty">Location unavailable</div>';
        } finally {
          loading = false;
          upButton.disabled = !currentLocation;
          validate();
        }
      };
      const commit = () => {
        if (validate()) close(joinLocalPath(currentLocation, nameInput.value.trim()));
      };
      const onKey = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close(null);
        } else if (event.key === 'Enter' && event.target === locationInput) {
          event.preventDefault();
          loadLocation(locationInput.value.trim());
        } else if (event.key === 'Enter' && event.target === nameInput) {
          event.preventDefault();
          commit();
        }
      };

      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) close(null);
      });
      upButton.onclick = () => loadLocation(parentLocation);
      overlay.querySelector('[data-notepad-save-refresh]').onclick = () => loadLocation(currentLocation);
      overlay.querySelector('[data-modal-cancel]').onclick = () => close(null);
      confirmButton.onclick = commit;
      nameInput.oninput = validate;
      locationInput.oninput = () => {
        if (locationInput.value.trim() !== currentLocation) {
          currentLocation = '';
          parentLocation = '';
          locationError = 'Press Enter to open this location.';
          validate();
        }
      };
      loadLocation(startLocation);
      nameInput.focus();
      nameInput.select();
    });
  }

  async function saveNotepadTab(paneId, tabId, silent = false) {
    const found = findPaneState(paneId);
    const tab = found?.pane.notepadTabs?.find((candidate) => candidate.id === tabId);
    if (!found || !tab) return;
    const data = notepadTabData(tabId);
    if (!tab.path && silent) {
      try {
        await persistNotepadTabState(paneId, tabId, {
          content: data.content,
          encoding: data.encoding
        });
        data.dirty = false;
        updateNotepadTabStrip(paneId);
      } catch (error) {
        data.error = error.message;
      }
      return;
    }
    let savePath = tab.path;
    if (!savePath) {
      const selectedPath = await openNotepadSaveDialog(paneId, tabId);
      if (!selectedPath) return;
      savePath = selectedPath;
    }
    try {
      const result = await api('/api/files/text', {
        method: 'PUT',
        body: JSON.stringify({ path: savePath, content: applyNotepadEol(data.content, data.eol), encoding: data.encoding })
      });
      data.loadedPath = result.path;
      data.encoding = result.encoding;
      data.stamp = { mtimeMs: result.mtimeMs, size: result.size };
      data.dirty = false;
      data.externalChange = false;
      data.error = '';
      if (tab.path !== result.path) {
        await api(`/api/panes/${paneId}/notepad/tabs/${tabId}`, {
          method: 'PATCH', body: JSON.stringify({ path: result.path })
        });
        tab.path = result.path;
      }
      if (silent) {
        updateNotepadTabStrip(paneId);
      } else {
        updateNotepadPane(paneId);
      }
      if (!silent) showToast('File saved.', 'success');
    } catch (error) {
      if (!silent) showToast(error.message);
    }
  }

  async function persistNotepadTabState(paneId, tabId, updates = {}) {
    const data = notepadTabData(tabId);
    const payload = {
      wrap: data.wrap,
      indentGuides: data.indentGuides,
      autosave: data.autosave,
      fontFamily: data.fontFamily,
      eol: data.eol,
      language: data.language,
      readOnly: data.readOnly,
      ...updates
    };
    await api(`/api/panes/${paneId}/notepad/tabs/${tabId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    const tab = findNotepadTab(tabId);
    if (tab) Object.assign(tab, payload);
  }

  function scheduleNotepadAutosave(paneId, tabId) {
    window.clearTimeout(state.notepadAutosaveTimers.get(tabId));
    state.notepadAutosaveTimers.set(tabId, window.setTimeout(() => {
      state.notepadAutosaveTimers.delete(tabId);
      saveNotepadTab(paneId, tabId, true);
    }, 1500));
  }

  async function notepadCopySelection(editor) {
    const text = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (!text) return '';
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      showToast('Clipboard access is unavailable.');
    }
    return text;
  }

  async function notepadCut(editor) {
    const text = await notepadCopySelection(editor);
    if (!text) return;
    notepadEdit(editor, editor.selectionStart, editor.selectionEnd, '');
  }

  async function notepadPaste(editor) {
    try {
      const text = await navigator.clipboard.readText();
      notepadEdit(editor, editor.selectionStart, editor.selectionEnd, text);
    } catch (error) {
      showToast('Clipboard access is unavailable.');
    }
  }

  function notepadFindNext(editor, options, backward) {
    const matches = notepadMatches(editor.value, options);
    if (!matches.length) return -1;
    let target = backward
      ? matches.reduce((found, match, index) => (match.start < editor.selectionStart ? index : found), -1)
      : matches.findIndex((match) => match.start >= editor.selectionEnd);
    if (target === -1) {
      if (!options.wrapAround) return -1;
      target = backward ? matches.length - 1 : 0;
    }
    editor.focus();
    editor.setSelectionRange(matches[target].start, matches[target].end);
    return target;
  }

  // Programmatic edits go through execCommand so the textarea keeps its native undo stack;
  // assigning to `value` would clear it and break Ctrl+Z.
  function notepadEdit(editor, start, end, text, selectionStart, selectionEnd) {
    if (start === end && !text) return;
    editor.focus();
    editor.setSelectionRange(start, end);
    let applied;
    try {
      applied = text ? document.execCommand('insertText', false, text) : document.execCommand('delete');
    } catch (error) {
      applied = false;
    }
    if (!applied) {
      editor.setRangeText(text, start, end, 'end');
      editor.dispatchEvent(new Event('input'));
    }
    if (selectionStart !== undefined) editor.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
  }

  function notepadCaretLine(editor) {
    return editor.value.slice(0, editor.selectionStart).split('\n').length - 1;
  }

  function notepadLineBlock(editor) {
    const text = editor.value;
    const end = text.indexOf('\n', editor.selectionEnd);
    return {
      start: text.lastIndexOf('\n', editor.selectionStart - 1) + 1,
      end: end === -1 ? text.length : end
    };
  }

  function notepadReplaceLines(editor, transform) {
    const block = notepadLineBlock(editor);
    const body = editor.value.slice(block.start, block.end);
    const next = transform(body.split('\n')).join('\n');
    if (next === body) return;
    notepadEdit(editor, block.start, block.end, next, block.start, block.start + next.length);
  }

  // Case conversion works on the selection when there is one, otherwise the caret line.
  function notepadReplaceSelection(editor, transform) {
    const range = editor.selectionEnd > editor.selectionStart
      ? { start: editor.selectionStart, end: editor.selectionEnd }
      : notepadLineBlock(editor);
    const body = editor.value.slice(range.start, range.end);
    const next = transform(body);
    if (next === body) return;
    notepadEdit(editor, range.start, range.end, next, range.start, range.start + next.length);
  }

  function notepadMoveLines(editor, delta) {
    const text = editor.value;
    const block = notepadLineBlock(editor);
    const length = block.end - block.start;
    const body = text.slice(block.start, block.end);
    if (delta < 0) {
      if (block.start === 0) return;
      const previousStart = text.lastIndexOf('\n', block.start - 2) + 1;
      notepadEdit(
        editor, previousStart, block.end,
        `${body}\n${text.slice(previousStart, block.start - 1)}`,
        previousStart, previousStart + length
      );
      return;
    }
    if (block.end >= text.length) return;
    const nextEnd = text.indexOf('\n', block.end + 1);
    const end = nextEnd === -1 ? text.length : nextEnd;
    const offset = end - block.end;
    notepadEdit(
      editor, block.start, end,
      `${text.slice(block.end + 1, end)}\n${body}`,
      block.start + offset, block.start + offset + length
    );
  }

  function notepadIndentLines(editor, outdent) {
    notepadReplaceLines(editor, (lines) => lines.map((line) => (outdent
      ? line.replace(/^(?: {1,4}|\t)/, '')
      : `    ${line}`)));
  }

  function notepadToggleComment(editor, spec) {
    const token = spec?.line;
    if (!token) return;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    notepadReplaceLines(editor, (lines) => {
      const commented = lines.every((line) => !line.trim() || line.trimStart().startsWith(token));
      return lines.map((line) => {
        if (!line.trim()) return line;
        if (commented) return line.replace(new RegExp(`^(\\s*)${escaped} ?`), '$1');
        const indent = line.match(/^\s*/)[0];
        return `${indent}${token} ${line.slice(indent.length)}`;
      });
    });
  }

  function notepadGoToLine(context, line) {
    const { editor, gutter } = context;
    const lines = editor.value.split('\n');
    const target = Math.max(0, Math.min(lines.length - 1, line));
    const start = lines.slice(0, target).reduce((total, text) => total + text.length + 1, 0);
    editor.focus();
    editor.setSelectionRange(start, start + lines[target].length);
    const row = gutter?.children[target];
    if (row) editor.scrollTop = Math.max(0, row.offsetTop - gutter.offsetTop - editor.clientHeight / 2);
  }

  function notepadJumpBookmark(context, backward) {
    const lines = [...context.data.bookmarks].sort((a, b) => a - b);
    if (!lines.length) return;
    const current = notepadCaretLine(context.editor);
    const next = backward
      ? [...lines].reverse().find((line) => line < current) ?? lines.at(-1)
      : lines.find((line) => line > current) ?? lines[0];
    notepadGoToLine(context, next);
  }

  const notepadCommands = {
    undo: () => document.execCommand('undo'),
    redo: () => document.execCommand('redo'),
    'duplicate-line': ({ editor }) => {
      const block = notepadLineBlock(editor);
      const offset = editor.selectionStart - block.start;
      notepadEdit(editor, block.end, block.end, `\n${editor.value.slice(block.start, block.end)}`, block.end + 1 + offset);
    },
    'delete-line': ({ editor }) => {
      const block = notepadLineBlock(editor);
      const atEnd = block.end >= editor.value.length;
      const start = atEnd && block.start > 0 ? block.start - 1 : block.start;
      notepadEdit(editor, start, atEnd ? block.end : block.end + 1, '', start);
    },
    'move-line-up': ({ editor }) => notepadMoveLines(editor, -1),
    'move-line-down': ({ editor }) => notepadMoveLines(editor, 1),
    'upper-case': ({ editor }) => notepadReplaceSelection(editor, (text) => text.toUpperCase()),
    'lower-case': ({ editor }) => notepadReplaceSelection(editor, (text) => text.toLowerCase()),
    'toggle-comment': ({ editor, spec }) => notepadToggleComment(editor, spec),
    'sort-ascending': ({ editor }) => notepadReplaceLines(editor, (lines) => lines.sort((a, b) => a.localeCompare(b))),
    'sort-descending': ({ editor }) => notepadReplaceLines(editor, (lines) => lines.sort((a, b) => b.localeCompare(a))),
    'remove-duplicates': ({ editor }) => notepadReplaceLines(editor, (lines) => [...new Set(lines)]),
    'trim-trailing': ({ editor }) => notepadReplaceLines(editor, (lines) => lines.map((line) => line.replace(/[ \t]+$/, ''))),
    'tabs-to-spaces': ({ editor }) => notepadReplaceLines(editor, (lines) => lines.map((line) => line.replaceAll('\t', '    '))),
    'spaces-to-tabs': ({ editor }) => notepadReplaceLines(editor, (lines) => lines.map((line) => line.replace(/^ +/, (run) => '\t'.repeat(Math.floor(run.length / 4)) + ' '.repeat(run.length % 4)))),
    'go-to-line': (context) => {
      const input = context.paneElement.querySelector('[data-notepad-goto-input]');
      const line = Number.parseInt(input?.value ?? '', 10);
      if (Number.isInteger(line)) notepadGoToLine(context, line - 1);
    },
    'toggle-bookmark': (context) => {
      const line = notepadCaretLine(context.editor);
      if (!context.data.bookmarks.delete(line)) context.data.bookmarks.add(line);
      context.refresh();
    },
    'next-bookmark': (context) => notepadJumpBookmark(context, false),
    'previous-bookmark': (context) => notepadJumpBookmark(context, true),
    'clear-bookmarks': (context) => {
      context.data.bookmarks.clear();
      context.refresh();
    },
    'toggle-read-only': (context) => {
      context.data.readOnly = !context.data.readOnly;
      persistNotepadTabState(context.paneId, context.tabId).catch((error) => showToast(error.message));
      updateNotepadPane(context.paneId);
    },
    reload: (context) => reloadNotepadTab(context.paneId, context.tabId),
    'close-all': (context) => closeNotepadTabs(context.paneId, null),
    'close-others': (context) => closeNotepadTabs(context.paneId, context.tabId)
  };

  function runNotepadCommand(context, command) {
    const [group, value] = command.split(':');
    if (group === 'eol' || group === 'encoding' || group === 'language') {
      context.data[group] = value;
      persistNotepadTabState(context.paneId, context.tabId).catch((error) => showToast(error.message));
      updateNotepadPane(context.paneId);
      return;
    }
    notepadCommands[command]?.(context);
  }

  async function reloadNotepadTab(paneId, tabId) {
    const tab = findNotepadTab(tabId);
    const data = notepadTabData(tabId);
    if (!tab?.path) return;
    if (data.dirty && !window.confirm('Discard unsaved changes and reload from disk?')) return;
    await reloadNotepadTabFromDisk(paneId, tabId);
  }

  // Reloading re-renders the whole pane, so the caret and scroll position are
  // carried over: an automatic reload must not throw away where the reader was.
  async function reloadNotepadTabFromDisk(paneId, tabId) {
    const tab = findNotepadTab(tabId);
    if (!tab?.path) return;
    const editor = document.querySelector(`[data-pane="${paneId}"] .notepad-editor`);
    const caret = editor
      ? { start: editor.selectionStart, end: editor.selectionEnd, scrollTop: editor.scrollTop }
      : null;
    notepadTabData(tabId).loadedPath = '';
    await loadNotepadTab(paneId, tabId, tab.path);
    const nextEditor = document.querySelector(`[data-pane="${paneId}"] .notepad-editor`);
    if (!nextEditor || !caret) return;
    const limit = nextEditor.value.length;
    nextEditor.selectionStart = Math.min(caret.start, limit);
    nextEditor.selectionEnd = Math.min(caret.end, limit);
    nextEditor.scrollTop = caret.scrollTop;
    nextEditor.dispatchEvent(new Event('scroll'));
  }

  // Another program - an editor, a script, a terminal command - can rewrite the
  // file an open tab is showing, and the tab has to follow it. Polling the
  // modification stamp beats fs.watch on the server: Windows editors save by
  // writing a temporary file and renaming it over the original, which silently
  // detaches a per-file watcher.
  async function pollNotepadFiles() {
    if (document.hidden) return;
    for (const paneElement of document.querySelectorAll('[data-notepad-pane]')) {
      const paneId = paneElement.dataset.notepadPane;
      const tabId = paneElement.dataset.notepadActiveTab;
      const data = state.notepadTabData[tabId];
      const tab = findNotepadTab(tabId);
      if (!tab?.path || !data?.stamp) continue;
      let stamp;
      try {
        stamp = await api(`/api/files/stat?path=${encodeURIComponent(tab.path)}`);
      } catch (error) {
        // A save in progress can leave the path missing for an instant; the
        // next poll sees the finished file.
        continue;
      }
      if (stamp.mtimeMs === data.stamp.mtimeMs && stamp.size === data.stamp.size) continue;
      if (!data.dirty) {
        await reloadNotepadTabFromDisk(paneId, tabId);
        continue;
      }
      // Unsaved edits are never discarded silently: the tab says the file moved
      // on and leaves the choice to reload or save to the person typing.
      data.stamp = stamp;
      if (data.externalChange) continue;
      data.externalChange = true;
      updateNotepadPane(paneId);
      showToast(`${notepadTabLabel(tab)} changed on disk. Reload to see the new version.`);
    }
  }

  function startNotepadWatch() {
    return window.setInterval(() => {
      pollNotepadFiles().catch(() => {});
    }, NOTEPAD_WATCH_INTERVAL);
  }

  async function closeNotepadTabs(paneId, keepTabId) {
    const found = findPaneState(paneId);
    if (!found) return;
    for (const tab of found.pane.notepadTabs.slice()) {
      if (tab.id !== keepTabId) await closeNotepadTabClient(paneId, tab.id);
    }
  }

  function setNotepadPopoverOpen(paneElement, popover, open) {
    paneElement.querySelectorAll('.notepad-popover').forEach((candidate) => {
      const candidateOpen = candidate === popover && open;
      candidate.hidden = !candidateOpen;
      candidate.parentElement.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', String(candidateOpen));
      if (candidateOpen && candidate.querySelector('[data-notepad-popover-drag]')) {
        placeNotepadPopover(candidate);
      }
    });
  }

  function closeNotepadPopoversFromOutside(event) {
    document.querySelectorAll('.notepad-font-popover:not([hidden]), .notepad-font-size-popover:not([hidden])').forEach((popover) => {
      const control = popover.closest('.notepad-popover-control');
      if (!control?.contains(event.target)) {
        setNotepadPopoverOpen(popover.closest('.notepad-pane'), popover, false);
      }
    });
  }

  function clampNotepadPopover(popover, left, top) {
    const area = popover.closest('.notepad-pane')?.querySelector('.notepad-editor-shell');
    if (!area) return { left, top };
    const maxLeft = Math.max(area.offsetLeft, area.offsetLeft + area.offsetWidth - popover.offsetWidth);
    const maxTop = Math.max(area.offsetTop, area.offsetTop + area.offsetHeight - popover.offsetHeight);
    return {
      left: Math.max(area.offsetLeft, Math.min(maxLeft, left)),
      top: Math.max(area.offsetTop, Math.min(maxTop, top))
    };
  }

  // The pane canvas is scaled, so client pixels must be divided by the zoom to become pane pixels.
  function placeNotepadPopover(popover) {
    const parent = popover.offsetParent;
    if (!parent || popover.hidden) return null;
    const parentRect = parent.getBoundingClientRect();
    const rect = popover.getBoundingClientRect();
    const scale = parentRect.width / parent.offsetWidth || 1;
    const position = clampNotepadPopover(
      popover,
      (rect.left - parentRect.left) / scale,
      (rect.top - parentRect.top) / scale
    );
    popover.style.transform = 'none';
    popover.style.right = 'auto';
    popover.style.left = `${position.left}px`;
    popover.style.top = `${position.top}px`;
    return { ...position, scale };
  }

  function wireNotepadPopoverDrag(popover) {
    const handle = popover.querySelector('[data-notepad-popover-drag]');
    if (!handle) return;
    handle.onpointerdown = (event) => {
      if (event.button !== 0 || event.target.closest('[data-notepad-popover-close]')) return;
      event.preventDefault();
      const start = placeNotepadPopover(popover);
      if (!start) return;
      const startX = event.clientX;
      const startY = event.clientY;
      handle.setPointerCapture(event.pointerId);
      const onMove = (moveEvent) => {
        if (!handle.hasPointerCapture(moveEvent.pointerId)) return;
        const position = clampNotepadPopover(
          popover,
          start.left + (moveEvent.clientX - startX) / start.scale,
          start.top + (moveEvent.clientY - startY) / start.scale
        );
        popover.style.left = `${position.left}px`;
        popover.style.top = `${position.top}px`;
      };
      const onUp = (upEvent) => {
        if (handle.hasPointerCapture(upEvent.pointerId)) handle.releasePointerCapture(upEvent.pointerId);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    };
  }

  function showNotepadFindPopover(paneElement, replace) {
    const popover = paneElement.querySelector(replace ? '[data-notepad-replace-popover]' : '[data-notepad-find-popover]');
    if (!popover) return;
    setNotepadPopoverOpen(paneElement, popover, true);
    popover.querySelector('input')?.focus();
  }

  function hideNotepadPopovers(paneElement, focusEditor = false) {
    setNotepadPopoverOpen(paneElement, null, false);
    if (focusEditor) paneElement.querySelector('.notepad-editor')?.focus();
  }

  function notepadReplacement(find) {
    // Only regex mode treats $1 and $& as references; a literal search replaces verbatim.
    return find.regex ? find.replace : find.replace.replaceAll('$', '$$$$');
  }

  function notepadReplaceAll(context) {
    const { editor, data } = context;
    const pattern = notepadSearchPattern(data.find);
    if (!pattern) return;
    const inSelection = editor.selectionEnd > editor.selectionStart;
    const start = inSelection ? editor.selectionStart : 0;
    const end = inSelection ? editor.selectionEnd : editor.value.length;
    const body = editor.value.slice(start, end);
    const next = body.replace(pattern, notepadReplacement(data.find));
    if (next === body) return;
    const count = notepadMatches(body, data.find).length;
    notepadEdit(editor, start, end, next, start, start + next.length);
    showToast(`Replaced ${count} match${count === 1 ? '' : 'es'}.`, 'success');
  }

  function wireNotepadFindPopovers(context) {
    const { paneElement, editor, data } = context;
    const find = data.find;
    const queryInputs = Array.from(paneElement.querySelectorAll('[data-notepad-find-input], [data-notepad-replace-find-input]'));
    const replaceInput = paneElement.querySelector('[data-notepad-replace-input]');
    const step = (backward) => {
      notepadFindNext(editor, find, backward);
      context.refreshCaret();
      updateNotepadSearchCount(context);
    };
    queryInputs.forEach((input) => {
      input.oninput = () => {
        find.query = input.value;
        queryInputs.forEach((other) => {
          if (other !== input) other.value = input.value;
        });
        context.refreshCaret();
        updateNotepadSearchCount(context);
      };
      input.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          step(event.shiftKey);
        } else if (event.key === 'Escape') {
          hideNotepadPopovers(paneElement, true);
        }
      };
    });
    paneElement.querySelectorAll('[data-notepad-find-clear]').forEach((button) => {
      const input = button.previousElementSibling;
      button.onclick = () => {
        find.query = '';
        queryInputs.forEach((queryInput) => {
          queryInput.value = '';
        });
        input.focus();
        context.refreshCaret();
        updateNotepadSearchCount(context);
      };
    });
    if (replaceInput) {
      replaceInput.oninput = () => {
        find.replace = replaceInput.value;
      };
      replaceInput.onkeydown = (event) => {
        if (event.key === 'Escape') hideNotepadPopovers(paneElement, true);
      };
    }
    paneElement.querySelectorAll('[data-notepad-search-option]').forEach((button) => {
      button.onclick = () => {
        const key = button.dataset.notepadSearchOption;
        find[key] = !find[key];
        paneElement.querySelectorAll(`[data-notepad-search-option="${key}"]`).forEach((option) => {
          option.setAttribute('aria-pressed', String(find[key]));
        });
        context.refreshCaret();
        updateNotepadSearchCount(context);
      };
    });
    const onClick = (selector, handler) => {
      const button = paneElement.querySelector(selector);
      if (button) button.onclick = handler;
    };
    onClick('[data-notepad-find-prev]', () => step(true));
    onClick('[data-notepad-find-next]', () => step(false));
    onClick('[data-notepad-replace-prev]', () => step(true));
    onClick('[data-notepad-replace-next]', () => step(false));
    onClick('[data-notepad-replace-one]', () => {
      const current = notepadMatches(editor.value, find)
        .find((match) => match.start === editor.selectionStart && match.end === editor.selectionEnd);
      if (current) {
        const body = editor.value.slice(current.start, current.end);
        notepadEdit(editor, current.start, current.end, body.replace(notepadSearchPattern(find), notepadReplacement(find)));
      }
      step(false);
    });
    onClick('[data-notepad-replace-all]', () => notepadReplaceAll(context));
  }

  function syncNotepadRows(paneElement, editor, gutter, guides) {
    if (!paneElement || !editor || !gutter || !guides) return;
    const lines = editor.value.split(/\r\n|\r|\n/);
    const wrapped = paneElement.querySelector('.notepad-editor-shell')?.classList.contains('wrap-on');
    const computed = getComputedStyle(editor);
    const lineHeight = Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.5;
    const heights = lines.map(() => lineHeight);
    // The highlight layer sits behind the textarea at full stage width, but the textarea's own
    // scrollbar (when content overflows vertically) narrows its clientWidth. Without matching
    // that width here, wrapped text wraps later in the highlight layer than in the textarea,
    // so painted glyphs drift out of step with the real caret and the gutter's line rows.
    const highlight = paneElement.querySelector('.notepad-highlight');
    if (highlight && editor.clientWidth) highlight.style.width = `${editor.clientWidth}px`;
    const measure = paneElement.querySelector('.notepad-wrap-measure');
    if (wrapped && measure && editor.clientWidth) {
      measure.style.width = `${editor.clientWidth}px`;
      measure.style.fontFamily = computed.fontFamily;
      measure.style.fontSize = computed.fontSize;
      measure.style.lineHeight = computed.lineHeight;
      measure.replaceChildren(...lines.map((line) => {
        const row = document.createElement('span');
        row.textContent = line || '\u200b';
        return row;
      }));
      Array.from(measure.children).forEach((row, index) => {
        heights[index] = Math.max(lineHeight, row.getBoundingClientRect().height);
      });
    }
    const activeTabId = paneElement.dataset.notepadActiveTab;
    const bookmarks = activeTabId ? notepadTabData(activeTabId).bookmarks : new Set();
    gutter.replaceChildren(...lines.map((line, index) => {
      const row = document.createElement('span');
      row.className = bookmarks.has(index) ? 'notepad-gutter-line bookmarked' : 'notepad-gutter-line';
      row.style.height = `${heights[index]}px`;
      row.dataset.line = String(index);
      row.textContent = String(index + 1);
      return row;
    }));
    guides.replaceChildren(...lines.map((line, index) => {
      const row = document.createElement('span');
      row.className = 'notepad-indent-guide-line';
      row.style.height = `${heights[index]}px`;
      const spaces = line.match(/^( +)(?=\S)/)?.[1].length || 0;
      row.style.setProperty('--notepad-guide-columns', String(Math.floor(spaces / 4) * 4));
      return row;
    }));
    gutter.scrollTop = editor.scrollTop;
    guides.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
  }

  function notepadDecorations(text, editor, data) {
    const decorations = notepadBracketRanges(text, editor.selectionStart);
    if (data.find.markAll && data.find.query) {
      for (const match of notepadMatches(text, data.find)) {
        const current = match.start === editor.selectionStart && match.end === editor.selectionEnd;
        decorations.push({ ...match, className: current ? 'notepad-mark current' : 'notepad-mark' });
      }
    }
    return decorations;
  }

  // Repainting the overlay costs a full re-tokenize, so a caret move only redraws when the
  // bracket pair or the current match actually moved.
  function refreshNotepadHighlight(context, force) {
    const { paneElement, editor, data } = context;
    const shell = paneElement.querySelector('.notepad-editor-shell');
    const highlight = paneElement.querySelector('.notepad-highlight');
    const target = paneElement.querySelector('[data-notepad-highlight]');
    if (!shell || !highlight || !target) return;
    const text = editor.value;
    const disabled = text.length > MAX_NOTEPAD_HIGHLIGHT_LENGTH;
    shell.classList.toggle('highlight-off', disabled);
    if (disabled) {
      target.textContent = '';
      return;
    }
    const decorations = notepadDecorations(text, editor, data);
    const key = decorations.map((item) => `${item.start}-${item.end}-${item.className}`).join(',');
    if (force || paneElement._notepadHighlightKey !== key) {
      paneElement._notepadHighlightKey = key;
      target.innerHTML = notepadHighlightHtml(text, notepadLanguages[context.languageId], decorations);
    }
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
  }

  function updateNotepadCurrentLine(context) {
    const { paneElement, editor, gutter } = context;
    const marker = paneElement.querySelector('[data-notepad-current-line]');
    const row = gutter?.children[notepadCaretLine(editor)];
    if (!marker || !row) return;
    marker.style.top = `${row.offsetTop - gutter.offsetTop - editor.scrollTop}px`;
    marker.style.height = `${row.offsetHeight}px`;
  }

  function updateNotepadStatusBar(context) {
    const { paneElement, editor, data } = context;
    const bar = paneElement.querySelector('[data-notepad-status-bar]');
    if (!bar) return;
    const rows = editor.value.slice(0, editor.selectionStart).split('\n');
    const set = (name, value) => {
      const cell = bar.querySelector(`[data-notepad-status-${name}]`);
      if (cell) cell.textContent = value;
    };
    set('language', notepadLanguages[context.languageId]?.label || 'Plain text');
    set('length', `length: ${editor.value.length}  lines: ${lineCount(editor.value)}`);
    set('caret', `Ln ${rows.length}, Col ${rows.at(-1).length + 1}, Sel ${editor.selectionEnd - editor.selectionStart}`);
    set('eol', notepadEolLabels[data.eol] || notepadEolLabels.crlf);
    set('encoding', notepadEncodingLabels[data.encoding] || 'UTF-8');
    set('mode', data.readOnly ? 'Read only' : 'INS');
    // This cell is rewritten after i18n has already translated the rendered
    // pane, so the translation has to be applied here too.
    set('external', data.externalChange ? (window.Wps7I18n?.t('Changed on disk') ?? 'Changed on disk') : '');
  }

  function updateNotepadSearchCount(context) {
    const { paneElement, editor, data } = context;
    const matches = data.find.query ? notepadMatches(editor.value, data.find) : [];
    const current = matches.findIndex((match) => match.start === editor.selectionStart && match.end === editor.selectionEnd);
    const label = data.find.query ? `${current + 1} of ${matches.length}` : '0 of 0';
    paneElement.querySelectorAll('[data-notepad-search-count]').forEach((output) => {
      output.textContent = label;
    });
  }

  function wireNotepadPane(root) {
    wirePagedToolbars(root);
    const paneElement = root?.querySelector?.('.notepad-pane') || (root?.matches?.('.notepad-pane') ? root : null);
    if (!paneElement) return;
    const paneId = paneElement.dataset.notepadPane;
    const tabId = paneElement.dataset.notepadActiveTab;
    const editor = paneElement.querySelector('.notepad-editor');
    const gutter = paneElement.querySelector('.notepad-gutter');
    const guides = paneElement.querySelector('.notepad-indent-guides');
    const data = notepadTabData(tabId);
    const tab = findNotepadTab(tabId);
    const languageId = notepadLanguageId(tab, data);
    const context = {
      paneId, tabId, paneElement, editor, gutter, data, tab, languageId, spec: notepadLanguages[languageId],
      refreshCaret: () => {
        refreshNotepadHighlight(context, false);
        updateNotepadCurrentLine(context);
        updateNotepadStatusBar(context);
      },
      refresh: (force = true) => {
        syncNotepadRows(paneElement, editor, gutter, guides);
        refreshNotepadHighlight(context, force);
        updateNotepadCurrentLine(context);
        updateNotepadStatusBar(context);
      }
    };

    const newButton = paneElement.querySelector('[data-notepad-new]');
    const saveButton = paneElement.querySelector('[data-notepad-save]');
    const cutButton = paneElement.querySelector('[data-notepad-cut]');
    const copyButton = paneElement.querySelector('[data-notepad-copy]');
    const pasteButton = paneElement.querySelector('[data-notepad-paste]');
    const wrapButton = paneElement.querySelector('[data-notepad-wrap]');
    const indentButton = paneElement.querySelector('[data-notepad-indent]');
    const autosaveButton = paneElement.querySelector('[data-notepad-autosave]');

    if (newButton) newButton.onclick = () => addNotepadTab(paneId, '');
    if (saveButton) saveButton.onclick = () => saveNotepadTab(paneId, tabId);
    const wirePopover = (toggleSelector, popoverSelector, persistent = false) => {
      const toggle = paneElement.querySelector(toggleSelector);
      const popover = paneElement.querySelector(popoverSelector);
      const control = toggle?.closest('.notepad-popover-control');
      if (!toggle || !popover || !control) return;
      toggle.onclick = () => {
        const open = popover.hidden;
        setNotepadPopoverOpen(paneElement, popover, open);
        if (open) popover.querySelector('input')?.focus();
      };
      if (!persistent) {
        control.onfocusout = (event) => {
          if (!control.contains(event.relatedTarget)) setNotepadPopoverOpen(paneElement, popover, false);
        };
      }
      control.onkeydown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setNotepadPopoverOpen(paneElement, popover, false);
          toggle.focus();
        }
      };
      if (persistent) {
        wireNotepadPopoverDrag(popover);
        const closeButton = popover.querySelector('[data-notepad-popover-close]');
        if (closeButton) {
          closeButton.onclick = () => {
            setNotepadPopoverOpen(paneElement, popover, false);
            toggle.focus();
          };
        }
      }
    };
    wirePopover('[data-notepad-font-toggle]', '[data-notepad-font-popover]');
    wirePopover('[data-notepad-font-size-toggle]', '[data-notepad-font-size-popover]');
    wirePopover('[data-notepad-find]', '[data-notepad-find-popover]', true);
    wirePopover('[data-notepad-replace]', '[data-notepad-replace-popover]', true);
    wirePopover('[data-notepad-edit-menu-toggle]', '[data-notepad-edit-menu]');
    wirePopover('[data-notepad-search-menu-toggle]', '[data-notepad-search-menu]');
    wirePopover('[data-notepad-document-menu-toggle]', '[data-notepad-document-menu]');
    paneElement.querySelectorAll('[data-notepad-command]').forEach((button) => {
      button.onclick = () => {
        const menu = button.closest('.notepad-menu');
        if (menu) setNotepadPopoverOpen(paneElement, menu, false);
        runNotepadCommand(context, button.dataset.notepadCommand);
      };
    });
    const gotoInput = paneElement.querySelector('[data-notepad-goto-input]');
    if (gotoInput) {
      gotoInput.onkeydown = (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        setNotepadPopoverOpen(paneElement, paneElement.querySelector('[data-notepad-search-menu]'), false);
        runNotepadCommand(context, 'go-to-line');
      };
    }
    if (gutter) {
      gutter.onclick = (event) => {
        const row = event.target.closest('.notepad-gutter-line');
        if (!row) return;
        const line = Number(row.dataset.line);
        if (!data.bookmarks.delete(line)) data.bookmarks.add(line);
        context.refresh();
      };
    }
    paneElement.querySelectorAll('[data-notepad-font]').forEach((button) => {
      button.onclick = () => {
        data.fontFamily = button.dataset.notepadFont;
        editor.style.fontFamily = data.fontFamily;
        gutter.style.fontFamily = data.fontFamily;
        guides.style.fontFamily = data.fontFamily;
        paneElement.querySelectorAll('[data-notepad-font]').forEach((option) => {
          option.setAttribute('aria-pressed', String(option === button));
        });
        paneElement.querySelector('.notepad-highlight').style.fontFamily = data.fontFamily;
        context.refresh();
        persistNotepadTabState(paneId, tabId).catch((error) => showToast(error.message));
        setNotepadPopoverOpen(paneElement, paneElement.querySelector('[data-notepad-font-popover]'), false);
      };
    });
    const fontSizeOutButton = paneElement.querySelector('[data-notepad-font-size-out]');
    const fontSizeInButton = paneElement.querySelector('[data-notepad-font-size-in]');
    const fontSizeResetButton = paneElement.querySelector('[data-notepad-font-size-reset]');
    if (fontSizeOutButton) fontSizeOutButton.onclick = () => changePaneFontSize(paneId, -1);
    if (fontSizeInButton) fontSizeInButton.onclick = () => changePaneFontSize(paneId, 1);
    if (fontSizeResetButton) {
      fontSizeResetButton.onclick = () => {
        changePaneFontSize(
          paneId,
          Math.round(terminalFontSize()) - Math.round(paneFontSize(findPaneState(paneId)?.pane))
        );
      };
    }
    if (cutButton) cutButton.onclick = () => notepadCut(editor);
    if (copyButton) copyButton.onclick = () => notepadCopySelection(editor);
    if (pasteButton) pasteButton.onclick = () => notepadPaste(editor);
    if (wrapButton) {
      wrapButton.onclick = () => {
        data.wrap = !data.wrap;
        persistNotepadTabState(paneId, tabId).catch((error) => showToast(error.message));
        updateNotepadPane(paneId);
      };
    }
    if (indentButton) {
      indentButton.onclick = () => {
        data.indentGuides = !data.indentGuides;
        persistNotepadTabState(paneId, tabId).catch((error) => showToast(error.message));
        updateNotepadPane(paneId);
      };
    }
    if (autosaveButton) {
      autosaveButton.onclick = () => {
        data.autosave = !data.autosave;
        const draft = data.autosave && !tab?.path ? { content: data.content, encoding: data.encoding } : {};
        persistNotepadTabState(paneId, tabId, draft).catch((error) => showToast(error.message));
        updateNotepadPane(paneId);
      };
    }

    if (editor) {
      editor.oninput = () => {
        data.content = editor.value;
        data.dirty = true;
        context.refresh();
        updateNotepadSearchCount(context);
        const label = document.querySelector(`[data-notepad-tab="${tabId}"] .notepad-tab-label`);
        if (label && !label.querySelector('.notepad-tab-modified')) {
          label.insertAdjacentHTML('afterbegin', '<span class="notepad-tab-modified">*</span>');
        }
        if (data.autosave) scheduleNotepadAutosave(paneId, tabId);
      };
      editor.onscroll = () => {
        gutter.scrollTop = editor.scrollTop;
        guides.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
        const highlight = paneElement.querySelector('.notepad-highlight');
        highlight.scrollTop = editor.scrollTop;
        highlight.scrollLeft = editor.scrollLeft;
        updateNotepadCurrentLine(context);
      };
      // `selectionchange` on the textarea is the only event that covers caret moves from
      // the keyboard, the mouse, and programmatic edits alike.
      editor.onselectionchange = () => context.refreshCaret();
      editor.onkeydown = (event) => notepadEditorKeydown(context, event);
    }

    wireNotepadFindPopovers(context);
    context.refresh();
    updateNotepadSearchCount(context);
    paneElement._notepadResizeObserver?.disconnect();
    paneElement._notepadResizeObserver = new ResizeObserver(() => {
      context.refresh();
      paneElement.querySelectorAll('.notepad-popover:not([hidden])').forEach((popover) => {
        if (popover.querySelector('[data-notepad-popover-drag]')) placeNotepadPopover(popover);
      });
    });
    paneElement._notepadResizeObserver.observe(editor);
    wireNotepadTabs(paneElement.closest('.pane') || paneElement, paneId);
  }

  const NOTEPAD_SHORTCUTS = {
    d: 'duplicate-line',
    l: 'delete-line',
    u: 'lower-case',
    q: 'toggle-comment',
    y: 'redo'
  };

  // Only brackets auto-close: pairing quotes would fight every apostrophe in prose.
  // Typing the closing character over an auto-inserted one just steps past it.
  function notepadAutoClose(editor, event) {
    const pairs = NOTEPAD_BRACKETS;
    const { selectionStart, selectionEnd, value } = editor;
    if (Object.values(pairs).includes(event.key) && value[selectionStart] === event.key && selectionStart === selectionEnd) {
      event.preventDefault();
      editor.setSelectionRange(selectionStart + 1, selectionStart + 1);
      return true;
    }
    if (!pairs[event.key]) return false;
    event.preventDefault();
    const body = value.slice(selectionStart, selectionEnd);
    notepadEdit(editor, selectionStart, selectionEnd, `${event.key}${body}${pairs[event.key]}`, selectionStart + 1, selectionStart + 1 + body.length);
    return true;
  }

  function notepadEditorKeydown(context, event) {
    const { paneId, tabId, paneElement, editor, data } = context;
    const key = event.key.toLowerCase();
    const plainCtrl = event.ctrlKey && !event.altKey && !event.metaKey;
    if (plainCtrl && !event.shiftKey && (key === '+' || key === '=' || key === '-' || key === '0')) {
      event.preventDefault();
      event.stopPropagation();
      changePaneFontSize(paneId, key === '0'
        ? Math.round(terminalFontSize()) - Math.round(paneFontSize(findPaneState(paneId)?.pane))
        : (key === '-' ? -1 : 1));
      setNotepadPopoverOpen(paneElement, paneElement.querySelector('[data-notepad-font-size-popover]'), true);
      return;
    }
    if (plainCtrl && !event.shiftKey && key === 's') {
      event.preventDefault();
      saveNotepadTab(paneId, tabId);
      return;
    }
    if (plainCtrl && !event.shiftKey && key === 'n') {
      event.preventDefault();
      addNotepadTab(paneId, '');
      return;
    }
    if (plainCtrl && !event.shiftKey && (key === 'f' || key === 'h')) {
      event.preventDefault();
      showNotepadFindPopover(paneElement, key === 'h');
      return;
    }
    if (plainCtrl && !event.shiftKey && key === 'g') {
      event.preventDefault();
      setNotepadPopoverOpen(paneElement, paneElement.querySelector('[data-notepad-search-menu]'), true);
      paneElement.querySelector('[data-notepad-goto-input]')?.focus();
      return;
    }
    if (plainCtrl && event.shiftKey && (key === 'arrowup' || key === 'arrowdown')) {
      event.preventDefault();
      runNotepadCommand(context, key === 'arrowup' ? 'move-line-up' : 'move-line-down');
      return;
    }
    if (plainCtrl && event.shiftKey && key === 'u') {
      event.preventDefault();
      runNotepadCommand(context, 'upper-case');
      return;
    }
    if (plainCtrl && !event.shiftKey && NOTEPAD_SHORTCUTS[key]) {
      event.preventDefault();
      runNotepadCommand(context, NOTEPAD_SHORTCUTS[key]);
      return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      if (event.ctrlKey) runNotepadCommand(context, 'toggle-bookmark');
      else runNotepadCommand(context, event.shiftKey ? 'previous-bookmark' : 'next-bookmark');
      return;
    }
    if (data.readOnly) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.shiftKey || editor.value.slice(editor.selectionStart, editor.selectionEnd).includes('\n')) {
        notepadIndentLines(editor, event.shiftKey);
      } else {
        notepadEdit(editor, editor.selectionStart, editor.selectionEnd, '    ');
      }
      return;
    }
    if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      const block = notepadLineBlock(editor);
      const indent = editor.value.slice(block.start, editor.selectionStart).match(/^[ \t]*/)[0];
      if (!indent) return;
      event.preventDefault();
      notepadEdit(editor, editor.selectionStart, editor.selectionEnd, `\n${indent}`);
      return;
    }
    if (!event.ctrlKey && !event.altKey && !event.metaKey) notepadAutoClose(editor, event);
  }

  function samePath(left, right) {
    // Only Windows paths are case-insensitive.
    const normalize = (value) => {
      const joined = String(value || '').replace(/[\\/]+/g, '\\').replace(/\\+$/, '');
      return serverOnWindows() ? joined.toLowerCase() : joined;
    };
    return Boolean(normalize(left)) && normalize(left) === normalize(right);
  }

  function findOpenNotepadTab(tab, path) {
    for (const pane of tab?.panes || []) {
      if (pane.type !== 'notepad') continue;
      const notepadTab = (pane.notepadTabs || []).find((candidate) => samePath(candidate.path, path));
      if (notepadTab) return { pane, notepadTab };
    }
    return null;
  }

  async function openNotepadForFile(path) {
    const session = activeSession();
    const tab = activeTab(session);
    const opened = findOpenNotepadTab(tab, path);
    if (opened) {
      await setActivePane(opened.pane.id, false);
      await activateNotepadTabClient(opened.pane.id, opened.notepadTab.id);
      return;
    }
    const existing = tab?.panes.find((candidate) => candidate.type === 'notepad');
    if (existing) {
      await addNotepadTab(existing.id, path);
      await setActivePane(existing.id, false);
      return;
    }
    await openNotepadPane(path);
  }

  // Kept in step with the types served by GET /api/files/image.
  const IMAGE_PATH_PATTERN = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;

  function isImagePath(path) {
    return IMAGE_PATH_PATTERN.test(String(path || ''));
  }

  // An image pane opened from the sidebar has no path, and a file pane is the
  // only other way to hand it one, so it browses for a picture itself.
  function openImagePickerDialog(startLocation) {
    return new Promise((resolve) => {
      document.querySelector('.app-modal-overlay')?.remove();
      const previousFocus = document.activeElement;
      const overlay = document.createElement('div');
      overlay.className = 'app-modal-overlay';
      overlay.innerHTML = `
        <div class="app-modal image-open-dialog" role="dialog" aria-modal="true" aria-label="Open image">
          <header class="app-modal-header">Open image</header>
          <div class="app-modal-body">
            <div class="image-open-location">
              <button class="file-command-button" type="button" data-image-open-up aria-label="Up one level" title="Up one level">${fileActionIcon('up')}</button>
              <input type="text" data-image-open-location value="${escapeAttr(startLocation || '')}" aria-label="Location" autocomplete="off" autocapitalize="off" spellcheck="false">
              <button class="file-command-button" type="button" data-image-open-refresh aria-label="Refresh" title="Refresh">${fileActionIcon('refresh')}</button>
            </div>
            <div class="image-open-list" data-image-open-list role="listbox" aria-label="Folders and images"></div>
            <div class="app-modal-error" data-modal-error role="alert"></div>
          </div>
          <footer class="app-modal-footer">
            <button type="button" class="secondary" data-modal-cancel>Cancel</button>
          </footer>
        </div>`;
      document.body.appendChild(overlay);
      const locationInput = overlay.querySelector('[data-image-open-location]');
      const list = overlay.querySelector('[data-image-open-list]');
      const errorElement = overlay.querySelector('[data-modal-error]');
      const upButton = overlay.querySelector('[data-image-open-up]');
      let currentLocation = startLocation || '';
      let parentLocation = '';

      const close = (result) => {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        previousFocus?.focus?.();
        resolve(result);
      };
      const renderItems = (items) => {
        list.innerHTML = items.length ? items.map((item) => `
          <button type="button" role="option" data-image-open-item="${escapeAttr(item.path)}" data-image-open-kind="${item.kind}" title="${escapeAttr(item.path)}">
            ${fileActionIcon(item.kind)}
            <span>${escapeHtml(item.name)}</span>
          </button>`).join('') : '<div class="image-open-empty">No folders or images here</div>';
        list.querySelectorAll('[data-image-open-item]').forEach((button) => {
          button.onclick = () => {
            if (button.dataset.imageOpenKind === 'image') close(button.dataset.imageOpenItem);
            else loadLocation(button.dataset.imageOpenItem);
          };
        });
      };
      const loadLocation = async (location) => {
        list.innerHTML = '<div class="image-open-empty">Loading…</div>';
        try {
          if (!location) {
            const result = await api('/api/files/drives');
            currentLocation = '';
            parentLocation = '';
            locationInput.value = '';
            renderItems((result.drives || []).map((drive) => ({ ...drive, kind: 'drive' })));
          } else {
            const result = await api(`/api/files?path=${encodeURIComponent(location)}`);
            currentLocation = result.path;
            parentLocation = result.parent || '';
            locationInput.value = currentLocation;
            renderItems((result.entries || [])
              .filter((entry) => entry.type === 'directory' || isImagePath(entry.name))
              .map((entry) => ({ ...entry, kind: entry.type === 'directory' ? 'folder' : 'image' })));
          }
          errorElement.textContent = '';
        } catch (error) {
          currentLocation = '';
          parentLocation = '';
          errorElement.textContent = error.message;
          list.innerHTML = '<div class="image-open-empty">Location unavailable</div>';
        }
        upButton.disabled = !currentLocation;
      };
      const onKey = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close(null);
        } else if (event.key === 'Enter' && event.target === locationInput) {
          event.preventDefault();
          loadLocation(locationInput.value.trim());
        }
      };

      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) close(null);
      });
      upButton.onclick = () => loadLocation(parentLocation);
      overlay.querySelector('[data-image-open-refresh]').onclick = () => loadLocation(currentLocation);
      overlay.querySelector('[data-modal-cancel]').onclick = () => close(null);
      loadLocation(currentLocation);
      locationInput.focus();
    });
  }

  async function chooseImageForPane(paneId) {
    const found = findPaneState(paneId);
    if (!found) {
      return;
    }
    const start = found.pane.path ? localPathDirectory(found.pane.path) : found.pane.cwd;
    const selected = await openImagePickerDialog(start);
    if (!selected) {
      return;
    }
    // The picture may live in another folder, so the strip is rebuilt.
    imagePaneData(paneId).entries = [];
    await setImagePanePath(paneId, selected);
    await loadImagePane(found.pane);
  }

  async function openImageForFile(path) {
    const tab = activeTab(activeSession());
    const existing = tab?.panes.find((candidate) => candidate.type === 'image');
    if (!existing) {
      await openImagePane(path);
      return;
    }
    const data = imagePaneData(existing.id);
    // The new picture may live in another folder, so the strip is rebuilt.
    data.entries = [];
    await setImagePanePath(existing.id, path);
    await loadImagePane(findPaneState(existing.id).pane);
    await setActivePane(existing.id, false);
  }

  async function loadFilesPane(pane) {
    if (!pane) {
      return;
    }
    const paneData = filesPaneData(pane.id);
    paneData.error = '';
    paneData.entries = [];
    paneData.drives = [];
    updateFilesPane(pane.id);
    try {
      if (pane.path) {
        const [result, bookmarkResult] = await Promise.all([
          api(`/api/files?path=${encodeURIComponent(pane.path)}`),
          api('/api/files/bookmarks')
        ]);
        pane.path = result.path;
        paneData.entries = result.entries || [];
        paneData.parent = result.parent || '';
        paneData.drives = [];
        paneData.bookmarks = bookmarkResult.bookmarks || [];
        rememberFilePath(pane.path);
      } else {
        const [result, bookmarkResult] = await Promise.all([
          api('/api/files/drives'),
          api('/api/files/bookmarks')
        ]);
        paneData.drives = result.drives || [];
        paneData.entries = [];
        paneData.parent = '';
        paneData.bookmarks = bookmarkResult.bookmarks || [];
      }
    } catch (error) {
      paneData.entries = [];
      paneData.drives = [];
      paneData.error = friendlyFileError(error.message);
    }
    updateFilesPane(pane.id);
  }

  async function setFilesPanePath(paneId, path) {
    const found = findPaneState(paneId);
    if (!found || found.pane.type !== 'files') {
      return;
    }
    try {
      const result = await api(`/api/panes/${paneId}/files/path`, {
        method: 'PATCH',
        body: JSON.stringify({ path })
      });
      found.pane.path = result.path || '';
      const activeTab = found.pane.filesTabs?.find((tab) => tab.id === found.pane.activeFilesTabId);
      if (activeTab) activeTab.path = found.pane.path;
      updatePaneTabStrip(paneId);
      state.selectedFiles[paneId] = [];
      filesPaneData(paneId).selectionAnchor = -1;
      await loadFilesPane(found.pane);
    } catch (error) {
      filesPaneData(paneId).error = error.message;
      showToast(error.message);
      updateFilesPane(paneId);
    }
  }

  function updateFilesPane(paneId) {
    const found = findPaneState(paneId);
    const container = document.querySelector(`[data-pane="${paneId}"]`);
    if (!found || !container) {
      return;
    }
    const existing = container.querySelector('.files-pane');
    if (existing) {
      existing.outerHTML = renderFilesPane(found.pane);
      wireFilesPane(container);
    }
  }

  function setFileColumnWidth(paneElement, paneData, column, value) {
    const minimums = { name: 90, modified: 90, size: 54 };
    const widths = { name: 150, modified: 130, size: 72, ...paneData.columnWidths };
    widths[column] = Math.max(minimums[column], Math.min(640, Math.round(value)));
    paneData.columnWidths = widths;
    paneElement.style.setProperty('--file-column-template', `${widths.name}px ${widths.modified}px ${widths.size}px`);
    paneElement.style.setProperty('--file-table-width', `${widths.name + widths.modified + widths.size}px`);
    return widths[column];
  }

  function wireFilesPane(root) {
    wirePagedToolbars(root);
    const paneElement = root.querySelector?.('.files-pane') || (root.matches?.('.files-pane') ? root : null);
    if (!paneElement) {
      return;
    }
    const paneId = paneElement.dataset.filesPane;
    const found = findPaneState(paneId);
    if (!found) {
      return;
    }
    const paneData = filesPaneData(paneId);
    const pathControl = paneElement.querySelector('[data-file-path-control]');
    const pathMenu = paneElement.querySelector('[data-file-path-menu]');
    const pathInput = paneElement.querySelector('.file-path-input');
    const pathToggle = paneElement.querySelector('[data-file-path-toggle]');
    const setPathMenuOpen = (open) => {
      if (!pathMenu || !pathToggle || !pathInput) {
        return;
      }
      if (open) {
        const paneHeight = paneElement.getBoundingClientRect().height;
        if (paneHeight > 0) {
          pathMenu.style.maxHeight = `${Math.round(paneHeight * 0.6)}px`;
        }
      }
      pathMenu.hidden = !open;
      pathToggle.setAttribute('aria-expanded', String(open));
      pathInput.setAttribute('aria-expanded', String(open));
    };
    pathToggle?.addEventListener('click', () => setPathMenuOpen(pathMenu.hidden));
    pathInput?.addEventListener('focus', () => setPathMenuOpen(true));
    pathInput?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setPathMenuOpen(true);
        pathMenu.querySelector('[data-file-path-choice]')?.focus();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        setPathMenuOpen(false);
        setFilesPanePath(paneId, pathInput.value);
      } else if (event.key === 'Escape') {
        setPathMenuOpen(false);
      }
    });
    pathControl?.addEventListener('focusout', (event) => {
      if (!pathControl.contains(event.relatedTarget)) {
        setPathMenuOpen(false);
      }
    });
    paneElement.querySelectorAll('[data-file-path-choice]').forEach((button) => {
      button.onclick = () => setFilesPanePath(paneId, button.dataset.filePathChoice);
    });
    paneElement.querySelectorAll('[data-path-bookmark]').forEach((button) => {
      button.onclick = () => togglePathBookmark(button.dataset.pathBookmark, paneId);
    });
    paneElement.querySelector('[data-file-path-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      setFilesPanePath(paneId, new FormData(event.currentTarget).get('path'));
    });
    paneElement.querySelector('[data-file-refresh]')?.addEventListener('click', () => loadFilesPane(found.pane));
    paneElement.querySelector('[data-file-up]')?.addEventListener('click', () => {
      if (paneData.parent) {
        setFilesPanePath(paneId, paneData.parent);
      } else {
        setFilesPanePath(paneId, '');
      }
    });
    paneElement.querySelector('[data-file-new-file]')?.addEventListener('click', () => createFile(paneId));
    paneElement.querySelector('[data-file-new-folder]')?.addEventListener('click', () => createFolder(paneId));
    paneElement.querySelector('[data-file-upload]')?.addEventListener('change', (event) => uploadFiles(event, paneId));
    paneElement.querySelector('[data-folder-upload]')?.addEventListener('change', (event) => uploadFiles(event, paneId));
    paneElement.querySelectorAll('[data-file-upload-trigger]').forEach((trigger) => {
      trigger.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }
        event.preventDefault();
        if (trigger.getAttribute('aria-disabled') === 'true') {
          return;
        }
        trigger.querySelector('input[type="file"]')?.click();
      });
    });
    paneElement.querySelectorAll('[data-file-sort]').forEach((button) => {
      button.onclick = () => {
        const key = button.dataset.fileSort;
        if (paneData.sortKey === key) {
          paneData.sortDirection = paneData.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          paneData.sortKey = key;
          paneData.sortDirection = 'asc';
        }
        paneData.selectionAnchor = -1;
        updateFilesPane(paneId);
      };
    });
    paneElement.querySelectorAll('[data-file-column-resize]').forEach((handle) => {
      const column = handle.dataset.fileColumnResize;
      handle.onpointerdown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = paneData.columnWidths?.[column] || { name: 150, modified: 130, size: 72 }[column];
        handle.setPointerCapture(event.pointerId);
        handle.onpointermove = (moveEvent) => {
          if (!handle.hasPointerCapture(moveEvent.pointerId)) return;
          const width = setFileColumnWidth(paneElement, paneData, column, startWidth + moveEvent.clientX - startX);
          handle.setAttribute('aria-valuenow', String(width));
        };
        handle.onpointerup = (upEvent) => {
          if (handle.hasPointerCapture(upEvent.pointerId)) handle.releasePointerCapture(upEvent.pointerId);
          handle.onpointermove = null;
          handle.onpointerup = null;
        };
      };
      handle.onkeydown = (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const current = paneData.columnWidths?.[column] || { name: 150, modified: 130, size: 72 }[column];
        const width = setFileColumnWidth(paneElement, paneData, column, current + (event.key === 'ArrowRight' ? 10 : -10));
        handle.setAttribute('aria-valuenow', String(width));
      };
    });
    let dragDepth = 0;
    paneElement.addEventListener('dragenter', (event) => {
      if (!found.pane.path || !Array.from(event.dataTransfer?.types || []).includes('Files')) return;
      event.preventDefault();
      dragDepth += 1;
      paneElement.classList.add('drop-target');
    });
    paneElement.addEventListener('dragover', (event) => {
      if (!found.pane.path || !Array.from(event.dataTransfer?.types || []).includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    paneElement.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) paneElement.classList.remove('drop-target');
    });
    paneElement.addEventListener('drop', async (event) => {
      if (!found.pane.path) return;
      event.preventDefault();
      dragDepth = 0;
      paneElement.classList.remove('drop-target');
      await uploadDroppedFiles(event.dataTransfer, paneId);
    });
    paneElement.querySelector('[data-file-download-selected]')?.addEventListener('click', () => downloadFiles(selectedFileList(paneId), paneId));
    paneElement.querySelector('[data-file-duplicate-selected]')?.addEventListener('click', () => copyFiles(selectedFileList(paneId), paneId));
    paneElement.querySelector('[data-file-copy-selected]')?.addEventListener('click', () => copyFilePaths(selectedFileList(paneId)));
    paneElement.querySelector('[data-file-paste]')?.addEventListener('click', () => pasteFiles(paneId));
    paneElement.querySelector('[data-file-select-all]')?.addEventListener('click', () => {
      state.selectedFiles[paneId] = allVisibleFilesSelected(paneId) ? [] : visibleFilePaths(paneId);
      syncFileSelectionUi(paneElement, paneId);
    });
    paneElement.querySelector('[data-file-show-hidden]')?.addEventListener('click', async () => {
      const showHidden = !paneData.showHidden;
      await setShowHiddenFiles(showHidden);
      if (!showHidden) {
        const visible = new Set(visibleFilePaths(paneId));
        state.selectedFiles[paneId] = selectedFileList(paneId).filter((path) => visible.has(path));
      }
      paneData.selectionAnchor = -1;
    });
    paneElement.querySelector('[data-file-filter-toggle]')?.addEventListener('click', () => {
      paneData.filterOpen = !paneData.filterOpen;
      if (!paneData.filterOpen) {
        paneData.filter = '';
      }
      paneData.selectionAnchor = -1;
      updateFilesPane(paneId);
      if (paneData.filterOpen) {
        document.querySelector(`[data-files-pane="${paneId}"] [data-file-filter]`)?.focus();
      }
    });
    const filterInput = paneElement.querySelector('[data-file-filter]');
    if (filterInput) {
      filterInput.addEventListener('input', () => {
        paneData.filter = filterInput.value;
        paneData.selectionAnchor = -1;
        const visible = new Set(visibleFilePaths(paneId));
        state.selectedFiles[paneId] = selectedFileList(paneId).filter((path) => visible.has(path));
        updateFilesPane(paneId);
        const nextInput = document.querySelector(`[data-files-pane="${paneId}"] [data-file-filter]`);
        if (nextInput) {
          nextInput.focus();
          const caret = nextInput.value.length;
          nextInput.setSelectionRange(caret, caret);
        }
      });
      filterInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          paneData.filterOpen = false;
          paneData.filter = '';
          updateFilesPane(paneId);
        }
      });
    }
    paneElement.querySelector('[data-file-filter-clear]')?.addEventListener('click', () => {
      paneData.filter = '';
      updateFilesPane(paneId);
      document.querySelector(`[data-files-pane="${paneId}"] [data-file-filter]`)?.focus();
    });
    paneElement.querySelector('[data-file-rename-selected]')?.addEventListener('click', () => {
      const selected = selectedFileList(paneId);
      if (selected.length === 1) {
        renameFile(selected[0], paneId);
      }
    });
    paneElement.querySelector('[data-file-delete-selected]')?.addEventListener('click', () => {
      const selected = selectedFileList(paneId);
      if (selected.length) {
        deleteFiles(selected, paneId);
      }
    });
    paneElement.querySelectorAll('[data-file-row]').forEach((row) => {
      row.onmousedown = (event) => {
        if (event.button === 1) {
          event.preventDefault();
          copyFilePath(row.dataset.fileRow);
          return;
        }
        if (event.shiftKey) {
          event.preventDefault();
        }
      };
      row.onclick = (event) => {
        selectFileRow(paneElement, paneId, row, event);
      };
      row.ondblclick = (event) => {
        event.preventDefault();
        openFileRow(row, paneId);
      };
      row.onkeydown = (event) => {
        if (event.key === ' ') {
          event.preventDefault();
          selectFileRow(paneElement, paneId, row, event);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          openFileRow(row, paneId);
        }
      };
      row.onauxclick = (event) => {
        if (event.button !== 1) {
          return;
        }
        event.preventDefault();
      };
      row.oncontextmenu = (event) => {
        event.preventDefault();
        openFileContextMenu(paneId, row.dataset.fileRow, event.clientX, event.clientY);
      };
    });
    paneElement.querySelector('.file-list')?.addEventListener('contextmenu', (event) => {
      if (event.target.closest('[data-file-row]') || !found.pane.path) {
        return;
      }
      event.preventDefault();
      openFileContextMenu(paneId, '', event.clientX, event.clientY);
    });
    paneElement.querySelectorAll('.file-row-button[data-file-open]').forEach((button) => {
      button.onclick = () => setFilesPanePath(paneId, button.dataset.fileOpen);
    });
    paneElement.querySelectorAll('[data-file-parent]').forEach((button) => {
      button.ondblclick = (event) => {
        event.preventDefault();
        setFilesPanePath(paneId, button.dataset.fileParent);
      };
      button.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          setFilesPanePath(paneId, button.dataset.fileParent);
        }
      };
    });
    paneElement.onkeydown = (event) => {
      if (event.target.closest('input')) {
        return;
      }
      const key = event.key.toLowerCase();
      const selected = selectedFileList(paneId);
      if ((event.ctrlKey || event.metaKey) && key === 'a') {
        event.preventDefault();
        state.selectedFiles[paneId] = visibleFilePaths(paneId);
        syncFileSelectionUi(paneElement, paneId);
      } else if ((event.ctrlKey || event.metaKey) && key === 'x') {
        if (selected.length) {
          event.preventDefault();
          cutFiles(selected, paneId);
        }
      } else if ((event.ctrlKey || event.metaKey) && key === 'c') {
        if (selected.length) {
          event.preventDefault();
          copyFiles(selected, paneId);
        }
      } else if ((event.ctrlKey || event.metaKey) && key === 'v') {
        if (state.fileClipboard?.paths?.length) {
          event.preventDefault();
          pasteFiles(paneId);
        }
      } else if (event.key === 'F2') {
        if (selected.length === 1) {
          event.preventDefault();
          renameFile(selected[0], paneId);
        }
      } else if (event.key === 'Delete') {
        if (selected.length) {
          event.preventDefault();
          deleteFiles(selected, paneId);
        }
      }
    };
  }

  function selectedFileList(paneId) {
    return Array.isArray(state.selectedFiles[paneId]) ? state.selectedFiles[paneId] : [];
  }

  function setFileSelected(paneId, path, selected) {
    const current = selectedFileList(paneId).filter((item) => item !== path);
    if (selected) {
      current.push(path);
    }
    state.selectedFiles[paneId] = current;
  }

  function visibleFilePaths(paneId) {
    return sortedFileEntries(paneId).map((entry) => entry.path);
  }

  function allVisibleFilesSelected(paneId) {
    const visible = visibleFilePaths(paneId);
    const selected = new Set(selectedFileList(paneId));
    return visible.length > 0 && visible.every((path) => selected.has(path));
  }

  function selectFileRange(paneId, paths, fromIndex, toIndex, additive) {
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const range = paths.slice(start, end + 1);
    state.selectedFiles[paneId] = additive
      ? Array.from(new Set([...selectedFileList(paneId), ...range]))
      : range;
  }

  function selectFileRow(container, paneId, row, event) {
    if (!row) {
      return;
    }
    if (state.activePaneId !== paneId) {
      setActivePane(paneId, false);
    }
    const paneData = filesPaneData(paneId);
    const paths = Array.from(container.querySelectorAll('[data-file-row]')).map((item) => item.dataset.fileRow);
    const index = Number(row.dataset.fileIndex);
    const additive = event.ctrlKey || event.metaKey;
    if (event.shiftKey && paneData.selectionAnchor >= 0) {
      selectFileRange(paneId, paths, paneData.selectionAnchor, index, additive);
    } else if (additive) {
      setFileSelected(paneId, row.dataset.fileRow, !selectedFileList(paneId).includes(row.dataset.fileRow));
      paneData.selectionAnchor = index;
    } else {
      state.selectedFiles[paneId] = [row.dataset.fileRow];
      paneData.selectionAnchor = index;
    }
    syncFileSelectionUi(container, paneId);
  }

  function copyFilePaths(paths) {
    const text = paths.join('\n');
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    const succeeded = () => showToast(paths.length === 1 ? 'Path copied.' : `${paths.length} paths copied.`, 'success');
    if (copied) {
      succeeded();
      return;
    }
    if (!navigator.clipboard?.writeText) {
      showToast('Could not copy path.');
      return;
    }
    navigator.clipboard.writeText(text).then(succeeded, () => showToast('Could not copy path.'));
  }

  function copyFilePath(path) {
    copyFilePaths([path]);
  }

  async function setShowHiddenFiles(showHidden) {
    try {
      state.config = await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ file_manager: { show_hidden: showHidden } })
      });
      Object.values(state.filePaneData).forEach((paneData) => {
        paneData.showHidden = showHidden;
      });
      document.querySelectorAll('[data-files-pane]').forEach((paneElement) => updateFilesPane(paneElement.dataset.filesPane));
    } catch (error) {
      showToast(error.message);
    }
  }

  async function openFileRow(row, paneId) {
    const opener = row.querySelector('[data-file-open]');
    if (opener.dataset.fileType === 'file') {
      const path = opener.dataset.fileOpen;
      if (isImagePath(path)) {
        await openImageForFile(path);
        return;
      }
      try {
        await api(`/api/files/text?path=${encodeURIComponent(path)}`);
        await openNotepadForFile(path);
      } catch (error) {
        if (error.status === 415) {
          await downloadFiles([path], paneId);
        } else {
          showToast(error.message);
        }
      }
    } else {
      setFilesPanePath(paneId, opener.dataset.fileOpen);
    }
  }

  function syncFileSelectionUi(container, paneId) {
    const selected = selectedFileList(paneId);
    container.querySelectorAll('[data-file-row]').forEach((row) => {
      const selectedRow = selected.includes(row.dataset.fileRow);
      row.classList.toggle('selected', selectedRow);
      row.setAttribute('aria-selected', String(selectedRow));
    });
    const renameButton = container.querySelector('[data-file-rename-selected]');
    const downloadButton = container.querySelector('[data-file-download-selected]');
    const duplicateButton = container.querySelector('[data-file-duplicate-selected]');
    const copyButton = container.querySelector('[data-file-copy-selected]');
    const deleteButton = container.querySelector('[data-file-delete-selected]');
    if (renameButton) {
      renameButton.disabled = selected.length !== 1;
    }
    if (deleteButton) {
      deleteButton.disabled = selected.length === 0;
    }
    if (downloadButton) {
      downloadButton.disabled = selected.length === 0;
    }
    if (duplicateButton) {
      duplicateButton.disabled = selected.length === 0;
    }
    if (copyButton) {
      copyButton.disabled = selected.length === 0;
    }
    const selectAllButton = container.querySelector('[data-file-select-all]');
    if (selectAllButton) {
      const allSelected = allVisibleFilesSelected(paneId);
      selectAllButton.classList.toggle('active', allSelected);
      selectAllButton.setAttribute('aria-label', allSelected ? 'Deselect all' : 'Select all');
      selectAllButton.setAttribute('aria-pressed', String(allSelected));
      selectAllButton.title = allSelected ? 'Deselect all' : 'Select all';
      selectAllButton.innerHTML = fileActionIcon(allSelected ? 'deselect-all' : 'select-all');
    }
    const itemCount = container.querySelector('.file-item-count');
    if (itemCount) {
      const total = visibleFilePaths(paneId).length;
      itemCount.textContent = selected.length ? `${selected.length}/${total} items` : `${total} items`;
    }
  }

  function clearFileSelections() {
    Object.keys(state.selectedFiles).forEach((paneId) => {
      state.selectedFiles[paneId] = [];
      filesPaneData(paneId).selectionAnchor = -1;
    });
    document.querySelectorAll('[data-files-pane]').forEach((paneElement) => syncFileSelectionUi(paneElement, paneElement.dataset.filesPane));
  }

  const INVALID_FILENAME_CHARS = /[<>:"/|?*]/;

  function validateFileName(name) {
    const value = String(name || '').trim();
    if (!value) {
      return 'Enter a name.';
    }
    if (value === '.' || value === '..') {
      return 'Choose a different name.';
    }
    if (INVALID_FILENAME_CHARS.test(value) || value.includes(String.fromCharCode(92))) {
      return 'Avoid these characters: < > : " / \\ | ? *';
    }
    if (/[. ]$/.test(value)) {
      return 'Names cannot end with a space or period.';
    }
    return '';
  }

  function openAppModal({ title, message = '', fields = [], confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, validate }) {
    return new Promise((resolve) => {
      document.querySelector('.app-modal-overlay')?.remove();
      const previousFocus = document.activeElement;
      const overlay = document.createElement('div');
      overlay.className = 'app-modal-overlay';
      overlay.innerHTML = `
        <div class="app-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
          <header class="app-modal-header">${escapeHtml(title)}</header>
          <div class="app-modal-body">
            ${message ? `<p class="app-modal-message">${escapeHtml(message)}</p>` : ''}
            ${fields.map((field) => `
              <label class="app-modal-field">
                <span>${escapeHtml(field.label)}</span>
                <input data-modal-field="${escapeAttr(field.name)}" value="${escapeAttr(field.value || '')}" autocomplete="off" autocapitalize="off" spellcheck="false">
              </label>`).join('')}
            <div class="app-modal-error" data-modal-error role="alert"></div>
          </div>
          <footer class="app-modal-footer">
            <button type="button" class="secondary" data-modal-cancel>${escapeHtml(cancelLabel)}</button>
            <button type="button" class="${danger ? 'app-modal-danger' : 'primary'}" data-modal-confirm>${escapeHtml(confirmLabel)}</button>
          </footer>
        </div>`;
      document.body.appendChild(overlay);
      const inputs = Array.from(overlay.querySelectorAll('[data-modal-field]'));
      const errorEl = overlay.querySelector('[data-modal-error]');
      const confirmButton = overlay.querySelector('[data-modal-confirm]');
      const values = () => Object.fromEntries(inputs.map((input) => [input.dataset.modalField, input.value.trim()]));
      const runValidate = () => {
        const error = validate ? validate(values()) : '';
        errorEl.textContent = error || '';
        confirmButton.disabled = Boolean(error);
        return !error;
      };
      const close = (result) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        previousFocus?.focus?.();
        resolve(result);
      };
      const commit = () => {
        if (runValidate()) {
          close(fields.length ? values() : true);
        }
      };
      const onKey = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close(null);
        } else if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          commit();
        }
      };
      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) {
          close(null);
        }
      });
      inputs.forEach((input) => input.addEventListener('input', runValidate));
      overlay.querySelector('[data-modal-cancel]').onclick = () => close(null);
      confirmButton.onclick = commit;
      runValidate();
      (inputs[0] || confirmButton).focus();
      if (inputs[0]) {
        const value = inputs[0].value;
        const dot = value.lastIndexOf('.');
        inputs[0].setSelectionRange(0, dot > 0 ? dot : value.length);
      }
    });
  }

  function confirmDialog(title, message, { danger = false, confirmLabel = 'Delete' } = {}) {
    return openAppModal({ title, message, confirmLabel, danger }).then((result) => result === true);
  }

  async function saveResponseAsFile(response, fallbackName) {
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const disposition = response.headers.get('Content-Disposition') || '';
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    link.download = encodedName ? decodeURIComponent(encodedName) : (plainName || fallbackName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function createFolder(paneId) {
    const found = findPaneState(paneId);
    const result = await openAppModal({
      title: 'New folder',
      fields: [{ name: 'name', label: 'Folder name', value: '' }],
      confirmLabel: 'Create',
      validate: (form) => validateFileName(form.name)
    });
    if (!result) {
      return;
    }
    try {
      await api('/api/files/folder', {
        method: 'POST',
        body: JSON.stringify({ path: found.pane.path, name: result.name })
      });
      await loadFilesPane(found.pane);
    } catch (error) {
      filesPaneData(paneId).error = friendlyFileError(error.message);
      showToast(error.message);
      updateFilesPane(paneId);
    }
  }

  async function createFile(paneId) {
    const found = findPaneState(paneId);
    if (!found?.pane.path) {
      return;
    }
    const result = await openAppModal({
      title: 'New file',
      fields: [{ name: 'name', label: 'File name', value: '' }],
      confirmLabel: 'Create',
      validate: (form) => validateFileName(form.name)
    });
    if (!result) {
      return;
    }
    try {
      await api('/api/files/file', {
        method: 'POST',
        body: JSON.stringify({ path: found.pane.path, name: result.name })
      });
      await loadFilesPane(found.pane);
    } catch (error) {
      filesPaneData(paneId).error = friendlyFileError(error.message);
      showToast(error.message);
      updateFilesPane(paneId);
    }
  }

  async function renameFile(path, paneId) {
    const found = findPaneState(paneId);
    const currentName = path.split(/[\\/]/).pop() || '';
    const result = await openAppModal({
      title: 'Rename',
      fields: [{ name: 'name', label: 'New name', value: currentName }],
      confirmLabel: 'Rename',
      validate: (form) => validateFileName(form.name)
    });
    if (!result || result.name === currentName) {
      return;
    }
    try {
      await api('/api/files/rename', {
        method: 'PATCH',
        body: JSON.stringify({ path, name: result.name })
      });
      await loadFilesPane(found.pane);
    } catch (error) {
      filesPaneData(paneId).error = friendlyFileError(error.message);
      showToast(error.message);
      updateFilesPane(paneId);
    }
  }

  async function deleteFiles(paths, paneId) {
    const found = findPaneState(paneId);
    if (!found || !paths.length) {
      return;
    }
    const confirmed = await confirmDialog('Delete items', `Delete ${paths.length} selected item(s) permanently? This cannot be undone.`, { danger: true });
    if (!confirmed) {
      return;
    }
    try {
      const { results } = await api('/api/files/delete-bulk', {
        method: 'POST',
        body: JSON.stringify({ paths })
      });
      const failed = (results || []).filter((item) => !item.ok);
      state.selectedFiles[paneId] = failed.map((item) => item.path);
      await loadFilesPane(found.pane);
      if (failed.length) {
        filesPaneData(paneId).error = `${failed.length} of ${paths.length} item(s) could not be deleted.`;
        updateFilesPane(paneId);
        showToast(`${failed.length} of ${paths.length} item(s) could not be deleted.`);
      }
    } catch (error) {
      filesPaneData(paneId).error = friendlyFileError(error.message);
      showToast(error.message);
      updateFilesPane(paneId);
    }
  }

  function syncFilePasteButtons() {
    const clipboardReady = Boolean(state.fileClipboard?.paths?.length);
    document.querySelectorAll('[data-files-pane]').forEach((paneElement) => {
      const pasteButton = paneElement.querySelector('[data-file-paste]');
      if (pasteButton) {
        pasteButton.disabled = !clipboardReady || !findPaneState(paneElement.dataset.filesPane)?.pane.path;
      }
    });
  }

  function cutFiles(paths, paneId) {
    if (!paths.length) {
      return;
    }
    state.fileClipboard = { paths: [...paths], mode: 'cut' };
    showToast(paths.length === 1 ? 'Item ready to move.' : `${paths.length} items ready to move.`, 'success');
    updateFilesPane(paneId);
    syncFilePasteButtons();
  }

  function copyFiles(paths, paneId) {
    if (!paths.length) {
      return;
    }
    state.fileClipboard = { paths: [...paths], mode: 'copy' };
    showToast(paths.length === 1 ? 'Item ready to copy.' : `${paths.length} items ready to copy.`, 'success');
    updateFilesPane(paneId);
    syncFilePasteButtons();
  }

  async function pasteFiles(paneId) {
    const found = findPaneState(paneId);
    const clipboard = state.fileClipboard;
    if (!found?.pane.path || !clipboard?.paths?.length) {
      return;
    }
    const destination = found.pane.path;
    const copying = clipboard.mode === 'copy';
    let failures = 0;
    for (const path of clipboard.paths) {
      try {
        if (copying) {
          await api('/api/files/copy', {
            method: 'POST',
            body: JSON.stringify({ path, destination })
          });
        } else {
          await api('/api/files/move', {
            method: 'PATCH',
            body: JSON.stringify({ path, destination })
          });
        }
      } catch (error) {
        failures += 1;
      }
    }
    if (!copying) {
      state.fileClipboard = null;
      syncFilePasteButtons();
    }
    state.selectedFiles[paneId] = [];
    await loadFilesPane(found.pane);
    if (failures) {
      filesPaneData(paneId).error = `${failures} item(s) could not be ${copying ? 'copied' : 'moved'}.`;
      updateFilesPane(paneId);
      showToast(`${failures} item(s) could not be ${copying ? 'copied' : 'moved'}.`);
    } else {
      showToast(copying ? 'Copied.' : 'Moved.', 'success');
    }
  }

  function closeFileContextMenu() {
    document.querySelector('.file-context-menu')?.remove();
    document.removeEventListener('pointerdown', handleContextMenuOutside, true);
    document.removeEventListener('keydown', handleContextMenuKey, true);
  }

  function handleContextMenuOutside(event) {
    if (!event.target.closest('.file-context-menu')) {
      closeFileContextMenu();
    }
  }

  function handleContextMenuKey(event) {
    if (event.key === 'Escape') {
      closeFileContextMenu();
    }
  }

  function openFileContextMenu(paneId, anchorPath, clientX, clientY) {
    closeFileContextMenu();
    const paneElement = document.querySelector(`[data-files-pane="${paneId}"]`);
    if (!paneElement) {
      return;
    }
    if (anchorPath && !selectedFileList(paneId).includes(anchorPath)) {
      state.selectedFiles[paneId] = [anchorPath];
      syncFileSelectionUi(paneElement, paneId);
    }
    const selected = selectedFileList(paneId);
    const clipboardReady = Boolean(state.fileClipboard?.paths?.length);
    const items = [];
    if (anchorPath && selected.length === 1) {
      items.push({ label: 'Open', action: () => {
        const row = paneElement.querySelector(`[data-file-row="${cssEscape(anchorPath)}"]`);
        if (row) {
          openFileRow(row, paneId);
        }
      } });
    }
    if (selected.length) {
      items.push({ label: selected.length > 1 ? `Download (${selected.length})` : 'Download', action: () => downloadFiles(selected, paneId) });
      items.push({ label: 'Cut', action: () => cutFiles(selected, paneId) });
      items.push({ label: selected.length > 1 ? `Copy (${selected.length})` : 'Copy', action: () => copyFiles(selected, paneId) });
      items.push({ label: selected.length > 1 ? 'Copy paths' : 'Copy path', action: () => copyFilePaths(selected) });
    }
    items.push({ label: 'Paste', disabled: !clipboardReady, action: () => pasteFiles(paneId) });
    if (selected.length === 1) {
      items.push({ label: 'Rename', action: () => renameFile(selected[0], paneId) });
    }
    if (selected.length) {
      items.push({ label: 'Delete', danger: true, action: () => deleteFiles(selected, paneId) });
    }
    if (!items.length) {
      return;
    }
    const menu = document.createElement('div');
    menu.className = 'file-context-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items.map((item, index) => `
      <button type="button" role="menuitem" class="file-context-item ${item.danger ? 'danger' : ''}" data-context-index="${index}" ${item.disabled ? 'disabled' : ''}>${escapeHtml(item.label)}</button>
    `).join('');
    document.body.appendChild(menu);
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    menu.style.left = `${Math.min(clientX, window.innerWidth - width - 6)}px`;
    menu.style.top = `${Math.min(clientY, viewportHeight() - height - 6)}px`;
    menu.querySelectorAll('[data-context-index]').forEach((button) => {
      button.onclick = () => {
        const item = items[Number(button.dataset.contextIndex)];
        closeFileContextMenu();
        item.action();
      };
    });
    menu.querySelector('button:not([disabled])')?.focus();
    document.addEventListener('pointerdown', handleContextMenuOutside, true);
    document.addEventListener('keydown', handleContextMenuKey, true);
  }

  function cssEscape(value) {
    return String(value).replace(/["\\]/g, '\\$&');
  }

  async function downloadFile(path, paneId) {
    try {
      const headers = {};
      if (state.token) {
        headers.Authorization = `Bearer ${state.token}`;
      }
      const response = await fetch(`/api/files/download?path=${encodeURIComponent(path)}`, { headers });
      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: 'Download failed.' }));
        throw new Error(result.error || 'Download failed.');
      }
      await saveResponseAsFile(response, path.split(/[\\/]/).pop() || 'download');
    } catch (error) {
      if (paneId) {
        filesPaneData(paneId).error = friendlyFileError(error.message);
        updateFilesPane(paneId);
      }
      showToast(error.message);
    }
  }

  async function downloadFiles(paths, paneId) {
    if (!paths.length) {
      return;
    }
    if (paths.length === 1) {
      await downloadFile(paths[0], paneId);
      return;
    }
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (state.token) {
        headers.Authorization = `Bearer ${state.token}`;
      }
      const response = await fetch('/api/files/download-archive', {
        method: 'POST',
        headers,
        body: JSON.stringify({ paths })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: 'Download failed.' }));
        throw new Error(result.error || 'Download failed.');
      }
      await saveResponseAsFile(response, 'paneboard-files.zip');
    } catch (error) {
      if (paneId) {
        filesPaneData(paneId).error = friendlyFileError(error.message);
      }
      showToast(error.message);
      if (paneId) {
        updateFilesPane(paneId);
      }
    }
  }

  async function uploadFiles(event, paneId) {
    const files = Array.from(event.target.files || []).map((file) => ({ file, name: file.webkitRelativePath || file.name }));
    await uploadFileItems(files, paneId);
    event.target.value = '';
  }

  async function uploadDroppedFiles(dataTransfer, paneId) {
    const items = Array.from(dataTransfer?.items || []);
    const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
    const files = entries.length
      ? (await Promise.all(entries.map((entry) => droppedEntryFiles(entry)))).flat()
      : Array.from(dataTransfer?.files || []).map((file) => ({ file, name: file.name }));
    await uploadFileItems(files, paneId);
  }

  async function droppedEntryFiles(entry, prefix = '') {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      return [{ file, name: `${prefix}${file.name}` }];
    }
    if (!entry.isDirectory) {
      return [];
    }
    const reader = entry.createReader();
    const children = [];
    while (true) {
      const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      children.push(...batch);
    }
    return (await Promise.all(children.map((child) => droppedEntryFiles(child, `${prefix}${entry.name}/`)))).flat();
  }

  async function uploadFileItems(files, paneId) {
    const found = findPaneState(paneId);
    if (!files.length) {
      return;
    }
    const form = new FormData();
    files.forEach((item) => form.append('files', item.file, item.name));
    try {
      await uploadWithProgress(`/api/files/upload?path=${encodeURIComponent(found.pane.path)}`, form, paneId);
      await loadFilesPane(found.pane);
      showToast('Upload complete.', 'success');
    } catch (error) {
      filesPaneData(paneId).error = error.message;
      showToast(error.message);
      updateFilesPane(paneId);
    } finally {
      setFileStatus('', paneId);
    }
  }

  function setFileStatus(message, paneId) {
    const pane = document.querySelector(`[data-pane="${paneId}"]`);
    const target = pane?.querySelector(`[data-pane-upload-status="${paneId}"]`);
    if (target) {
      target.textContent = message;
      target.closest('.pane-title')?.classList.toggle('uploading', Boolean(message));
      syncPaneTitleWidth(pane);
    }
  }

  function uploadWithProgress(url, form, paneId) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      if (state.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);
      }
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          setFileStatus('0%', paneId);
          return;
        }
        const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
        setFileStatus(`${percent}%`, paneId);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        let message = xhr.responseText || 'Upload failed.';
        try {
          message = JSON.parse(message).error || message;
        } catch (error) {
          // Keep the raw response text.
        }
        if (xhr.status === 401) {
          clearToken();
          renderLogin();
        }
        reject(new Error(message));
      };
      xhr.onerror = () => reject(new Error('Upload failed.'));
      xhr.send(form);
    });
  }

  async function togglePathBookmark(path, paneId) {
    if (!path) {
      return;
    }
    const paneData = filesPaneData(paneId);
    const bookmarked = paneData.bookmarks.some((bookmark) => bookmark.path.toLowerCase() === path.toLowerCase());
    try {
      const result = await api('/api/files/bookmarks', {
        method: bookmarked ? 'DELETE' : 'POST',
        body: JSON.stringify({ name: path, path })
      });
      paneData.bookmarks = result.bookmarks || [];
      updateFilesPane(paneId);
    } catch (error) {
      paneData.error = friendlyFileError(error.message);
      showToast(error.message);
      updateFilesPane(paneId);
    }
  }

  function formatBytes(value) {
    const size = Number(value) || 0;
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${Math.round(size / 1024)} KB`;
    }
    return `${Math.round(size / 1024 / 1024)} MB`;
  }

  // The upload limit is stored in bytes, so the raw number tells a user nothing
  // about the size it allows.
  function uploadLimitHint(bytes) {
    const size = Number(bytes) || 0;
    return size > 0
      ? `Largest single upload: ${formatBytes(size)}. Use 0 for no limit.`
      : 'No limit. Enter a size in bytes to cap a single upload.';
  }

  function wirePaneControls(root) {
    findAll(root, '[data-close-pane]').forEach((button) => {
      button.onclick = async (event) => {
        event.stopPropagation();
        await closePane(button.dataset.closePane);
      };
      button.ondblclick = (event) => event.stopPropagation();
    });
    findAll(root, '[data-pane]').forEach((pane) => {
      syncPaneTitleWidth(pane);
      pane.onclick = (event) => {
        if (event.target.closest('.terminal') && pane.dataset.pane === state.activePaneId) {
          return;
        }
        setActivePane(pane.dataset.pane, pane.dataset.paneType !== 'files');
      };
    });
    findAll(root, '[data-pane-title]').forEach((title) => {
      title.onpointerdown = startPaneMove;
      title.ontouchstart = startPaneSwipe;
      title.ondblclick = (event) => {
        const label = title.querySelector('[data-rename-pane]');
        if (!label) return;
        cancelClick();
        event.stopPropagation();
        renamePane(title.dataset.paneTitle, label.textContent);
      };
    });
    findAll(root, '[data-rename-pane]').forEach((label) => {
      label.ondblclick = (event) => {
        event.stopPropagation();
        renamePane(label.dataset.renamePane, label.textContent);
      };
    });
    findAll(root, '[data-pane-resize]').forEach((handle) => {
      handle.onpointerdown = startPaneResize;
    });
    wirePaneKindIcon(root);
  }

  function wirePaneKindIcon(root) {
    findAll(root, '.pane-kind-icon').forEach((icon) => {
      icon.ondblclick = (event) => {
        event.stopPropagation();
        event.preventDefault();
        togglePaneFocus(icon.closest('[data-pane]')?.dataset.pane);
      };
    });
  }

  const PANE_FOCUS_ESCAPE_MS = 500;

  function togglePaneFocus(paneId) {
    // Mobile shows one pane at a time, so blowing it up to 85% of the screen
    // behind a backdrop achieves nothing and sizes itself off screen.
    if (!paneId || isMobileLayout()) {
      return;
    }
    if (state.focusedPaneId === paneId) {
      exitPaneFocus();
    } else {
      enterPaneFocus(paneId);
    }
  }

  function enterPaneFocus(paneId) {
    const paneElement = document.querySelector(`[data-pane="${paneId}"]`);
    if (!paneElement) {
      return;
    }
    if (state.focusedPaneId) {
      exitPaneFocus();
    }
    const rect = paneElement.getBoundingClientRect();
    const ratio = rect.width / rect.height || 1;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const targetArea = viewportWidth * viewportHeight * 0.85;
    let focusHeight = Math.sqrt(targetArea / ratio);
    let focusWidth = focusHeight * ratio;
    const maxWidth = viewportWidth * 0.96;
    const maxHeight = viewportHeight * 0.96;
    if (focusWidth > maxWidth) {
      focusWidth = maxWidth;
      focusHeight = focusWidth / ratio;
    }
    if (focusHeight > maxHeight) {
      focusHeight = maxHeight;
      focusWidth = focusHeight * ratio;
    }
    // Zooming the pane grows everything inside it by the same factor instead of
    // only handing the contents more room, so a focused terminal keeps its
    // column count in larger type. The layout size therefore stays as it was
    // and the zoom does the growing. Zoom never shrinks: a pane already larger
    // than the target still gets pulled back to it, at its own scale.
    const scale = Math.max(1, focusWidth / rect.width || 1);
    state.focusedPaneId = paneId;
    paneElement.style.setProperty('--pane-focus-scale', String(Math.round(scale * 1000) / 1000));
    paneElement.style.setProperty('--pane-focus-width', `${Math.round(focusWidth / scale)}px`);
    paneElement.style.setProperty('--pane-focus-height', `${Math.round(focusHeight / scale)}px`);
    paneElement.classList.add('pane-focused');
    const backdrop = document.createElement('div');
    backdrop.className = 'pane-focus-backdrop';
    backdrop.setAttribute('data-pane-focus-backdrop', '');
    app.querySelector('.app')?.appendChild(backdrop);
    state.paneFocusEscapeAt = 0;
    state.browserConnections.get(paneId)?.refreshViewport();
    document.addEventListener('keydown', paneFocusKeydown, true);
    setActivePane(paneId, paneElement.dataset.paneType !== 'files');
  }

  // Capture phase, so Escape leaves focus mode from every pane type instead of
  // being swallowed by xterm or a host canvas. Rename fields and text
  // inputs keep their own cancel meaning; xterm's helper textarea is neither.
  // A focused terminal keeps its Escape key, which vim, less and PSReadLine all
  // need, so there it takes a second Escape in quick succession to leave.
  function paneFocusKeydown(event) {
    if (event.key !== 'Escape') {
      state.paneFocusEscapeAt = 0;
      return;
    }
    if (event.target.closest?.('.inline-rename, input')) {
      return;
    }
    const paneElement = document.querySelector(`[data-pane="${state.focusedPaneId}"]`);
    if (paneElement?.dataset.paneType === 'terminal') {
      const now = Date.now();
      if (now - state.paneFocusEscapeAt > PANE_FOCUS_ESCAPE_MS) {
        state.paneFocusEscapeAt = now;
        return;
      }
    }
    event.preventDefault();
    event.stopPropagation();
    exitPaneFocus();
  }

  function exitPaneFocus() {
    if (!state.focusedPaneId) {
      return;
    }
    const paneElement = document.querySelector(`[data-pane="${state.focusedPaneId}"]`);
    paneElement?.classList.remove('pane-focused');
    paneElement?.style.removeProperty('--pane-focus-width');
    paneElement?.style.removeProperty('--pane-focus-height');
    paneElement?.style.removeProperty('--pane-focus-scale');
    state.browserConnections.get(state.focusedPaneId)?.refreshViewport();
    state.focusedPaneId = '';
    app.querySelector('[data-pane-focus-backdrop]')?.remove();
    document.removeEventListener('keydown', paneFocusKeydown, true);
  }

  function closePaneFocusFromOutside(event) {
    if (!state.focusedPaneId || event.target.closest?.(`[data-pane="${state.focusedPaneId}"]`)) {
      return;
    }
    exitPaneFocus();
  }

  function startPaneSwipe(event) {
    if (!event.touches || event.touches.length !== 1 || event.target.closest('button, [data-browser-tab], [data-notepad-tab], [data-pane-tab]')) {
      return;
    }
    const touch = event.touches[0];
    state.swipeStart = { x: touch.clientX, y: touch.clientY, paneId: event.currentTarget.dataset.paneTitle };
    event.currentTarget.ontouchend = finishPaneSwipe;
  }

  function finishPaneSwipe(event) {
    const start = state.swipeStart;
    state.swipeStart = null;
    if (!start || !event.changedTouches || !event.changedTouches.length) {
      return;
    }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) {
      return;
    }
    switchPaneByOffset(dx < 0 ? 1 : -1);
  }

  async function switchPaneByOffset(offset) {
    const session = activeSession();
    const tab = activeTab(session);
    if (!tab || tab.panes.length < 2) {
      return;
    }
    const index = tab.panes.findIndex((pane) => pane.id === state.activePaneId);
    const nextIndex = (index + offset + tab.panes.length) % tab.panes.length;
    await setActivePane(tab.panes[nextIndex].id);
  }

  async function activateSidebarPaneTab(paneId, tabKind, tabId) {
    if (!tabId) return;
    if (tabKind === 'browser') {
      state.browserConnections.get(paneId)?.send({ type: 'activateTab', tabId });
    } else if (tabKind === 'notepad') {
      await activateNotepadTabClient(paneId, tabId);
    } else {
      await activatePaneTabClient(paneId, tabId);
    }
  }

  function wirePaneLinks(root) {
    findAll(root, '[data-pane-link]').forEach((button) => {
      button.onclick = (event) => {
        scheduleClick(event, async () => {
          const found = findPaneState(button.dataset.paneLink);
          if (found && found.session.id === state.activeSessionId) {
            await setActivePane(button.dataset.paneLink);
            await activateSidebarPaneTab(button.dataset.paneLink, button.dataset.sidebarPaneTabKind, button.dataset.sidebarPaneTab);
            updateActivePaneUi();
            return;
          }
          state.activeSessionId = button.dataset.session;
          state.activePaneId = button.dataset.paneLink;
          await api(`/api/panes/${state.activePaneId}/activate`, { method: 'POST' });
          await loadState();
          await activateSidebarPaneTab(button.dataset.paneLink, button.dataset.sidebarPaneTabKind, button.dataset.sidebarPaneTab);
          updateActivePaneUi();
        });
      };
    });
  }

  function findAll(root, selector) {
    const items = [];
    if (root.matches?.(selector)) {
      items.push(root);
    }
    items.push(...root.querySelectorAll(selector));
    return items;
  }

  function scheduleClick(event, handler) {
    if (event.detail > 1) {
      cancelClick();
      return;
    }
    cancelClick();
    state.clickTimer = window.setTimeout(() => {
      state.clickTimer = null;
      handler();
    }, isMobileLayout() ? 420 : 220);
  }

  function installSessionTabTouchRename(button) {
    button.addEventListener('pointerup', (event) => {
      if (event.pointerType !== 'touch') {
        return;
      }
      const now = Date.now();
      const previous = state.lastSessionTap;
      state.lastSessionTap = { sessionId: button.dataset.tabSession, at: now };
      if (!previous || previous.sessionId !== button.dataset.tabSession || now - previous.at > 420) {
        return;
      }
      state.suppressSessionClickUntil = now + 500;
      state.lastSessionTap = null;
      cancelClick();
      event.preventDefault();
      const label = button.querySelector('[data-rename-session]');
      if (label) {
        renameSession(button.dataset.tabSession, label.textContent);
      }
    });
  }

  function cancelClick() {
    if (state.clickTimer) {
      window.clearTimeout(state.clickTimer);
      state.clickTimer = null;
    }
  }

  async function closeSession(sessionId) {
    try {
      await api(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      state.activeSessionId = '';
      state.activePaneId = '';
      await loadState();
    } catch (error) {
      showToast(error.message);
    }
  }

  // Closing a pane kills every shell in it, so a tab that is still running a
  // command gets to object first. A probe that fails never blocks the close.
  async function confirmBusyTerminals(pane) {
    if (pane.type !== 'terminal') {
      return true;
    }
    let busy;
    try {
      busy = (await api(`/api/panes/${pane.id}/terminal/busy`)).busy || [];
    } catch (error) {
      return true;
    }
    if (!busy.length) {
      return true;
    }
    const names = busy.map((tab) => tab.title).join(', ');
    return confirmDialog(
      'Close pane',
      busy.length === 1
        ? `${names} is still running a command. Closing the pane stops it.`
        : `${names} are still running commands. Closing the pane stops them.`,
      { danger: true, confirmLabel: 'Close pane' }
    );
  }

  async function closePane(paneId) {
    if (!paneId) {
      return;
    }
    const found = findPaneState(paneId);
    if (!found) {
      return;
    }
    if (!await confirmBusyTerminals(found.pane)) {
      return;
    }

    let result;
    try {
      result = await api(`/api/panes/${paneId}`, { method: 'DELETE' });
      if (!result.ok) {
        return;
      }
    } catch (error) {
      showToast(error.message);
      return;
    }

    if (state.focusedPaneId === paneId) {
      exitPaneFocus();
    }
    clearUsageRefresh(paneId);
    for (const tab of found.pane.type === 'ai' ? paneTabs(found.pane) : []) {
      aiPane.disposeTab(tab.id);
    }
    const index = found.tab.panes.findIndex((pane) => pane.id === paneId);
    found.tab.panes.splice(index, 1);
    const nextPane = found.tab.panes[Math.max(0, index - 1)] || found.tab.panes[0];
    found.tab.activePaneId = nextPane?.id || '';
    found.session.activePaneId = nextPane?.id || '';
    state.activePaneId = nextPane?.id || '';

    (found.pane.terminalTabs || []).forEach((tab) => disposeTerminal(tab.id));
    state.browserConnections.get(paneId)?.dispose();
    state.browserConnections.delete(paneId);
    delete state.filePaneData[paneId];
    (found.pane.notepadTabs || []).forEach((tab) => {
      delete state.notepadTabData[tab.id];
      window.clearTimeout(state.notepadAutosaveTimers.get(tab.id));
      state.notepadAutosaveTimers.delete(tab.id);
    });
    document.querySelector(`[data-pane="${paneId}"]`)?.remove();
    syncBoardMetrics(found.tab);
    renderSidebarPaneList();
    updateActivePaneUi();
    paneTerminal(state.activePaneId)?.term.focus();
  }

  function startSidebarResize(event) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = state.sidebarWidth || Number(state.config.ui?.sidebar_width) || 286;
    const onMove = (moveEvent) => {
      const width = Math.max(180, Math.min(520, startWidth + moveEvent.clientX - startX));
      state.sidebarWidth = width;
      localStorage.setItem('paneboard.sidebarWidth', String(width));
      document.querySelector('.app')?.style.setProperty('--sidebar-width', `${width}px`);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function editInline(label, value, save, renderLabel) {
    const input = document.createElement('input');
    input.className = 'inline-rename';
    input.value = value.trim();
    label.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = async () => {
      if (committed) {
        return;
      }
      committed = true;
      const nextValue = input.value.trim();
      try {
        if (nextValue && nextValue !== value.trim()) {
          await save(nextValue);
        }
        input.replaceWith(renderLabel(nextValue || value.trim()));
      } catch (error) {
        showToast(error.message);
        input.replaceWith(renderLabel(value.trim()));
      }
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        commit();
      }
      if (event.key === 'Escape') {
        committed = true;
        loadState();
      }
    });
    input.addEventListener('blur', commit);
  }

  function renameSession(sessionId, value) {
    const label = document.querySelector(`[data-rename-session="${sessionId}"]`);
    editInline(label, value, async (name) => {
      await api(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name })
      });
      const session = state.sessions.find((candidate) => candidate.id === sessionId);
      if (session) {
        session.name = name;
      }
      updateSidebarLabels();
    }, (name) => {
      const nextLabel = document.createElement('span');
      nextLabel.dataset.renameSession = sessionId;
      nextLabel.textContent = name;
      nextLabel.ondblclick = (event) => {
        cancelClick();
        event.stopPropagation();
        renameSession(sessionId, nextLabel.textContent);
      };
      return nextLabel;
    });
  }

  function renamePane(paneId, value) {
    const label = document.querySelector(`[data-rename-pane="${paneId}"]`);
    editInline(label, value, async (title) => {
      await api(`/api/panes/${paneId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title })
      });
      const found = findPaneState(paneId);
      if (found) {
        found.pane.title = title;
      }
      updateSidebarLabels();
    }, (title) => {
      const nextLabel = document.createElement('span');
      nextLabel.dataset.renamePane = paneId;
      nextLabel.textContent = title;
      nextLabel.ondblclick = (event) => {
        event.stopPropagation();
        renamePane(paneId, nextLabel.textContent);
      };
      return nextLabel;
    });
  }

  function findPaneState(paneId) {
    for (const session of state.sessions) {
      for (const tab of session.tabs) {
        const pane = tab.panes.find((candidate) => candidate.id === paneId);
        if (pane) {
          return { session, tab, pane };
        }
      }
    }
    return null;
  }

  function updateSidebarLabels() {
    renderSidebarPaneList();
  }

  async function setActivePane(paneId, reloadFiles = true) {
    if (state.activePaneId === paneId) {
      return;
    }

    clearFileSelections();
    state.activePaneId = paneId;
    updateActivePaneUi();
    try {
      await api(`/api/panes/${paneId}/activate`, { method: 'POST' });
    } catch (error) {
      showToast(error.message);
      return;
    }
    const terminal = paneTerminal(paneId);
    if (terminal) {
      terminal.sendResize();
      terminal.term.focus();
    } else {
      const found = findPaneState(paneId);
      if (found?.pane.type === 'files' && reloadFiles) {
        await loadFilesPane(found.pane);
      }
    }
  }

  function updateActivePaneUi() {
    app.querySelectorAll('[data-pane]').forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.pane === state.activePaneId);
    });
    app.querySelectorAll('[data-pane-link]').forEach((button) => {
      const found = findPaneState(button.dataset.paneLink);
      button.classList.toggle('active', Boolean(found) && sidebarPaneRowActive(found.pane, button.dataset.sidebarPaneTab));
    });
    ensureActivePaneVisible();
  }

  function setSidebarOpen(open) {
    state.sidebarOpen = Boolean(open);
    localStorage.setItem('paneboard.sidebarOpen', String(state.sidebarOpen));
    app.querySelector('.app')?.classList.toggle('sidebar-closed', !state.sidebarOpen);
    app.querySelectorAll('[data-action="toggle"]').forEach((button) => {
      button.setAttribute('aria-expanded', String(state.sidebarOpen));
      button.title = state.sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar';
    });
  }

  function setSidebarPinned(pinned) {
    state.sidebarPinned = Boolean(pinned);
    localStorage.setItem('paneboard.sidebarPinned', String(state.sidebarPinned));
    const root = app.querySelector('.app');
    root?.classList.toggle('sidebar-pinned', state.sidebarPinned);
    const button = app.querySelector('[data-sidebar-pin]');
    if (button) {
      const label = state.sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar';
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(state.sidebarPinned));
      button.title = label;
      button.querySelector('.rail-icon').innerHTML = fileActionIcon(state.sidebarPinned ? 'pin-off' : 'pin');
    }
    setSidebarOpen(true);
  }

  function sendMobileTerminalKey(button) {
    const pane = button.closest('[data-pane]');
    const terminal = paneTerminal(pane?.dataset.pane);
    if (!terminal) {
      return;
    }
    const keybar = button.closest('.mobile-keybar');
    const action = button.dataset.terminalAction;
    const value = button.dataset.terminalValue || '';
    if (action === 'modifier') {
      setKeybarModifierState(button, button.dataset.modifierState ? '' : 'armed');
      terminal.term.focus();
      return;
    }
    const prefix = Array.from(consumeKeybarModifiers(keybar))
      .map(modifierShortcutToken)
      .filter(Boolean);
    const input = action === 'text'
      ? terminalTextSequence(value)
      : terminalShortcutSequence([...prefix, value].join('+'));
    terminal.term.input(input, true);
    terminal.term.focus();
  }

  function modifierShortcutToken(value) {
    return { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift' }[value] || '';
  }

  // Modifiers cycle off -> armed (one shot, cleared by the next key) and a
  // double-click locks them on so a run of Ctrl+X presses needs one toggle.
  function setKeybarModifierState(button, modifierState) {
    button.dataset.modifierState = modifierState;
    button.setAttribute('aria-pressed', String(Boolean(modifierState)));
    const name = button.dataset.terminalValue || 'Modifier';
    button.title = modifierState === 'locked'
      ? `${name} locked, click to release`
      : modifierState === 'armed'
        ? `${name} held for the next key, double-click to lock`
        : `${name}, double-click to lock`;
  }

  function consumeKeybarModifiers(keybar) {
    const active = new Set();
    keybar?.querySelectorAll('[data-terminal-action="modifier"]').forEach((button) => {
      if (!button.dataset.modifierState) {
        return;
      }
      active.add(button.dataset.terminalValue);
      if (button.dataset.modifierState === 'armed') {
        setKeybarModifierState(button, '');
      }
    });
    return active;
  }

  // Keys whose escape sequence ends in a letter: CSI D, or CSI 1;<modifier> D.
  const csiLetterKeys = { ArrowLeft: 'D', ArrowDown: 'B', ArrowUp: 'A', ArrowRight: 'C', Home: 'H', End: 'F' };
  // Keys encoded by number: CSI 3 ~, or CSI 3;<modifier> ~.
  const csiNumberKeys = { Delete: '3', PageUp: '5', PageDown: '6' };
  const functionKeySequences = {
    F1: '\x1bOP', F2: '\x1bOQ', F3: '\x1bOR', F4: '\x1bOS',
    F5: '\x1b[15~', F6: '\x1b[17~', F7: '\x1b[18~', F8: '\x1b[19~',
    F9: '\x1b[20~', F10: '\x1b[21~', F11: '\x1b[23~', F12: '\x1b[24~'
  };
  const namedKeySequences = { Escape: '\x1b', Tab: '\t', Enter: '\r', Backspace: '\x7f' };

  function terminalShortcutSequence(shortcut) {
    const parts = String(shortcut || '').split('+').map((part) => part.trim()).filter(Boolean);
    const key = parts.pop() || '';
    const modifiers = new Set(parts.map((part) => part.toLowerCase()));
    const shift = modifiers.has('shift');
    const alt = modifiers.has('alt');
    const ctrl = modifiers.has('ctrl') || modifiers.has('control');
    // xterm's modifier parameter: 1 plus a bit per held modifier.
    const modifier = 1 + (shift ? 1 : 0) + (alt ? 2 : 0) + (ctrl ? 4 : 0);
    if (csiLetterKeys[key]) {
      return modifier > 1 ? `\x1b[1;${modifier}${csiLetterKeys[key]}` : `\x1b[${csiLetterKeys[key]}`;
    }
    if (csiNumberKeys[key]) {
      return modifier > 1 ? `\x1b[${csiNumberKeys[key]};${modifier}~` : `\x1b[${csiNumberKeys[key]}~`;
    }
    if (functionKeySequences[key]) {
      return functionKeySequences[key];
    }
    // Back-tab has its own sequence; without it Shift+Tab reads as a plain Tab.
    if (key === 'Tab' && shift) {
      return '\x1b[Z';
    }
    if (ctrl && key.length === 1) {
      const code = key.toUpperCase().charCodeAt(0);
      return code >= 64 && code <= 95 ? String.fromCharCode(code & 31) : key;
    }
    let value = namedKeySequences[key] || (shift ? key.toUpperCase() : key);
    if (alt) {
      value = `\x1b${value}`;
    }
    return value;
  }

  // Only a named key or a modifier combination counts as a key, so the braces
  // in a real command survive: `${env:PATH}`, `@{a=1}` and `% { $_.Name }` are
  // typed as written. A lone character never needs the brace form, because
  // typing it directly does the same thing.
  function isKeyToken(token) {
    const parts = String(token || '').split('+').map((part) => part.trim()).filter(Boolean);
    const key = parts.pop() || '';
    return parts.length ? isSupportedShortcut(token) : namedShortcutKeys.has(key);
  }

  // A typed-text button may chain keys with braces, so one button can send
  // `claude{Enter}`. `{{` types a literal brace, for text that really wants to
  // read `{Enter}`.
  function terminalTextSequence(text) {
    return String(text || '').replace(/\{\{|\{([^{}]+)\}/g, (match, token) => {
      if (!token) {
        return '{';
      }
      return isKeyToken(token) ? terminalShortcutSequence(token) : match;
    });
  }

  function applyMobileModifiers(element, data) {
    const keybar = element.closest('[data-pane]')?.querySelector('.mobile-keybar');
    // Only a typed character spends a modifier. xterm also reports focus and
    // paste through onData, and those escape sequences used to swallow a held
    // Ctrl before the key it was armed for ever arrived.
    if (!keybar || data.length !== 1) {
      return data;
    }
    const active = consumeKeybarModifiers(keybar);
    if (!active.size) {
      return data;
    }
    let value = data;
    if (active.has('Shift')) {
      value = value.toUpperCase();
    }
    if (active.has('Control')) {
      const code = value.toUpperCase().charCodeAt(0);
      value = value === '?' ? '\x7f'
        : code >= 64 && code <= 95 ? String.fromCharCode(code & 31) : value;
    }
    if (active.has('Alt')) {
      value = `\x1b${value}`;
    }
    return value;
  }

  function closeFloatingSidebarFromOutside(event) {
    if (!app.querySelector('.app') || !state.sidebarOpen || (state.sidebarPinned && !isMobileLayout())) {
      return;
    }
    if (event.target.closest?.('.sidebar, [data-action="toggle"]')) {
      return;
    }
    setSidebarOpen(false);
  }

  function closeMobileSidebarAfterAction(event) {
    if (!isMobileLayout() || !event.target.closest('button') || event.target.closest('[data-action="toggle"]')) {
      return;
    }
    setSidebarOpen(false);
  }

  async function setThemeLive(theme, persist = false) {
    applyTheme(theme);
    hostPane.setTheme();
    for (const item of state.terminals.values()) {
      item.term.options.theme = terminalTheme();
    }
    app.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const dark = themeMode() === 'dark';
      const modeLabel = dark ? 'Dark mode' : 'Light mode';
      button.setAttribute('aria-checked', String(dark));
      button.setAttribute('aria-label', modeLabel);
      button.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
      const icon = button.querySelector('.rail-icon');
      const label = button.querySelector('.rail-label');
      if (icon) icon.textContent = dark ? '☾' : '☀';
      if (label) label.textContent = modeLabel;
    });
    if (persist && state.token) {
      try {
        const config = await api('/api/settings', {
          method: 'POST',
          body: JSON.stringify({ custom_theme: { mode: themeMode() } })
        });
        state.config.custom_theme = config.custom_theme;
      } catch (error) {
        showToast(error.message);
      }
    }
  }

  function wirePaneGrid(root) {
    const grid = root.querySelector?.('.pane-grid') || (root.matches?.('.pane-grid') ? root : null);
    if (!grid) {
      return;
    }
    // Double-clicking empty board space opens a pane in a new column.
    grid.ondblclick = async (event) => {
      if (event.target.closest('[data-pane]')) {
        return;
      }
      await createPane();
    };
    // Scrolling the board, and anything that resizes the board itself (the
    // sidebar opening, the viewport changing), slides every pane sideways
    // without resizing it.
    grid.addEventListener('scroll', refreshHostPaneOffsets, { passive: true });
    new ResizeObserver(refreshHostPaneOffsets).observe(grid);
    grid.addEventListener('wheel', (event) => {
      const paneEl = event.ctrlKey && event.shiftKey ? event.target.closest?.('[data-pane]') : null;
      if (!paneEl) {
        return; // the board scrolls natively; panes keep their own scrolling
      }
      event.preventDefault();
      event.stopPropagation();
      changePaneFontSize(paneEl.dataset.pane, event.deltaY < 0 ? 1 : -1);
    }, { passive: false, capture: true });
  }

  // Stands in for the native scrollbar the bottom tab bar now covers: a track
  // + thumb that mirrors and drives .pane-grid's scrollLeft.
  function wireBoardScroll(root) {
    const grid = root.querySelector?.('.pane-grid');
    const bar = root.querySelector?.('[data-board-hscroll]');
    if (!grid || !bar) {
      return;
    }
    const track = bar.querySelector('[data-board-hscroll-track]');
    const thumb = bar.querySelector('[data-board-hscroll-thumb]');
    const arrows = bar.querySelectorAll('[data-board-scroll-dir]');

    const updateThumb = () => {
      const trackWidth = track.clientWidth;
      const overflow = grid.scrollWidth - grid.clientWidth;
      const scrollable = overflow > 1;
      arrows.forEach((button) => { button.disabled = !scrollable; });
      if (!scrollable) {
        thumb.style.width = `${trackWidth}px`;
        thumb.style.left = '0px';
        return;
      }
      const thumbWidth = Math.max(24, trackWidth * (grid.clientWidth / grid.scrollWidth));
      const maxThumbLeft = trackWidth - thumbWidth;
      thumb.style.width = `${thumbWidth}px`;
      thumb.style.left = `${(grid.scrollLeft / overflow) * maxThumbLeft}px`;
    };

    grid._updateBoardScrollbar = updateThumb;
    grid.addEventListener('scroll', updateThumb, { passive: true });
    const observer = new ResizeObserver(updateThumb);
    observer.observe(grid);
    observer.observe(track);

    arrows.forEach((button) => {
      button.onclick = () => {
        grid.scrollBy({ left: Number(button.dataset.boardScrollDir) * gridSize(), behavior: 'smooth' });
      };
    });

    track.onpointerdown = (event) => {
      const rect = track.getBoundingClientRect();
      const target = ((event.clientX - rect.left) / rect.width) * grid.scrollWidth;
      grid.scrollTo({ left: target - grid.clientWidth / 2, behavior: 'smooth' });
    };

    thumb.onpointerdown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      thumb.classList.add('dragging');
      thumb.setPointerCapture(event.pointerId);
      const trackRect = track.getBoundingClientRect();
      const overflow = grid.scrollWidth - grid.clientWidth;
      thumb.onpointermove = (moveEvent) => {
        const maxThumbLeft = trackRect.width - thumb.offsetWidth;
        if (maxThumbLeft <= 0) {
          return;
        }
        const left = Math.min(maxThumbLeft, Math.max(0, moveEvent.clientX - trackRect.left - thumb.offsetWidth / 2));
        grid.scrollLeft = (left / maxThumbLeft) * overflow;
      };
      thumb.onpointerup = () => {
        thumb.classList.remove('dragging');
        thumb.onpointermove = null;
        thumb.onpointerup = null;
      };
    };

    updateThumb();
  }

  async function createPane(preferredLayout, shell) {
    const session = activeSession();
    const tab = activeTab(session);
    const basePaneId = state.activePaneId || tab?.activePaneId || tab?.panes[0]?.id;
    if (!session || !tab || !basePaneId) {
      return;
    }

    try {
      const pane = await api(`/api/panes/${basePaneId}/split`, {
        method: 'POST',
        body: JSON.stringify({ direction: 'auto', shell: shell || 'powershell' })
      });
      if (preferredLayout) {
        try {
          const result = await api(`/api/panes/${pane.id}/layout`, {
            method: 'PATCH',
            body: JSON.stringify({ layout: preferredLayout })
          });
          pane.layout = result.layout || preferredLayout;
        } catch (error) {
          showToast(error.message);
        }
      }
      appendPaneToWorkspace(session, tab, pane);
    } catch (error) {
      showToast(error.message);
    }
  }


  // Which cell the pointer is over, in board coordinates so a scrolled board
  // still resolves to the cell drawn under the cursor.
  function pointerCell(grid, clientX, clientY) {
    const rect = grid.getBoundingClientRect();
    const rowHeight = rect.height / verticalSlots();
    return {
      x: Math.floor((clientX - rect.left + grid.scrollLeft) / gridSize()),
      y: Math.floor((clientY - rect.top) / rowHeight)
    };
  }

  // Drag and resize both work in whole-cell deltas: the pointer's starting cell
  // is subtracted from its current one, so the pane can only ever land on a
  // cell boundary and never drifts by a stray pixel.
  function startPaneResize(event) {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const paneId = handle.dataset.paneResize;
    const paneElement = handle.closest('[data-pane]');
    const grid = app.querySelector('.pane-grid');
    const found = findPaneState(paneId);
    if (!paneElement || !grid || !found) {
      return;
    }

    const direction = handle.dataset.paneResizeDirection || 'se';
    const startCell = pointerCell(grid, event.clientX, event.clientY);
    const startLayout = normalizePaneLayout(found.pane.layout);
    let nextLayout = startLayout;

    handle.setPointerCapture(event.pointerId);
    const onMove = (moveEvent) => {
      const cell = pointerCell(grid, moveEvent.clientX, moveEvent.clientY);
      const dx = cell.x - startCell.x;
      const dy = cell.y - startCell.y;
      const candidate = { ...startLayout };
      if (direction.includes('e')) candidate.w = startLayout.w + dx;
      if (direction.includes('w')) {
        candidate.x = startLayout.x + dx;
        candidate.w = startLayout.w - dx;
      }
      if (direction.includes('s')) candidate.h = startLayout.h + dy;
      if (direction.includes('n')) {
        candidate.y = startLayout.y + dy;
        candidate.h = startLayout.h - dy;
      }
      // Keep the anchored edge still once the pane is down to a single cell.
      if (direction.includes('w') && candidate.w < 1) {
        candidate.x = startLayout.x + startLayout.w - 1;
      }
      if (direction.includes('n') && candidate.h < 1) {
        candidate.y = startLayout.y + startLayout.h - 1;
      }
      nextLayout = normalizePaneLayout(candidate);
      applyPaneLayoutStyle(paneElement, nextLayout);
      paneElement.classList.toggle('invalid', wouldOverlap(found.tab, paneId, nextLayout));
    };
    const onUp = async () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      paneElement.classList.remove('invalid');
      // Snapping back locally avoids a round trip the server would only refuse.
      if (wouldOverlap(found.tab, paneId, nextLayout)) {
        applyPaneLayoutStyle(paneElement, startLayout);
        return;
      }
      if (!await savePaneLayoutLocal(paneId, nextLayout)) {
        applyPaneLayoutStyle(paneElement, startLayout);
      } else {
        syncBoardMetrics(found.tab);
      }
      paneTerminal(paneId)?.sendResize();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  function startPaneMove(event) {
    if (event.button !== 0 || event.target.closest('.pane-close, button, input, [data-browser-tab], [data-notepad-tab], [data-pane-tab]')) {
      return;
    }
    // The kind icon drags the pane like the rest of the title bar, but it also
    // toggles focus mode on double click. preventDefault() on pointerdown would
    // suppress the compatibility dblclick, and capturing the pointer on the
    // title bar would retarget that dblclick there, so a drag started on the
    // icon captures on the icon itself and leaves the default action alone.
    const icon = event.target.closest('.pane-kind-icon');
    if (!icon) {
      event.preventDefault();
    }

    const title = event.currentTarget;
    const paneId = title.dataset.paneTitle;
    const paneElement = title.closest('[data-pane]');
    const grid = app.querySelector('.pane-grid');
    const found = findPaneState(paneId);
    if (!paneElement || !grid || !found) {
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const startCell = pointerCell(grid, startX, startY);
    const startLayout = normalizePaneLayout(found.pane.layout);
    let nextLayout = startLayout;
    let moved = false;

    const dragSurface = icon || title;
    dragSurface.setPointerCapture(event.pointerId);
    const onMove = (moveEvent) => {
      if (!moved && Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) < 6) {
        return;
      }
      if (!moved) {
        moved = true;
        cancelClick();
        paneElement.classList.add('dragging');
      }
      const cell = pointerCell(grid, moveEvent.clientX, moveEvent.clientY);
      nextLayout = normalizePaneLayout({
        ...startLayout,
        x: startLayout.x + (cell.x - startCell.x),
        y: startLayout.y + (cell.y - startCell.y)
      });
      applyPaneLayoutStyle(paneElement, nextLayout);
      paneElement.classList.toggle('invalid', wouldOverlap(found.tab, paneId, nextLayout));
    };
    const onUp = async () => {
      dragSurface.removeEventListener('pointermove', onMove);
      dragSurface.removeEventListener('pointerup', onUp);
      paneElement.classList.remove('dragging', 'invalid');
      if (!moved) {
        return;
      }
      // Snapping back locally avoids a round trip the server would only refuse.
      if (wouldOverlap(found.tab, paneId, nextLayout)) {
        applyPaneLayoutStyle(paneElement, startLayout);
        await setActivePane(paneId);
        return;
      }
      if (!await savePaneLayoutLocal(paneId, nextLayout)) {
        applyPaneLayoutStyle(paneElement, startLayout);
      } else {
        syncBoardMetrics(found.tab);
      }
      await setActivePane(paneId);
    };
    dragSurface.addEventListener('pointermove', onMove);
    dragSurface.addEventListener('pointerup', onUp);
  }

  async function savePaneLayoutLocal(paneId, layout) {
    try {
      const result = await api(`/api/panes/${paneId}/layout`, {
        method: 'PATCH',
        body: JSON.stringify({ layout })
      });
      const found = findPaneState(paneId);
      if (found) {
        found.pane.layout = result.layout || layout;
      }
      return true;
    } catch (error) {
      showToast(error.message);
      return false;
    }
  }

  function syncPaneTitleWidth(paneElement) {
    const label = paneElement?.querySelector('[data-rename-pane]');
    if (!label || paneElement.clientWidth <= 0) {
      return;
    }
    const status = paneElement.querySelector('.pane-upload-status:not(:empty)');
    const available = Math.max(0, paneElement.clientWidth - 70 - (status ? status.offsetWidth + 8 : 0));
    label.style.width = `${available}px`;
    label.style.maxWidth = `${available}px`;
  }

  function applyPaneLayoutStyle(paneElement, layout) {
    if (!paneElement) {
      return;
    }
    paneElement.style.gridColumn = `${layout.x + 1} / span ${layout.w}`;
    paneElement.style.gridRow = `${layout.y + 1} / span ${layout.h}`;
    refreshHostPaneOffsets();
    syncPaneTitleWidth(paneElement);
    paneElement.querySelectorAll('[data-paged-toolbar]').forEach(updatePagedToolbar);
  }

  function applyPaneLayoutUpdates(tab, paneLayouts) {
    if (!Array.isArray(paneLayouts)) {
      return;
    }
    for (const update of paneLayouts) {
      const pane = tab.panes.find((candidate) => candidate.id === update.id);
      if (!pane) continue;
      const previous = normalizePaneLayout(pane.layout);
      const next = normalizePaneLayout(update.layout);
      pane.layout = next;
      applyPaneLayoutStyle(document.querySelector(`[data-pane="${pane.id}"]`), next);
      if (previous.w !== next.w || previous.h !== next.h) {
        paneTerminal(pane.id)?.sendResize();
      }
    }
  }

  function appendPaneToWorkspace(session, tab, response) {
    const { paneLayouts, ...pane } = response;
    applyPaneLayoutUpdates(tab, paneLayouts);
    tab.panes.push(pane);
    tab.activePaneId = pane.id;
    session.activeTabId = tab.id;
    state.activeSessionId = session.id;
    state.activePaneId = pane.id;

    const grid = app.querySelector('.pane-grid');
    grid?.insertAdjacentHTML('beforeend', renderPane(pane));
    const paneElement = grid?.querySelector(`[data-pane="${pane.id}"]`);
    if (paneElement) {
      wirePaneControls(paneElement);
      wireFilesPane(paneElement);
      wireBrowserPane(paneElement);
      wireNotepadPane(paneElement);
      wireImagePane(paneElement);
      aiPane.wire(paneElement);
      wirePaneTabStrips(paneElement);
      wireMobileKeybarButtons(paneElement);
    }
    syncBoardMetrics(tab);
    renderSidebarPaneList();
    updateActivePaneUi();
    mountPaneContent(pane);
  }

  const DEFAULT_GRID_SIZE = 400;
  const DEFAULT_VERTICAL_SLOTS = 2;
  const MAX_VERTICAL_SLOTS = 24;
  const DEFAULT_PANE_CELLS = 6;
  const BOARD_RESERVE_COLUMNS = 4;

  // Cell width is a fixed pixel size because the board scrolls sideways; cell
  // height is the viewport divided by the configured slot count, so it is only
  // ever resolved in CSS.
  function gridSize() {
    const size = Math.round(Number(state.config?.ui?.grid_size));
    return Number.isFinite(size) ? Math.min(400, Math.max(20, size)) : DEFAULT_GRID_SIZE;
  }

  function verticalSlots() {
    const slots = Math.round(Number(state.config?.ui?.vertical_slots));
    return Number.isFinite(slots) ? Math.min(MAX_VERTICAL_SLOTS, Math.max(1, slots)) : DEFAULT_VERTICAL_SLOTS;
  }

  function defaultPaneWidth() {
    const width = Math.round(Number(state.config?.ui?.default_pane_width));
    return Number.isFinite(width) ? Math.max(1, width) : DEFAULT_PANE_CELLS;
  }

  // Mirrors sanitizeLayout in src/state.js: whole cells, at least one of each,
  // never taller than the board, and pushed back so it always fits.
  function normalizePaneLayout(layout, slots = verticalSlots()) {
    const cell = (value, fallback) => {
      const rounded = Math.round(Number(value));
      return Number.isFinite(rounded) ? rounded : fallback;
    };
    const w = Math.max(1, cell(layout?.w, defaultPaneWidth()));
    const h = Math.min(slots, Math.max(1, cell(layout?.h, slots)));
    return {
      x: Math.max(0, cell(layout?.x, 0)),
      y: Math.min(Math.max(0, cell(layout?.y, 0)), slots - h),
      w,
      h
    };
  }

  // Mirrors overlaps() in src/state.js: sharing a cell is a collision, merely
  // touching edges is not.
  function layoutsOverlap(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  // Checked while dragging so an illegal drop shows up under the cursor rather
  // than as a rejection after the fact.
  function wouldOverlap(tab, paneId, layout) {
    return (tab?.panes || []).some((pane) => pane.id !== paneId
      && layoutsOverlap(layout, normalizePaneLayout(pane.layout)));
  }

  // How many columns the rightmost pane occupies, i.e. how many explicit
  // column tracks the board currently needs.
  function boardExtent(panes) {
    return (panes || []).reduce((max, pane) => {
      const layout = normalizePaneLayout(pane.layout);
      return Math.max(max, layout.x + layout.w);
    }, 0);
  }

  // Pane creation/removal/drag mutate the board outside the normal render
  // path (see appendPaneToWorkspace, closePane, startPaneMove/Resize), so the
  // reserved-column spacer and the scrollbar thumb both need an explicit
  // refresh after each of those -- neither one is rebuilt by a full render.
  function syncBoardMetrics(tab) {
    const grid = app.querySelector('.pane-grid');
    const spacer = grid?.querySelector('.board-reserve');
    if (spacer) {
      spacer.style.gridColumn = `${boardExtent(tab?.panes) + BOARD_RESERVE_COLUMNS} / span 1`;
    }
    grid?._updateBoardScrollbar?.();
  }

  // The board only scrolls horizontally, so bringing a pane into view is just
  // scrolling to the pane itself.
  function ensureActivePaneVisible(behavior = 'smooth') {
    if (isMobileLayout()) {
      return; // the active pane already fills the grid
    }
    const pane = app.querySelector(`[data-pane="${state.activePaneId}"]`);
    if (!pane) {
      return;
    }
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    pane.scrollIntoView({
      behavior: reduceMotion ? 'auto' : behavior,
      inline: 'nearest',
      block: 'nearest'
    });
  }

  // The dashed backdrop and the pane placement read the same two variables, so
  // the cells a pane snaps to are exactly the cells drawn behind it.
  function boardStyle() {
    return `--grid-size: ${gridSize()}px; --vertical-slots: ${verticalSlots()};`;
  }

  function mountTerminal(paneId, terminalTabId) {
    const element = document.getElementById(`terminal-${terminalTabId}`);
    if (!element || state.terminals.has(terminalTabId)) {
      return;
    }

    const term = new Terminal({
      cursorBlink: state.config.terminal?.cursor_blink !== false,
      fontFamily: state.config.ui?.terminal_font_family || 'Consolas, "Cascadia Mono", monospace',
      fontSize: paneFontSize(findPaneState(paneId)?.pane),
      // Not a setting: xterm pre-allocates this buffer and rejects Infinity, so
      // 100k lines stands in for unlimited at well under a megabyte per pane.
      scrollback: TERMINAL_SCROLLBACK_LINES,
      windowsPty: { backend: 'conpty' },
      theme: terminalTheme()
    });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(element);
    const touchScroll = installMobileTerminalTouchScroll(element, term, (clientX, clientY) => {
      openTerminalContextMenu(terminalTabId, clientX, clientY);
    });
    fitTerminal(term, fit, true);
    element.addEventListener('click', () => term.focus());
    element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      // A long press fires this halfway through the gesture; that menu belongs
      // to touchend, once the selection is final.
      if (touchScroll.isTouchActive()) {
        return;
      }
      openTerminalContextMenu(terminalTabId, event.clientX, event.clientY);
    });
    term.attachCustomKeyEventHandler((event) => terminalShortcut(terminalTabId, event));
    term.onTitleChange((title) => updatePaneTitleFromTerminal(paneId, terminalTabId, title));
    term.onBell(() => showTerminalNotification(paneId));
    term.parser.registerOscHandler(9, (data) => handleTerminalOscNotification(paneId, 9, data));
    term.parser.registerOscHandler(99, (data) => handleTerminalOscNotification(paneId, 99, data));
    term.parser.registerOscHandler(777, (data) => handleTerminalOscNotification(paneId, 777, data));

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const writer = createTerminalWriter(term, element);
    let ws = null;
    let reconnectTimer = 0;
    let reconnectDelay = 500;
    let disposed = false;
    let lastCols = 0;
    let lastRows = 0;
    let lastWidth = 0;
    let lastHeight = 0;
    let resizeFrame = 0;
    let resizeTimer = 0;
    const sendResize = () => {
      if (!element.getClientRects().length) {
        return;
      }
      const rect = element.getBoundingClientRect();
      if (Math.round(rect.width) === lastWidth && Math.round(rect.height) === lastHeight) {
        return;
      }
      lastWidth = Math.round(rect.width);
      lastHeight = Math.round(rect.height);
      fitTerminal(term, fit, Boolean(state.config.terminal?.auto_scroll_on_resize));
      if (ws?.readyState === WebSocket.OPEN) {
        if (term.cols !== lastCols || term.rows !== lastRows) {
          lastCols = term.cols;
          lastRows = term.rows;
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      }
    };
    const scheduleResize = () => {
      if (resizeFrame) {
        return;
      }
      if (resizeTimer) {
        window.clearTimeout(resizeTimer);
      }
      resizeTimer = window.setTimeout(() => {
        resizeTimer = 0;
        scheduleResizeNow();
      }, RESIZE_DEBOUNCE_MS);
    };
    const scheduleResizeNow = () => {
      if (resizeFrame) {
        return;
      }
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        sendResize();
      });
    };
    const connect = () => {
      if (disposed) {
        return;
      }
      const socket = new WebSocket(`${protocol}//${location.host}/ws?paneId=${encodeURIComponent(terminalTabId)}&token=${encodeURIComponent(state.token)}`);
      ws = socket;
      socket.onopen = () => {
        reconnectDelay = 500;
        lastWidth = 0;
        lastHeight = 0;
        sendResize();
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'snapshot') {
          term.reset();
          writer.write(message.data || '');
        }
        if (message.type === 'output') {
          writer.write(message.data);
        }
      };
      socket.onclose = (event) => {
        if (disposed || socket !== ws) {
          return;
        }
        if (event.code === 1008 || event.code === 1011) {
          showToast(event.reason || 'Terminal connection rejected.');
          if (event.reason === 'Login required') {
            clearToken();
            renderLogin();
          }
          return;
        }
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      };
    };
    connect();
    term.onData((data) => {
      const input = applyMobileModifiers(element, data);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: input }));
      }
    });
    term.onResize((size) => {
      if (ws?.readyState === WebSocket.OPEN && (size.cols !== lastCols || size.rows !== lastRows)) {
        lastCols = size.cols;
        lastRows = size.rows;
        ws.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }));
      }
    });
    const resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(element);
    window.addEventListener('resize', scheduleResize);
    state.terminals.set(terminalTabId, {
      term,
      fit,
      writer,
      resizeObserver,
      sendResize: scheduleResize,
      sendClear: () => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'clear' }));
        }
      },
      disposeConnection: () => {
        disposed = true;
        window.clearTimeout(reconnectTimer);
        ws?.close();
      },
      cancelResize: () => {
        if (resizeTimer) {
          window.clearTimeout(resizeTimer);
          resizeTimer = 0;
        }
        if (resizeFrame) {
          window.cancelAnimationFrame(resizeFrame);
          resizeFrame = 0;
        }
      }
    });
    if (paneId === state.activePaneId) {
      term.focus();
    }
  }

  // A row that runs all the way to the last column was broken by the terminal,
  // not by the program that wrote it. ConPTY repaints such rows without the
  // wrap flag xterm sets for its own wrapping, so the flag alone is not enough
  // to tell a real newline from a display break.
  function terminalRowIsFull(term, line) {
    if (!line) {
      return false;
    }
    const last = line.getCell(term.cols - 1);
    // The tail half of a double width character carries no text of its own.
    const cell = last && last.getWidth() === 0 ? line.getCell(term.cols - 2) : last;
    const chars = cell?.getChars() || '';
    return chars !== '' && chars !== ' ';
  }

  // Reading the xterm buffer instead of the DOM keeps wrapped lines joined and
  // drops the padding spaces the renderer adds to fill each row.
  function terminalSelectionText(term) {
    const range = term.getSelectionPosition();
    if (!range) {
      return '';
    }
    const buffer = term.buffer.active;
    const lines = [];
    for (let y = range.start.y; y <= range.end.y; y += 1) {
      const line = buffer.getLine(y);
      if (!line) {
        continue;
      }
      const startX = y === range.start.y ? range.start.x : 0;
      const endX = y === range.end.y ? range.end.x : term.cols;
      const text = line.translateToString(true, startX, endX);
      const continuesPreviousRow = lines.length > 0
        && startX === 0
        && (line.isWrapped || terminalRowIsFull(term, buffer.getLine(y - 1)));
      if (continuesPreviousRow) {
        lines[lines.length - 1] += text;
      } else {
        lines.push(text);
      }
    }
    return lines.join('\r\n');
  }

  function copyTerminalSelection(terminalTabId) {
    const term = state.terminals.get(terminalTabId)?.term;
    const text = term ? terminalSelectionText(term) : '';
    if (!text) {
      showToast('No text selected.');
      return;
    }
    copyBrowserText(text);
  }

  function pasteTerminalText(terminalTabId) {
    const terminal = state.terminals.get(terminalTabId);
    if (!terminal) {
      return;
    }
    const fallback = () => {
      terminal.term.focus();
      showToast('Clipboard access is unavailable. Press Ctrl+V to paste.');
    };
    if (!navigator.clipboard?.readText) {
      fallback();
      return;
    }
    navigator.clipboard.readText().then((text) => {
      if (text) {
        terminal.term.paste(text);
      }
    }, fallback);
  }

  function selectAllTerminal(terminalTabId) {
    const terminal = state.terminals.get(terminalTabId);
    terminal?.term.selectAll();
    terminal?.term.focus();
  }

  function clearTerminal(terminalTabId) {
    const terminal = state.terminals.get(terminalTabId);
    if (!terminal) {
      return;
    }
    terminal.term.clear();
    terminal.sendClear();
    terminal.term.focus();
  }

  // xterm hands every key here first; returning false keeps the shortcut out of
  // the shell. Ctrl+C is left alone so it still interrupts the running command.
  function terminalShortcut(terminalTabId, event) {
    if (event.type !== 'keydown' || event.altKey || event.metaKey) {
      return true;
    }
    const key = event.key.toLowerCase();
    // Insert pairs work in plain browser tabs, where Chrome keeps Ctrl+Shift+C.
    if (key === 'insert' && event.ctrlKey !== event.shiftKey) {
      event.preventDefault();
      if (event.ctrlKey) {
        copyTerminalSelection(terminalTabId);
      } else {
        pasteTerminalText(terminalTabId);
      }
      return false;
    }
    if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) {
      return true;
    }
    switch (key) {
      case 'c':
        event.preventDefault();
        copyTerminalSelection(terminalTabId);
        return false;
      case 'v':
        event.preventDefault();
        pasteTerminalText(terminalTabId);
        return false;
      case 'a':
        event.preventDefault();
        selectAllTerminal(terminalTabId);
        return false;
      case 'l':
        event.preventDefault();
        clearTerminal(terminalTabId);
        return false;
      default:
        return true;
    }
  }

  function closeTerminalContextMenu() {
    document.querySelector('.terminal-context-menu')?.remove();
    document.removeEventListener('pointerdown', handleTerminalMenuOutside, true);
    document.removeEventListener('keydown', handleTerminalMenuKey, true);
  }

  function handleTerminalMenuOutside(event) {
    if (!event.target.closest('.terminal-context-menu')) {
      closeTerminalContextMenu();
    }
  }

  function handleTerminalMenuKey(event) {
    if (event.key === 'Escape') {
      closeTerminalContextMenu();
    }
  }

  function openTerminalContextMenu(terminalTabId, clientX, clientY) {
    closeTerminalContextMenu();
    const term = state.terminals.get(terminalTabId)?.term;
    if (!term) {
      return;
    }
    const items = [
      { label: 'Copy', shortcut: 'Ctrl+Shift+C', disabled: !term.hasSelection(), action: () => copyTerminalSelection(terminalTabId) },
      { label: 'Paste', shortcut: 'Ctrl+Shift+V', action: () => pasteTerminalText(terminalTabId) },
      { label: 'Select all', shortcut: 'Ctrl+Shift+A', action: () => selectAllTerminal(terminalTabId) },
      { label: 'Clear', shortcut: 'Ctrl+Shift+L', action: () => clearTerminal(terminalTabId) }
    ];
    const menu = document.createElement('div');
    menu.className = 'terminal-context-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items.map((item, index) => `
      <button type="button" role="menuitem" class="terminal-context-item" data-terminal-context-index="${index}" ${item.disabled ? 'disabled' : ''}>${escapeHtml(item.label)}<span class="terminal-context-shortcut">${escapeHtml(item.shortcut)}</span></button>
    `).join('');
    document.body.appendChild(menu);
    menu.style.left = `${Math.min(clientX, window.innerWidth - menu.offsetWidth - 6)}px`;
    menu.style.top = `${Math.min(clientY, viewportHeight() - menu.offsetHeight - 6)}px`;
    menu.querySelectorAll('[data-terminal-context-index]').forEach((button) => {
      button.onclick = () => {
        const item = items[Number(button.dataset.terminalContextIndex)];
        closeTerminalContextMenu();
        item.action();
      };
    });
    menu.querySelector('button:not([disabled])')?.focus();
    document.addEventListener('pointerdown', handleTerminalMenuOutside, true);
    document.addEventListener('keydown', handleTerminalMenuKey, true);
  }

  function terminalCellAtTouch(element, term, touch) {
    const screen = element.querySelector('.xterm-screen');
    const rect = screen?.getBoundingClientRect();
    if (!rect?.width || !rect.height) {
      return null;
    }
    const column = Math.max(0, Math.min(term.cols - 1, Math.floor((touch.clientX - rect.left) / rect.width * term.cols)));
    const viewportRow = Math.max(0, Math.min(term.rows - 1, Math.floor((touch.clientY - rect.top) / rect.height * term.rows)));
    return { column, row: term.buffer.active.viewportY + viewportRow };
  }

  function terminalWordCell(line, column) {
    return /[\p{L}\p{N}_-]/u.test(line?.getCell(column)?.getChars() || '');
  }

  function selectTerminalWordAtTouch(element, term, touch) {
    const cell = terminalCellAtTouch(element, term, touch);
    const line = cell && term.buffer.active.getLine(cell.row);
    if (!cell || !line) {
      return null;
    }
    let start = cell.column;
    let end = cell.column;
    if (terminalWordCell(line, cell.column)) {
      while (start > 0 && terminalWordCell(line, start - 1)) {
        start -= 1;
      }
      while (end < term.cols - 1 && terminalWordCell(line, end + 1)) {
        end += 1;
      }
    }
    term.select(start, cell.row, end - start + 1);
    return { start: { column: start, row: cell.row }, end: { column: end, row: cell.row } };
  }

  function extendTerminalTouchSelection(element, term, anchor, touch) {
    const cell = terminalCellAtTouch(element, term, touch);
    if (!cell || !anchor) {
      return;
    }
    const beforeAnchor = cell.row < anchor.start.row || (cell.row === anchor.start.row && cell.column < anchor.start.column);
    const start = beforeAnchor ? cell : anchor.start;
    const end = beforeAnchor ? anchor.end : cell;
    const length = (end.row - start.row) * term.cols + end.column - start.column + 1;
    term.select(start.column, start.row, Math.max(1, length));
  }

  function installMobileTerminalTouchScroll(element, term, openContextMenu) {
    const scrollSurface = element.querySelector('.xterm-scrollable-element');
    const longPressDelay = 500;
    const moveTolerance = 10;
    let lastY = 0;
    let startX = 0;
    let startY = 0;
    let longPressTimer = 0;
    let selecting = false;
    let selectionAnchor = null;
    let touchActive = false;
    const cancelLongPress = () => {
      window.clearTimeout(longPressTimer);
      longPressTimer = 0;
    };
    element.addEventListener('touchstart', (event) => {
      cancelLongPress();
      selecting = false;
      selectionAnchor = null;
      if (!isMobileLayout() || event.touches.length !== 1) {
        lastY = 0;
        return;
      }
      touchActive = true;
      const touch = event.touches[0];
      lastY = touch.clientY;
      startX = touch.clientX;
      startY = touch.clientY;
      const point = { clientX: touch.clientX, clientY: touch.clientY };
      longPressTimer = window.setTimeout(() => {
        selecting = true;
        lastY = 0;
        selectionAnchor = selectTerminalWordAtTouch(element, term, point);
        if (!selectionAnchor) {
          selecting = false;
          return;
        }
        element.classList.add('touch-selecting');
        navigator.vibrate?.(12);
      }, longPressDelay);
    }, { passive: true, capture: true });
    element.addEventListener('touchmove', (event) => {
      if (!isMobileLayout() || event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      if (selecting) {
        event.preventDefault();
        extendTerminalTouchSelection(element, term, selectionAnchor, touch);
        return;
      }
      if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > moveTolerance) {
        cancelLongPress();
      }
      if (!lastY) {
        return;
      }
      const nextY = touch.clientY;
      // Dragging down pulls older output back into view, so the text follows the
      // finger the way a page does under a touch.
      const deltaY = nextY - lastY;
      lastY = nextY;
      if (!deltaY) {
        return;
      }
      event.preventDefault();
      scrollSurface?.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaMode: 0,
        deltaY
      }));
    }, { passive: false, capture: true });
    element.addEventListener('touchend', (event) => {
      cancelLongPress();
      if (selecting) {
        event.preventDefault();
        // The menu waits for the finger to lift, so the long press can still be
        // dragged to grow the selection before anything covers the terminal.
        const touch = event.changedTouches[0];
        if (touch) {
          openContextMenu?.(touch.clientX, touch.clientY);
        }
      }
      touchActive = false;
      lastY = 0;
      selecting = false;
      selectionAnchor = null;
      element.classList.remove('touch-selecting');
    }, { passive: false, capture: true });
    element.addEventListener('touchcancel', () => {
      cancelLongPress();
      touchActive = false;
      lastY = 0;
      selecting = false;
      selectionAnchor = null;
      element.classList.remove('touch-selecting');
    }, { passive: true, capture: true });
    return { isTouchActive: () => touchActive };
  }

  function createTerminalWriter(term, element) {
    const maxQueueLength = 2 * 1024 * 1024;
    let queue = '';
    let writing = false;
    let disposed = false;
    let cursorTimer = 0;

    const stabilizeTuiCursor = (data) => {
      const cursorMoves = data.match(/\x1b\[[0-9;?]*[Hf]/g)?.length || 0;
      const alternateScreen = term.buffer.active.type === 'alternate';
      if (!alternateScreen && !data.includes('\x1b[?1049h') && cursorMoves < 2) {
        return;
      }
      element?.classList.add('terminal-updating');
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(() => element?.classList.remove('terminal-updating'), 90);
    };

    const flush = () => {
      if (disposed || writing || !queue) {
        return;
      }
      const chunk = queue;
      queue = '';
      writing = true;
      term.write(chunk, () => {
        writing = false;
        flush();
      });
    };

    return {
      write(data) {
        if (disposed || !data) {
          return;
        }
        stabilizeTuiCursor(data);
        queue += data;
        if (queue.length > maxQueueLength) {
          queue = queue.slice(-maxQueueLength);
        }
        flush();
      },
      dispose() {
        disposed = true;
        queue = '';
        clearTimeout(cursorTimer);
        element?.classList.remove('terminal-updating');
      }
    };
  }

  function fitTerminal(term, fit, scrollToBottom = false) {
    try {
      fit.fit();
      if (scrollToBottom) {
        term.scrollToBottom();
      }
    } catch (error) {
      // xterm can throw while its DOM is being replaced.
    }
  }

  function disposeTerminals() {
    for (const item of state.terminals.values()) {
      disposeTerminalItem(item);
    }
    state.terminals.clear();
    for (const timer of state.terminalTitleTimers.values()) {
      window.clearTimeout(timer);
    }
    state.terminalTitleTimers.clear();
  }

  function disposeTerminal(terminalTabId) {
    window.clearTimeout(state.terminalTitleTimers.get(terminalTabId));
    state.terminalTitleTimers.delete(terminalTabId);
    const item = state.terminals.get(terminalTabId);
    if (!item) {
      return;
    }
    disposeTerminalItem(item);
    state.terminals.delete(terminalTabId);
  }

  function disposeTerminalItem(item) {
    window.removeEventListener('resize', item.sendResize);
    item.cancelResize();
    item.resizeObserver.disconnect();
    item.disposeConnection();
    item.writer?.dispose();
    item.term.dispose();
  }

  async function loadState() {
    const loaded = await api('/api/state');
    state.sessions = loaded.sessions;
    state.persistedActiveSessionId = loaded.activeSessionId;
    render();
  }

  async function load() {
    installKeyboardShortcuts();
    try {
      state.config = await api('/api/config');
      applyTheme(selectedThemeForMode(state.config.custom_theme?.mode || 'dark'));
      if (state.config.authRequired && !state.token) {
        renderLogin();
        return;
      }
      state.pluginPanes = (await api('/api/plugin-panes')).panes;
      await Promise.all([
        loadAiPanePlugins(state.pluginPanes),
        loadHostPanePlugins(state.pluginPanes)
      ]);
      await loadState();
      startNotepadWatch();
    } catch (error) {
      if (error.status === 401) {
        renderLogin();
        return;
      }
      renderConnectionError(error);
    }
  }

  // "2h 14m" reads as time left at a glance, which a reset timestamp does not.
  // Under a minute stays "under a minute" rather than counting seconds down,
  // because the reading only refreshes once a minute.
  function usageCountdown(resetsAt, now = Date.now()) {
    const target = new Date(resetsAt).getTime();
    if (!Number.isFinite(target)) {
      return 'Reset time unavailable';
    }
    const minutes = Math.floor((target - now) / 60000);
    if (minutes < 0) {
      return 'Resetting now';
    }
    if (minutes < 1) {
      return 'Resets in under a minute';
    }
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const parts = [days ? `${days}d` : '', days || hours ? `${hours}h` : '', days ? '' : `${minutes % 60}m`].filter(Boolean);
    return `Resets in ${parts.join(' ')}`;
  }

  function usageLevel(usedPercent) {
    const warn = Number(state.config?.usage?.warn_percent);
    const alert = Number(state.config?.usage?.alert_percent);
    if (Number.isFinite(alert) && usedPercent >= alert) {
      return 'danger';
    }
    if (Number.isFinite(warn) && usedPercent >= warn) {
      return 'warn';
    }
    return '';
  }

  function usageWindowMarkup(window) {
    const used = Math.max(0, Math.min(100, Number(window.usedPercent) || 0));
    const level = usageLevel(used);
    const absolute = window.resetsAt ? new Date(window.resetsAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short', hour12: false }) : '';
    return `
      <div class="usage-window ${level}">
        <div class="usage-window-heading"><span>${escapeHtml(window.label)}</span><strong>${Math.round(used)}%</strong></div>
        <div class="usage-meter" role="progressbar" aria-label="${escapeAttr(window.label)} used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(used)}"><i style="width:${used}%"></i></div>
        <small data-usage-countdown="${escapeAttr(window.resetsAt || '')}" title="${escapeAttr(absolute)}">${escapeHtml(usageCountdown(window.resetsAt))}</small>
      </div>
    `;
  }

  function usageProviderMarkup(provider) {
    if (provider.error) {
      return `
        <article class="usage-card usage-error-card">
          <header><div><h3>${escapeHtml(provider.label)}</h3><small>Unavailable</small></div><span class="usage-state">!</span></header>
          <p>${escapeHtml(provider.error)}</p>
          ${provider.provider === 'minimax' ? '<button class="secondary" type="button" data-usage-settings>Configure</button>' : ''}
        </article>
      `;
    }
    const windows = provider.provider === 'minimax'
      ? (provider.services || []).map((service) => `<div class="usage-service"><h4>${escapeHtml(service.label)}</h4>${(service.windows || []).map(usageWindowMarkup).join('')}</div>`).join('')
      : (provider.windows || []).map(usageWindowMarkup).join('');
    const detail = provider.stale || (provider.provider === 'codex' && provider.plan ? provider.plan : provider.source);
    const credits = provider.credits?.hasCredits || provider.credits?.unlimited
      ? `<div class="usage-credits"><span>Credits</span><strong>${provider.credits.unlimited ? 'Unlimited' : provider.credits.balance}</strong></div>`
      : '';
    const resetExpiry = provider.resetCredits?.expiresAt
      ? ` · expires ${new Date(provider.resetCredits.expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', hour12: false })}`
      : '';
    const resetCredits = provider.resetCredits?.count > 0
      ? `<div class="usage-credits"><span>Reset credits</span><strong>${provider.resetCredits.count}${escapeHtml(resetExpiry)}</strong></div>`
      : '';
    return `
      <article class="usage-card">
        <header><div><h3>${escapeHtml(provider.label)}</h3><small>${escapeHtml(detail || 'Connected')}</small></div><span class="usage-state${provider.stale ? '' : ' ok'}">●</span></header>
        ${windows || '<p>No quota windows returned.</p>'}
        ${credits}
        ${resetCredits}
      </article>
    `;
  }

  function renderUsagePane(pane) {
    return `
      <div class="usage-pane" data-usage-pane="${pane.id}">
        <div class="usage-content" data-usage-content><div class="usage-loading">Reading provider usage…</div></div>
      </div>
    `;
  }

  const usageRefreshTimers = new Map();
  // Notify on the crossing, not on the state: a window that stays over the
  // threshold is announced once. Keying on the reset timestamp cannot do this
  // because the providers return one that drifts by a second between calls.
  const usageWindowLevels = new Map();
  let usageCountdownTimer = 0;

  // The readings themselves only change on refresh, but the time left does not,
  // so the countdown ticks on its own and stops once no pane is showing one.
  function startUsageCountdownTicker() {
    if (usageCountdownTimer) {
      return;
    }
    usageCountdownTimer = setInterval(() => {
      const labels = document.querySelectorAll('[data-usage-countdown]');
      if (!labels.length) {
        clearInterval(usageCountdownTimer);
        usageCountdownTimer = 0;
        return;
      }
      for (const label of labels) {
        label.textContent = usageCountdown(label.dataset.usageCountdown);
      }
    }, 60000);
  }

  function notifyUsageThresholds(providers) {
    const alert = Number(state.config?.usage?.alert_percent);
    if (!state.config?.usage?.notify_quota || !Number.isFinite(alert)) {
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }
    for (const provider of providers) {
      const windows = provider.services
        ? provider.services.flatMap((service) => (service.windows || []).map((window) => ({ ...window, label: `${service.label} ${window.label}` })))
        : provider.windows || [];
      for (const window of windows) {
        const used = Math.round(Math.max(0, Math.min(100, Number(window.usedPercent) || 0)));
        const key = `${provider.provider}:${window.label}`;
        const previous = usageWindowLevels.get(key);
        usageWindowLevels.set(key, used);
        // Unknown counts as below, so a pane opened on an already-red window
        // still says so once. A reset drops it back under and re-arms the alert.
        if (used < alert || (previous !== undefined && previous >= alert)) {
          continue;
        }
        const body = `${window.label} at ${used}%. ${usageCountdown(window.resetsAt)}.`;
        new Notification(`${provider.label} quota`, { body, icon: '/icon.svg', tag: `paneboard-usage-${key}` });
      }
    }
  }

  function clearUsageRefresh(paneId) {
    clearTimeout(usageRefreshTimers.get(paneId));
    usageRefreshTimers.delete(paneId);
  }

  // Re-runs the lookup on the configured interval. 0 minutes turns auto-refresh off.
  function scheduleUsageRefresh(paneId) {
    clearUsageRefresh(paneId);
    const minutes = Number(state.config?.usage?.refresh_minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    usageRefreshTimers.set(paneId, setTimeout(() => loadUsagePane(paneId, true, false), minutes * 60000));
  }

  // `refresh` keeps the readings on screen instead of a spinner. `force` also
  // bypasses the server's shared cache, which only the button does: providers
  // rate limit per account, so several panes ticking together must not each cost
  // a lookup.
  async function loadUsagePane(paneId, refresh = false, force = refresh) {
    const pane = document.querySelector(`[data-pane="${paneId}"]`);
    const content = pane?.querySelector('[data-usage-content]');
    const refreshButton = pane?.querySelector('[data-usage-refresh]');
    if (!content) {
      clearUsageRefresh(paneId);
      return;
    }
    refreshButton.onclick = () => loadUsagePane(paneId, true);
    refreshButton.disabled = true;
    if (!refresh) {
      content.innerHTML = '<div class="usage-loading">Reading provider usage…</div>';
    }
    try {
      const result = force ? await api('/api/usage?refresh=1') : await api('/api/usage');
      const providers = result.providers || [];
      content.innerHTML = providers.length
        ? providers.map(usageProviderMarkup).join('')
        : '<div class="usage-loading">Choose at least one provider in Settings → Usage.</div>';
      content.querySelector('[data-usage-settings]')?.addEventListener('click', openSettings);
      notifyUsageThresholds(providers);
      startUsageCountdownTicker();
    } catch (error) {
      content.innerHTML = `<div class="usage-loading error">${escapeHtml(error.message)}</div>`;
    } finally {
      refreshButton.disabled = false;
      scheduleUsageRefresh(paneId);
    }
  }

  const mobileKeybarModifierOptions = ['Control', 'Alt', 'Shift'];
  const namedShortcutKeys = new Set([
    'Escape', 'Tab', 'Enter', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
  ]);

  function isSupportedShortcut(value) {
    const parts = String(value || '').split('+').map((part) => part.trim()).filter(Boolean);
    const key = parts.pop() || '';
    if (!key) {
      return false;
    }
    const modifiers = parts.map((part) => part.toLowerCase());
    if (modifiers.some((modifier) => !['ctrl', 'control', 'alt', 'shift'].includes(modifier))) {
      return false;
    }
    return namedShortcutKeys.has(key) || key.length === 1;
  }

  // Braces that do not name a key are typed as written, so a command such as
  // `Get-ChildItem | % { $_.Name }` is valid. It is still worth saying so,
  // because a misspelled {Etner} would otherwise fail silently.
  function literalBraceTokens(value) {
    const literal = [];
    String(value || '').replace(/\{\{|\{([^{}]+)\}/g, (match, token) => {
      if (token && !isKeyToken(token)) {
        literal.push(token);
      }
      return match;
    });
    return literal;
  }

  function mobileKeybarRowValidity(action, value) {
    const trimmed = String(value || '').trim();
    if (action === 'text') {
      if (!trimmed) {
        return { valid: false, hint: 'Enter the text to type.' };
      }
      const literal = literalBraceTokens(trimmed);
      return literal.length
        ? { valid: true, hint: `{${literal[0]}} is not a key name, so it is typed as text.` }
        : { valid: true, hint: '' };
    }
    if (action === 'modifier') {
      const valid = mobileKeybarModifierOptions.includes(value);
      return { valid, hint: valid ? '' : 'Pick a modifier.' };
    }
    if (!trimmed) {
      return { valid: false, hint: 'Enter or record a shortcut.' };
    }
    return isSupportedShortcut(trimmed)
      ? { valid: true, hint: '' }
      : { valid: false, hint: 'Unsupported key combination.' };
  }

  function readMobileKeybarRow(row) {
    const action = row.querySelector('[data-mobile-keybar-action]').value;
    const value = action === 'modifier'
      ? row.querySelector('[data-mobile-keybar-modifier]').value
      : row.querySelector('[data-mobile-keybar-value]').value;
    return {
      label: row.querySelector('[data-mobile-keybar-label]').value.trim(),
      action,
      value,
      enabled: row.querySelector('[data-mobile-keybar-enabled]').checked
    };
  }

  function renderMobileKeybarRow(button) {
    const action = button.action || 'shortcut';
    const isModifier = action === 'modifier';
    const modifierValue = isModifier && mobileKeybarModifierOptions.includes(button.value) ? button.value : 'Control';
    return `
      <div class="mobile-keybar-setting-row" data-mobile-keybar-row>
        <span class="mobile-keybar-drag" data-mobile-keybar-drag draggable="true" aria-hidden="true" title="Drag to reorder">⠿</span>
        <label class="mobile-keybar-visible" title="Show on the toolbar"><input type="checkbox" data-mobile-keybar-enabled ${button.enabled !== false ? 'checked' : ''}><span>Show</span></label>
        <label><span>Label</span><input data-mobile-keybar-label maxlength="15" value="${escapeAttr(String(button.label || '').slice(0, 15))}"></label>
        <label><span>Action</span><select data-mobile-keybar-action>
          <option value="shortcut" ${action === 'shortcut' ? 'selected' : ''}>Shortcut</option>
          <option value="modifier" ${action === 'modifier' ? 'selected' : ''}>Modifier</option>
          <option value="text" ${action === 'text' ? 'selected' : ''}>Type text</option>
        </select></label>
        <label class="mobile-keybar-value"><span>Shortcut or text</span>
          <div class="mobile-keybar-value-field" ${isModifier ? 'hidden' : ''}>
            <input data-mobile-keybar-value maxlength="256" value="${escapeAttr(isModifier ? '' : button.value)}" placeholder="${action === 'text' ? 'claude{Enter}' : 'Ctrl+C, Escape, Home, F5'}">
            <button type="button" class="secondary mobile-keybar-record" data-mobile-keybar-record ${action === 'text' ? 'hidden' : ''} title="Record a key combination">Rec</button>
          </div>
          <select class="mobile-keybar-modifier" data-mobile-keybar-modifier ${isModifier ? '' : 'hidden'}>
            ${mobileKeybarModifierOptions.map((modifier) => `<option value="${modifier}" ${modifier === modifierValue ? 'selected' : ''}>${modifier}</option>`).join('')}
          </select>
        </label>
        <div class="mobile-keybar-order" aria-label="Button order">
          <button type="button" class="icon-button" data-mobile-keybar-up aria-label="Move button up" title="Move up">↑</button>
          <button type="button" class="icon-button" data-mobile-keybar-down aria-label="Move button down" title="Move down">↓</button>
          <button type="button" class="icon-button" data-mobile-keybar-duplicate aria-label="Duplicate button" title="Duplicate">⧉</button>
          <button type="button" class="icon-button" data-mobile-keybar-remove aria-label="Remove button" title="Remove">×</button>
        </div>
        <div class="mobile-keybar-hint" data-mobile-keybar-hint aria-live="polite"></div>
      </div>`;
  }

  function renderKeybarPreviewChips(rows) {
    const visible = rows.filter((button) => button.enabled !== false && button.label && mobileKeybarRowValidity(button.action, button.value).valid);
    if (!visible.length) {
      return '<span class="mobile-keybar-preview-empty">No buttons will be shown.</span>';
    }
    return visible.map((button) => `<span class="mobile-keybar-preview-chip">${escapeHtml(button.label)}</span>`).join('');
  }

  function renderMobileKeybarEditor(buttons) {
    const values = Array.isArray(buttons) ? buttons : defaultMobileKeybarButtons;
    return `
      <div class="mobile-keybar-preview" data-mobile-keybar-preview aria-label="Toolbar preview"></div>
      <div class="mobile-keybar-editor" data-mobile-keybar-editor>${values.map(renderMobileKeybarRow).join('')}</div>`;
  }

  function refreshMobileKeybarPreview(container) {
    const editor = container.querySelector('[data-mobile-keybar-editor]');
    const preview = container.querySelector('[data-mobile-keybar-preview]');
    if (!editor) {
      return;
    }
    const rows = Array.from(editor.querySelectorAll('[data-mobile-keybar-row]'));
    rows.forEach((row) => {
      const data = readMobileKeybarRow(row);
      const hasContent = Boolean(data.label || data.value);
      let invalid = false;
      let hint = '';
      if (hasContent) {
        if (!data.label) {
          invalid = true;
          hint = 'Enter a label.';
        } else {
          const validity = mobileKeybarRowValidity(data.action, data.value);
          invalid = !validity.valid;
          hint = validity.hint;
        }
      }
      row.classList.toggle('invalid', invalid);
      const hintEl = row.querySelector('[data-mobile-keybar-hint]');
      if (hintEl) {
        hintEl.textContent = hint;
      }
    });
    if (preview) {
      preview.innerHTML = renderKeybarPreviewChips(rows.map(readMobileKeybarRow));
    }
  }

  function mobileKeybarButtonsFromSettings(form) {
    return Array.from(form.querySelectorAll('[data-mobile-keybar-row]'))
      .map(readMobileKeybarRow)
      .filter((button) => button.label && mobileKeybarRowValidity(button.action, button.value).valid);
  }

  function mobileKeybarSkippedCount(form) {
    return Array.from(form.querySelectorAll('[data-mobile-keybar-row]'))
      .map(readMobileKeybarRow)
      .filter((button) => (button.label || button.value) && !(button.label && mobileKeybarRowValidity(button.action, button.value).valid))
      .length;
  }

  function normalizeRecordedShortcutKey(key) {
    if (key === ' ' || key === 'Spacebar') {
      return ' ';
    }
    return key;
  }

  function syncMobileKeybarRowAction(row) {
    const action = row.querySelector('[data-mobile-keybar-action]').value;
    const field = row.querySelector('.mobile-keybar-value-field');
    const input = row.querySelector('[data-mobile-keybar-value]');
    const record = row.querySelector('[data-mobile-keybar-record]');
    const modifier = row.querySelector('[data-mobile-keybar-modifier]');
    if (field) field.hidden = action === 'modifier';
    if (modifier) modifier.hidden = action !== 'modifier';
    if (record) record.hidden = action === 'text';
    if (input) input.placeholder = action === 'text' ? 'claude{Enter}' : 'Ctrl+C, Escape, Home, F5';
  }

  function startMobileKeybarRecording(recordButton, row, refresh) {
    const input = row.querySelector('[data-mobile-keybar-value]');
    const actionSelect = row.querySelector('[data-mobile-keybar-action]');
    const hintEl = row.querySelector('[data-mobile-keybar-hint]');
    const original = input.value;
    recordButton.classList.add('recording');
    recordButton.textContent = '…';
    if (hintEl) hintEl.textContent = 'Press a key combination…';
    const finish = () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onCancel, true);
      recordButton.classList.remove('recording');
      recordButton.textContent = 'Rec';
      refresh();
    };
    const onCancel = (event) => {
      if (event.target !== recordButton) {
        input.value = original;
        finish();
      }
    };
    const onKey = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
        return;
      }
      const modifiers = [];
      if (event.ctrlKey) modifiers.push('Ctrl');
      if (event.altKey) modifiers.push('Alt');
      if (event.shiftKey) modifiers.push('Shift');
      const combo = [...modifiers, normalizeRecordedShortcutKey(event.key)].join('+');
      if (actionSelect.value !== 'shortcut') {
        actionSelect.value = 'shortcut';
        syncMobileKeybarRowAction(row);
      }
      input.value = combo;
      if (hintEl) {
        hintEl.textContent = isSupportedShortcut(combo) ? '' : 'Unsupported key combination.';
      }
      finish();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onCancel, true);
  }

  function wireMobileKeybarDrag(editor, refresh) {
    let dragged = null;
    editor.addEventListener('dragstart', (event) => {
      const handle = event.target.closest('[data-mobile-keybar-drag]');
      if (!handle) {
        event.preventDefault();
        return;
      }
      dragged = handle.closest('[data-mobile-keybar-row]');
      dragged.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
    });
    editor.addEventListener('dragover', (event) => {
      if (!dragged) {
        return;
      }
      event.preventDefault();
      const over = event.target.closest('[data-mobile-keybar-row]');
      if (!over || over === dragged) {
        return;
      }
      const rect = over.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      editor.insertBefore(dragged, after ? over.nextElementSibling : over);
    });
    editor.addEventListener('drop', (event) => event.preventDefault());
    editor.addEventListener('dragend', () => {
      if (dragged) {
        dragged.classList.remove('dragging');
        dragged = null;
        refresh();
      }
    });
  }

  function wireMobileKeybarEditor(overlay) {
    const container = overlay.querySelector('.mobile-keybar-setting');
    const editor = overlay.querySelector('[data-mobile-keybar-editor]');
    if (!container || !editor) {
      return;
    }
    const refresh = () => refreshMobileKeybarPreview(container);
    const move = (button, direction) => {
      const row = button.closest('[data-mobile-keybar-row]');
      const sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling) {
        return;
      }
      editor.insertBefore(row, direction < 0 ? sibling : sibling.nextElementSibling);
      refresh();
    };
    editor.addEventListener('input', refresh);
    editor.addEventListener('change', (event) => {
      if (event.target.matches('[data-mobile-keybar-action]')) {
        syncMobileKeybarRowAction(event.target.closest('[data-mobile-keybar-row]'));
      }
      refresh();
    });
    editor.addEventListener('click', (event) => {
      const row = event.target.closest('[data-mobile-keybar-row]');
      if (!row) {
        return;
      }
      if (event.target.closest('[data-mobile-keybar-up]')) {
        move(event.target, -1);
      } else if (event.target.closest('[data-mobile-keybar-down]')) {
        move(event.target, 1);
      } else if (event.target.closest('[data-mobile-keybar-remove]')) {
        row.remove();
        refresh();
      } else if (event.target.closest('[data-mobile-keybar-duplicate]')) {
        row.insertAdjacentHTML('afterend', renderMobileKeybarRow(readMobileKeybarRow(row)));
        syncMobileKeybarRowAction(row.nextElementSibling);
        refresh();
      } else if (event.target.closest('[data-mobile-keybar-record]')) {
        startMobileKeybarRecording(event.target.closest('[data-mobile-keybar-record]'), row, refresh);
      }
    });
    wireMobileKeybarDrag(editor, refresh);
    overlay.querySelector('[data-mobile-keybar-add]').onclick = () => {
      editor.insertAdjacentHTML('beforeend', renderMobileKeybarRow({ label: 'Custom', action: 'shortcut', value: 'Ctrl+Shift+C', enabled: true }));
      syncMobileKeybarRowAction(editor.lastElementChild);
      editor.lastElementChild.querySelector('[data-mobile-keybar-label]').focus();
      refresh();
    };
    overlay.querySelector('[data-mobile-keybar-reset]').onclick = () => {
      editor.innerHTML = defaultMobileKeybarButtons.map(renderMobileKeybarRow).join('');
      editor.querySelectorAll('[data-mobile-keybar-row]').forEach(syncMobileKeybarRowAction);
      refresh();
    };
    editor.querySelectorAll('[data-mobile-keybar-row]').forEach(syncMobileKeybarRowAction);
    refresh();
  }

  async function openSettings() {
    let settings;
    try {
      settings = await api('/api/settings');
    } catch (error) {
      showToast(error.message);
      return;
    }

    discardOverlay('.settings-overlay');

    state.customThemeDraft = { ...customThemeDefaults, ...(settings.custom_theme || {}) };
    let savedTheme = state.theme;
    let savedDisplayMode = state.displayMode;
    let savedTerminalDensity = state.mobileTerminalDensity;
    const selectedLight = selectedThemeForMode('light');
    const selectedDark = selectedThemeForMode('dark');
    const notificationCapability = browserNotificationCapability();
    const overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    const fontOptions = [
      { label: 'Consolas', value: 'Consolas, "Cascadia Mono", monospace' },
      { label: 'Cascadia Mono', value: '"Cascadia Mono", Consolas, monospace' },
      { label: 'Cascadia Code', value: '"Cascadia Code", Consolas, monospace' },
      { label: 'JetBrains Mono', value: '"JetBrains Mono", Consolas, monospace' },
      { label: 'Fira Code', value: '"Fira Code", Consolas, monospace' },
      { label: 'Lucida Console', value: '"Lucida Console", monospace' }
    ];
    overlay.innerHTML = `
      <form class="settings-panel">
        <header class="settings-header">
          <div class="product-mark"><span class="brand-mark">${brandIcon()}</span><div><div class="settings-title" id="settings-dialog-title">Paneboard Settings</div><small>Workspace preferences</small></div></div>
          <button class="icon-button" type="button" data-settings-close aria-label="Close settings" title="Close">×</button>
        </header>
        <div class="settings-shell">
          <nav class="settings-nav" aria-label="Settings categories">
            <a aria-label="Appearance" href="#settings-appearance">
              <span class="settings-nav-icon" aria-hidden="true">${fileActionIcon('appearance')}</span><span class="settings-nav-label">Appearance</span>
            </a>
            <a aria-label="Terminal" href="#settings-terminal">
              <span class="settings-nav-icon" aria-hidden="true">${fileActionIcon('terminal')}</span><span class="settings-nav-label">Terminal</span>
            </a>
            <a aria-label="Workspace" href="#settings-workspace">
              <span class="settings-nav-icon" aria-hidden="true">${fileActionIcon('workspace')}</span><span class="settings-nav-label">Workspace</span>
            </a>
            <a aria-label="Shell" href="#settings-shell">
              <span class="settings-nav-icon" aria-hidden="true">${fileActionIcon('shell')}</span><span class="settings-nav-label">Shell</span>
            </a>
            <a aria-label="Files" href="#settings-files">
              <span class="settings-nav-icon" aria-hidden="true">${fileActionIcon('file')}</span><span class="settings-nav-label">Files</span>
            </a>
            <a aria-label="Notepad" href="#settings-notepad">
              <span class="settings-nav-icon" aria-hidden="true">${fileActionIcon('notepad')}</span><span class="settings-nav-label">Notepad</span>
            </a>
            <a aria-label="Usage" href="#settings-usage">
              <span class="settings-nav-icon" aria-hidden="true">${fileActionIcon('usage')}</span><span class="settings-nav-label">Usage</span>
            </a>
            <a aria-label="AI" href="#settings-ai">
              <span class="settings-nav-icon" aria-hidden="true">${fileActionIcon('ai')}</span><span class="settings-nav-label">AI</span>
            </a>
            <a aria-label="Server and security" href="#settings-server">
              <span class="settings-nav-icon" aria-hidden="true">${fileActionIcon('server')}</span><span class="settings-nav-label">Server</span>
            </a>
          </nav>
          <div class="settings-body">
            <section class="settings-section appearance-section" id="settings-appearance">
              <div class="section-heading"><div><h2>Appearance</h2><p>Previewed live — Cancel reverts, Save keeps it.</p></div><span class="live-badge">● Live preview</span></div>
              <input type="hidden" name="custom_theme.mode" value="${escapeAttr(state.customThemeDraft.mode)}">
              <input type="hidden" name="custom_theme.selected_light" value="${escapeAttr(selectedLight)}">
              <input type="hidden" name="custom_theme.selected_dark" value="${escapeAttr(selectedDark)}">
              <div class="theme-mode-setting" data-theme-mode="light">
                <div class="theme-mode-heading"><span>Light mode</span><small>Used whenever Paneboard is in light mode.</small></div>
                <div class="theme-preset-grid" role="group" aria-label="Light theme">
                  ${Object.entries(themePresets).filter(([, theme]) => theme.mode === 'light').map(([id, theme]) => `
                    <button type="button" class="theme-preset ${selectedLight === id ? 'active' : ''}" data-theme-choice="${id}" data-theme-choice-mode="light" aria-pressed="${selectedLight === id}">
                      <span class="theme-swatches" aria-hidden="true"><i style="--swatch:${theme.ink}"></i><i style="--swatch:${theme.panel}"></i><i style="--swatch:${theme.accent}"></i></span><span>${escapeHtml(theme.label)}</span>
                    </button>
                  `).join('')}
                  <button type="button" class="theme-preset ${selectedLight === 'custom-light' ? 'active' : ''}" data-theme-choice="custom-light" data-theme-choice-mode="light" aria-pressed="${selectedLight === 'custom-light'}"><span class="theme-swatches custom" aria-hidden="true"><i></i><i></i><i></i></span><span>Custom Light</span></button>
                </div>
              </div>
              <div class="custom-theme-editor ${selectedLight === 'custom-light' ? '' : 'hidden'}" data-custom-theme-editor="light">
                <div class="custom-theme-heading"><div><h3>Custom Light palette</h3><p>Saved on the Paneboard server and shared across devices.</p></div><button class="secondary custom-theme-reset" type="button" data-custom-theme-reset="light" aria-label="Reset custom light palette" title="Reset to default custom light palette">${fileActionIcon('refresh')}<span>Reset</span></button></div>
                <div class="custom-theme-grid">
                  <label>App background<input name="custom_theme.light_ink" type="color" value="${escapeAttr(state.customThemeDraft.light_ink)}"></label>
                  <label>Panel<input name="custom_theme.light_panel" type="color" value="${escapeAttr(state.customThemeDraft.light_panel)}"></label>
                  <label>Sidebar<input name="custom_theme.light_rail" type="color" value="${escapeAttr(state.customThemeDraft.light_rail)}"></label>
                  <label>Raised surface<input name="custom_theme.light_surface" type="color" value="${escapeAttr(state.customThemeDraft.light_surface)}"></label>
                  <label>Border<input name="custom_theme.light_line" type="color" value="${escapeAttr(state.customThemeDraft.light_line)}"></label>
                  <label>Text<input name="custom_theme.light_text" type="color" value="${escapeAttr(state.customThemeDraft.light_text)}"></label>
                  <label>Muted text<input name="custom_theme.light_muted" type="color" value="${escapeAttr(state.customThemeDraft.light_muted)}"></label>
                  <label>Accent<input name="custom_theme.light_accent" type="color" value="${escapeAttr(state.customThemeDraft.light_accent)}"></label>
                  <label>Warning<input name="custom_theme.light_warn" type="color" value="${escapeAttr(state.customThemeDraft.light_warn)}"></label>
                  <label>Danger<input name="custom_theme.light_danger" type="color" value="${escapeAttr(state.customThemeDraft.light_danger)}"></label>
                  <label>Terminal background<input name="custom_theme.light_terminal_bg" type="color" value="${escapeAttr(state.customThemeDraft.light_terminal_bg)}"></label>
                  <label>Terminal text<input name="custom_theme.light_terminal_fg" type="color" value="${escapeAttr(state.customThemeDraft.light_terminal_fg)}"></label>
                </div>
              </div>
              <div class="theme-mode-setting" data-theme-mode="dark">
                <div class="theme-mode-heading"><span>Dark mode</span><small>Used whenever Paneboard is in dark mode.</small></div>
                <div class="theme-preset-grid" role="group" aria-label="Dark theme">
                  ${Object.entries(themePresets).filter(([, theme]) => theme.mode === 'dark').map(([id, theme]) => `
                    <button type="button" class="theme-preset ${selectedDark === id ? 'active' : ''}" data-theme-choice="${id}" data-theme-choice-mode="dark" aria-pressed="${selectedDark === id}">
                      <span class="theme-swatches" aria-hidden="true"><i style="--swatch:${theme.ink}"></i><i style="--swatch:${theme.panel}"></i><i style="--swatch:${theme.accent}"></i></span><span>${escapeHtml(theme.label)}</span>
                    </button>
                  `).join('')}
                  <button type="button" class="theme-preset ${selectedDark === 'custom-dark' ? 'active' : ''}" data-theme-choice="custom-dark" data-theme-choice-mode="dark" aria-pressed="${selectedDark === 'custom-dark'}"><span class="theme-swatches custom" aria-hidden="true"><i></i><i></i><i></i></span><span>Custom Dark</span></button>
                </div>
              </div>
              <div class="custom-theme-editor ${selectedDark === 'custom-dark' ? '' : 'hidden'}" data-custom-theme-editor="dark">
                <div class="custom-theme-heading"><div><h3>Custom Dark palette</h3><p>Saved on the Paneboard server and shared across devices.</p></div><button class="secondary custom-theme-reset" type="button" data-custom-theme-reset="dark" aria-label="Reset custom dark palette" title="Reset to default custom dark palette">${fileActionIcon('refresh')}<span>Reset</span></button></div>
                <div class="custom-theme-grid">
                  <label>App background<input name="custom_theme.ink" type="color" value="${escapeAttr(state.customThemeDraft.ink)}"></label>
                  <label>Panel<input name="custom_theme.panel" type="color" value="${escapeAttr(state.customThemeDraft.panel)}"></label>
                  <label>Sidebar<input name="custom_theme.rail" type="color" value="${escapeAttr(state.customThemeDraft.rail)}"></label>
                  <label>Raised surface<input name="custom_theme.surface" type="color" value="${escapeAttr(state.customThemeDraft.surface)}"></label>
                  <label>Border<input name="custom_theme.line" type="color" value="${escapeAttr(state.customThemeDraft.line)}"></label>
                  <label>Text<input name="custom_theme.text" type="color" value="${escapeAttr(state.customThemeDraft.text)}"></label>
                  <label>Muted text<input name="custom_theme.muted" type="color" value="${escapeAttr(state.customThemeDraft.muted)}"></label>
                  <label>Accent<input name="custom_theme.accent" type="color" value="${escapeAttr(state.customThemeDraft.accent)}"></label>
                  <label>Warning<input name="custom_theme.warn" type="color" value="${escapeAttr(state.customThemeDraft.warn)}"></label>
                  <label>Danger<input name="custom_theme.danger" type="color" value="${escapeAttr(state.customThemeDraft.danger)}"></label>
                  <label>Terminal background<input name="custom_theme.terminal_bg" type="color" value="${escapeAttr(state.customThemeDraft.terminal_bg)}"></label>
                  <label>Terminal text<input name="custom_theme.terminal_fg" type="color" value="${escapeAttr(state.customThemeDraft.terminal_fg)}"></label>
                </div>
              </div>
              <div class="display-mode-setting">
                <div class="theme-mode-heading"><span>Layout</span><small>Mobile shows one pane at a time. Auto follows the window width.</small></div>
                <div class="segmented" role="group" aria-label="Display mode">
                  ${['auto', 'mobile', 'desktop'].map((mode) => `
                    <button type="button" class="segmented-option ${state.displayMode === mode ? 'active' : ''}" data-display-mode="${mode}" aria-pressed="${state.displayMode === mode}">${mode[0].toUpperCase()}${mode.slice(1)}</button>
                  `).join('')}
                </div>
                <div class="theme-mode-heading"><span>Terminal density</span><small>Dense fits more rows on small screens.</small></div>
                <div class="segmented" role="group" aria-label="Terminal density">
                  ${['readable', 'dense'].map((density) => `
                    <button type="button" class="segmented-option ${state.mobileTerminalDensity === density ? 'active' : ''}" data-terminal-density="${density}" aria-pressed="${state.mobileTerminalDensity === density}">${density === 'dense' ? 'Dense' : 'Readable'}</button>
                  `).join('')}
                </div>
              </div>
              <div class="settings-grid appearance-font-setting">
                <label>System font size<input name="ui.system_font_size" type="number" min="10" max="24" value="${escapeAttr(settings.ui.system_font_size ?? 13)}"><small class="field-hint">${serverOnWindows() ? 'Pixels. Menus, tabs and dialogs. PowerShell and file panes have their own sizes.' : 'Pixels. Menus, tabs and dialogs. Terminal and file panes have their own sizes.'}</small></label>
                <label>Language<select data-language-select>
                  <option value="en" ${window.PaneboardI18n.getLocale() === 'en' ? 'selected' : ''}>English</option>
                  <option value="zh-HK" ${window.PaneboardI18n.getLocale() === 'zh-HK' ? 'selected' : ''}>繁體中文（香港）</option>
                </select></label>
              </div>
            </section>
            <section class="settings-section" id="settings-terminal">
              <div class="section-heading"><div><h2>Terminal</h2><p>${serverOnWindows() ? 'Type, cursor and alerts for every PowerShell pane.' : 'Type, cursor and alerts for every terminal pane.'}</p></div></div>
              <h3 class="settings-subhead">Type</h3>
              <div class="settings-grid">
                <label>Terminal font<select name="ui.terminal_font_family">
                  ${fontOptions.map((font) => `<option value="${escapeAttr(font.value)}" ${font.value === settings.ui.terminal_font_family ? 'selected' : ''}>${escapeHtml(font.label)}</option>`).join('')}
                </select><small class="field-hint">Falls back to Consolas when the font is not installed.</small></label>
                <label>${serverOnWindows() ? 'PowerShell font size' : 'Terminal font size'}<input name="ui.terminal_font_size" type="number" min="8" max="32" value="${escapeAttr(settings.ui.terminal_font_size)}"><small class="field-hint">Pixels, used on desktop.</small></label>
                <label>${serverOnWindows() ? 'PowerShell mobile font size' : 'Terminal mobile font size'}<input name="ui.mobile_terminal_font_size" type="number" min="8" max="24" value="${escapeAttr(settings.ui.mobile_terminal_font_size ?? 12)}"><small class="field-hint">Pixels, used in mobile layout.</small></label>
              </div>
              <h3 class="settings-subhead">Behavior</h3>
              <div class="settings-grid">
                <label class="settings-check"><input name="terminal.cursor_blink" type="checkbox" ${settings.terminal?.cursor_blink !== false ? 'checked' : ''}> Cursor blink<small class="field-hint">Blink the cursor instead of leaving it solid.</small></label>
                <label class="settings-check"><input name="terminal.auto_scroll_on_resize" type="checkbox" ${settings.terminal?.auto_scroll_on_resize ? 'checked' : ''}> Auto scroll on resize<small class="field-hint">Jump back to the newest line after a pane changes size.</small></label>
                <div class="notification-setting settings-wide">
                  <label class="settings-check"><input name="terminal.browser_notifications" type="checkbox" ${settings.terminal?.browser_notifications ? 'checked' : ''} ${notificationCapability.available ? '' : 'disabled'}> Browser notifications for terminal bells<small class="field-hint">Notify when a command rings the bell, for example when it finishes.</small></label>
                  <small class="notification-capability ${notificationCapability.available ? '' : 'blocked'}" data-browser-notification-status>${escapeHtml(notificationCapability.message)}</small>
                </div>
              </div>
              <div class="mobile-keybar-setting">
                <div class="mobile-keybar-setting-heading"><div><h3>${serverOnWindows() ? 'PowerShell shortcut buttons' : 'Terminal shortcut buttons'}</h3><p>${serverOnWindows() ? 'The key row shown under every PowerShell pane, on desktop and mobile. Untick a button to hide it, drag to reorder, or add your own.' : 'The key row shown under every terminal pane, on desktop and mobile. Untick a button to hide it, drag to reorder, or add your own.'}</p></div><div class="mobile-keybar-setting-actions"><button class="secondary" type="button" data-mobile-keybar-reset>Reset to defaults</button><button class="secondary" type="button" data-mobile-keybar-add>${fileActionIcon('add')}<span>Add button</span></button></div></div>
                <ul class="field-hint mobile-keybar-rules"><li>A modifier stays armed for the next key. Double-click it on the toolbar to lock it on.</li><li>Typed text can chain keys with braces, so <code>claude{Enter}</code> types the word and runs it.</li><li>Only a key name counts, so braces in a command such as <code>\${env:PATH}</code> are typed as written. Write <code>{{</code> for text that has to read like a key name.</li></ul>
                ${renderMobileKeybarEditor(settings.terminal?.mobile_keybar_buttons)}
              </div>
            </section>
            <section class="settings-section" id="settings-workspace">
              <div class="section-heading"><div><h2>Workspace</h2><p>Panes snap to a grid of cells. These set the cell size, the size of a new pane, and how often the layout is saved.</p></div></div>
              <h3 class="settings-subhead">Board grid</h3>
              <div class="settings-grid">
                <label>Grid cell width (px)<input name="ui.grid_size" type="number" min="20" max="400" step="10" value="${escapeAttr(settings.ui.grid_size)}"><small class="field-hint">A smaller cell lets panes be sized and moved more finely.</small></label>
                <label>Rows per screen<input name="ui.vertical_slots" type="number" min="1" max="24" value="${escapeAttr(settings.ui.vertical_slots)}"><small class="field-hint">The screen height is split into this many cells. Changing it rescales every open pane.</small></label>
              </div>
              <h3 class="settings-subhead">New panes</h3>
              <div class="settings-grid">
                <label>New pane width (cells)<input name="ui.default_pane_width" type="number" min="1" max="48" value="${escapeAttr(settings.ui.default_pane_width ?? 6)}"><small class="field-hint">Existing panes keep their size.</small></label>
                <label>New pane height (cells)<input name="ui.default_pane_height" type="number" min="1" max="${escapeAttr(settings.ui.vertical_slots)}" value="${escapeAttr(settings.ui.default_pane_height ?? 2)}"><small class="field-hint">Capped at rows per screen, so a new pane never overflows.</small></label>
              </div>
              <h3 class="settings-subhead">Saving</h3>
              <div class="settings-grid">
                <label>Autosave minutes<input name="persistence.autosave_minutes" type="number" min="1" value="${escapeAttr(settings.persistence.autosave_minutes)}"><small class="field-hint">How often the layout is written to disk. It is also saved whenever Paneboard shuts down.</small></label>
              </div>
            </section>
            <section class="settings-section" id="settings-shell">
              <div class="section-heading"><div><h2>Shell</h2><p>${serverOnWindows() ? 'Which PowerShell a new pane starts, and how. Panes already open keep what they started with.' : 'Which shell a new pane starts, and how. Panes already open keep what they started with.'}</p></div></div>
              <div class="settings-grid">
                ${serverOnWindows() ? `<label>PowerShell preferred<input name="shell.preferred" value="${escapeAttr(settings.shell.preferred)}"><small class="field-hint">Tried first. <code>pwsh.exe</code> is PowerShell 7.</small></label>
                <label>PowerShell fallback<input name="shell.fallback" value="${escapeAttr(settings.shell.fallback)}"><small class="field-hint">Used when the preferred one is not installed. <code>powershell.exe</code> ships with Windows.</small></label>` : `<label>Preferred shell<input name="shell.preferred" value="${escapeAttr(settings.shell.preferred)}"><small class="field-hint">Tried first. A name on PATH, such as <code>bash</code>, or a full path.</small></label>
                <label>Fallback shell<input name="shell.fallback" value="${escapeAttr(settings.shell.fallback)}"><small class="field-hint">Used when the preferred one is not installed.</small></label>`}
                <label class="settings-wide">Startup arguments<textarea name="shell.args" rows="3">${escapeHtml((settings.shell.args || []).join('\n'))}</textarea><small class="field-hint">One argument per line, passed on the command line. Clearing this restores the defaults.</small></label>
              </div>
            </section>
            <section class="settings-section" id="settings-files">
              <div class="section-heading"><div><h2>Files</h2><p>Upload limit and text size for file panes.</p></div></div>
              <div class="settings-grid">
                <label>Upload limit (bytes)<input name="file_manager.max_upload_bytes" type="number" min="0" value="${escapeAttr(settings.file_manager?.max_upload_bytes ?? 0)}"><small class="field-hint" data-upload-limit-hint>${escapeHtml(uploadLimitHint(settings.file_manager?.max_upload_bytes ?? 0))}</small></label>
                <label>File pane font size<input name="ui.file_pane_font_size" type="number" min="10" max="24" value="${escapeAttr(settings.ui.file_pane_font_size ?? 13)}"><small class="field-hint">Pixels, used by the file browser and its preview.</small></label>
              </div>
            </section>
            <section class="settings-section" id="settings-notepad">
              <div class="section-heading"><div><h2>Notepad</h2><p>Starting state for newly opened Notepad tabs. Tabs already open keep their own switches.</p></div></div>
              <div class="settings-grid">
                <label class="settings-check"><input name="ui.notepad_word_wrap" type="checkbox" ${settings.ui.notepad_word_wrap ? 'checked' : ''}> Word wrap<small class="field-hint">Wrap long lines instead of scrolling sideways.</small></label>
                <label class="settings-check"><input name="ui.notepad_indent_guides" type="checkbox" ${settings.ui.notepad_indent_guides ? 'checked' : ''}> Indent guides<small class="field-hint">Draw a faint line at each indent level.</small></label>
                <label class="settings-check"><input name="ui.notepad_autosave" type="checkbox" ${settings.ui.notepad_autosave ? 'checked' : ''}> Auto save<small class="field-hint">Write changes back to the file without pressing save.</small></label>
              </div>
            </section>
            <section class="settings-section" id="settings-usage">
              <div class="section-heading"><div><h2>Usage</h2><p>What a Usage pane shows: which provider cards, which quota windows on each card, and when a window changes color.</p></div></div>
              <h3 class="settings-subhead">Provider cards<small>Untick a provider to leave its card out of every Usage pane.</small></h3>
              <div class="settings-grid">
                <label class="settings-check"><input name="usage.show_codex" type="checkbox" ${settings.usage?.show_codex !== false ? 'checked' : ''}> Codex<small class="field-hint">Reads the Codex CLI account signed in on this machine.</small></label>
                <label class="settings-check"><input name="usage.show_claude" type="checkbox" ${settings.usage?.show_claude !== false ? 'checked' : ''}> Claude Code<small class="field-hint">Reads the Claude Code CLI account signed in on this machine.</small></label>
                <label class="settings-check"><input name="usage.show_minimax" type="checkbox" ${settings.usage?.show_minimax !== false ? 'checked' : ''}> MiniMax<small class="field-hint">Needs a Coding Plan API key, entered below.</small></label>
              </div>
              <h3 class="settings-subhead">Quota windows<small>Rows shown on every provider card. A provider that has no such window simply omits it.</small></h3>
              <div class="settings-grid">
                <label class="settings-check"><input name="usage.show_five_hour" type="checkbox" ${settings.usage?.show_five_hour !== false ? 'checked' : ''}> 5-hour window<small class="field-hint">The short rolling limit that resets a few times a day.</small></label>
                <label class="settings-check"><input name="usage.show_weekly" type="checkbox" ${settings.usage?.show_weekly !== false ? 'checked' : ''}> Weekly window<small class="field-hint">The account's overall weekly allowance.</small></label>
                <label class="settings-check"><input name="usage.show_model_weekly" type="checkbox" ${settings.usage?.show_model_weekly !== false ? 'checked' : ''}> Per-model weekly windows<small class="field-hint">One extra row per model that has its own weekly cap.</small></label>
                <label class="settings-check"><input name="usage.show_credits" type="checkbox" ${settings.usage?.show_credits !== false ? 'checked' : ''}> Credit balance<small class="field-hint">Money left on the account, for plans that bill by credit.</small></label>
              </div>
              <h3 class="settings-subhead">Refresh and warnings</h3>
              <div class="settings-grid">
                <label>Auto-refresh minutes<input name="usage.refresh_minutes" type="number" min="0" max="999" step="1" value="${escapeAttr(settings.usage?.refresh_minutes ?? 10)}"><small class="field-hint">0 refreshes only when you ask.</small></label>
                <label>Amber at (%)<input name="usage.warn_percent" type="number" min="0" max="100" step="1" value="${escapeAttr(settings.usage?.warn_percent ?? 75)}"><small class="field-hint">Percent used at which a quota window turns amber.</small></label>
                <label>Red at (%)<input name="usage.alert_percent" type="number" min="0" max="100" step="1" value="${escapeAttr(settings.usage?.alert_percent ?? 90)}"><small class="field-hint">Percent used at which it turns red. Also the notification threshold.</small></label>
                <label class="settings-check"><input name="usage.notify_quota" type="checkbox" ${settings.usage?.notify_quota ? 'checked' : ''} ${notificationCapability.available ? '' : 'disabled'}> Notify when a window turns red<small class="field-hint ${notificationCapability.available ? '' : 'blocked'}">Once per window each reset period.${notificationCapability.available ? '' : ` ${escapeHtml(notificationCapability.message)}`}</small></label>
              </div>
              <div data-minimax-setting class="minimax-setting ${settings.usage?.show_minimax !== false ? '' : 'hidden'}">
                <h3 class="settings-subhead">MiniMax Coding Plan</h3>
                <div class="settings-grid">
                  <label class="settings-wide">API key<input name="usage.minimax_api_key" type="password" autocomplete="off" placeholder="${settings.usage?.minimax_configured ? 'Saved — leave blank to keep it' : 'sk-cp-…'}"><small class="field-hint">${settings.usage?.minimax_configured ? 'A key is saved on this server. Type a new one to replace it.' : 'From the MiniMax Coding Plan dashboard. Stored on this server only.'}</small></label>
                  <label>Region<select name="usage.minimax_region"><option value="global" ${settings.usage?.minimax_region !== 'china' ? 'selected' : ''}>Global</option><option value="china" ${settings.usage?.minimax_region === 'china' ? 'selected' : ''}>China mainland</option></select><small class="field-hint">Which MiniMax endpoint the key belongs to.</small></label>
                  ${settings.usage?.minimax_configured ? '<label class="settings-check"><input name="usage.clear_minimax_api_key" type="checkbox"> Forget the saved key<small class="field-hint">Removes it from this server when you save.</small></label>' : ''}
                </div>
              </div>
              <details class="settings-advanced">
                <summary>Advanced</summary>
                <div class="settings-grid">
                  <label class="settings-wide">Codex home folder<input name="usage.codex_home" type="text" autocomplete="off" placeholder="Blank = search this account's home" value="${escapeAttr(settings.usage?.codex_home || '')}"><small class="field-hint">Where the signed-in Codex CLI credentials (auth.json) are read from. Set it only to pin one profile.</small></label>
                  <label class="settings-wide">Claude Code home folder<input name="usage.claude_home" type="text" autocomplete="off" placeholder="Blank = search this account's home" value="${escapeAttr(settings.usage?.claude_home || '')}"><small class="field-hint">Same for the Claude Code CLI credentials (.credentials.json).</small></label>
                </div>
              </details>
            </section>
            <section class="settings-section" id="settings-ai">
              <div class="section-heading"><div><h2>AI</h2><p>Defaults for new AI tabs. Each tab is its own conversation with the Claude Code or Codex CLI signed in on this server.</p></div></div>
              <div class="settings-grid">
                <label>Default CLI<select name="ai.default_provider"><option value="claude" ${settings.ai?.default_provider !== 'codex' ? 'selected' : ''}>Claude Code</option><option value="codex" ${settings.ai?.default_provider === 'codex' ? 'selected' : ''}>Codex</option></select><small class="field-hint">Which CLI a new AI pane or tab starts.</small></label>
                <label class="settings-check"><input name="ai.show_thinking" type="checkbox" ${settings.ai?.show_thinking !== false ? 'checked' : ''}> Show thinking<small class="field-hint">New tabs start with the agent's reasoning visible. Each tab can be toggled on its own.</small></label>
                <label class="settings-check"><input name="ai.show_tools" type="checkbox" ${settings.ai?.show_tools !== false ? 'checked' : ''}> Show tool calls<small class="field-hint">New tabs start with the commands and file edits visible.</small></label>
              </div>
              <h3 class="settings-subhead">Claude Code<small>Blank model or effort uses whatever the CLI already defaults to. Use the CLI's own /model command to change a conversation in progress.</small></h3>
              <div class="settings-grid">
                <label>Model<input name="ai.claude_model" type="text" autocomplete="off" placeholder="CLI default" value="${escapeAttr(settings.ai?.claude_model || '')}"><small class="field-hint">An alias such as opus or sonnet, or a full model name.</small></label>
                <label>Effort<select name="ai.claude_effort">${['', 'low', 'medium', 'high', 'xhigh', 'max'].map((level) => `<option value="${level}" ${(settings.ai?.claude_effort || '') === level ? 'selected' : ''}>${level || 'CLI default'}</option>`).join('')}</select><small class="field-hint">How much thinking the model does per turn.</small></label>
                <label class="settings-wide">Extra CLI arguments<input name="ai.claude_args" type="text" autocomplete="off" value="${escapeAttr(settings.ai?.claude_args || '')}"><small class="field-hint">Appended to Claude Code when a new tab starts. Shell operators and quoted arguments are not accepted.</small></label>
              </div>
              <h3 class="settings-subhead">Codex</h3>
              <div class="settings-grid">
                <label>Model<input name="ai.codex_model" type="text" autocomplete="off" placeholder="CLI default" value="${escapeAttr(settings.ai?.codex_model || '')}"><small class="field-hint">A model name the Codex CLI accepts.</small></label>
                <label>Effort<input name="ai.codex_effort" type="text" autocomplete="off" placeholder="CLI default" value="${escapeAttr(settings.ai?.codex_effort || '')}"><small class="field-hint">The reasoning effort the Codex CLI accepts.</small></label>
                <label class="settings-wide">Extra CLI arguments<input name="ai.codex_args" type="text" autocomplete="off" value="${escapeAttr(settings.ai?.codex_args || '')}"><small class="field-hint">Placed before app-server when a new tab starts. For example, --yolo runs codex --yolo app-server.</small></label>
              </div>
              <details class="settings-advanced">
                <summary>Advanced</summary>
                <div class="settings-grid">
                  <label class="settings-check"><input name="ai.debug_log" type="checkbox" ${settings.ai?.debug_log ? 'checked' : ''}> Log the raw CLI protocol<small class="field-hint">Writes every frame to data/ai-debug.log, whole conversations included. For diagnosing a pane that misreads its CLI.</small></label>
                </div>
              </details>
            </section>
            <section class="settings-section restart" id="settings-server">
              <div class="section-heading"><div><h2>Server &amp; security</h2><p>Who can reach this workspace, and the password they need. Switching to LAN saves and restarts Paneboard for you.</p></div><span class="restart-badge">△ Restart required</span></div>
              <div class="settings-grid">
                <label>Access<select name="server.host"><option value="127.0.0.1" ${settings.server.host === '127.0.0.1' ? 'selected' : ''}>Local</option><option value="0.0.0.0" ${settings.server.host === '0.0.0.0' ? 'selected' : ''}>LAN</option></select><small class="field-hint">Local: this machine only. LAN: any device on your network, which requires a password.</small></label>
                <label>Port<input name="server.port" type="number" min="1" max="65535" value="${escapeAttr(settings.server.port)}"><small class="field-hint">The address becomes ${settings.server.protocol === 'https' ? 'https' : 'http'}://127.0.0.1:&lt;port&gt;/. Takes effect after a restart.</small></label>
                <label>Protocol<select name="server.protocol"><option value="http" ${settings.server.protocol !== 'https' ? 'selected' : ''}>HTTP</option><option value="https" ${settings.server.protocol === 'https' ? 'selected' : ''}>HTTPS</option></select><small class="field-hint">HTTPS serves a self-signed certificate generated on first use; browsers warn until you trust it. Takes effect after a restart.</small></label>
                <label class="settings-check"><input name="server.open_browser" type="checkbox" ${settings.server.open_browser ? 'checked' : ''}> Open browser on start<small class="field-hint">Open the workspace automatically when Paneboard launches.</small></label>
                <label class="settings-wide">${settings.auth?.password_set ? 'New password' : 'Password'}<input name="auth.password" type="password" autocomplete="new-password" aria-describedby="settings-password-rule" placeholder="${settings.auth?.password_set ? 'Leave blank to keep the current password' : 'Not set — anyone reaching this port can sign in'}"><small class="field-hint" id="settings-password-rule">At least 12 characters, including an upper case letter, a lower case letter, a number and a symbol. Saving a new one signs every device out.</small></label>
              </div>
              <details class="settings-advanced">
                <summary>Advanced</summary>
                <div class="settings-grid">
                  <label class="settings-wide">Allowed hosts<textarea name="server.allowed_hosts" rows="3" spellcheck="false" aria-describedby="settings-allowed-hosts-rule">${escapeHtml((settings.server.allowed_hosts || []).join('\n'))}</textarea><small class="field-hint" id="settings-allowed-hosts-rule">One hostname per line, for a reverse proxy that forwards its own name. Addresses and localhost are always accepted. Use * to accept every name, which turns off DNS rebinding protection. This list applies without a restart.</small></label>
                </div>
              </details>
            </section>
          </div>
        </div>
        <footer class="settings-footer">
          <span class="settings-status" data-settings-status></span>
          <button type="button" class="secondary" data-settings-cancel title="Discard changes and close">Cancel</button>
          <button type="submit" class="secondary" data-settings-apply title="Save and keep this dialog open">Apply</button>
          <button type="submit" class="primary" data-settings-save title="Save and close">Save</button>
        </footer>
      </form>
    `;

    document.body.appendChild(overlay);
    const settingsBody = overlay.querySelector('.settings-body');
    const settingsLinks = [...overlay.querySelectorAll('.settings-nav a')];
    const settingsSections = settingsLinks.map((link) => overlay.querySelector(link.getAttribute('href'))).filter(Boolean);

    function setActiveSettingsSection(sectionId) {
      settingsLinks.forEach((link) => {
        const active = link.getAttribute('href') === `#${sectionId}`;
        link.classList.toggle('active', active);
        active ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current');
      });
    }

    function syncSettingsNav() {
      const atBottom = settingsBody.scrollTop + settingsBody.clientHeight >= settingsBody.scrollHeight - 2;
      let current = atBottom ? settingsSections[settingsSections.length - 1] : settingsSections[0];
      if (!atBottom) {
        const bodyTop = settingsBody.getBoundingClientRect().top + 18;
        for (const section of settingsSections) {
          if (section.getBoundingClientRect().top <= bodyTop) {
            current = section;
          }
        }
      }
      setActiveSettingsSection(current.id);
    }

    // The last section is shorter than the viewport, so without trailing room it
    // can never scroll to the top and clicking its nav entry looks like a no-op.
    function syncSettingsScrollPadding() {
      const last = settingsSections[settingsSections.length - 1];
      if (!last) {
        return;
      }
      const slack = settingsBody.clientHeight - last.offsetHeight - 24;
      const next = `${Math.max(24, Math.round(slack))}px`;
      if (settingsBody.style.paddingBottom !== next) {
        settingsBody.style.paddingBottom = next;
      }
    }

    settingsLinks.forEach((link) => {
      link.onclick = (event) => {
        event.preventDefault();
        const section = overlay.querySelector(link.getAttribute('href'));
        section.scrollIntoView({ block: 'start' });
        setActiveSettingsSection(section.id);
        requestAnimationFrame(() => setActiveSettingsSection(section.id));
      };
    });
    settingsBody.addEventListener('scroll', syncSettingsNav, { passive: true });
    const settingsResizeObserver = new ResizeObserver(() => {
      syncSettingsScrollPadding();
      syncSettingsNav();
    });
    settingsResizeObserver.observe(settingsBody);
    const closeSettings = (restoreTheme = true) => {
      disposeModal();
      settingsResizeObserver.disconnect();
      overlay.remove();
      if (restoreTheme) {
        state.customThemeDraft = null;
        setThemeLive(savedTheme);
        if (state.displayMode !== savedDisplayMode) {
          setDisplayMode(savedDisplayMode, false);
        }
        if (state.mobileTerminalDensity !== savedTerminalDensity) {
          setTerminalDensity(savedTerminalDensity, false);
        }
      }
    };
    const disposeModal = wireModal(overlay.querySelector('.settings-panel'), () => closeSettings(), 'settings-dialog-title');
    overlay._disposeModal = disposeModal;
    const initialSection = settingsSections[0];
    setActiveSettingsSection(initialSection.id);
    requestAnimationFrame(() => {
      syncSettingsScrollPadding();
      initialSection.scrollIntoView({ block: 'start' });
      syncSettingsNav();
    });
    overlay.querySelector('[data-settings-close]').onclick = closeSettings;
    overlay.querySelector('[data-settings-cancel]').onclick = closeSettings;
    overlay.querySelector('[data-language-select]').onchange = (event) => {
      window.PaneboardI18n.setLocale(event.currentTarget.value);
      window.location.reload();
    };
    const syncSegmented = (group, activeButton) => {
      group.querySelectorAll('.segmented-option').forEach((option) => {
        const active = option === activeButton;
        option.classList.toggle('active', active);
        option.setAttribute('aria-pressed', String(active));
      });
    };
    overlay.querySelectorAll('[data-display-mode]').forEach((button) => {
      button.onclick = () => {
        setDisplayMode(button.dataset.displayMode, false);
        syncSegmented(button.closest('.segmented'), button);
      };
    });
    overlay.querySelectorAll('[data-terminal-density]').forEach((button) => {
      button.onclick = () => {
        setTerminalDensity(button.dataset.terminalDensity, false);
        syncSegmented(button.closest('.segmented'), button);
      };
    });
    overlay.querySelectorAll('[data-theme-choice]').forEach((button) => {
      button.onclick = () => {
        const mode = button.dataset.themeChoiceMode;
        const selectedInput = overlay.querySelector(`[name="custom_theme.selected_${mode}"]`);
        selectedInput.value = button.dataset.themeChoice;
        overlay.querySelector('[name="custom_theme.mode"]').value = mode;
        state.customThemeDraft[`selected_${mode}`] = button.dataset.themeChoice;
        state.customThemeDraft.mode = mode;
        applyTheme(button.dataset.themeChoice);
        overlay.querySelector(`[data-custom-theme-editor="${mode}"]`).classList.toggle('hidden', button.dataset.themeChoice !== `custom-${mode}`);
        button.closest('[data-theme-mode]').querySelectorAll('[data-theme-choice]').forEach((choice) => {
          const active = choice === button;
          choice.classList.toggle('active', active);
          choice.setAttribute('aria-pressed', String(active));
        });
        for (const item of state.terminals.values()) {
          item.term.options.theme = terminalTheme();
        }
      };
    });
    overlay.querySelectorAll('[name^="custom_theme."][type="color"]').forEach((input) => {
      input.oninput = () => {
        state.customThemeDraft[input.name.slice('custom_theme.'.length)] = input.value;
        if (state.theme === 'custom-light' || state.theme === 'custom-dark') {
          setThemeLive(state.theme);
        }
      };
    });
    overlay.querySelectorAll('[data-custom-theme-reset]').forEach((button) => {
      button.onclick = () => resetCustomThemePalette(button.dataset.customThemeReset, overlay);
    });
    wireMobileKeybarEditor(overlay);
    const uploadLimitInput = overlay.querySelector('[name="file_manager.max_upload_bytes"]');
    uploadLimitInput.oninput = () => {
      overlay.querySelector('[data-upload-limit-hint]').textContent = uploadLimitHint(uploadLimitInput.value);
    };
    // The MiniMax key and region only matter while its card is shown.
    const minimaxToggle = overlay.querySelector('[name="usage.show_minimax"]');
    minimaxToggle.onchange = () => {
      overlay.querySelector('[data-minimax-setting]').classList.toggle('hidden', !minimaxToggle.checked);
    };
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeSettings();
      }
    });
    overlay.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const settingsForm = event.currentTarget;
      const keepSettingsOpen = event.submitter?.hasAttribute('data-settings-apply') === true;
      const status = overlay.querySelector('[data-settings-status]');
      status.textContent = 'Saving...';
      try {
        for (const name of ['terminal.browser_notifications', 'usage.notify_quota']) {
          const notificationInput = settingsForm.elements[name];
          if (notificationInput?.checked && !notificationInput?.disabled) {
            const permission = await requestBrowserNotificationPermission();
            if (permission !== 'granted') {
              notificationInput.checked = false;
              showToast('Browser notification permission was not granted.');
            }
          }
        }
        const payload = settingsPayload(new FormData(settingsForm), settingsForm);
        const skippedKeybarButtons = mobileKeybarSkippedCount(settingsForm);
        if (skippedKeybarButtons) {
          showToast(`${skippedKeybarButtons} shortcut button(s) skipped: fill in a label and a supported key or text.`);
        }
        const switchingToLan = payload.server.host === '0.0.0.0' && state.config.server.host !== '0.0.0.0';
        const hasPassword = settings.auth?.password_set || Boolean(payload.auth?.password);
        if (payload.server.host === '0.0.0.0' && !hasPassword) {
          status.textContent = 'Set a password before enabling LAN access.';
          const passwordInput = settingsForm.elements['auth.password'];
          passwordInput.scrollIntoView({ block: 'center' });
          passwordInput.focus();
          showToast(status.textContent);
          return;
        }
        payload.restart_after_save = switchingToLan;
        state.config = await api('/api/settings', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        savedTheme = selectedThemeForMode(state.config.custom_theme?.mode || themeMode());
        state.customThemeDraft = { ...customThemeDefaults, ...(state.config.custom_theme || {}) };
        applyTheme(savedTheme);
        // Display mode and density live in localStorage, not the server config.
        localStorage.setItem('paneboard.displayMode', state.displayMode);
        localStorage.setItem('paneboard.mobileTerminalDensity', state.mobileTerminalDensity);
        savedDisplayMode = state.displayMode;
        savedTerminalDensity = state.mobileTerminalDensity;
        applyConfigLive();
        // A new row count rescales every pane on the server. Only the geometry
        // moved, so the panes are repositioned in place: a full render would
        // tear down every terminal connection to change two numbers.
        if (state.config.layoutChanged) {
          const loaded = await api('/api/state');
          state.sessions = loaded.sessions;
          state.persistedActiveSessionId = loaded.activeSessionId;
          for (const pane of activeTab(activeSession())?.panes || []) {
            pane.layout = normalizePaneLayout(pane.layout);
            applyPaneLayoutStyle(document.querySelector(`[data-pane="${pane.id}"]`), pane.layout);
            paneTerminal(pane.id)?.sendResize();
          }
        }
        document.querySelectorAll('[data-pane-type="usage"]').forEach((pane) => loadUsagePane(pane.dataset.pane, true));
        if (state.config.restarting) {
          if (payload.auth?.password) {
            clearToken();
          }
          status.textContent = 'Saved. Restarting Paneboard…';
          showToast(status.textContent, 'success');
          const nextUrl = `${payload.server.protocol === 'https' ? 'https:' : 'http:'}//${location.hostname}:${payload.server.port}/`;
          window.setTimeout(() => location.assign(nextUrl), 1800);
          return;
        }
        if (payload.auth?.password) {
          clearToken();
          closeSettings(false);
          renderLogin();
          showToast('Password changed. Sign in again.', 'success');
          return;
        }
        status.textContent = state.config.restartRequired ? 'Saved. Restart paneboard.exe for host/port changes.' : 'Saved.';
        showToast(status.textContent, 'success');
        if (!keepSettingsOpen) {
          state.customThemeDraft = null;
          closeSettings(false);
        }
      } catch (error) {
        status.textContent = error.message || 'Save failed.';
        showToast(status.textContent);
      }
    });
  }

  function settingsPayload(form, formElement) {
    const notificationInput = formElement.elements['terminal.browser_notifications'];
    // A disabled checkbox is absent from the form data, which would silently
    // clear the stored setting rather than leave it alone.
    const quotaNotifyInput = formElement.elements['usage.notify_quota'];
    const payload = {
      server: {
        host: form.get('server.host'),
        port: numberOrUndefined(form.get('server.port')),
        protocol: form.get('server.protocol'),
        open_browser: form.get('server.open_browser') === 'on',
        allowed_hosts: lines(form.get('server.allowed_hosts'))
      },
      shell: {
        preferred: form.get('shell.preferred'),
        fallback: form.get('shell.fallback'),
        args: lines(form.get('shell.args'))
      },
      persistence: {
        autosave_minutes: numberOrUndefined(form.get('persistence.autosave_minutes'))
      },
      terminal: {
        auto_scroll_on_resize: form.get('terminal.auto_scroll_on_resize') === 'on',
        cursor_blink: form.get('terminal.cursor_blink') === 'on',
        browser_notifications: notificationInput?.disabled
          ? Boolean(state.config.terminal?.browser_notifications)
          : form.get('terminal.browser_notifications') === 'on',
        mobile_keybar_buttons: mobileKeybarButtonsFromSettings(formElement)
      },
      ui: {
        sidebar_width: numberOrUndefined(form.get('ui.sidebar_width')),
        grid_size: numberOrUndefined(form.get('ui.grid_size')),
        vertical_slots: numberOrUndefined(form.get('ui.vertical_slots')),
        default_pane_width: numberOrUndefined(form.get('ui.default_pane_width')),
        default_pane_height: numberOrUndefined(form.get('ui.default_pane_height')),
        terminal_font_family: form.get('ui.terminal_font_family'),
        terminal_font_size: numberOrUndefined(form.get('ui.terminal_font_size')),
        mobile_terminal_font_size: numberOrUndefined(form.get('ui.mobile_terminal_font_size')),
        file_pane_font_size: numberOrUndefined(form.get('ui.file_pane_font_size')),
        system_font_size: numberOrUndefined(form.get('ui.system_font_size')),
        notepad_word_wrap: form.get('ui.notepad_word_wrap') === 'on',
        notepad_indent_guides: form.get('ui.notepad_indent_guides') === 'on',
        notepad_autosave: form.get('ui.notepad_autosave') === 'on'
      },
      file_manager: {
        root_mode: 'drives',
        max_upload_bytes: numberOrUndefined(form.get('file_manager.max_upload_bytes')) || 0
      },
      usage: {
        minimax_region: form.get('usage.minimax_region'),
        refresh_minutes: numberOrUndefined(form.get('usage.refresh_minutes')),
        show_codex: form.get('usage.show_codex') === 'on',
        show_claude: form.get('usage.show_claude') === 'on',
        show_minimax: form.get('usage.show_minimax') === 'on',
        show_five_hour: form.get('usage.show_five_hour') === 'on',
        show_weekly: form.get('usage.show_weekly') === 'on',
        show_model_weekly: form.get('usage.show_model_weekly') === 'on',
        show_credits: form.get('usage.show_credits') === 'on',
        warn_percent: numberOrUndefined(form.get('usage.warn_percent')),
        alert_percent: numberOrUndefined(form.get('usage.alert_percent')),
        notify_quota: quotaNotifyInput?.disabled
          ? Boolean(state.config.usage?.notify_quota)
          : form.get('usage.notify_quota') === 'on',
        codex_home: String(form.get('usage.codex_home') || '').trim(),
        claude_home: String(form.get('usage.claude_home') || '').trim()
      },
      ai: {
        default_provider: form.get('ai.default_provider'),
        show_thinking: form.get('ai.show_thinking') === 'on',
        show_tools: form.get('ai.show_tools') === 'on',
        claude_model: String(form.get('ai.claude_model') || '').trim(),
        claude_effort: String(form.get('ai.claude_effort') || '').trim(),
        claude_args: String(form.get('ai.claude_args') || '').trim(),
        codex_model: String(form.get('ai.codex_model') || '').trim(),
        codex_effort: String(form.get('ai.codex_effort') || '').trim(),
        codex_args: String(form.get('ai.codex_args') || '').trim(),
        debug_log: form.get('ai.debug_log') === 'on'
      },
      custom_theme: customThemeFromForm(form)
    };
    const minimaxApiKey = String(form.get('usage.minimax_api_key') || '').trim();
    if (form.get('usage.clear_minimax_api_key') === 'on') {
      payload.usage.minimax_api_key = '';
    } else if (minimaxApiKey) {
      payload.usage.minimax_api_key = minimaxApiKey;
    }
    const password = String(form.get('auth.password') || '');
    if (password) {
      payload.auth = { password };
    }
    return payload;
  }

  function customThemeFromForm(form) {
    return {
      mode: form.get('custom_theme.mode'),
      selected_light: form.get('custom_theme.selected_light'),
      selected_dark: form.get('custom_theme.selected_dark'),
      ink: form.get('custom_theme.ink'),
      panel: form.get('custom_theme.panel'),
      rail: form.get('custom_theme.rail'),
      surface: form.get('custom_theme.surface'),
      line: form.get('custom_theme.line'),
      text: form.get('custom_theme.text'),
      muted: form.get('custom_theme.muted'),
      accent: form.get('custom_theme.accent'),
      warn: form.get('custom_theme.warn'),
      danger: form.get('custom_theme.danger'),
      terminal_bg: form.get('custom_theme.terminal_bg'),
      terminal_fg: form.get('custom_theme.terminal_fg'),
      light_ink: form.get('custom_theme.light_ink'),
      light_panel: form.get('custom_theme.light_panel'),
      light_rail: form.get('custom_theme.light_rail'),
      light_surface: form.get('custom_theme.light_surface'),
      light_line: form.get('custom_theme.light_line'),
      light_text: form.get('custom_theme.light_text'),
      light_muted: form.get('custom_theme.light_muted'),
      light_accent: form.get('custom_theme.light_accent'),
      light_warn: form.get('custom_theme.light_warn'),
      light_danger: form.get('custom_theme.light_danger'),
      light_terminal_bg: form.get('custom_theme.light_terminal_bg'),
      light_terminal_fg: form.get('custom_theme.light_terminal_fg')
    };
  }

  function resetCustomThemePalette(mode, overlay) {
    const prefix = mode === 'light' ? 'light_' : '';
    for (const key of customThemePaletteKeys) {
      const field = `${prefix}${key}`;
      state.customThemeDraft[field] = customThemeDefaults[field];
      const input = overlay.querySelector(`[name="custom_theme.${field}"]`);
      input.value = customThemeDefaults[field];
    }
    if (state.theme === `custom-${mode}`) {
      setThemeLive(state.theme);
    }
  }

  function lines(value) {
    return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  function numberOrUndefined(value) {
    if (value === null || String(value).trim() === '') {
      return undefined;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  function applyConfigLive() {
    applyUiTypography();
    app.querySelectorAll('.mobile-keybar').forEach((keybar) => {
      keybar.outerHTML = renderMobileKeybar();
    });
    wireMobileKeybarButtons(app);
    const sidebarWidth = state.sidebarWidth || Number(state.config.ui?.sidebar_width) || 286;
    document.querySelector('.app')?.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
    const session = activeSession();
    const tab = activeTab(session);
    const grid = document.querySelector('.pane-grid');
    if (grid && tab) {
      // Cell size and row count drive both the pane placement and the dashed
      // backdrop, so the board picks up a saved setting without a reload.
      grid.setAttribute('style', boardStyle());
      for (const pane of tab.panes) {
        pane.layout = normalizePaneLayout(pane.layout);
        applyPaneLayoutStyle(document.querySelector(`[data-pane="${pane.id}"]`), pane.layout);
      }
    }
    for (const [paneId, item] of state.terminals.entries()) {
      item.term.options.fontFamily = state.config.ui?.terminal_font_family || item.term.options.fontFamily;
      item.term.options.fontSize = paneFontSize(findPaneState(paneId)?.pane);
      item.term.options.theme = terminalTheme();
      item.sendResize();
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value ?? '');
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }

  load();
})();
