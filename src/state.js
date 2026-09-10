const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeCwd, shellKind, shellTitle } = require('./shell');

const DEFAULT_GRID_SIZE = 120;
const MIN_GRID_SIZE = 20;
const MAX_GRID_SIZE = 400;
const DEFAULT_VERTICAL_SLOTS = 12;
const MAX_VERTICAL_SLOTS = 24;
const DEFAULT_PANE_CELLS = 6;
const MIN_PANE_CELLS = 1;
const MAX_PANE_CELLS = 48;
// The original grid laid panes out in 720x480 cells; only migration needs this.
const LEGACY_CELL_WIDTH = 720;
const LEGACY_CELL_HEIGHT = 480;
const PANE_TYPES = new Set(['terminal', 'files', 'browser', 'notepad', 'image', 'usage', 'ai', 'plugin']);
// Which array and active-id field a dragged tab belongs to, keyed by the same
// kind name used in the /api/panes/:paneId/<kind>/tabs route family.
const TAB_KIND_FIELDS = {
  terminal: { tabs: 'terminalTabs', active: 'activeTerminalTabId' },
  files: { tabs: 'filesTabs', active: 'activeFilesTabId' },
  ai: { tabs: 'aiTabs', active: 'activeAiTabId' },
  browser: { tabs: 'browserTabs', active: 'activeBrowserTabId' },
  notepad: { tabs: 'notepadTabs', active: 'activeNotepadTabId' }
};
const MAX_PLUGIN_DATA_LENGTH = 5 * 1024 * 1024;
const NOTEPAD_ENCODINGS = new Set(['utf8', 'utf8-bom', 'utf16le', 'utf16be', 'latin1']);
const NOTEPAD_EOLS = new Set(['crlf', 'lf', 'cr']);
const MAX_NOTEPAD_CONTENT_LENGTH = 10 * 1024 * 1024;
const AI_PROVIDER = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const AI_ROLES = new Set(['user', 'assistant', 'system']);
const AI_EVENT_KINDS = new Set(['text', 'thinking', 'tool_use', 'tool_result', 'question', 'result', 'error', 'notice']);
const AI_TOOL_STATUS = new Set(['running', 'ok', 'error']);
// A conversation is the only pane content that grows for as long as the pane is
// open, so it is bounded twice: by event count and by the bytes it adds to
// state.json, which every pane shares.
const MAX_AI_MESSAGES = 1500;
const MAX_AI_HISTORY_BYTES = 2 * 1024 * 1024;
const MAX_AI_TEXT_LENGTH = 64 * 1024;
const MAX_AI_DETAIL_LENGTH = 8 * 1024;
// Pasted images are written to disk (see plugin-panes/*/server.js) and only
// referenced here by filename, so they never count against MAX_AI_HISTORY_BYTES.
const MAX_AI_IMAGES = 4;
const AI_ATTACHMENT_FILE = /^[0-9a-f-]{20,80}\.(?:png|jpe?g|gif|webp)$/i;
const AI_TRIM_NOTICE = 'Older messages were dropped from this device\'s copy of the conversation.';

function paneType(value) {
  return PANE_TYPES.has(value) ? value : 'terminal';
}

function nextNumberedName(prefix, existingNames) {
  const names = new Set(existingNames);
  let index = 1;
  while (names.has(`${prefix} ${index}`)) {
    index += 1;
  }
  return `${prefix} ${index}`;
}

function browserEmulationMode(value) {
  return value === 'mobile' ? 'mobile' : 'desktop';
}

function browserTab(value = {}) {
  const zoom = Number(value.zoom);
  return {
    id: value.id || crypto.randomUUID(),
    title: String(value.title || 'New tab').slice(0, 160),
    url: String(value.url || ''),
    zoom: zoom >= 0.25 && zoom <= 3 ? zoom : 1,
    emulationMode: browserEmulationMode(value.emulationMode)
  };
}

function browserTabsForPane(pane) {
  const tabs = Array.isArray(pane.browserTabs) && pane.browserTabs.length
    ? pane.browserTabs.slice(0, 50).map(browserTab)
    : [browserTab({ url: pane.url || '' })];
  const activeBrowserTabId = tabs.some((tab) => tab.id === pane.activeBrowserTabId)
    ? pane.activeBrowserTabId
    : tabs[0].id;
  return { tabs, activeBrowserTabId };
}

function terminalTab(value = {}, fallback = {}) {
  // Which shell a tab runs is fixed when it is created; a running process
  // cannot be swapped underneath it.
  const shell = shellKind(value.shell || fallback.shell);
  return {
    id: value.id || crypto.randomUUID(),
    title: String(value.title || fallback.title || shellTitle(shell)).slice(0, 160),
    // A name the user typed outranks the title the shell keeps announcing.
    titlePinned: Boolean(value.titlePinned),
    shell,
    cwd: String(value.cwd || fallback.cwd || '')
  };
}

function paneShellKind(pane) {
  const active = (pane.terminalTabs || []).find((candidate) => candidate.id === pane.activeTerminalTabId);
  return shellKind(active?.shell || pane.terminalTabs?.[0]?.shell);
}

function terminalTabsForPane(pane, fallback) {
  const tabs = Array.isArray(pane.terminalTabs) && pane.terminalTabs.length
    ? pane.terminalTabs.slice(0, 50).map((tab) => terminalTab(tab, fallback))
    : [terminalTab({}, fallback)];
  const activeTerminalTabId = tabs.some((tab) => tab.id === pane.activeTerminalTabId)
    ? pane.activeTerminalTabId
    : tabs[0].id;
  return { tabs, activeTerminalTabId };
}

function filesTab(value = {}, fallbackPath = '') {
  return {
    id: value.id || crypto.randomUUID(),
    path: String(value.path || fallbackPath || '')
  };
}

function filesTabsForPane(pane) {
  const tabs = Array.isArray(pane.filesTabs) && pane.filesTabs.length
    ? pane.filesTabs.slice(0, 50).map((tab) => filesTab(tab))
    : [filesTab({ path: pane.path || '' })];
  const activeFilesTabId = tabs.some((tab) => tab.id === pane.activeFilesTabId)
    ? pane.activeFilesTabId
    : tabs[0].id;
  return { tabs, activeFilesTabId };
}

function notepadTab(value = {}) {
  const pathValue = String(value.path || '');
  return {
    id: value.id || crypto.randomUUID(),
    title: String(value.title || 'Untitled').slice(0, 160),
    path: pathValue,
    content: pathValue ? '' : String(value.content || '').slice(0, MAX_NOTEPAD_CONTENT_LENGTH),
    encoding: NOTEPAD_ENCODINGS.has(value.encoding) ? value.encoding : 'utf8',
    eol: NOTEPAD_EOLS.has(value.eol) ? value.eol : 'crlf',
    language: String(value.language || '').slice(0, 40),
    readOnly: Boolean(value.readOnly),
    wrap: Boolean(value.wrap),
    indentGuides: Boolean(value.indentGuides),
    autosave: Boolean(value.autosave),
    fontFamily: String(value.fontFamily || '').slice(0, 200)
  };
}

function notepadTabDefaults(defaults = {}) {
  return {
    wrap: Boolean(defaults.wrap),
    indentGuides: Boolean(defaults.indentGuides),
    autosave: Boolean(defaults.autosave)
  };
}

function notepadTabsForPane(pane) {
  const tabs = Array.isArray(pane.notepadTabs) && pane.notepadTabs.length
    ? pane.notepadTabs.slice(0, 50).map(notepadTab)
    : [notepadTab({ path: pane.path || '' })];
  const activeNotepadTabId = tabs.some((tab) => tab.id === pane.activeNotepadTabId)
    ? pane.activeNotepadTabId
    : tabs[0].id;
  return { tabs, activeNotepadTabId };
}

function aiProvider(value) {
  return AI_PROVIDER.test(String(value || '')) ? String(value) : 'claude';
}

function aiProviderTitle(provider) {
  if (provider === 'codex') return 'Codex';
  if (provider === 'claude') return 'Claude';
  return String(provider || 'AI').replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Clamps one field and reports whether anything was cut, so a bubble can say it
// is showing a shortened command instead of silently showing half of one.
function clampAiText(value, limit) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '') || '';
  return text.length > limit
    ? { text: text.slice(0, limit), truncated: true }
    : { text, truncated: false };
}

function aiEvent(value = {}) {
  const event = {
    id: value.id || crypto.randomUUID(),
    turnId: String(value.turnId || '').slice(0, 80),
    at: String(value.at || new Date().toISOString()),
    role: AI_ROLES.has(value.role) ? value.role : 'assistant',
    kind: AI_EVENT_KINDS.has(value.kind) ? value.kind : 'text'
  };
  let truncated = Boolean(value.truncated);
  if (value.text !== undefined) {
    const clamped = clampAiText(value.text, MAX_AI_TEXT_LENGTH);
    event.text = clamped.text;
    truncated = truncated || clamped.truncated;
  }
  if (value.tool) {
    const input = clampAiText(value.tool.input, MAX_AI_DETAIL_LENGTH);
    event.tool = {
      id: String(value.tool.id || ''),
      name: String(value.tool.name || '').slice(0, 120),
      input: input.text,
      language: String(value.tool.language || '').slice(0, 40),
      status: AI_TOOL_STATUS.has(value.tool.status) ? value.tool.status : 'running'
    };
    truncated = truncated || input.truncated;
  }
  if (value.result) {
    const output = clampAiText(value.result.output, MAX_AI_DETAIL_LENGTH);
    event.result = {
      toolUseId: String(value.result.toolUseId || ''),
      output: output.text,
      isError: Boolean(value.result.isError)
    };
    truncated = truncated || output.truncated;
  }
  if (value.question) {
    const detail = clampAiText(value.question.detail, MAX_AI_DETAIL_LENGTH);
    event.question = {
      requestId: String(value.question.requestId || ''),
      groupId: String(value.question.groupId || ''),
      prompt: clampAiText(value.question.prompt, 2000).text,
      detail: detail.text,
      detailLanguage: String(value.question.detailLanguage || '').slice(0, 40),
      multi: Boolean(value.question.multi),
      // Both CLIs let the user answer in their own words instead of picking a
      // listed option; the pane has to offer that, or the answer is lost.
      allowFreeText: Boolean(value.question.allowFreeText),
      // The options come from the CLI, so they are kept as given rather than
      // mapped onto a fixed allow/deny pair.
      options: (Array.isArray(value.question.options) ? value.question.options : []).slice(0, 12).map((option) => ({
        id: String(option.id || ''),
        label: String(option.label || '').slice(0, 200),
        hint: String(option.hint || '').slice(0, 400)
      }))
    };
    truncated = truncated || detail.truncated;
  }
  if (value.answer) {
    event.answer = {
      optionIds: (Array.isArray(value.answer.optionIds) ? value.answer.optionIds : []).slice(0, 12).map(String),
      labels: (Array.isArray(value.answer.labels) ? value.answer.labels : []).slice(0, 12).map((label) => String(label).slice(0, 200)),
      at: String(value.answer.at || new Date().toISOString()),
      cancelled: Boolean(value.answer.cancelled)
    };
  }
  if (value.usage) {
    event.usage = {
      inputTokens: Number(value.usage.inputTokens) || 0,
      outputTokens: Number(value.usage.outputTokens) || 0,
      durationMs: Number(value.usage.durationMs) || 0
    };
  }
  if (Array.isArray(value.images) && value.images.length) {
    const images = value.images
      .filter((image) => AI_ATTACHMENT_FILE.test(String(image?.id || '')))
      .slice(0, MAX_AI_IMAGES)
      .map((image) => ({
        id: String(image.id),
        mimeType: String(image.mimeType || '').slice(0, 40)
      }));
    if (images.length) {
      event.images = images;
    }
  }
  if (truncated) {
    event.truncated = true;
  }
  return event;
}

// Events leave a whole turn at a time: dropping half a turn would strand a tool
// result above the call that produced it, which reads as a bug on screen.
function truncateAiMessages(messages) {
  const hadNotice = messages[0]?.kind === 'notice' && messages[0].text === AI_TRIM_NOTICE;
  let kept = hadNotice ? messages.slice(1) : messages;
  let dropped = hadNotice;
  const dropOldestTurn = () => {
    const { turnId } = kept[0];
    kept = turnId ? kept.filter((event) => event.turnId !== turnId) : kept.slice(1);
    dropped = true;
  };
  while (kept.length > MAX_AI_MESSAGES) {
    dropOldestTurn();
  }
  // Only worth measuring once the cheap count check is satisfied.
  while (kept.length && JSON.stringify(kept).length > MAX_AI_HISTORY_BYTES) {
    dropOldestTurn();
  }
  if (!dropped) {
    return kept;
  }
  return [aiEvent({ role: 'system', kind: 'notice', text: AI_TRIM_NOTICE }), ...kept];
}

function aiTab(value = {}, fallback = {}) {
  // Which CLI a tab talks to is fixed when it is created, the same way a
  // terminal tab's shell is: the transcript on screen belongs to that CLI's
  // own session, and swapping it underneath would orphan the resume id.
  const provider = aiProvider(value.provider || fallback.provider);
  return {
    id: value.id || crypto.randomUUID(),
    title: String(value.title || fallback.title || aiProviderTitle(provider)).slice(0, 160),
    titlePinned: Boolean(value.titlePinned),
    provider,
    cwd: String(value.cwd || fallback.cwd || ''),
    sessionId: String(value.sessionId || '').slice(0, 200),
    messages: truncateAiMessages((Array.isArray(value.messages) ? value.messages : []).map(aiEvent)),
    showThinking: value.showThinking !== false,
    showTools: value.showTools !== false
  };
}

function aiTabsForPane(pane, fallback) {
  const tabs = Array.isArray(pane.aiTabs) && pane.aiTabs.length
    ? pane.aiTabs.slice(0, 50).map((tab) => aiTab(tab, fallback))
    : [aiTab({}, fallback)];
  const activeAiTabId = tabs.some((tab) => tab.id === pane.activeAiTabId)
    ? pane.activeAiTabId
    : tabs[0].id;
  return { tabs, activeAiTabId };
}

function defaultSession(name = 'Workspace 1', paneTitle = 'PowerShell 1', verticalSlots = DEFAULT_VERTICAL_SLOTS, paneWidth = DEFAULT_PANE_CELLS, paneHeight = verticalSlots) {
  const paneId = crypto.randomUUID();
  const firstTerminalTab = terminalTab({ title: paneTitle, cwd: process.cwd() });
  return {
    id: crypto.randomUUID(),
    name,
    activePaneId: paneId,
    tabs: [
      {
        id: crypto.randomUUID(),
        name: 'Main',
        activePaneId: paneId,
        panes: [
          {
            id: paneId,
            type: 'terminal',
            title: paneTitle,
            cwd: process.cwd(),
            split: null,
            layout: { x: 0, y: 0, w: clampPaneWidth(paneWidth), h: clampPaneHeight(paneHeight, verticalSlots) },
            terminalTabs: [firstTerminalTab],
            activeTerminalTabId: firstTerminalTab.id
          }
        ]
      }
    ]
  };
}

class StateStore {
  constructor(root, options = {}) {
    this.root = root;
    this.dataDir = path.join(root, 'data');
    this.statePath = path.join(this.dataDir, 'state.json');
    this.backupPath = `${this.statePath}.bak`;
    this.gridSize = clampGridSize(options.gridSize);
    this.verticalSlots = clampVerticalSlots(options.verticalSlots);
    this.defaultPaneWidth = clampPaneWidth(options.defaultPaneWidth);
    this.defaultPaneHeight = clampPaneHeight(options.defaultPaneHeight, this.verticalSlots);
    this.pluginPaneMigrations = options.pluginPaneMigrations || {};
    const session = defaultSession('Workspace 1', 'PowerShell 1', this.verticalSlots, this.defaultPaneWidth, this.defaultPaneHeight);
    this.state = {
      activeSessionId: session.id,
      sessions: [session],
      updatedAt: new Date().toISOString()
    };
  }

  load() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const restored = this.readState(this.statePath) || this.readState(this.backupPath);
    if (restored) {
      this.state = restored;
      this.state.activeSessionId = this.state.activeSessionId || this.state.sessions[0]?.id || '';
    } else {
      this.save();
    }
    return this.state;
  }

  readState(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!parsed || !Array.isArray(parsed.sessions) || !parsed.sessions.length) {
        return null;
      }
      return this.hydrateState(parsed);
    } catch (error) {
      // A half-written or hand-edited file must not stop the server from
      // starting; the caller falls back to the backup and then to a new
      // workspace.
      return null;
    }
  }

  save() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.state.updatedAt = new Date().toISOString();
    const payload = JSON.stringify(this.getPersistedState(), null, 2);
    const tempPath = `${this.statePath}.tmp`;
    // Notepad buffers and plugin payloads make this file large enough that
    // losing power mid-write is a real risk, so the replacement is complete and
    // flushed to disk before it takes the place of the previous copy.
    const handle = fs.openSync(tempPath, 'w');
    try {
      fs.writeFileSync(handle, payload);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    if (fs.existsSync(this.statePath)) {
      fs.copyFileSync(this.statePath, this.backupPath);
    }
    fs.renameSync(tempPath, this.statePath);
  }

  hydrateState(state) {
    return {
      ...state,
      sessions: (state.sessions || []).map((session) => ({
        ...session,
        tabs: (session.tabs || []).map((tab) => this.hydrateTab(tab))
      }))
    };
  }

  hydrateTab(tab) {
    const panes = [];
    for (const pane of tab.panes || []) {
      const pluginMigration = this.pluginPaneMigrations[pane.type];
      const type = pane.type === 'local' || pluginMigration ? 'plugin' : paneType(pane.type);
      const nextPane = {
        id: pane.id,
        type,
        title: pane.title || 'PowerShell 1',
        cwd: normalizeCwd(pane.cwd, this.root),
        path: pane.path || '',
        url: pane.url || '',
        pluginPaneId: type === 'plugin' ? String(pluginMigration?.pluginPaneId || pane.pluginPaneId || pane.localPaneId || '') : undefined,
        pluginData: type === 'plugin' ? pluginPaneData(pluginMigration ? pane[pluginMigration.dataField] : pane.pluginData) : undefined,
        fontSize: validPaneFontSize(pane.fontSize) ? Number(pane.fontSize) : undefined,
        split: pane.split || null,
        layout: pane.layout
      };
      if (nextPane.type === 'terminal') {
        const terminalState = terminalTabsForPane(pane, { title: nextPane.title, cwd: nextPane.cwd });
        nextPane.terminalTabs = terminalState.tabs.map((tab) => ({
          ...tab,
          cwd: normalizeCwd(tab.cwd, this.root)
        }));
        nextPane.activeTerminalTabId = terminalState.activeTerminalTabId;
      }
      if (nextPane.type === 'files') {
        const filesState = filesTabsForPane(pane);
        nextPane.filesTabs = filesState.tabs;
        nextPane.activeFilesTabId = filesState.activeFilesTabId;
        nextPane.path = nextPane.filesTabs.find((tab) => tab.id === nextPane.activeFilesTabId)?.path || '';
      }
      if (nextPane.type === 'browser') {
        const browserState = browserTabsForPane(pane);
        nextPane.browserTabs = browserState.tabs;
        nextPane.activeBrowserTabId = browserState.activeBrowserTabId;
        nextPane.url = nextPane.browserTabs.find((tab) => tab.id === nextPane.activeBrowserTabId)?.url || '';
      }
      if (nextPane.type === 'notepad') {
        const notepadState = notepadTabsForPane(pane);
        nextPane.notepadTabs = notepadState.tabs;
        nextPane.activeNotepadTabId = notepadState.activeNotepadTabId;
        nextPane.path = nextPane.notepadTabs.find((tab) => tab.id === nextPane.activeNotepadTabId)?.path || '';
      }
      if (nextPane.type === 'ai') {
        const aiState = aiTabsForPane(pane, { cwd: nextPane.cwd });
        nextPane.aiTabs = aiState.tabs.map((tab) => ({
          ...tab,
          cwd: normalizeCwd(tab.cwd, this.root)
        }));
        nextPane.activeAiTabId = aiState.activeAiTabId;
      }
      panes.push(nextPane);
    }
    // Column placement depends on every pane in the tab, so it is resolved once
    // here rather than per pane above.
    // Older schemas, and any hand-edited state, can leave panes on top of each
    // other; the board only ever shows one plane, so they are pushed apart here.
    const migrated = resolveOverlaps(
      migratePaneLayouts(panes, tab.columns, this.gridSize, this.verticalSlots)
    );
    panes.forEach((pane, index) => {
      pane.layout = migrated[index];
    });
    const { columns, camera, drawings, ...rest } = tab;
    return { ...rest, panes };
  }

  getPersistedState() {
    return {
      ...this.state,
      sessions: this.state.sessions.map((session) => ({
        ...session,
        tabs: session.tabs.map((tab) => ({
          ...tab,
          panes: tab.panes.map((pane) => ({
            id: pane.id,
            type: paneType(pane.type),
            title: pane.title,
            cwd: pane.cwd,
            path: pane.type === 'files' || pane.type === 'notepad' || pane.type === 'image' ? pane.path : undefined,
            url: pane.type === 'browser' ? pane.url : undefined,
            pluginPaneId: pane.type === 'plugin' ? pane.pluginPaneId : undefined,
            pluginData: pane.type === 'plugin' ? pluginPaneData(pane.pluginData) : undefined,
            terminalTabs: pane.type === 'terminal' ? pane.terminalTabs.map((tab) => terminalTab(tab)) : undefined,
            activeTerminalTabId: pane.type === 'terminal' ? pane.activeTerminalTabId : undefined,
            filesTabs: pane.type === 'files' ? pane.filesTabs.map((tab) => filesTab(tab)) : undefined,
            activeFilesTabId: pane.type === 'files' ? pane.activeFilesTabId : undefined,
            browserTabs: pane.type === 'browser' ? pane.browserTabs.map((tab) => browserTab(tab)) : undefined,
            activeBrowserTabId: pane.type === 'browser' ? pane.activeBrowserTabId : undefined,
            notepadTabs: pane.type === 'notepad' ? pane.notepadTabs.map((tab) => notepadTab(tab)) : undefined,
            activeNotepadTabId: pane.type === 'notepad' ? pane.activeNotepadTabId : undefined,
            aiTabs: pane.type === 'ai' ? pane.aiTabs.map((tab) => aiTab(tab)) : undefined,
            activeAiTabId: pane.type === 'ai' ? pane.activeAiTabId : undefined,
            fontSize: validPaneFontSize(pane.fontSize) ? pane.fontSize : undefined,
            split: pane.split,
            layout: sanitizeLayout(pane.layout, this.verticalSlots, this.defaultPaneWidth)
          }))
        }))
      }))
    };
  }

  getPublicState() {
    return {
      ...this.state,
      sessions: this.state.sessions.map((session) => ({
        ...session,
        tabs: session.tabs.map((tab) => ({
          ...tab,
          panes: tab.panes.map((pane) => ({
            id: pane.id,
            type: paneType(pane.type),
            title: pane.title,
            cwd: pane.cwd,
            path: pane.type === 'files' || pane.type === 'notepad' || pane.type === 'image' ? pane.path : undefined,
            url: pane.type === 'browser' ? pane.url : undefined,
            pluginPaneId: pane.type === 'plugin' ? pane.pluginPaneId : undefined,
            pluginData: pane.type === 'plugin' ? pluginPaneData(pane.pluginData) : undefined,
            terminalTabs: pane.type === 'terminal' ? pane.terminalTabs.map((tab) => terminalTab(tab)) : undefined,
            activeTerminalTabId: pane.type === 'terminal' ? pane.activeTerminalTabId : undefined,
            filesTabs: pane.type === 'files' ? pane.filesTabs.map((tab) => filesTab(tab)) : undefined,
            activeFilesTabId: pane.type === 'files' ? pane.activeFilesTabId : undefined,
            browserTabs: pane.type === 'browser' ? pane.browserTabs.map((tab) => browserTab(tab)) : undefined,
            activeBrowserTabId: pane.type === 'browser' ? pane.activeBrowserTabId : undefined,
            notepadTabs: pane.type === 'notepad' ? pane.notepadTabs.map((tab) => notepadTab(tab)) : undefined,
            activeNotepadTabId: pane.type === 'notepad' ? pane.activeNotepadTabId : undefined,
            // Deliberately unlike getPersistedState: the transcript is replayed
            // over the pane's own socket, so leaving it out here keeps a few
            // long conversations from bloating every /api/state response.
            aiTabs: pane.type === 'ai' ? pane.aiTabs.map((tab) => {
              const { messages, ...rest } = aiTab(tab);
              return rest;
            }) : undefined,
            activeAiTabId: pane.type === 'ai' ? pane.activeAiTabId : undefined,
            fontSize: validPaneFontSize(pane.fontSize) ? pane.fontSize : undefined,
            split: pane.split,
            layout: sanitizeLayout(pane.layout, this.verticalSlots, this.defaultPaneWidth)
          }))
        }))
      }))
    };
  }

  findPane(paneId) {
    for (const session of this.state.sessions) {
      for (const tab of session.tabs) {
        const pane = tab.panes.find((candidate) => candidate.id === paneId);
        if (pane) {
          return { session, tab, pane };
        }
      }
    }
    return null;
  }

  // Dragging a tab within its own strip reorders it; dragging it onto another
  // pane of the same kind hands it over instead. A pane can never be left
  // holding zero tabs, so the last tab in a pane cannot be dragged out of it.
  moveTab(kind, paneId, tabId, index, targetPaneId) {
    const fields = TAB_KIND_FIELDS[kind];
    const from = this.findPane(paneId);
    const target = Math.trunc(Number(index));
    if (!fields || !from || (from.pane.type || 'terminal') !== kind || !Number.isFinite(target)) {
      return null;
    }
    const fromTabs = from.pane[fields.tabs] || [];
    const fromIndex = fromTabs.findIndex((tab) => tab.id === tabId);
    if (fromIndex === -1) {
      return null;
    }

    if (!targetPaneId || targetPaneId === paneId) {
      const clamped = Math.max(0, Math.min(fromTabs.length - 1, target));
      if (clamped !== fromIndex) {
        const [tab] = fromTabs.splice(fromIndex, 1);
        fromTabs.splice(clamped, 0, tab);
        this.save();
      }
      return { pane: from.pane };
    }

    if (fromTabs.length <= 1) {
      return null;
    }
    const to = this.findPane(targetPaneId);
    const toTabs = to?.pane[fields.tabs];
    if (!to || (to.pane.type || 'terminal') !== kind || !Array.isArray(toTabs) || toTabs.length >= 50) {
      return null;
    }

    const [tab] = fromTabs.splice(fromIndex, 1);
    if (from.pane[fields.active] === tabId) {
      from.pane[fields.active] = fromTabs[Math.min(fromIndex, fromTabs.length - 1)].id;
    }
    // The dropped-on pane, not the strip the tab came from, decides where a
    // handed-over tab lands; appending it is the one placement that always
    // makes sense regardless of where in the old strip it was dragged from.
    toTabs.push(tab);
    to.pane[fields.active] = tabId;
    this.save();
    return { pane: to.pane, sourcePane: from.pane };
  }

  findTerminalTab(tabId) {
    for (const session of this.state.sessions) {
      for (const tab of session.tabs) {
        for (const pane of tab.panes) {
          const terminalTabEntry = (pane.terminalTabs || []).find((candidate) => candidate.id === tabId);
          if (terminalTabEntry) {
            return { session, tab, pane, terminalTab: terminalTabEntry };
          }
        }
      }
    }
    return null;
  }

  createSession(name) {
    const sessionName = String(name || '').trim() ||
      nextNumberedName('Workspace', this.state.sessions.map((session) => session.name));
    const paneTitle = nextNumberedName('PowerShell', []);
    const session = defaultSession(sessionName, paneTitle, this.verticalSlots, this.defaultPaneWidth, this.defaultPaneHeight);
    this.state.sessions.push(session);
    this.state.activeSessionId = session.id;
    this.save();
    return session;
  }

  closeSession(sessionId) {
    if (this.state.sessions.length <= 1) {
      return false;
    }

    const index = this.state.sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) {
      return false;
    }

    this.state.sessions.splice(index, 1);
    if (this.state.activeSessionId === sessionId) {
      this.state.activeSessionId = this.state.sessions[Math.max(0, index - 1)].id;
    }
    this.save();
    return true;
  }

  renameSession(sessionId, name) {
    const nextName = String(name || '').trim();
    const session = this.state.sessions.find((candidate) => candidate.id === sessionId);
    if (!session || !nextName) {
      return false;
    }

    session.name = nextName;
    this.save();
    return true;
  }

  // Dragging a workspace title to a new slot in the strip. The index is where
  // the workspace lands once it has been lifted out, so dropping it past its
  // own old slot does not have to account for the gap it left behind.
  moveSession(sessionId, index) {
    const from = this.state.sessions.findIndex((session) => session.id === sessionId);
    const target = Math.max(0, Math.min(this.state.sessions.length - 1, Math.trunc(Number(index))));
    if (from === -1 || !Number.isFinite(Number(index))) {
      return false;
    }
    if (from === target) {
      return true;
    }

    const [session] = this.state.sessions.splice(from, 1);
    this.state.sessions.splice(target, 0, session);
    this.save();
    return true;
  }

  setActiveSession(sessionId) {
    if (!this.state.sessions.some((session) => session.id === sessionId)) {
      return false;
    }

    this.state.activeSessionId = sessionId;
    this.save();
    return true;
  }

  splitPane(paneId, direction, shell) {
    const found = this.findPane(paneId);
    if (!found) {
      return null;
    }

    const kind = shellKind(shell);
    const layout = appendLayout(found.tab.panes, this.verticalSlots, this.defaultPaneWidth, this.defaultPaneHeight);
    const title = nextNumberedName(shellTitle(kind), found.tab.panes.map((candidate) => candidate.title));
    const firstTab = terminalTab({ title, shell: kind, cwd: found.pane.cwd });
    const pane = {
      id: crypto.randomUUID(),
      type: 'terminal',
      title,
      cwd: found.pane.cwd,
      split: direction === 'vertical' ? 'vertical' : 'horizontal',
      layout,
      terminalTabs: [firstTab],
      activeTerminalTabId: firstTab.id
    };
    if (!pane.layout) {
      return null;
    }
    found.tab.panes.push(pane);
    found.tab.activePaneId = pane.id;
    found.session.activePaneId = pane.id;
    this.save();
    return pane;
  }

  createFilesPane(paneId, pathValue = '') {
    const found = this.findPane(paneId);
    if (!found) {
      return null;
    }
    const layout = appendLayout(found.tab.panes, this.verticalSlots, this.defaultPaneWidth, this.defaultPaneHeight);
    const firstTab = filesTab({ path: pathValue || '' });
    const pane = {
      id: crypto.randomUUID(),
      type: 'files',
      title: nextNumberedName('Files', found.tab.panes.map((candidate) => candidate.title)),
      cwd: found.pane.cwd,
      path: pathValue || '',
      split: 'files',
      layout,
      filesTabs: [firstTab],
      activeFilesTabId: firstTab.id
    };
    if (!pane.layout) {
      return null;
    }
    found.tab.panes.push(pane);
    found.tab.activePaneId = pane.id;
    found.session.activePaneId = pane.id;
    this.state.activeSessionId = found.session.id;
    this.save();
    return pane;
  }

  setFilesPanePath(paneId, pathValue) {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'files') {
      return false;
    }
    found.pane.path = String(pathValue || '');
    const activeTab = found.pane.filesTabs?.find((tab) => tab.id === found.pane.activeFilesTabId);
    if (activeTab) activeTab.path = found.pane.path;
    this.save();
    return true;
  }

  createFilesTab(paneId, pathValue = '') {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'files' || found.pane.filesTabs.length >= 50) return null;
    const tab = filesTab({ path: pathValue });
    found.pane.filesTabs.push(tab);
    found.pane.activeFilesTabId = tab.id;
    found.pane.path = tab.path;
    this.save();
    return tab;
  }

  activateFilesTab(paneId, tabId) {
    const found = this.findPane(paneId);
    const tab = found?.pane.type === 'files'
      ? found.pane.filesTabs.find((candidate) => candidate.id === tabId)
      : null;
    if (!tab) return false;
    found.pane.activeFilesTabId = tab.id;
    found.pane.path = tab.path;
    this.save();
    return true;
  }

  closeFilesTab(paneId, tabId) {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'files') return false;
    const index = found.pane.filesTabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return false;
    if (found.pane.filesTabs.length === 1) {
      found.pane.filesTabs[0] = filesTab({ id: tabId });
    } else {
      found.pane.filesTabs.splice(index, 1);
    }
    if (!found.pane.filesTabs.some((tab) => tab.id === found.pane.activeFilesTabId)) {
      found.pane.activeFilesTabId = found.pane.filesTabs[Math.min(index, found.pane.filesTabs.length - 1)].id;
    }
    found.pane.path = found.pane.filesTabs.find((tab) => tab.id === found.pane.activeFilesTabId)?.path || '';
    this.save();
    return true;
  }

  createTerminalTab(paneId) {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'terminal' || found.pane.terminalTabs.length >= 50) return null;
    // A new tab runs the same shell as the pane it opens in.
    const kind = paneShellKind(found.pane);
    const tab = {
      ...terminalTab({
        title: nextNumberedName(shellTitle(kind), found.pane.terminalTabs.map((candidate) => candidate.title)),
        shell: kind,
        cwd: found.pane.cwd
      })
    };
    found.pane.terminalTabs.push(tab);
    found.pane.activeTerminalTabId = tab.id;
    this.save();
    return tab;
  }

  activateTerminalTab(paneId, tabId) {
    const found = this.findPane(paneId);
    const tab = found?.pane.type === 'terminal'
      ? found.pane.terminalTabs.find((candidate) => candidate.id === tabId)
      : null;
    if (!tab) return false;
    found.pane.activeTerminalTabId = tab.id;
    this.save();
    return true;
  }

  renameTerminalTab(paneId, tabId, title) {
    const nextTitle = String(title || '').trim();
    const found = this.findPane(paneId);
    const tab = found?.pane.type === 'terminal'
      ? found.pane.terminalTabs.find((candidate) => candidate.id === tabId)
      : null;
    if (!tab || !nextTitle) return false;
    tab.title = nextTitle.slice(0, 160);
    tab.titlePinned = true;
    this.save();
    return true;
  }

  // PowerShell and the tools running inside it announce a title on almost every
  // prompt, usually the cwd. That stream is the tab's name only until the user
  // renames the tab; after that the pinned name wins.
  setTerminalTabProcessTitle(paneId, tabId, title) {
    const nextTitle = String(title || '').trim();
    const found = this.findPane(paneId);
    const tab = found?.pane.type === 'terminal'
      ? found.pane.terminalTabs.find((candidate) => candidate.id === tabId)
      : null;
    if (!tab || !nextTitle || tab.titlePinned) return false;
    tab.title = nextTitle.slice(0, 160);
    this.save();
    return true;
  }

  closeTerminalTab(paneId, tabId) {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'terminal') return null;
    const index = found.pane.terminalTabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return null;
    // Closing the last tab restarts the shell instead of leaving the pane empty.
    let replacement = null;
    if (found.pane.terminalTabs.length === 1) {
      replacement = {
        ...terminalTab({
          title: found.pane.terminalTabs[0].title,
          titlePinned: found.pane.terminalTabs[0].titlePinned,
          shell: found.pane.terminalTabs[0].shell,
          cwd: found.pane.cwd
        })
      };
      found.pane.terminalTabs[0] = replacement;
    } else {
      found.pane.terminalTabs.splice(index, 1);
    }
    if (!found.pane.terminalTabs.some((tab) => tab.id === found.pane.activeTerminalTabId)) {
      found.pane.activeTerminalTabId = found.pane.terminalTabs[Math.min(index, found.pane.terminalTabs.length - 1)].id;
    }
    this.save();
    return { replacement };
  }

  createAiPane(paneId, provider = 'claude', cwd = '') {
    const pane = this.createUtilityPane(paneId, 'ai', 'AI', aiProvider(provider));
    if (pane && cwd) {
      pane.aiTabs[0].cwd = String(cwd);
      this.save();
    }
    return pane;
  }

  // The pane's socket is opened per tab, so the tab id is what arrives from the
  // browser; this is the AI equivalent of findTerminalTab.
  findAiTabById(tabId) {
    for (const session of this.state.sessions) {
      for (const tab of session.tabs) {
        for (const pane of tab.panes) {
          if (pane.type !== 'ai') continue;
          const aiTab = pane.aiTabs.find((candidate) => candidate.id === tabId);
          if (aiTab) {
            return { session, pane, tab: aiTab };
          }
        }
      }
    }
    return null;
  }

  findAiTab(paneId, tabId) {
    const found = this.findPane(paneId);
    if (found?.pane.type !== 'ai') return null;
    const tab = found.pane.aiTabs.find((candidate) => candidate.id === tabId);
    return tab ? { pane: found.pane, tab } : null;
  }

  createAiTab(paneId, provider, cwd) {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'ai' || found.pane.aiTabs.length >= 50) return null;
    const active = found.pane.aiTabs.find((candidate) => candidate.id === found.pane.activeAiTabId);
    // A new tab continues from the one it was opened beside: same CLI, same
    // folder, unless the caller asked for something else.
    const kind = aiProvider(provider || active?.provider);
    const tab = aiTab({
      title: nextNumberedName(aiProviderTitle(kind), found.pane.aiTabs.map((candidate) => candidate.title)),
      provider: kind,
      cwd: cwd || active?.cwd || found.pane.cwd
    });
    found.pane.aiTabs.push(tab);
    found.pane.activeAiTabId = tab.id;
    this.save();
    return tab;
  }

  activateAiTab(paneId, tabId) {
    const found = this.findAiTab(paneId, tabId);
    if (!found) return false;
    found.pane.activeAiTabId = found.tab.id;
    this.save();
    return true;
  }

  renameAiTab(paneId, tabId, title) {
    const nextTitle = String(title || '').trim();
    const found = this.findAiTab(paneId, tabId);
    if (!found || !nextTitle) return false;
    found.tab.title = nextTitle.slice(0, 160);
    found.tab.titlePinned = true;
    this.save();
    return true;
  }

  closeAiTab(paneId, tabId) {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'ai') return null;
    const index = found.pane.aiTabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return null;
    // Closing the last tab starts a fresh conversation rather than leaving the
    // pane empty, matching how a terminal pane restarts its shell.
    let replacement = null;
    if (found.pane.aiTabs.length === 1) {
      replacement = aiTab({
        title: found.pane.aiTabs[0].title,
        titlePinned: found.pane.aiTabs[0].titlePinned,
        provider: found.pane.aiTabs[0].provider,
        cwd: found.pane.cwd
      });
      found.pane.aiTabs[0] = replacement;
    } else {
      found.pane.aiTabs.splice(index, 1);
    }
    if (!found.pane.aiTabs.some((tab) => tab.id === found.pane.activeAiTabId)) {
      found.pane.activeAiTabId = found.pane.aiTabs[Math.min(index, found.pane.aiTabs.length - 1)].id;
    }
    this.save();
    return { replacement };
  }

  // Events arrive far too often for the atomic whole-file save() this store
  // does, so appending only touches memory; the caller saves at turn
  // boundaries instead.
  appendAiMessages(paneId, tabId, events) {
    const found = this.findAiTab(paneId, tabId);
    if (!found) return [];
    const added = (Array.isArray(events) ? events : [events]).map(aiEvent);
    found.tab.messages = truncateAiMessages([...found.tab.messages, ...added]);
    return added;
  }

  patchAiMessage(paneId, tabId, eventId, patch) {
    const found = this.findAiTab(paneId, tabId);
    const index = found ? found.tab.messages.findIndex((event) => event.id === eventId) : -1;
    if (index === -1) return false;
    found.tab.messages[index] = aiEvent({ ...found.tab.messages[index], ...patch });
    return true;
  }

  // The folder is fixed when the CLI process is spawned, so the caller has to
  // restart the tab for this to take effect.
  setAiTabCwd(paneId, tabId, cwd) {
    const found = this.findAiTab(paneId, tabId);
    if (!found) return false;
    found.tab.cwd = String(cwd || '');
    this.save();
    return true;
  }

  setAiSession(paneId, tabId, sessionId) {
    const found = this.findAiTab(paneId, tabId);
    if (!found) return false;
    found.tab.sessionId = String(sessionId || '').slice(0, 200);
    this.save();
    return true;
  }

  setAiVisibility(paneId, tabId, { showThinking, showTools } = {}) {
    const found = this.findAiTab(paneId, tabId);
    if (!found) return false;
    if (showThinking !== undefined) found.tab.showThinking = Boolean(showThinking);
    if (showTools !== undefined) found.tab.showTools = Boolean(showTools);
    this.save();
    return true;
  }

  // Dropping the resume id is the half that actually forgets: without it the
  // next prompt would resume the conversation the user just cleared.
  clearAiTab(paneId, tabId) {
    const found = this.findAiTab(paneId, tabId);
    if (!found) return false;
    found.tab.messages = [];
    found.tab.sessionId = '';
    this.save();
    return true;
  }

  createBrowserPane(paneId, urlValue = '', emulationMode = 'desktop') {
    return this.createUtilityPane(paneId, 'browser', 'Browser', urlValue, 'url', emulationMode);
  }

  setBrowserPaneUrl(paneId, urlValue) {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'browser') {
      return false;
    }
    found.pane.url = String(urlValue || '');
    const activeTab = found.pane.browserTabs?.find((tab) => tab.id === found.pane.activeBrowserTabId);
    if (activeTab) activeTab.url = found.pane.url;
    this.save();
    return true;
  }

  createBrowserTab(paneId, urlValue = '', emulationMode = 'desktop') {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'browser' || found.pane.browserTabs.length >= 50) return null;
    const tab = browserTab({ url: urlValue, emulationMode });
    found.pane.browserTabs.push(tab);
    found.pane.activeBrowserTabId = tab.id;
    found.pane.url = tab.url;
    this.save();
    return tab;
  }

  activateBrowserTab(paneId, tabId) {
    const found = this.findPane(paneId);
    const tab = found?.pane.type === 'browser'
      ? found.pane.browserTabs.find((candidate) => candidate.id === tabId)
      : null;
    if (!tab) return false;
    found.pane.activeBrowserTabId = tab.id;
    found.pane.url = tab.url;
    this.save();
    return true;
  }

  updateBrowserTab(paneId, tabId, updates = {}) {
    const found = this.findPane(paneId);
    const tab = found?.pane.type === 'browser'
      ? found.pane.browserTabs.find((candidate) => candidate.id === tabId)
      : null;
    if (!tab) return false;
    if (Object.prototype.hasOwnProperty.call(updates, 'url')) tab.url = String(updates.url || '');
    if (Object.prototype.hasOwnProperty.call(updates, 'title')) tab.title = String(updates.title || 'New tab').slice(0, 160);
    if (Object.prototype.hasOwnProperty.call(updates, 'zoom')) {
      const zoom = Number(updates.zoom);
      if (zoom >= 0.25 && zoom <= 3) tab.zoom = zoom;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'emulationMode')) {
      tab.emulationMode = browserEmulationMode(updates.emulationMode);
    }
    if (found.pane.activeBrowserTabId === tab.id) found.pane.url = tab.url;
    this.save();
    return true;
  }

  closeBrowserTab(paneId, tabId) {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'browser') return false;
    const index = found.pane.browserTabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return false;
    if (found.pane.browserTabs.length === 1) {
      found.pane.browserTabs[0] = browserTab({ id: tabId });
    } else {
      found.pane.browserTabs.splice(index, 1);
    }
    if (!found.pane.browserTabs.some((tab) => tab.id === found.pane.activeBrowserTabId)) {
      found.pane.activeBrowserTabId = found.pane.browserTabs[Math.min(index, found.pane.browserTabs.length - 1)].id;
    }
    const activeTab = found.pane.browserTabs.find((tab) => tab.id === found.pane.activeBrowserTabId);
    found.pane.url = activeTab?.url || '';
    this.save();
    return true;
  }

  createNotepadPane(paneId, pathValue = '', defaults = {}) {
    const pane = this.createUtilityPane(paneId, 'notepad', 'Notepad', pathValue, 'path');
    if (pane) {
      Object.assign(pane.notepadTabs[0], notepadTabDefaults(defaults));
      this.save();
    }
    return pane;
  }

  createImagePane(paneId, pathValue = '') {
    return this.createUtilityPane(paneId, 'image', 'Image', pathValue, 'path');
  }

  setImagePanePath(paneId, pathValue) {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'image') {
      return false;
    }
    found.pane.path = String(pathValue || '');
    this.save();
    return true;
  }

  createUsagePane(paneId) {
    return this.createUtilityPane(paneId, 'usage', 'Usage');
  }

  createPluginPane(paneId, pluginPaneId, title) {
    return this.createUtilityPane(paneId, 'plugin', title, pluginPaneId, 'pluginPaneId');
  }

  setPluginPaneData(paneId, content) {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'plugin') {
      return false;
    }
    found.pane.pluginData = pluginPaneData(content);
    this.save();
    return true;
  }

  createNotepadTab(paneId, pathValue = '', defaults = {}) {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'notepad' || found.pane.notepadTabs.length >= 50) return null;
    const tab = notepadTab({ path: pathValue, ...notepadTabDefaults(defaults) });
    found.pane.notepadTabs.push(tab);
    found.pane.activeNotepadTabId = tab.id;
    found.pane.path = tab.path;
    this.save();
    return tab;
  }

  activateNotepadTab(paneId, tabId) {
    const found = this.findPane(paneId);
    const tab = found?.pane.type === 'notepad'
      ? found.pane.notepadTabs.find((candidate) => candidate.id === tabId)
      : null;
    if (!tab) return false;
    found.pane.activeNotepadTabId = tab.id;
    found.pane.path = tab.path;
    this.save();
    return true;
  }

  updateNotepadTab(paneId, tabId, updates = {}) {
    const found = this.findPane(paneId);
    const tab = found?.pane.type === 'notepad'
      ? found.pane.notepadTabs.find((candidate) => candidate.id === tabId)
      : null;
    if (!tab) return false;
    if (Object.prototype.hasOwnProperty.call(updates, 'path')) tab.path = String(updates.path || '');
    if (Object.prototype.hasOwnProperty.call(updates, 'title')) tab.title = String(updates.title || 'Untitled').slice(0, 160);
    if (Object.prototype.hasOwnProperty.call(updates, 'content') && !tab.path) {
      tab.content = String(updates.content || '').slice(0, MAX_NOTEPAD_CONTENT_LENGTH);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'encoding') && NOTEPAD_ENCODINGS.has(updates.encoding)) {
      tab.encoding = updates.encoding;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'eol') && NOTEPAD_EOLS.has(updates.eol)) {
      tab.eol = updates.eol;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'language')) {
      tab.language = String(updates.language || '').slice(0, 40);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'readOnly')) tab.readOnly = Boolean(updates.readOnly);
    if (Object.prototype.hasOwnProperty.call(updates, 'wrap')) tab.wrap = Boolean(updates.wrap);
    if (Object.prototype.hasOwnProperty.call(updates, 'indentGuides')) tab.indentGuides = Boolean(updates.indentGuides);
    if (Object.prototype.hasOwnProperty.call(updates, 'autosave')) tab.autosave = Boolean(updates.autosave);
    if (Object.prototype.hasOwnProperty.call(updates, 'fontFamily')) {
      tab.fontFamily = String(updates.fontFamily || '').slice(0, 200);
    }
    if (tab.path) tab.content = '';
    if (found.pane.activeNotepadTabId === tab.id) found.pane.path = tab.path;
    this.save();
    return true;
  }

  closeNotepadTab(paneId, tabId) {
    const found = this.findPane(paneId);
    if (!found || found.pane.type !== 'notepad') return false;
    const index = found.pane.notepadTabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return false;
    if (found.pane.notepadTabs.length === 1) {
      found.pane.notepadTabs[0] = notepadTab({ id: tabId });
    } else {
      found.pane.notepadTabs.splice(index, 1);
    }
    if (!found.pane.notepadTabs.some((tab) => tab.id === found.pane.activeNotepadTabId)) {
      found.pane.activeNotepadTabId = found.pane.notepadTabs[Math.min(index, found.pane.notepadTabs.length - 1)].id;
    }
    const activeTab = found.pane.notepadTabs.find((tab) => tab.id === found.pane.activeNotepadTabId);
    found.pane.path = activeTab?.path || '';
    this.save();
    return true;
  }

  createUtilityPane(paneId, type, title, value, property, emulationMode = 'desktop') {
    const found = this.findPane(paneId);
    if (!found) {
      return null;
    }
    const layout = appendLayout(found.tab.panes, this.verticalSlots, this.defaultPaneWidth, this.defaultPaneHeight);
    if (!layout) {
      return null;
    }
    const pane = {
      id: crypto.randomUUID(),
      type,
      title: nextNumberedName(title, found.tab.panes.map((candidate) => candidate.title)),
      cwd: found.pane.cwd,
      split: type,
      layout
    };
    if (property) {
      pane[property] = String(value || '');
    }
    if (type === 'plugin') {
      pane.pluginData = '{}';
    }
    if (type === 'browser') {
      const tab = browserTab({ url: value, emulationMode });
      pane.browserTabs = [tab];
      pane.activeBrowserTabId = tab.id;
    }
    if (type === 'notepad') {
      const tab = notepadTab({ path: value });
      pane.notepadTabs = [tab];
      pane.activeNotepadTabId = tab.id;
    }
    if (type === 'ai') {
      const tab = aiTab({ provider: value, cwd: found.pane.cwd });
      pane.aiTabs = [tab];
      pane.activeAiTabId = tab.id;
    }
    found.tab.panes.push(pane);
    found.tab.activePaneId = pane.id;
    found.session.activePaneId = pane.id;
    this.state.activeSessionId = found.session.id;
    this.save();
    return pane;
  }

  closePane(paneId) {
    for (const session of this.state.sessions) {
      for (const tab of session.tabs) {
        if (tab.panes.length <= 1) {
          continue;
        }
        const index = tab.panes.findIndex((pane) => pane.id === paneId);
        if (index !== -1) {
          tab.panes.splice(index, 1);
          tab.activePaneId = tab.panes[0].id;
          session.activePaneId = tab.panes[0].id;
          this.save();
          return true;
        }
      }
    }
    return false;
  }

  renamePane(paneId, title) {
    const nextTitle = String(title || '').trim();
    const found = this.findPane(paneId);
    if (!found || !nextTitle) {
      return false;
    }

    found.pane.title = nextTitle;
    this.save();
    return true;
  }

  setPaneFontSize(paneId, fontSize) {
    const found = this.findPane(paneId);
    if (!found || !validPaneFontSize(fontSize)) {
      return false;
    }
    found.pane.fontSize = Number(fontSize);
    this.save();
    return true;
  }

  placePane(paneId, layout) {
    const found = this.findPane(paneId);
    if (!found) {
      return false;
    }

    const next = sanitizeLayout(layout, this.verticalSlots, this.defaultPaneWidth);
    // Refusing the move leaves the pane where it was, which the client reads as
    // "put it back" rather than silently nudging it somewhere unasked for.
    const collides = found.tab.panes.some((pane) => pane.id !== paneId
      && overlaps(next, sanitizeLayout(pane.layout, this.verticalSlots)));
    if (collides) {
      return false;
    }
    found.pane.layout = next;
    this.save();
    return true;
  }

  // Returns true when pane geometry actually changed, so the caller knows the
  // clients need a fresh layout rather than just a repaint.
  applyGrid(gridSize, verticalSlots, defaultPaneWidth, defaultPaneHeight) {
    const previous = this.verticalSlots;
    const next = clampVerticalSlots(verticalSlots);
    this.gridSize = clampGridSize(gridSize);
    this.verticalSlots = next;
    this.defaultPaneWidth = clampPaneWidth(defaultPaneWidth);
    this.defaultPaneHeight = clampPaneHeight(defaultPaneHeight, next);
    if (previous === next) {
      return false; // only the cell width moved; cell counts are unaffected
    }

    for (const session of this.state.sessions) {
      for (const tab of session.tabs) {
        const rescaled = tab.panes.map((pane) => sanitizeLayout(
          rescaleLayout(sanitizeLayout(pane.layout, previous), previous, next),
          next
        ));
        const resolved = resolveOverlaps(rescaled);
        tab.panes.forEach((pane, index) => {
          pane.layout = resolved[index];
        });
      }
    }
    this.save();
    return true;
  }

  movePane(paneId, beforePaneId) {
    const found = this.findPane(paneId);
    if (!found) {
      return false;
    }

    const fromIndex = found.tab.panes.findIndex((pane) => pane.id === paneId);
    const toIndex = found.tab.panes.findIndex((pane) => pane.id === beforePaneId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
      return false;
    }

    const [pane] = found.tab.panes.splice(fromIndex, 1);
    const nextIndex = found.tab.panes.findIndex((candidate) => candidate.id === beforePaneId);
    found.tab.panes.splice(nextIndex, 0, pane);
    found.tab.activePaneId = paneId;
    found.session.activePaneId = paneId;
    this.save();
    return true;
  }

  setActivePane(paneId) {
    const found = this.findPane(paneId);
    if (!found) {
      return false;
    }

    found.tab.activePaneId = paneId;
    found.session.activePaneId = paneId;
    this.state.activeSessionId = found.session.id;
    this.save();
    return true;
  }
}

module.exports = {
  StateStore,
  defaultSession,
  nextNumberedName,
  AI_ATTACHMENT_FILE
};

// Every pane measurement is in whole grid cells. Cell width is the configured
// pixel size (the board scrolls sideways, so it stays fixed); cell height is
// the viewport divided by verticalSlots, which the client resolves at render.
function sanitizeLayout(layout, verticalSlots, paneWidth = DEFAULT_PANE_CELLS) {
  const slots = clampVerticalSlots(verticalSlots);
  const cell = (value, fallback) => {
    const rounded = Math.round(Number(value));
    return Number.isFinite(rounded) ? rounded : fallback;
  };
  const w = Math.max(1, cell(layout?.w, paneWidth));
  const h = Math.min(slots, Math.max(1, cell(layout?.h, slots)));
  return {
    x: Math.max(0, cell(layout?.x, 0)),
    // Pushed back rather than clipped, so a pane always fits the board height.
    y: Math.min(Math.max(0, cell(layout?.y, 0)), slots - h),
    w,
    h
  };
}

function clampGridSize(value) {
  const size = Math.round(Number(value));
  return Number.isFinite(size) ? Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, size)) : DEFAULT_GRID_SIZE;
}

function clampVerticalSlots(value) {
  const slots = Math.round(Number(value));
  return Number.isFinite(slots) ? Math.min(MAX_VERTICAL_SLOTS, Math.max(1, slots)) : DEFAULT_VERTICAL_SLOTS;
}

function clampPaneWidth(value) {
  const width = Math.round(Number(value));
  return Number.isFinite(width) ? Math.min(MAX_PANE_CELLS, Math.max(MIN_PANE_CELLS, width)) : DEFAULT_PANE_CELLS;
}

// Unlike pane width, the cap is not a fixed constant: a pane can never be
// taller than the current row count, so the ceiling moves with verticalSlots.
function clampPaneHeight(value, verticalSlots) {
  const slots = clampVerticalSlots(verticalSlots);
  const height = Math.round(Number(value));
  return Number.isFinite(height) ? Math.min(slots, Math.max(MIN_PANE_CELLS, height)) : slots;
}

// A layout is already in cells when it carries none of the older markers: the
// column model's `column`, the first grid's `cols`, or the canvas's `z`.
function isCellLayout(layout) {
  return Boolean(layout)
    && layout.column === undefined
    && layout.cols === undefined
    && layout.z === undefined
    && Number.isFinite(Number(layout.w));
}

// Each older schema reduces to world pixels, so one pass below converts them
// all. Only x and width matter: vertical position becomes a sort key, because
// none of the older models shared this one's bounded height.
function worldLayout(layout, columns) {
  if (Number.isFinite(Number(layout?.column))) {
    const index = Math.max(0, Math.round(Number(layout.column)));
    const list = Array.isArray(columns) ? columns : [];
    let x = 0;
    for (let position = 0; position < index; position += 1) {
      x += Math.round(Number(list[position]?.width)) || LEGACY_CELL_WIDTH;
    }
    return {
      x,
      y: Math.max(0, Math.round(Number(layout.row)) || 0),
      width: Math.round(Number(list[index]?.width)) || LEGACY_CELL_WIDTH
    };
  }
  if (layout && layout.cols !== undefined) {
    const cols = Math.max(1, Math.round(Number(layout.cols)) || 1);
    return {
      x: (Math.round(Number(layout.x)) || 0) * LEGACY_CELL_WIDTH,
      y: (Math.round(Number(layout.y)) || 0) * LEGACY_CELL_HEIGHT,
      width: cols * LEGACY_CELL_WIDTH
    };
  }
  return {
    x: Math.round(Number(layout?.x)) || 0,
    y: Math.round(Number(layout?.y)) || 0,
    width: Math.max(1, Math.round(Number(layout?.w)) || LEGACY_CELL_WIDTH)
  };
}

function migratePaneLayouts(panes, columns, gridSize, verticalSlots) {
  const layouts = panes.map((pane) => pane.layout);
  if (layouts.every(isCellLayout)) {
    return layouts.map((layout) => sanitizeLayout(layout, verticalSlots));
  }

  const grouped = new Map();
  panes
    .map((pane, index) => ({ ...worldLayout(pane.layout, columns), index }))
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .forEach((item) => {
      if (!grouped.has(item.x)) {
        grouped.set(item.x, []);
      }
      grouped.get(item.x).push(item);
    });

  const next = new Array(panes.length);
  for (const items of grouped.values()) {
    // Panes that shared an x stack up, splitting the slots between them; the
    // last one absorbs whatever the division left over.
    const height = Math.max(1, Math.floor(verticalSlots / items.length));
    items.forEach((item, position) => {
      const y = position * height;
      next[item.index] = sanitizeLayout({
        x: Math.round(item.x / gridSize),
        y,
        w: Math.max(1, Math.round(item.width / gridSize)),
        h: position === items.length - 1 ? verticalSlots - y : height
      }, verticalSlots);
    });
  }
  return next;
}

// Panes share one plane, so two of them may never cover the same cell. Edges
// that merely touch are fine: a pane ending at x+w does not occupy that column.
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// Slides overlapping panes right until each one sits clear. Working
// left-to-right, top-to-bottom keeps the result stable and independent of the
// order panes happen to be stored in.
function resolveOverlaps(layouts) {
  const placed = [];
  const resolved = new Array(layouts.length);
  layouts
    .map((layout, index) => ({ layout, index }))
    .sort((a, b) => a.layout.x - b.layout.x || a.layout.y - b.layout.y || a.index - b.index)
    .forEach((item) => {
      const next = { ...item.layout };
      while (placed.some((other) => overlaps(next, other))) {
        next.x += 1;
      }
      placed.push(next);
      resolved[item.index] = next;
    });
  return resolved;
}

// A different slot count means a cell covers a different fraction of the
// screen, so heights and offsets scale with it and the board keeps its shape.
function rescaleLayout(layout, fromSlots, toSlots) {
  const scale = toSlots / fromSlots;
  return {
    ...layout,
    y: Math.round(layout.y * scale),
    h: Math.max(1, Math.round(layout.h * scale))
  };
}

// A new pane takes the leftmost free space it fits in, topmost first, so
// closing a pane in the middle of the board leaves a gap the next one reuses
// instead of the board only ever growing sideways. Nothing already placed is
// disturbed: past the rightmost edge is always free, so the scan ends there.
function appendLayout(panes, verticalSlots, paneWidth = DEFAULT_PANE_CELLS, paneHeight = verticalSlots) {
  const slots = clampVerticalSlots(verticalSlots);
  const width = clampPaneWidth(paneWidth);
  const height = clampPaneHeight(paneHeight, slots);
  const taken = panes.map((pane) => sanitizeLayout(pane.layout, slots, width));
  const right = taken.reduce((max, layout) => Math.max(max, layout.x + layout.w), 0);
  for (let x = 0; x < right; x += 1) {
    for (let y = 0; y + height <= slots; y += 1) {
      const candidate = { x, y, w: width, h: height };
      if (!taken.some((layout) => overlaps(candidate, layout))) {
        return candidate;
      }
    }
  }
  return { x: right, y: 0, w: width, h: height };
}

// Host plugins own their payload shape, so the server stores JSON verbatim and
// only checks that it parses and stays within the shared state budget.
function pluginPaneData(value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value ?? {});
  if (typeof json !== 'string' || json.length > MAX_PLUGIN_DATA_LENGTH) {
    return '{}';
  }
  try {
    JSON.parse(json);
    return json;
  } catch {
    return '{}';
  }
}

function validPaneFontSize(value) {
  const size = Number(value);
  return Number.isInteger(size) && size >= 8 && size <= 32;
}
