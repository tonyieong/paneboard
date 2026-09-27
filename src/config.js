const fs = require('fs');
const path = require('path');
const TOML = require('@iarna/toml');

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

// PSReadLine's inline prediction is what greys the rest of a remembered command
// after the prompt; History is its own default, set explicitly so a profile that
// turned it off still gets it back in a paneboard pane.
// Elsewhere a login shell, so a server started by systemd, with its bare
// environment, still gets the PATH the user's profile sets up.
const defaultShell = process.platform === 'win32'
  ? {
    preferred: 'pwsh.exe',
    fallback: 'powershell.exe',
    args: ['-NoLogo', '-NoExit', '-Command', 'try { Set-PSReadLineOption -PredictionSource History } catch {}']
  }
  : { preferred: 'bash', fallback: 'sh', args: ['-l'] };
const defaultShellArgsLine = `args = ${formatTomlValue(defaultShell.args)}`;

const defaultConfig = {
  server: {
    host: '127.0.0.1',
    port: 5000,
    protocol: 'http',
    open_browser: true,
    allowed_hosts: []
  },
  auth: {
    password_hash: ''
  },
  shell: {
    preferred: defaultShell.preferred,
    fallback: defaultShell.fallback,
    args: defaultShell.args,
    extra_path: []
  },
  persistence: {
    autosave_minutes: 15
  },
  terminal: {
    auto_scroll_on_resize: false,
    cursor_blink: true,
    browser_notifications: false,
    mobile_keybar_buttons: defaultMobileKeybarButtons
  },
  ui: {
    sidebar_width: 286,
    grid_size: 400,
    vertical_slots: 2,
    default_pane_width: 6,
    default_pane_height: 2,
    terminal_font_family: 'Consolas, "Cascadia Mono", monospace',
    terminal_font_size: 13,
    mobile_terminal_font_size: 12,
    file_pane_font_size: 13,
    system_font_size: 13,
    notepad_word_wrap: false,
    notepad_indent_guides: false,
    notepad_autosave: false
  },
  file_manager: {
    root_mode: 'drives',
    max_upload_bytes: 0,
    show_hidden: false,
    bookmarks: []
  },
  browser: {
    bookmarks: [],
    history: []
  },
  usage: {
    minimax_api_key: '',
    minimax_region: 'global',
    refresh_minutes: 10,
    show_codex: true,
    show_claude: true,
    show_minimax: true,
    show_five_hour: true,
    show_weekly: true,
    show_model_weekly: true,
    show_credits: true,
    warn_percent: 75,
    alert_percent: 90,
    notify_quota: false,
    codex_home: '',
    claude_home: ''
  },
  ai: {
    default_provider: 'claude',
    show_thinking: true,
    show_tools: true,
    claude_model: '',
    claude_effort: '',
    claude_args: '--dangerously-skip-permissions',
    codex_model: '',
    codex_effort: '',
    codex_args: '--yolo',
    debug_log: false
  },
  custom_theme: {
    selected_light: 'paneboard-light',
    selected_dark: 'paneboard-dark',
    mode: 'dark',
    ink: '#0c1017',
    panel: '#161b24',
    rail: '#111721',
    surface: '#202735',
    line: '#394354',
    text: '#f4f7fa',
    muted: '#9aa7b8',
    accent: '#6ee7c2',
    warn: '#f0b35a',
    danger: '#ff7676',
    terminal_bg: '#080c12',
    terminal_fg: '#f4f7fa',
    light_ink: '#f5f7f8',
    light_panel: '#ffffff',
    light_rail: '#f2f5f6',
    light_surface: '#edf3f3',
    light_line: '#d7e0e4',
    light_text: '#14202b',
    light_muted: '#667582',
    light_accent: '#159d83',
    light_warn: '#8a4f00',
    light_danger: '#c43d4b',
    light_terminal_bg: '#ffffff',
    light_terminal_fg: '#17232d'
  }
};

const defaultConfigText = `# Settings saved in the web UI update this file.
# Hot reload: [auth], [shell], [persistence], [ui]
# Restart paneboard.exe: server.host, server.port, server.protocol

[server]
# Requires restart: host, port and protocol are bound when paneboard.exe starts.
# Hot reload: open_browser only affects future browser opens.
host = "127.0.0.1"
port = 5000
# "http" or "https". "https" serves a self-signed certificate generated on
# first use (data/tls-cert.pem, data/tls-key.pem); browsers warn until you
# trust it.
protocol = "http"
open_browser = true
# Extra Host header values to accept, for a reverse proxy that forwards its own
# hostname. Addresses and "localhost" are always accepted; any other name is
# rejected so a DNS rebinding page cannot reach this server.
# Use ["*"] to accept every name, which turns that rebinding protection off.
allowed_hosts = []

[auth]
# Hot reload.
password_hash = ""

[shell]
# Hot reload for new panes only. Existing PowerShell processes keep their current executable and args.
preferred = "${defaultShell.preferred}"
fallback = "${defaultShell.fallback}"
${defaultShellArgsLine}
# Folders appended to PATH for new panes. paneboard inherits the PATH it had at
# logon, so a tool installed after that goes missing until paneboard restarts: npm's
# global folder, where claude and codex land, is the usual one.
# extra_path = ["C:\\\\Users\\\\yourname\\\\AppData\\\\Roaming\\\\npm"]
# Panes run whatever those folders hold, so it is editable here only, never
# through the web UI.
extra_path = []

[persistence]
# Hot reload.
autosave_minutes = 15

[terminal]
# Hot reload.
auto_scroll_on_resize = false
cursor_blink = true
browser_notifications = false
mobile_keybar_buttons = ${formatTomlValue(defaultMobileKeybarButtons)}

[ui]
# Hot reload after saving settings in the web UI.
sidebar_width = 286
# Board grid. Cell width is fixed in pixels; cell height is the viewport height
# divided by vertical_slots. Pane sizes are always whole cells.
grid_size = 400
vertical_slots = 2
# Width, in cells, given to a newly created pane.
default_pane_width = 6
# Height, in cells, given to a newly created pane. Capped at vertical_slots.
default_pane_height = 2
terminal_font_family = "Consolas, \\"Cascadia Mono\\", monospace"
terminal_font_size = 13
mobile_terminal_font_size = 12
file_pane_font_size = 13
system_font_size = 13
# Defaults applied to newly opened Notepad tabs.
notepad_word_wrap = false
notepad_indent_guides = false
notepad_autosave = false

[file_manager]
root_mode = "drives"
# 0 means no app-level upload limit.
max_upload_bytes = 0
show_hidden = false
bookmarks = []

[browser]
bookmarks = []
history = []

[usage]
# Codex and Claude Code usage always come from the account signed in on this server.
# MiniMax Coding Plan key. MINIMAX_CODING_API_KEY or MINIMAX_API_KEY takes precedence.
minimax_api_key = ""
minimax_region = "global"
# Usage pane auto-refresh in minutes, 0-999. 0 turns auto-refresh off.
refresh_minutes = 10
show_codex = true
show_claude = true
show_minimax = true
# Quota windows and extras shown on every provider card.
show_five_hour = true
show_weekly = true
show_model_weekly = true
show_credits = true
# Percentages, 0-100, at which a quota window turns amber and then red.
# alert_percent doubles as the notification threshold.
warn_percent = 75
alert_percent = 90
# Raise a browser notification the first time a window crosses alert_percent in
# a given reset period. The browser asks for permission when this is enabled.
notify_quota = false
# Override the Codex/Claude Code home folder used to find the signed-in CLI
# credentials (auth.json / .credentials.json). Leave blank to search: this
# account's home first, then the other profiles beside it, most recent login
# first. Set it only to pin one, e.g. "C:\\Users\\yourname\\.codex".
codex_home = ""
claude_home = ""

[ai]
# The AI pane drives the Claude Code and Codex CLIs signed in on this server.
# Each tab in the pane is a separate conversation with its own CLI process.
# Which CLI a new tab talks to, and whether new tabs start with the agent's
# thinking and tool calls visible.
default_provider = "claude"
show_thinking = true
show_tools = true
# Defaults for new tabs only; use the CLI's own /model command to change a
# conversation already in progress. Blank means "whatever the CLI defaults to".
claude_model = ""
claude_effort = ""
codex_model = ""
codex_effort = ""
# Permissions default to not interrupting, because a terminal pane in this same
# app already runs any command you ask it to -- the AI pane is not handing out
# access that was not there already. The password and allowed_hosts checks in
# [auth] and [server] are what actually guard this, so keep a strong password
# set, especially when server.host is 0.0.0.0.
# Extra CLI arguments for each provider. Codex global flags are placed before
# app-server, so codex_args = "--yolo" launches codex --yolo app-server.
claude_args = "--dangerously-skip-permissions"
codex_args = "--yolo"
# Write every raw CLI protocol frame to data/ai-debug.log. Only for diagnosing
# a pane that misreads its CLI; the log records whole conversations.
debug_log = false

[custom_theme]
selected_light = "paneboard-light"
selected_dark = "paneboard-dark"
mode = "dark"
ink = "#0c1017"
panel = "#161b24"
rail = "#111721"
surface = "#202735"
line = "#394354"
text = "#f4f7fa"
muted = "#9aa7b8"
accent = "#6ee7c2"
warn = "#f0b35a"
danger = "#ff7676"
terminal_bg = "#080c12"
terminal_fg = "#f4f7fa"
light_ink = "#f5f7f8"
light_panel = "#ffffff"
light_rail = "#f2f5f6"
light_surface = "#edf3f3"
light_line = "#d7e0e4"
light_text = "#14202b"
light_muted = "#667582"
light_accent = "#159d83"
light_warn = "#8a4f00"
light_danger = "#c43d4b"
light_terminal_bg = "#ffffff"
light_terminal_fg = "#17232d"
`;

function deepMerge(base, value) {
  const result = { ...base };
  for (const [key, nextValue] of Object.entries(value || {})) {
    if (nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue)) {
      result[key] = deepMerge(base[key] || {}, nextValue);
    } else {
      result[key] = nextValue;
    }
  }
  return result;
}

function appRoot() {
  if (process.pkg) {
    return path.dirname(process.execPath);
  }
  return path.resolve(__dirname, '..');
}

function loadConfig(root = appRoot()) {
  const configPath = path.join(root, 'config.toml');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, defaultConfigText);
  }

  const configText = normalizeConfigText(fs.readFileSync(configPath, 'utf8'));
  fs.writeFileSync(configPath, configText);
  const parsed = TOML.parse(configText);
  const config = deepMerge(defaultConfig, parsed);
  const port = Number(config.server.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    config.server.port = defaultConfig.server.port;
  } else {
    config.server.port = port;
  }
  if (config.server.protocol !== 'https') {
    config.server.protocol = 'http';
  }

  if (config.server.host === '0.0.0.0' && !config.auth.password_hash) {
    throw new Error('Binding to 0.0.0.0 requires auth.password_hash in config.toml.');
  }

  return { config, configPath, root };
}

function normalizeConfigText(configText) {
  let nextText = configText
    .replace(/^port\s*=\s*5_000\s*$/m, 'port = 5000')
    .replace(/^allowlist\s*=\s*\[\s*"codex"\s*\]\s*$/m, 'allowlist = []')
    .replace(/^args\s*=\s*\["-NoLogo",\s*"-NoProfile",\s*"-NoExit",\s*"-Command",\s*"try \{ Set-PSReadLineOption -PredictionSource None \} catch \{\}; Clear-Host"\]\s*$/m, defaultShellArgsLine)
    .replace(/^args\s*=\s*\["-NoLogo",\s*"-NoExit",\s*"-Command",\s*"try \{ Set-PSReadLineOption -PredictionSource None \} catch \{\}; Clear-Host"\]\s*$/m, defaultShellArgsLine)
    // Predictions used to be turned off for every pane; the setting is worth
    // more than the tidier prompt, so an untouched shell line gets them back.
    .replace(/^args\s*=\s*\["-NoLogo",\s*"-NoExit",\s*"-Command",\s*"try \{ Set-PSReadLineOption -PredictionSource None \} catch \{\}"\]\s*$/m, defaultShellArgsLine)
    .replace(/^args\s*=\s*\[\s*\]\s*$/m, defaultShellArgsLine);

  nextText = ensureTomlKey(nextText, 'shell', 'extra_path', defaultConfig.shell.extra_path);
  nextText = ensureTomlKey(nextText, 'server', 'protocol', defaultConfig.server.protocol);

  if (!/^\[ui\]\s*$/m.test(nextText)) {
    nextText = `${nextText.trimEnd()}

[ui]
sidebar_width = ${defaultConfig.ui.sidebar_width}
grid_size = ${defaultConfig.ui.grid_size}
vertical_slots = ${defaultConfig.ui.vertical_slots}
default_pane_width = ${defaultConfig.ui.default_pane_width}
default_pane_height = ${defaultConfig.ui.default_pane_height}
terminal_font_family = "${defaultConfig.ui.terminal_font_family.replaceAll('"', '\\"')}"
terminal_font_size = ${defaultConfig.ui.terminal_font_size}
mobile_terminal_font_size = ${defaultConfig.ui.mobile_terminal_font_size}
file_pane_font_size = ${defaultConfig.ui.file_pane_font_size}
system_font_size = ${defaultConfig.ui.system_font_size}
notepad_word_wrap = ${defaultConfig.ui.notepad_word_wrap}
notepad_indent_guides = ${defaultConfig.ui.notepad_indent_guides}
notepad_autosave = ${defaultConfig.ui.notepad_autosave}
`;
  }

  if (/^\[ui\]\s*$/m.test(nextText)) {
    nextText = ensureTomlKey(nextText, 'ui', 'grid_size', defaultConfig.ui.grid_size);
    nextText = ensureTomlKey(nextText, 'ui', 'vertical_slots', defaultConfig.ui.vertical_slots);
    nextText = ensureTomlKey(nextText, 'ui', 'default_pane_width', defaultConfig.ui.default_pane_width);
    nextText = ensureTomlKey(nextText, 'ui', 'default_pane_height', defaultConfig.ui.default_pane_height);
    nextText = ensureTomlKey(nextText, 'ui', 'terminal_font_family', defaultConfig.ui.terminal_font_family);
    nextText = ensureTomlKey(nextText, 'ui', 'terminal_font_size', defaultConfig.ui.terminal_font_size);
    nextText = ensureTomlKey(nextText, 'ui', 'mobile_terminal_font_size', defaultConfig.ui.mobile_terminal_font_size);
    nextText = ensureTomlKey(nextText, 'ui', 'file_pane_font_size', defaultConfig.ui.file_pane_font_size);
    nextText = ensureTomlKey(nextText, 'ui', 'system_font_size', defaultConfig.ui.system_font_size);
    nextText = ensureTomlKey(nextText, 'ui', 'notepad_word_wrap', defaultConfig.ui.notepad_word_wrap);
    nextText = ensureTomlKey(nextText, 'ui', 'notepad_indent_guides', defaultConfig.ui.notepad_indent_guides);
    nextText = ensureTomlKey(nextText, 'ui', 'notepad_autosave', defaultConfig.ui.notepad_autosave);
  }
  if (!/^\[file_manager\]\s*$/m.test(nextText)) {
    nextText = `${nextText.trimEnd()}

[file_manager]
root_mode = "drives"
max_upload_bytes = 0
show_hidden = false
bookmarks = []
`;
  }
  if (/^\[file_manager\]\s*$/m.test(nextText)) {
    nextText = ensureTomlKey(nextText, 'file_manager', 'root_mode', defaultConfig.file_manager.root_mode);
    nextText = ensureTomlKey(nextText, 'file_manager', 'max_upload_bytes', defaultConfig.file_manager.max_upload_bytes);
    nextText = ensureTomlKey(nextText, 'file_manager', 'show_hidden', defaultConfig.file_manager.show_hidden);
    nextText = ensureTomlKey(nextText, 'file_manager', 'bookmarks', defaultConfig.file_manager.bookmarks);
  }
  if (!/^\[browser\]\s*$/m.test(nextText)) {
    nextText = `${nextText.trimEnd()}\n\n[browser]\nbookmarks = []\nhistory = []\n`;
  }
  nextText = ensureTomlKey(nextText, 'browser', 'bookmarks', defaultConfig.browser.bookmarks);
  nextText = ensureTomlKey(nextText, 'browser', 'history', defaultConfig.browser.history);
  if (!/^\[usage\]\s*$/m.test(nextText)) {
    nextText = `${nextText.trimEnd()}\n\n[usage]\nminimax_api_key = ""\nminimax_region = "global"\n`;
  }
  for (const key of Object.keys(defaultConfig.usage)) {
    nextText = ensureTomlKey(nextText, 'usage', key, defaultConfig.usage[key]);
  }
  if (!/^\[ai\]\s*$/m.test(nextText)) {
    nextText = `${nextText.trimEnd()}\n\n[ai]\ndefault_provider = "claude"\n`;
  }
  if (!/^claude_args\s*=/m.test(nextText)) {
    const legacyMode = /^claude_permission_mode\s*=\s*"([^"]+)"\s*$/m.exec(nextText)?.[1];
    const legacyArgs = legacyMode
      ? `--permission-mode ${legacyMode}${legacyMode === 'bypassPermissions' ? ' --allow-dangerously-skip-permissions' : ''}`
      : defaultConfig.ai.claude_args;
    nextText = ensureTomlKey(nextText, 'ai', 'claude_args', legacyArgs);
  }
  if (!/^codex_args\s*=/m.test(nextText)) {
    const sandbox = /^codex_sandbox_mode\s*=\s*"([^"]+)"\s*$/m.exec(nextText)?.[1];
    const approval = /^codex_approval_policy\s*=\s*"([^"]+)"\s*$/m.exec(nextText)?.[1];
    const legacyArgs = sandbox === 'danger-full-access' && approval === 'never'
      ? '--yolo'
      : [sandbox && `--sandbox ${sandbox}`, approval && `--ask-for-approval ${approval}`].filter(Boolean).join(' ')
        || defaultConfig.ai.codex_args;
    nextText = ensureTomlKey(nextText, 'ai', 'codex_args', legacyArgs);
  }
  for (const key of Object.keys(defaultConfig.ai)) {
    nextText = ensureTomlKey(nextText, 'ai', key, defaultConfig.ai[key]);
  }
  if (!/^\[terminal\]\s*$/m.test(nextText)) {
    nextText = `${nextText.trimEnd()}

[terminal]
auto_scroll_on_resize = false
cursor_blink = true
browser_notifications = false
mobile_keybar_buttons = ${formatTomlValue(defaultMobileKeybarButtons)}
`;
  }
  if (/^\[terminal\]\s*$/m.test(nextText)) {
    nextText = ensureTomlKey(nextText, 'terminal', 'auto_scroll_on_resize', defaultConfig.terminal.auto_scroll_on_resize);
    nextText = ensureTomlKey(nextText, 'terminal', 'cursor_blink', defaultConfig.terminal.cursor_blink);
    nextText = ensureTomlKey(nextText, 'terminal', 'browser_notifications', defaultConfig.terminal.browser_notifications);
    nextText = ensureTomlKey(nextText, 'terminal', 'mobile_keybar_buttons', defaultConfig.terminal.mobile_keybar_buttons);
  }
  if (!/^\[custom_theme\]\s*$/m.test(nextText)) {
    nextText = `${nextText.trimEnd()}\n\n[custom_theme]\n`;
  }
  for (const [key, value] of Object.entries(defaultConfig.custom_theme)) {
    nextText = ensureTomlKey(nextText, 'custom_theme', key, value);
  }
  // Preserve existing theme selections when upgrading from the previous brand.
  nextText = nextText.replace(/^(selected_(?:light|dark)\s*=\s*["'])wps-(light|dark)(["'].*)$/gm, '$1paneboard-$2$3');

  return nextText;
}

function formatTomlValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map(formatTomlValue).join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    return `{ ${Object.entries(value).map(([key, nextValue]) => `${key} = ${formatTomlValue(nextValue)}`).join(', ')} }`;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function sectionRange(configText, section) {
  const startMatch = new RegExp(`^\\[${section}\\]\\s*$`, 'm').exec(configText);
  if (!startMatch) {
    return null;
  }
  const start = startMatch.index + startMatch[0].length;
  const rest = configText.slice(start);
  const nextMatch = /^\[[^\]]+\]\s*$/m.exec(rest);
  return {
    start,
    end: nextMatch ? start + nextMatch.index : configText.length
  };
}

function ensureTomlKey(configText, section, key, value) {
  const range = sectionRange(configText, section);
  if (!range) {
    return `${configText.trimEnd()}\n\n[${section}]\n${key} = ${formatTomlValue(value)}\n`;
  }
  const body = configText.slice(range.start, range.end);
  if (new RegExp(`^${key}\\s*=`, 'm').test(body)) {
    return configText;
  }
  return `${configText.slice(0, range.end).trimEnd()}\n${key} = ${formatTomlValue(value)}\n${configText.slice(range.end)}`;
}

function setTomlKey(configText, section, key, value) {
  let nextText = ensureTomlKey(configText, section, key, value);
  const range = sectionRange(nextText, section);
  const body = nextText.slice(range.start, range.end);
  const nextBody = body.replace(new RegExp(`^${key}\\s*=.*$`, 'm'), `${key} = ${formatTomlValue(value)}`);
  return `${nextText.slice(0, range.start)}${nextBody}${nextText.slice(range.end)}`;
}

function updateConfigFile(root, updates) {
  const configPath = path.join(root, 'config.toml');
  let configText = normalizeConfigText(fs.readFileSync(configPath, 'utf8'));
  const allowed = {
    server: ['host', 'port', 'protocol', 'open_browser', 'allowed_hosts'],
    auth: ['password_hash'],
    shell: ['preferred', 'fallback', 'args'],
    persistence: ['autosave_minutes'],
    terminal: ['auto_scroll_on_resize', 'cursor_blink', 'browser_notifications', 'mobile_keybar_buttons'],
    ui: ['sidebar_width', 'grid_size', 'vertical_slots', 'default_pane_width', 'default_pane_height', 'terminal_font_family', 'terminal_font_size', 'mobile_terminal_font_size', 'file_pane_font_size', 'system_font_size', 'notepad_word_wrap', 'notepad_indent_guides', 'notepad_autosave'],
    file_manager: ['root_mode', 'max_upload_bytes', 'show_hidden', 'bookmarks'],
    browser: ['bookmarks', 'history'],
    usage: Object.keys(defaultConfig.usage),
    ai: Object.keys(defaultConfig.ai),
    custom_theme: ['selected_light', 'selected_dark', 'mode', 'ink', 'panel', 'rail', 'surface', 'line', 'text', 'muted', 'accent', 'warn', 'danger', 'terminal_bg', 'terminal_fg', 'light_ink', 'light_panel', 'light_rail', 'light_surface', 'light_line', 'light_text', 'light_muted', 'light_accent', 'light_warn', 'light_danger', 'light_terminal_bg', 'light_terminal_fg']
  };

  for (const [section, keys] of Object.entries(allowed)) {
    for (const key of keys) {
      if (updates[section] && Object.prototype.hasOwnProperty.call(updates[section], key)) {
        configText = setTomlKey(configText, section, key, updates[section][key]);
      }
    }
  }

  const candidate = deepMerge(defaultConfig, TOML.parse(configText));
  if (candidate.server.host !== '127.0.0.1' && candidate.server.host !== '0.0.0.0') {
    throw new Error('Server access must be Local or LAN.');
  }
  if (candidate.server.protocol !== 'http' && candidate.server.protocol !== 'https') {
    throw new Error('Server protocol must be http or https.');
  }
  if (candidate.server.host === '0.0.0.0' && !candidate.auth.password_hash) {
    throw new Error('LAN access requires a password.');
  }

  fs.writeFileSync(configPath, configText);
  return loadConfig(root);
}

module.exports = {
  appRoot,
  defaultConfig,
  loadConfig,
  updateConfigFile
};
