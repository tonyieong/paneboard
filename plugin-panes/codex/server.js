'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

function shellEnv(config, env = process.env) {
  const key = Object.keys(env).find((name) => name.toLowerCase() === 'path') || 'PATH';
  const current = env[key] || '';
  const existing = new Set(current.split(path.delimiter).filter(Boolean).map((entry) => entry.toLowerCase()));
  const additions = (config.shell?.extra_path || [])
    .map((entry) => String(entry).trim())
    .filter((entry) => entry && !existing.has(entry.toLowerCase()));
  return additions.length
    ? { ...env, [key]: [current, ...additions].filter(Boolean).join(path.delimiter) }
    : { ...env };
}

function normalizeCwd(cwd, root) {
  return cwd && fs.existsSync(cwd) ? cwd : root || path.dirname(process.execPath);
}

// Turns the two agent CLIs into one stream of conversation events.
//
// Claude Code speaks newline-delimited JSON over stdio; Codex speaks JSON-RPC
// over stdio. Both are normalised here into the same event shape so the pane
// renders one kind of bubble, one kind of choice prompt, and one transcript
// format regardless of which CLI a tab is talking to.
//
// The adapters deliberately do not own their child process: they are handed a
// `write` callback and fed lines. That keeps the protocol logic testable
// against recorded frames (test/fixtures) without spawning anything.

// Notifications the pane never draws. Opting out at the protocol level keeps
// them from crossing the pipe at all, which matters because the delta streams
// are one message per token.
const CODEX_MUTED_NOTIFICATIONS = [
  'item/reasoning/textDelta',
  'item/reasoning/summaryPartAdded',
  'item/commandExecution/outputDelta',
  'item/fileChange/outputDelta',
  'item/plan/delta',
  'mcpServer/startupStatus/updated',
  'remoteControl/status/changed'
];
// Codex's TUI commands are not parsed by app-server. Only advertise the ones
// this pane can translate to app-server methods or manage itself.
const CODEX_PANE_COMMANDS = [
  'compact', 'review', 'new', 'fork', 'model', 'reasoning', 'mode', 'skills', 'personality', 'permissions'
];
const CODEX_REASONING_EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh']);
const CODEX_PERSONALITIES = new Set(['none', 'friendly', 'pragmatic']);
const CLAUDE_EFFORTS = new Set(['auto', 'low', 'medium', 'high', 'xhigh', 'max']);

// These values are appended to a command line that Windows runs through
// cmd.exe, which passes any quotes we add straight on to the CLI as part of the
// value -- claude answers `Provided value ""<id>"" is not a UUID`. So instead of
// quoting, anything outside a conservative character set is dropped, which also
// keeps a hand-edited config.toml from injecting extra arguments.
// Both CLIs write coloured diagnostics to stderr. The transcript quotes that
// text when a process dies, so the escape sequences come out first.
function stripAnsi(value) {
  return String(value || '')
    // CSI sequences: colour, cursor moves, everything codex logs with.
    .replace(/\u001B\[[0-9;]*[A-Za-z]/g, '')
    // OSC sequences, which a CLI may use to set a window title.
    .replace(/\u001B\][^\u0007]*\u0007/g, '');
}

function safeArg(value) {
  const text = String(value ?? '').trim();
  return /^[\w.:@/\\-]+$/.test(text) ? text : '';
}

// AI settings accept CLI arguments, not a shell command. Keeping every token
// to this conservative alphabet lets cmd.exe launch the npm shims without also
// turning the settings page into a command-execution surface.
function parseCliArgs(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return [];
  }
  const args = text.split(/\s+/);
  return args.every((arg) => /^[\w.:=@/\\-]+$/.test(arg)) ? args : null;
}

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_NPM_PACKAGE = '@openai/codex';
const UPDATE_CACHE_FILE = 'ai-update-codex.json';
const UPDATE_CLI_LABEL = 'Codex';
const UPDATE_VERSION_COMMAND = 'codex --version';
const MAX_PROMPT_IMAGES = 4;
const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const BASE64_PATTERN = /^[A-Za-z0-9+/]+=*$/;

function updateCachePath(root) {
  return path.join(root, 'data', UPDATE_CACHE_FILE);
}

function readUpdateCache(root) {
  try {
    return JSON.parse(fs.readFileSync(updateCachePath(root), 'utf8'));
  } catch (error) {
    return null;
  }
}

function writeUpdateCache(root, data) {
  try {
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.writeFileSync(updateCachePath(root), JSON.stringify(data));
  } catch (error) {
    // A failed write only delays the next scheduled check.
  }
}

// A version the CLI could not report, or a registry lookup that failed, never
// counts as an update -- silence beats a false positive here.
function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  const a = String(latest).split('.').map(Number);
  const b = String(current).split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

function readLocalCliVersion(commandLine, env) {
  return new Promise((resolve) => {
    const cli = cliProcess(commandLine);
    let child;
    try {
      child = spawn(cli.command, cli.args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve('');
      return;
    }
    let out = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch (killError) {
        // Already gone.
      }
      resolve('');
    }, 8000);
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('error', () => { clearTimeout(timer); resolve(''); });
    child.on('close', () => {
      clearTimeout(timer);
      const match = out.match(/\d+\.\d+\.\d+/);
      resolve(match ? match[0] : '');
    });
  });
}

function fetchLatestNpmVersion(packageName) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const req = https.get(`https://registry.npmjs.org/${packageName}/latest`, {
      timeout: 8000,
      headers: { 'User-Agent': 'paneboard' }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          done(String(JSON.parse(body).version || ''));
        } catch (error) {
          done('');
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => done(''));
  });
}

// Runs at most once a day per AiManager: the CLI's own --version output is
// compared against the npm registry so an available update can be mentioned
// in the pane without the user having to think to ask.
async function refreshUpdateCheck(root, env) {
  const [localVersion, latestVersion] = await Promise.all([
    readLocalCliVersion(UPDATE_VERSION_COMMAND, env),
    fetchLatestNpmVersion(UPDATE_NPM_PACKAGE)
  ]);
  const data = { checkedAt: Date.now(), localVersion, latestVersion };
  writeUpdateCache(root, data);
  return data;
}

// Caps count, size and MIME type on the way in: these bytes came straight
// from the browser's clipboard, over a socket with no other validation.
function sanitizeImages(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const images = [];
  for (const item of value) {
    if (images.length >= MAX_PROMPT_IMAGES) break;
    const mimeType = String(item?.mimeType || '');
    const data = String(item?.data || '');
    if (!ALLOWED_IMAGE_TYPES.has(mimeType) || !data
        || data.length > MAX_IMAGE_BASE64_LENGTH || !BASE64_PATTERN.test(data)) {
      continue;
    }
    images.push({ mimeType, data });
  }
  return images;
}

const AI_ATTACHMENTS_DIR = 'ai-attachments';
const IMAGE_FILE_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

function attachmentsDir(root, tabId) {
  return path.join(root, 'data', AI_ATTACHMENTS_DIR, tabId);
}

// The folder name claude derives from a working directory: every character
// that is not a letter or a digit becomes a dash.
function claudeProjectDir(cwd, home) {
  return path.join(home, 'projects', String(cwd).replace(/[^A-Za-z0-9]/g, '-'));
}

function findFileRecursive(dir, matches, depth = 0) {
  if (depth > 6) return '';
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return '';
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, matches, depth + 1);
      if (found) return found;
    } else if (matches(entry.name)) {
      return full;
    }
  }
  return '';
}

function transcriptBlockText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block === 'string') return block;
      // Codex spells this two different ways across its own item types --
      // 'text' on a UserMessage block, 'Text' on an AgentMessage one.
      if (block?.text && String(block.type || '').toLowerCase() === 'text') return block.text;
    }
  }
  return '';
}

// The CLI wraps its own injected context -- slash-command echoes, the caveat
// that precedes them, environment notes -- in a record that otherwise looks
// exactly like a real turn, and this tag is the only thing that tells them
// apart from what the user actually typed.
function isInjectedContext(text) {
  const trimmed = text.trim();
  return trimmed.startsWith('<') || trimmed.startsWith('Caveat:');
}

function parseTranscriptLines(text) {
  const records = [];
  // A line a tail-read cut in half simply fails to parse and is skipped.
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      // A partial or malformed record says nothing about the conversation.
    }
  }
  return records;
}

// The CLI already wrote the earlier conversation to its own session file, so
// resuming can show what was actually said instead of just a note that
// something continues off-screen. Read only, and best-effort: a session file
// that has moved, or one from a CLI version with a different shape, simply
// yields no history rather than a broken pane.
const TRANSCRIPT_TAIL_BYTES = 8 * 1024 * 1024;

function readSessionTranscript(provider, sessionId, cwd, env = process.env) {
  if (!sessionId) return [];
  const home = env.USERPROFILE || env.HOME || os.homedir();
  let file = '';
  if (provider === 'codex') {
    const root = env.CODEX_HOME || path.join(home, '.codex');
    file = findFileRecursive(path.join(root, 'sessions'),
      (name) => name.startsWith('rollout-') && name.endsWith(`${sessionId}.jsonl`));
  } else if (provider === 'claude') {
    const root = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
    const candidate = path.join(claudeProjectDir(cwd, root), `${sessionId}.jsonl`);
    file = fs.existsSync(candidate) ? candidate : '';
  }
  if (!file) return [];
  let text;
  try {
    text = fs.readFileSync(file, 'utf8').slice(-TRANSCRIPT_TAIL_BYTES);
  } catch (error) {
    return [];
  }
  const events = [];
  for (const record of parseTranscriptLines(text)) {
    if (provider === 'codex') {
      // event_msg carries only what the user actually typed and the model's
      // finished reply; the response_item log beside it also holds whatever
      // context codex injected ahead of the real turns (AGENTS.md, recommended
      // plugins, skill instructions), with no reliable way to tell those apart
      // from a real message once they are in that shape.
      if (record.type !== 'event_msg') continue;
      const payload = record.payload || {};
      // Current rollout files (codex 0.153+) wrap every turn's item in
      // item_completed instead of writing a dedicated user_message/agent_message
      // event; both are read so a session recorded by an older CLI still resumes.
      if (payload.type === 'item_completed') {
        const item = payload.item || {};
        const text = transcriptBlockText(item.content);
        if (item.type === 'UserMessage' && text) {
          events.push({ role: 'user', kind: 'text', text });
        } else if (item.type === 'AgentMessage' && text) {
          events.push({ role: 'assistant', kind: 'text', text });
        }
      } else if (payload.type === 'user_message' && payload.message) {
        events.push({ role: 'user', kind: 'text', text: payload.message });
      } else if (payload.type === 'agent_message' && payload.phase === 'final_answer' && payload.message) {
        events.push({ role: 'assistant', kind: 'text', text: payload.message });
      }
    } else {
      if ((record.type !== 'user' && record.type !== 'assistant') || record.isSidechain) continue;
      const value = transcriptBlockText(record.message?.content);
      if (value && !isInjectedContext(value)) {
        events.push({ role: record.type, kind: 'text', text: value });
      }
    }
  }
  return events.slice(-200);
}

// /model and /effort are answered locally by the CLI -- the reply carries
// model: "<synthetic>" and cost 0, meaning no API call happened -- as plain
// confirmation text with no structured field for the new value. The 'system'
// init frame does repeat the model, but only once the next turn starts, and
// never carries effort at all, so without this the pane's own badge either
// lags a full turn behind or never reflects an effort change.
function claudeSyntheticReplyUpdate(text) {
  const value = String(text || '').trim();
  const current = /^Current model:\s*(.+?)\s*\(effort:\s*(auto|low|medium|high|xhigh|max)\)/i.exec(value);
  if (current) {
    return { model: current[1].trim(), effort: current[2].toLowerCase() };
  }
  const update = {};
  const setEffort = /^Set effort level to (auto|low|medium|high|xhigh|max)\b/i.exec(value);
  if (setEffort) {
    update.effort = setEffort[1].toLowerCase();
  }
  const setModel = /^Set model to (.+?)(?: for this session only)?[.:]?\s*$/i.exec(value.split('\n')[0]);
  if (setModel) {
    update.model = setModel[1].trim();
  }
  return Object.keys(update).length ? update : null;
}

function claudeEffort(value) {
  const effort = String(value || '').trim().toLowerCase();
  return CLAUDE_EFFORTS.has(effort) ? effort : '';
}

function readClaudeEffort(filePath) {
  try {
    const settings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return claudeEffort(settings.effortLevel);
  } catch (error) {
    return '';
  }
}

function readClaudeModel(filePath) {
  try {
    const settings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return safeArg(settings.model);
  } catch (error) {
    return '';
  }
}

function resolveClaudeModel(config, cwd = '', env = process.env) {
  const configured = safeArg(config?.ai?.claude_model);
  const environment = safeArg(env.ANTHROPIC_MODEL);
  let persisted = '';
  const home = env.USERPROFILE || env.HOME;
  if (home) {
    persisted = readClaudeModel(path.join(home, '.claude', 'settings.json')) || persisted;
  }
  if (cwd) {
    const folder = path.resolve(cwd);
    persisted = readClaudeModel(path.join(folder, '.claude', 'settings.json')) || persisted;
    persisted = readClaudeModel(path.join(folder, '.claude', 'settings.local.json')) || persisted;
  }
  return configured || environment || persisted || 'default';
}

function resolveClaudeEffort(config, cwd = '', env = process.env) {
  const configured = claudeEffort(config?.ai?.claude_effort);
  const environment = claudeEffort(env.CLAUDE_CODE_EFFORT_LEVEL);
  let persisted = '';
  const home = env.USERPROFILE || env.HOME;
  if (home) {
    persisted = readClaudeEffort(path.join(home, '.claude', 'settings.json')) || persisted;
  }
  if (cwd) {
    const folder = path.resolve(cwd);
    persisted = readClaudeEffort(path.join(folder, '.claude', 'settings.json')) || persisted;
    persisted = readClaudeEffort(path.join(folder, '.claude', 'settings.local.json')) || persisted;
  }
  return environment || configured || persisted || 'auto';
}

// Renders a tool's arguments as something worth reading in a bubble: the shell
// command for Bash, the path and body for a write, a diff for an edit, and
// pretty JSON for anything else.
function formatToolInput(input) {
  if (input === undefined || input === null) {
    return { text: '', language: '' };
  }
  if (typeof input !== 'object') {
    return { text: String(input), language: '' };
  }
  if (typeof input.command === 'string') {
    return { text: input.command, language: 'bash' };
  }
  if (typeof input.file_path === 'string' && typeof input.old_string === 'string') {
    return {
      text: `${input.file_path}\n\n- ${input.old_string}\n+ ${input.new_string ?? ''}`,
      language: 'diff'
    };
  }
  if (typeof input.file_path === 'string' && typeof input.content === 'string') {
    return { text: `${input.file_path}\n\n${input.content}`, language: '' };
  }
  return { text: JSON.stringify(input, null, 2), language: 'json' };
}

function toolResultText(block, extra) {
  if (extra && typeof extra === 'object' && typeof extra.stdout === 'string') {
    return [extra.stdout, extra.stderr].filter(Boolean).join('\n').trim();
  }
  if (typeof block.content === 'string') {
    return block.content;
  }
  if (Array.isArray(block.content)) {
    return block.content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

// The CLI offers these alongside allow/deny; they are the "and stop asking"
// choices its own prompt shows, so they are surfaced verbatim rather than
// being collapsed into a second Allow button.
function suggestionLabel(suggestion) {
  if (suggestion?.type === 'setMode' && suggestion.mode === 'acceptEdits') {
    return suggestion.destination === 'session'
      ? 'Allow edits for the rest of this session'
      : 'Allow edits from now on';
  }
  if (suggestion?.type === 'setMode') {
    return `Switch to ${suggestion.mode} mode`;
  }
  if (suggestion?.type === 'addRules' && Array.isArray(suggestion.rules)) {
    return `Always allow ${suggestion.rules.map((rule) => rule.toolName || rule).join(', ')}`;
  }
  return 'Allow and remember this choice';
}

class ClaudeAdapter {
  constructor({ config, cwd, env, write, onEvent, onDelta, onSession, onStatus }) {
    this.config = config;
    this.write = write;
    this.onEvent = onEvent;
    this.onDelta = onDelta || (() => {});
    this.onSession = onSession;
    this.onStatus = onStatus;
    // Accumulated text-so-far for a content block still streaming, keyed by
    // its index; only text blocks are tracked, so a reply mixing text and
    // tool calls never gets its bookkeeping confused with tool-call bookkeeping.
    this.streamingText = new Map();
    // requestId -> what the CLI is waiting to hear back about.
    this.pending = new Map();
    // AskUserQuestion is drawn as the choice prompt it becomes, so its raw tool
    // call and result are suppressed rather than shown twice.
    this.questionToolIds = new Set();
    this.turnId = '';
    this.modelSelection = resolveClaudeModel(this.config, cwd, env);
    this.model = this.modelSelection === 'default' ? '' : this.modelSelection;
    this.effort = resolveClaudeEffort(this.config, cwd, env);
    // Answered by the initialize control request, before any turn.
    this.commands = [];
    this.terminalCommands = new Set();
    this.initRequestId = '';
  }

  get provider() {
    return 'claude';
  }

  commandLine({ sessionId } = {}) {
    const settings = this.config.ai || {};
    const args = [
      'claude --print',
      '--output-format stream-json',
      '--input-format stream-json',
      '--verbose',
      // Undocumented, but the only way to see permission prompts as data
      // instead of as a terminal UI. Verified against claude 2.1.233.
      '--permission-prompt-tool stdio',
      // Streams content_block_delta events for the reply as it is generated,
      // instead of only the completed text block at the end.
      '--include-partial-messages'
    ];
    const extraArgs = parseCliArgs(settings.claude_args);
    if (extraArgs) {
      args.push(...extraArgs);
    }
    const model = safeArg(settings.claude_model);
    const effort = safeArg(settings.claude_effort);
    const resume = safeArg(sessionId);
    if (model) {
      args.push(`--model ${model}`);
    }
    if (effort) {
      args.push(`--effort ${effort}`);
    }
    if (resume) {
      args.push(`--resume ${resume}`);
    }
    return args.join(' ');
  }

  emit(event) {
    this.onEvent({ turnId: this.turnId, ...event });
  }

  // The CLI stays completely silent until it is given something to do, so the
  // init frame -- and the command list on it -- does not arrive until after the
  // first reply. This control request answers straight away instead, and it
  // carries a description and an argument hint for each command as well.
  start() {
    this.initRequestId = crypto.randomUUID();
    this.write({
      type: 'control_request',
      request_id: this.initRequestId,
      request: { subtype: 'initialize' }
    });
    this.onStatus({ status: 'starting' });
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      return;
    }
    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') {
          this.model = message.model || '';
          // Only this frame says which commands are bound to the local terminal,
          // and the CLI's own note is that a remote UI should hide those.
          this.terminalCommands = new Set(message.terminal_slash_commands || []);
          this.onSession(message.session_id || '');
          this.onStatus({ status: 'idle', model: this.model, effort: this.effort });
          // Re-publish with the descriptions already collected, now that the
          // terminal-bound ones can be dropped.
          this.publishCommands(this.commands.length ? this.commands : (message.slash_commands || []));
        }
        return;
      case 'assistant':
        this.handleAssistant(message);
        return;
      case 'user':
        this.handleUser(message);
        return;
      case 'stream_event':
        this.handleStreamEvent(message.event || {});
        return;
      case 'control_request':
        this.handleControlRequest(message);
        return;
      case 'control_response':
        this.handleControlResponse(message);
        return;
      case 'result':
        // A compaction reports itself as a result without ending the turn.
        if (message.subtype === 'compact' || message.subtype === 'compaction') {
          this.emit({ role: 'system', kind: 'notice', text: 'The conversation was compacted to free up context.' });
          return;
        }
        this.emit({
          role: 'system',
          kind: 'result',
          text: message.is_error ? String(message.result || 'The turn failed.') : '',
          usage: {
            inputTokens: message.usage?.input_tokens,
            outputTokens: message.usage?.output_tokens,
            durationMs: message.duration_ms
          }
        });
        this.turnId = '';
        this.onStatus({ status: 'idle' });
        return;
      default:
        // rate_limit_event and friends carry nothing the transcript shows.
    }
  }

  handleAssistant(message) {
    for (const [index, block] of (message.message?.content || []).entries()) {
      if (block.type === 'thinking') {
        // Extended thinking can arrive as a signature with no text at all.
        if (block.thinking) {
          this.emit({ role: 'assistant', kind: 'thinking', text: block.thinking });
        }
      } else if (block.type === 'text') {
        if (block.text) {
          if (message.message?.model === '<synthetic>') {
            const update = claudeSyntheticReplyUpdate(block.text);
            if (update) {
              this.model = update.model || this.model;
              this.effort = update.effort || this.effort;
              this.onStatus({ model: this.model, effort: this.effort });
            }
          }
          const key = String(index);
          // A block that streamed deltas is finished by this same full text,
          // which arrives once content_block_stop has already fired; a block
          // that never streamed (partial messages disabled or never enabled
          // by the CLI) still gets its one complete event as before.
          if (this.streamingText.has(key)) {
            this.streamingText.delete(key);
            this.onDelta({ turnId: this.turnId, key, text: block.text, done: true });
          } else {
            this.emit({ role: 'assistant', kind: 'text', text: block.text });
          }
        }
      } else if (block.type === 'tool_use') {
        if (block.name === 'AskUserQuestion') {
          this.questionToolIds.add(block.id);
          continue;
        }
        const input = formatToolInput(block.input);
        this.emit({
          role: 'assistant',
          kind: 'tool_use',
          tool: { id: block.id, name: block.name, input: input.text, language: input.language, status: 'running' }
        });
      }
    }
  }

  // Only a text block's own token stream is drawn as it arrives; thinking and
  // tool-call argument deltas stay muted, the same as Codex's reasoning and
  // tool-output deltas, so this only ever looks at content_block_delta/text_delta.
  handleStreamEvent(event) {
    if (event.type !== 'content_block_delta' || event.delta?.type !== 'text_delta' || !event.delta.text) {
      return;
    }
    const key = String(event.index ?? 0);
    const text = (this.streamingText.get(key) || '') + event.delta.text;
    this.streamingText.set(key, text);
    this.onDelta({ turnId: this.turnId, key, text, done: false });
  }

  handleUser(message) {
    for (const block of message.message?.content || []) {
      // Text here is the CLI echoing back what we sent; the bubble for it was
      // drawn when the prompt was submitted.
      if (block.type !== 'tool_result') continue;
      if (this.questionToolIds.has(block.tool_use_id)) {
        this.questionToolIds.delete(block.tool_use_id);
        continue;
      }
      this.emit({
        role: 'user',
        kind: 'tool_result',
        result: {
          toolUseId: block.tool_use_id,
          output: toolResultText(block, message.tool_use_result),
          isError: Boolean(block.is_error)
        }
      });
    }
  }

  handleControlResponse(message) {
    const response = message.response || {};
    if (response.request_id !== this.initRequestId || response.subtype !== 'success') {
      return;
    }
    const details = response.response || {};
    const models = Array.isArray(details.models) ? details.models : [];
    const selected = models.find((model) => model.value === this.modelSelection)
      || models.find((model) => model.resolvedModel === this.modelSelection)
      || models.find((model) => model.value === 'default')
      || models[0];
    const model = safeArg(selected?.resolvedModel) || safeArg(this.modelSelection);
    if (model) {
      this.model = model;
      this.onStatus({ model: this.model, effort: this.effort });
    }
    this.publishCommands(details.commands || []);
  }

  // Commands arrive as objects here and as bare names on the init frame, and
  // only the init frame says which of them belong to the CLI's own terminal.
  publishCommands(commands) {
    this.commands = commands
      .map((command) => (typeof command === 'string'
        ? { name: command, description: '', argumentHint: '' }
        : {
          name: String(command.name || ''),
          description: String(command.description || ''),
          argumentHint: String(command.argumentHint || '')
        }))
      .filter((command) => command.name && !this.terminalCommands.has(command.name));
    this.onStatus({ commands: this.commands });
  }

  handleControlRequest(message) {
    const requestId = message.request_id;
    const request = message.request || {};
    if (request.subtype !== 'can_use_tool' || !requestId) {
      return;
    }
    if (request.tool_name === 'AskUserQuestion') {
      this.openAskQuestions(requestId, request);
      return;
    }
    this.openPermissionQuestion(requestId, request);
  }

  openAskQuestions(requestId, request) {
    const questions = request.input?.questions || [];
    this.pending.set(requestId, {
      kind: 'ask',
      input: request.input,
      questions,
      answers: {},
      eventIds: new Map()
    });
    questions.forEach((question, index) => {
      const event = {
        role: 'assistant',
        kind: 'question',
        question: {
          requestId,
          groupId: String(index),
          prompt: question.question,
          detail: question.header || '',
          multi: Boolean(question.multiSelect),
          // The tool's own contract is that "Other" is offered automatically
          // and never listed among the options, so the pane has to supply it.
          allowFreeText: true,
          // Straight from the CLI: same labels and descriptions its own prompt
          // would have shown.
          options: (question.options || []).map((option) => ({
            id: option.label,
            label: option.label,
            hint: option.description || ''
          }))
        }
      };
      this.emit(event);
    });
    this.onStatus({ status: 'waiting' });
  }

  openPermissionQuestion(requestId, request) {
    const input = formatToolInput(request.input);
    const options = [{ id: 'allow', label: 'Allow' }];
    for (const [index, suggestion] of (request.permission_suggestions || []).entries()) {
      options.push({ id: `suggestion:${index}`, label: suggestionLabel(suggestion) });
    }
    options.push({ id: 'deny', label: 'Deny' });
    this.pending.set(requestId, { kind: 'permission', request });
    this.emit({
      role: 'assistant',
      kind: 'question',
      question: {
        requestId,
        prompt: `Run ${request.display_name || request.tool_name}?`,
        detail: input.text,
        detailLanguage: input.language,
        allowFreeText: false,
        options
      }
    });
    this.onStatus({ status: 'waiting' });
  }

  answer(requestId, groupId, optionIds, text) {
    const entry = this.pending.get(requestId);
    if (!entry) {
      return false;
    }
    if (entry.kind === 'permission') {
      this.pending.delete(requestId);
      this.respondPermission(requestId, entry.request, optionIds[0]);
      this.onStatus({ status: 'busy' });
      return true;
    }
    const index = Number(groupId) || 0;
    const question = entry.questions[index];
    if (!question) {
      return false;
    }
    // Multi-question requests are answered one bubble at a time; the CLI is
    // only told once every question has a choice.
    // A typed answer is just a label the CLI never listed; it goes back the
    // same way a chosen one does.
    const chosen = text ? [...optionIds, text] : optionIds;
    entry.answers[question.question] = question.multiSelect ? chosen : chosen[0];
    if (Object.keys(entry.answers).length < entry.questions.length) {
      return true;
    }
    this.pending.delete(requestId);
    this.write({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        // Answering means handing the tool its input back with an `answers`
        // map; allowing without it reads to the CLI as "the user said nothing".
        response: { behavior: 'allow', updatedInput: { ...entry.input, answers: entry.answers } }
      }
    });
    this.onStatus({ status: 'busy' });
    return true;
  }

  respondPermission(requestId, request, optionId) {
    if (optionId === 'deny') {
      this.write({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: requestId,
          response: { behavior: 'deny', message: 'The user declined this tool call.' }
        }
      });
      return;
    }
    const response = { behavior: 'allow' };
    const match = /^suggestion:(\d+)$/.exec(optionId || '');
    if (match) {
      const suggestion = (request.permission_suggestions || [])[Number(match[1])];
      if (suggestion) {
        response.updatedPermissions = [suggestion];
      }
    }
    this.write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
  }

  sendPrompt(text) {
    this.turnId = crypto.randomUUID();
    this.emit({ role: 'user', kind: 'text', text });
    this.write({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });
    this.onStatus({ status: 'busy' });
  }

  interrupt() {
    this.write({
      type: 'control_request',
      request_id: crypto.randomUUID(),
      request: { subtype: 'interrupt' }
    });
  }

  // Called when the CLI is gone: the requests can never be answered now, so
  // the caller marks their bubbles cancelled rather than leaving live buttons.
  takePending() {
    const ids = [...this.pending.keys()];
    this.pending.clear();
    return ids;
  }
}

const CODEX_DECISION_LABELS = {
  accept: 'Accept',
  acceptForSession: 'Accept for this session',
  decline: 'Decline',
  cancel: 'Decline and stop the turn'
};

function decisionLabel(decision) {
  if (typeof decision === 'string') {
    return CODEX_DECISION_LABELS[decision] || decision;
  }
  // The object-shaped decisions carry an amendment to remember; naming them by
  // their key is closer to the CLI's own wording than inventing a sentence.
  const key = Object.keys(decision || {})[0] || '';
  return CODEX_DECISION_LABELS[key] || key || 'Accept';
}

function reasoningText(item) {
  const parts = [...(item.summary || []), ...(item.content || [])];
  return parts
    .map((part) => (typeof part === 'string' ? part : part?.text || ''))
    .filter(Boolean)
    .join('\n\n');
}

class CodexAdapter {
  constructor({ config, cwd = '', write, onEvent, onDelta, onSession, onStatus }) {
    this.config = config;
    this.cwd = cwd;
    this.write = write;
    this.onEvent = onEvent;
    this.onDelta = onDelta || (() => {});
    this.onSession = onSession;
    this.onStatus = onStatus;
    // Accumulated text-so-far for an agentMessage item still streaming, keyed
    // by its itemId.
    this.streamingText = new Map();
    this.reasoningSummaries = new Map();
    this.pending = new Map();
    this.requests = new Map();
    this.turnId = '';
    this.threadId = '';
    this.nextId = 1;
    this.commands = [...CODEX_PANE_COMMANDS];
    // Prompts submitted before the handshake finishes wait here rather than
    // being dropped, because the pane lets you type immediately.
    this.queue = [];
    this.resumeId = '';
    this.modelOverride = '';
    this.modelChosen = false;
    this.currentModel = this.config.ai?.codex_model || '';
    this.effortOverride = this.config.ai?.codex_effort || '';
    this.effortChosen = false;
    this.currentEffort = this.effortOverride;
    this.personalityOverride = '';
    this.permissionsOverride = '';
    this.collaborationModeOverride = null;
    this.activeTurnId = '';
    this.models = [];
    this.skills = [];
    this.permissionProfiles = [];
    this.collaborationModes = [];
  }

  get provider() {
    return 'codex';
  }

  commandLine() {
    const settings = this.config.ai || {};
    const extraArgs = parseCliArgs(settings.codex_args);
    // app-server accepts --yolo but does not apply its implicit config overrides,
    // so spell them out while placing every global argument before the subcommand.
    const appServerArgs = (extraArgs || []).flatMap((arg) => arg === '--yolo'
      ? ['-c', 'approval_policy=never', '-c', 'sandbox_mode=danger-full-access']
      : [arg]);
    return ['codex', ...appServerArgs, 'app-server'].join(' ');
  }

  emit(event) {
    this.onEvent({ turnId: this.turnId, ...event });
  }

  request(method, params) {
    const id = this.nextId;
    this.nextId += 1;
    this.requests.set(id, method);
    this.write({ jsonrpc: '2.0', id, method, params });
    return id;
  }

  notify(method, params) {
    this.write({ jsonrpc: '2.0', method, params });
  }

  start({ sessionId } = {}) {
    this.resumeId = sessionId || '';
    this.request('initialize', {
      clientInfo: { name: 'paneboard', title: 'Paneboard', version: '0.1.0' },
      capabilities: {
        // request_user_input, the choice-prompt path, is behind this flag.
        experimentalApi: true,
        // The per-token delta streams would be several hundred messages per
        // reply, and the pane only draws completed items.
        optOutNotificationMethods: CODEX_MUTED_NOTIFICATIONS
      }
    });
    this.onStatus({ status: 'starting', commands: this.commands });
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      return;
    }
    if (message.method && message.id !== undefined && message.id !== null) {
      this.handleServerRequest(message);
      return;
    }
    if (message.method) {
      this.handleNotification(message.method, message.params || {});
      return;
    }
    this.handleResponse(message);
  }

  handleResponse(message) {
    const method = this.requests.get(message.id);
    this.requests.delete(message.id);
    if (message.error) {
      if (method === 'model/list' || method === 'skills/list' || method === 'permissionProfile/list'
          || method === 'collaborationMode/list') {
        return;
      }
      // A resume that fails is worth saying out loud: the transcript on screen
      // survives, but the model can no longer see any of it.
      if (method === 'thread/resume') {
        this.emit({
          role: 'system',
          kind: 'notice',
          text: '--- New Session ---'
        });
        this.resumeId = '';
        this.request('thread/start', this.threadParams());
        return;
      }
      this.emit({ role: 'system', kind: 'error', text: message.error.message || 'The CLI reported an error.' });
      this.onStatus({ status: 'idle' });
      return;
    }
    if (method === 'initialize') {
      this.notify('initialized', {});
      if (this.resumeId) {
        this.request('thread/resume', { ...this.threadParams(), threadId: this.resumeId });
      } else {
        this.request('thread/start', this.threadParams());
      }
      return;
    }
    if (method === 'thread/start' || method === 'thread/resume') {
      this.threadId = message.result?.thread?.id || message.result?.threadId || '';
      this.currentModel = (this.modelChosen && this.modelOverride) || message.result?.model || this.currentModel;
      this.currentEffort = (this.effortChosen && this.effortOverride) || message.result?.reasoningEffort || this.currentEffort;
      this.onSession(this.threadId);
      this.onStatus({ status: 'idle', model: this.currentModel, effort: this.currentEffort });
      this.refreshCapabilities();
      const queued = this.queue;
      this.queue = [];
      for (const item of queued) {
        this.emit({
          role: 'user',
          kind: 'text',
          text: item.text,
          ...(item.images.length ? { images: item.images.map(({ id, mimeType }) => ({ id, mimeType })) } : {})
        });
        this.dispatchPrompt(item.text, item.images);
      }
      return;
    }
    if (method === 'turn/start') {
      this.activeTurnId = message.result?.turn?.id || '';
      return;
    }
    if (method === 'thread/fork') {
      this.threadId = message.result?.thread?.id || '';
      if (this.threadId) {
        this.onSession(this.threadId);
        this.emit({ role: 'system', kind: 'notice', text: 'This conversation was forked into a new thread.' });
      }
      this.onStatus({ status: 'idle' });
      return;
    }
    if (method === 'model/list') {
      this.models = (message.result?.data || []).map((model) => ({
        id: model.id,
        label: model.displayName || model.id,
        description: model.description || '',
        isDefault: Boolean(model.isDefault),
        defaultReasoningEffort: model.defaultReasoningEffort || '',
        supportsPersonality: Boolean(model.supportsPersonality),
        reasoningEfforts: (model.supportedReasoningEfforts || []).map((option) => ({
          id: option.reasoningEffort,
          description: option.description || ''
        }))
      })).filter((model) => model.id);
      const selected = this.models.find((model) => model.id === this.currentModel)
        || this.models.find((model) => model.isDefault);
      if (!this.currentModel && selected) {
        this.currentModel = selected.id;
      }
      if (!this.currentEffort && selected?.defaultReasoningEffort) {
        this.currentEffort = selected.defaultReasoningEffort;
      }
      this.onStatus({ model: this.currentModel, effort: this.currentEffort });
      this.announceCapabilities();
      return;
    }
    if (method === 'skills/list') {
      const seen = new Set();
      this.skills = (message.result?.data || []).flatMap((entry) => entry.skills || [])
        .filter((skill) => skill.enabled !== false && skill.name && skill.path && !seen.has(skill.name) && seen.add(skill.name))
        .map((skill) => ({
          name: skill.name,
          path: skill.path,
          description: skill.interface?.shortDescription || skill.shortDescription || skill.description || ''
        }));
      this.announceCapabilities();
      return;
    }
    if (method === 'permissionProfile/list') {
      this.permissionProfiles = (message.result?.data || [])
        .filter((profile) => profile.allowed !== false && profile.id)
        .map((profile) => ({ id: profile.id, description: profile.description || '' }));
      this.announceCapabilities();
      return;
    }
    if (method === 'collaborationMode/list') {
      this.collaborationModes = (message.result?.data || [])
        .filter((item) => item.mode)
        .map((item) => ({
          id: item.mode,
          label: item.name || item.mode,
          model: item.model || '',
          reasoningEffort: item.reasoning_effort || ''
        }));
      this.announceCapabilities();
    }
  }

  refreshCapabilities({ forceSkills = false } = {}) {
    this.request('model/list', {});
    this.request('skills/list', { cwds: this.cwd ? [this.cwd] : [], forceReload: forceSkills });
    this.request('permissionProfile/list', this.cwd ? { cwd: this.cwd } : {});
    this.request('collaborationMode/list', {});
  }

  announceCapabilities() {
    this.onStatus({
      capabilities: {
        models: this.models,
        skills: this.skills.map(({ name, description }) => ({ name, description })),
        permissionProfiles: this.permissionProfiles,
        collaborationModes: this.collaborationModes.map(({ id, label }) => ({ id, label })),
        personalities: [...CODEX_PERSONALITIES]
      }
    });
  }

  threadParams() {
    return {};
  }

  handleNotification(method, params) {
    switch (method) {
      case 'turn/started':
        this.activeTurnId = params.turn?.id || params.turnId || '';
        this.onStatus({ status: 'busy' });
        return;
      case 'turn/completed':
        this.emit({ role: 'system', kind: 'result' });
        this.turnId = '';
        this.activeTurnId = '';
        this.onStatus({ status: 'idle' });
        return;
      case 'skills/changed':
        this.request('skills/list', { cwds: this.cwd ? [this.cwd] : [], forceReload: true });
        return;
      case 'error':
        this.emit({
          role: 'system',
          kind: 'error',
          text: params.error?.message || params.message || 'The CLI reported an error.'
        });
        // Retriable errors leave this turn in flight; terminal failures are
        // followed by turn/completed. Only that lifecycle event makes it idle.
        return;
      case 'item/started':
        this.handleItemStarted(params.item || {});
        return;
      case 'item/completed':
        this.handleItemCompleted(params.item || {});
        return;
      case 'item/agentMessage/delta': {
        const prior = this.streamingText.get(params.itemId);
        const text = (prior?.text || '') + (params.delta || '');
        this.streamingText.set(params.itemId, { turnId: params.turnId, text });
        this.onDelta({ turnId: params.turnId, key: params.itemId, text, done: false });
        return;
      }
      case 'item/reasoning/summaryTextDelta': {
        const parts = this.reasoningSummaries.get(params.itemId) || [];
        const index = Number.isInteger(params.summaryIndex) ? params.summaryIndex : 0;
        parts[index] = (parts[index] || '') + (params.delta || '');
        this.reasoningSummaries.set(params.itemId, parts);
        return;
      }
      default:
        // Everything else is bookkeeping the transcript does not show.
    }
  }

  handleItemStarted(item) {
    if (item.type === 'commandExecution') {
      this.emit({
        role: 'assistant',
        kind: 'tool_use',
        tool: { id: item.id, name: 'Shell', input: item.command || '', language: 'bash', status: 'running' }
      });
      return;
    }
    if (item.type === 'fileChange') {
      this.emit({
        role: 'assistant',
        kind: 'tool_use',
        tool: { id: item.id, name: 'Edit', input: formatCodexChanges(item.changes), language: 'diff', status: 'running' }
      });
      return;
    }
    if (item.type === 'mcpToolCall') {
      const input = formatToolInput(item.arguments);
      this.emit({
        role: 'assistant',
        kind: 'tool_use',
        tool: { id: item.id, name: `${item.server}/${item.tool}`, input: input.text, language: input.language, status: 'running' }
      });
    }
  }

  handleItemCompleted(item) {
    switch (item.type) {
      case 'agentMessage': {
        // An item that streamed deltas is finished with the same authoritative
        // text, keyed by the turnId those deltas were tagged with; one that
        // never streamed still gets its one complete event.
        const streaming = this.streamingText.get(item.id);
        this.streamingText.delete(item.id);
        if (streaming) {
          if (item.text) {
            this.onDelta({ turnId: streaming.turnId, key: item.id, text: item.text, done: true });
          }
        } else if (item.text) {
          this.emit({ role: 'assistant', kind: 'text', text: item.text });
        }
        return;
      }
      case 'reasoning': {
        const streamed = this.reasoningSummaries.get(item.id) || [];
        this.reasoningSummaries.delete(item.id);
        const text = reasoningText(item) || streamed.filter(Boolean).join('\n\n');
        if (text) {
          this.emit({ role: 'assistant', kind: 'thinking', text });
        }
        return;
      }
      case 'commandExecution':
        this.emit({
          role: 'user',
          kind: 'tool_result',
          result: {
            toolUseId: item.id,
            output: item.aggregatedOutput || '',
            isError: item.status === 'failed' || (item.exitCode !== null && item.exitCode !== 0)
          }
        });
        return;
      case 'fileChange':
        this.emit({
          role: 'user',
          kind: 'tool_result',
          result: { toolUseId: item.id, output: item.status || '', isError: item.status === 'failed' }
        });
        return;
      case 'mcpToolCall':
        this.emit({
          role: 'user',
          kind: 'tool_result',
          result: {
            toolUseId: item.id,
            output: item.error ? JSON.stringify(item.error) : JSON.stringify(item.result ?? ''),
            isError: item.status === 'failed'
          }
        });
        return;
      case 'contextCompaction':
        this.emit({ role: 'system', kind: 'notice', text: 'The conversation was compacted to free up context.' });
        return;
      case 'exitedReviewMode':
        if (item.review) {
          this.emit({ role: 'assistant', kind: 'text', text: item.review });
        }
        return;
      default:
        // userMessage is our own prompt coming back; the rest carry no bubble.
    }
  }

  handleServerRequest(message) {
    const { id, method, params = {} } = message;
    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
      this.openApproval(id, method, params);
      return;
    }
    if (method === 'item/tool/requestUserInput') {
      this.openUserInput(id, params);
      return;
    }
    if (method === 'item/permissions/requestApproval') {
      this.openPermissions(id, params);
      return;
    }
    // An unanswered request would stall the turn forever, so anything not
    // understood is declined rather than ignored.
    this.write({ jsonrpc: '2.0', id, error: { code: -32601, message: `paneboard does not handle ${method}` } });
  }

  openApproval(id, method, params) {
    const isCommand = method === 'item/commandExecution/requestApproval';
    // The CLI states which decisions apply to this request; only fall back to
    // the protocol's full set when it does not.
    const decisions = Array.isArray(params.availableDecisions) && params.availableDecisions.length
      ? params.availableDecisions
      : ['accept', 'acceptForSession', 'decline', 'cancel'];
    this.pending.set(String(id), { kind: 'approval', id });
    this.emit({
      role: 'assistant',
      kind: 'question',
      question: {
        requestId: String(id),
        prompt: isCommand ? 'Run this command?' : 'Apply these file changes?',
        detail: isCommand ? String(params.command || '') : String(params.reason || ''),
        detailLanguage: isCommand ? 'bash' : 'diff',
        allowFreeText: false,
        options: decisions.map((decision) => ({
          id: typeof decision === 'string' ? decision : JSON.stringify(decision),
          label: decisionLabel(decision)
        }))
      }
    });
    this.onStatus({ status: 'waiting' });
  }

  openUserInput(id, params) {
    const questions = params.questions || [];
    this.pending.set(String(id), { kind: 'userInput', id, questions, answers: {} });
    questions.forEach((question, index) => {
      this.emit({
        role: 'assistant',
        kind: 'question',
        question: {
          requestId: String(id),
          groupId: String(index),
          prompt: question.question,
          detail: question.header || '',
          // isOther is the CLI saying this one takes an answer in the user's
          // own words; a question with no options can only be answered that way.
          allowFreeText: Boolean(question.isOther) || !(question.options || []).length,
          options: (question.options || []).map((option) => ({
            id: option.label,
            label: option.label,
            hint: option.description || ''
          }))
        }
      });
    });
    this.onStatus({ status: 'waiting' });
  }

  openPermissions(id, params) {
    this.pending.set(String(id), { kind: 'permissions', id, permissions: params.permissions });
    this.emit({
      role: 'assistant',
      kind: 'question',
      question: {
        requestId: String(id),
        prompt: 'Grant the agent these permissions?',
        detail: JSON.stringify(params.permissions ?? {}, null, 2),
        detailLanguage: 'json',
        allowFreeText: false,
        options: [{ id: 'grant', label: 'Grant' }, { id: 'refuse', label: 'Refuse' }]
      }
    });
    this.onStatus({ status: 'waiting' });
  }

  answer(requestId, groupId, optionIds, text) {
    const entry = this.pending.get(String(requestId));
    if (!entry) {
      return false;
    }
    if (entry.kind === 'approval') {
      this.pending.delete(String(requestId));
      const choice = optionIds[0];
      let decision = choice;
      if (choice && choice.startsWith('{')) {
        try {
          decision = JSON.parse(choice);
        } catch (error) {
          decision = 'decline';
        }
      }
      this.write({ jsonrpc: '2.0', id: entry.id, result: { decision } });
      this.onStatus({ status: 'busy' });
      return true;
    }
    if (entry.kind === 'permissions') {
      this.pending.delete(String(requestId));
      this.write({
        jsonrpc: '2.0',
        id: entry.id,
        result: { permissions: optionIds[0] === 'grant' ? entry.permissions ?? {} : {}, scope: 'turn' }
      });
      this.onStatus({ status: 'busy' });
      return true;
    }
    const index = Number(groupId) || 0;
    const question = entry.questions[index];
    if (!question) {
      return false;
    }
    entry.answers[question.id] = { answers: text ? [...optionIds, text] : optionIds };
    if (Object.keys(entry.answers).length < entry.questions.length) {
      return true;
    }
    this.pending.delete(String(requestId));
    this.write({ jsonrpc: '2.0', id: entry.id, result: { answers: entry.answers } });
    this.onStatus({ status: 'busy' });
    return true;
  }

  sendPrompt(text, images = []) {
    if (!this.activeTurnId) {
      this.turnId = crypto.randomUUID();
    }
    if (!this.threadId) {
      // Held rather than echoed immediately: a resume attempt still in flight
      // might fail, and its notice needs to land before this prompt, not after.
      this.queue.push({ text, images });
      return;
    }
    this.emit({
      role: 'user',
      kind: 'text',
      text,
      ...(images.length ? { images: images.map(({ id, mimeType }) => ({ id, mimeType })) } : {})
    });
    this.dispatchPrompt(text, images);
  }

  dispatchPrompt(text, images = []) {
    const command = text.trim();
    if (command === '/compact') {
      this.request('thread/compact/start', { threadId: this.threadId });
      this.onStatus({ status: 'busy' });
      return;
    }
    if (command === '/review') {
      this.request('review/start', {
        threadId: this.threadId,
        delivery: 'inline',
        target: { type: 'uncommittedChanges' }
      });
      this.onStatus({ status: 'busy' });
      return;
    }
    if (command === '/fork') {
      this.request('thread/fork', { threadId: this.threadId });
      this.onStatus({ status: 'busy' });
      return;
    }
    if (command === '/model' || command.startsWith('/model ')) {
      const model = command.slice('/model'.length).trim();
      const available = this.models.map((item) => item.id);
      if (!model) {
        this.emit({
          role: 'system',
          kind: 'notice',
          text: `Current model: ${this.currentModel || 'CLI default'}.${available.length ? ` Available models: ${available.join(', ')}.` : ''}`
        });
        return;
      }
      if (!/^[\w.:-]+$/.test(model) || (available.length && !available.includes(model))) {
        this.emit({ role: 'system', kind: 'notice', text: `Unknown model: ${model}` });
        return;
      }
      this.modelOverride = model;
      this.modelChosen = true;
      this.currentModel = model;
      const selected = this.models.find((item) => item.id === model);
      if (selected?.defaultReasoningEffort) {
        this.effortOverride = selected.defaultReasoningEffort;
        this.effortChosen = true;
        this.currentEffort = selected.defaultReasoningEffort;
      }
      if (this.collaborationModeOverride) {
        this.collaborationModeOverride.settings.model = model;
        this.collaborationModeOverride.settings.reasoning_effort = this.currentEffort || null;
      }
      this.emit({ role: 'system', kind: 'notice', text: `Model changed to ${model}.` });
      this.onStatus({ model, effort: this.currentEffort });
      return;
    }
    if (command === '/reasoning' || command.startsWith('/reasoning ')) {
      const effort = command.slice('/reasoning'.length).trim().toLowerCase();
      const selected = this.models.find((item) => item.id === this.currentModel)
        || this.models.find((item) => item.isDefault);
      const available = selected?.reasoningEfforts.map((item) => item.id) || [...CODEX_REASONING_EFFORTS];
      if (!effort) {
        this.emit({
          role: 'system',
          kind: 'notice',
          text: `Current reasoning effort: ${this.currentEffort || 'CLI default'}.${available.length ? ` Available levels: ${available.join(', ')}.` : ''}`
        });
        return;
      }
      if (!available.includes(effort)) {
        const choices = available.length > 1
          ? `${available.slice(0, -1).join(', ')}, or ${available.at(-1)}`
          : available[0] || '';
        this.emit({
          role: 'system',
          kind: 'notice',
          text: `Usage: /reasoning <${choices}>`
        });
        return;
      }
      this.effortOverride = effort;
      this.effortChosen = true;
      this.currentEffort = effort;
      if (this.collaborationModeOverride) {
        this.collaborationModeOverride.settings.reasoning_effort = effort;
      }
      this.emit({ role: 'system', kind: 'notice', text: `Reasoning effort changed to ${effort}.` });
      this.onStatus({ model: this.currentModel, effort });
      return;
    }
    if (command === '/skills') {
      this.emit({
        role: 'system',
        kind: 'notice',
        text: this.skills.length
          ? `Available skills: ${this.skills.map((skill) => `$${skill.name}`).join(', ')}`
          : 'No enabled skills were found for this working folder.'
      });
      return;
    }
    if (command === '/mode' || command.startsWith('/mode ')) {
      const mode = command.slice('/mode'.length).trim().toLowerCase();
      const selected = this.collaborationModes.find((item) => item.id === mode);
      if (!selected) {
        const available = this.collaborationModes.map((item) => item.id);
        this.emit({
          role: 'system', kind: 'notice',
          text: available.length ? `Usage: /mode <${available.join(' or ')}>` : 'No collaboration modes were reported.'
        });
        return;
      }
      const model = selected.model || this.currentModel || this.config.ai?.codex_model;
      if (!model) {
        this.emit({ role: 'system', kind: 'notice', text: 'The current model is not known yet; try /mode again.' });
        return;
      }
      this.collaborationModeOverride = {
        mode: selected.id,
        settings: {
          model,
          reasoning_effort: selected.reasoningEffort || this.effortOverride || null,
          developer_instructions: null
        }
      };
      this.currentModel = model;
      this.currentEffort = this.collaborationModeOverride.settings.reasoning_effort || '';
      this.emit({ role: 'system', kind: 'notice', text: `Collaboration mode changed to ${selected.label}.` });
      this.onStatus({ model: this.currentModel, effort: this.currentEffort });
      return;
    }
    if (command === '/personality' || command.startsWith('/personality ')) {
      const personality = command.slice('/personality'.length).trim().toLowerCase();
      if (!CODEX_PERSONALITIES.has(personality)) {
        this.emit({ role: 'system', kind: 'notice', text: 'Usage: /personality <none, friendly, or pragmatic>' });
        return;
      }
      this.personalityOverride = personality;
      this.emit({ role: 'system', kind: 'notice', text: `Personality changed to ${personality}.` });
      return;
    }
    if (command === '/permissions' || command.startsWith('/permissions ')) {
      const profile = command.slice('/permissions'.length).trim();
      const available = this.permissionProfiles.map((item) => item.id);
      if (!profile) {
        this.emit({
          role: 'system', kind: 'notice',
          text: available.length ? `Available permission profiles: ${available.join(', ')}` : 'No selectable permission profiles were reported.'
        });
        return;
      }
      if (!available.includes(profile)) {
        this.emit({ role: 'system', kind: 'notice', text: `Unknown permission profile: ${profile}` });
        return;
      }
      this.permissionsOverride = profile;
      this.emit({ role: 'system', kind: 'notice', text: `Permission profile changed to ${profile}.` });
      return;
    }
    this.startTurn(text, images);
  }

  inputFor(text, images = []) {
    const input = images.map((image) => ({ type: 'image', url: `data:${image.mimeType};base64,${image.data}` }));
    if (text) {
      input.push({ type: 'text', text });
    }
    const names = new Set([...text.matchAll(/(?:^|\s)\$([\w:-]+)/g)].map((match) => match[1]));
    for (const skill of this.skills) {
      if (names.has(skill.name)) {
        input.push({ type: 'skill', name: skill.name, path: skill.path });
      }
    }
    return input;
  }

  startTurn(text, images = []) {
    const input = this.inputFor(text, images);
    if (this.activeTurnId) {
      this.request('turn/steer', {
        threadId: this.threadId,
        expectedTurnId: this.activeTurnId,
        input
      });
      return;
    }
    const settings = this.config.ai || {};
    const params = {
      ...this.threadParams(),
      threadId: this.threadId,
      input
    };
    const model = this.modelOverride || settings.codex_model;
    const effort = this.effortOverride || settings.codex_effort;
    if (this.collaborationModeOverride) {
      params.collaborationMode = this.collaborationModeOverride;
    } else {
      if (model) {
        params.model = model;
      }
      if (effort) {
        params.effort = effort;
      }
    }
    if (this.personalityOverride) {
      params.personality = this.personalityOverride;
    }
    if (this.permissionsOverride) {
      params.permissions = this.permissionsOverride;
    }
    this.request('turn/start', params);
    this.onStatus({ status: 'busy' });
  }

  interrupt() {
    if (this.threadId) {
      this.request('turn/interrupt', { threadId: this.threadId });
    }
  }

  takePending() {
    const ids = [...this.pending.keys()];
    this.pending.clear();
    return ids;
  }
}

function formatCodexChanges(changes) {
  if (!Array.isArray(changes)) {
    return '';
  }
  return changes
    .map((change) => {
      const target = change?.path || change?.file || '';
      const body = change?.diff || change?.unifiedDiff || JSON.stringify(change ?? '');
      return target ? `${target}\n${body}` : String(body);
    })
    .join('\n\n');
}

function cliProcess(commandLine) {
  if (process.platform === 'win32') {
    return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', commandLine] };
  }
  const parts = commandLine.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  return { command: parts[0], args: parts.slice(1).map((part) => part.replace(/^"|"$/g, '')) };
}

// claude and codex are npm shims launched through the command interpreter, so
// the process handle we hold is cmd.exe and the CLI is its child. Calling
// child.kill() would leave that child alive, holding an API session and a lock
// on files the packaged build needs to replace, so the whole tree goes.
function terminateTree(child, spawnImpl, onError = () => {}) {
  if (!child || child.exitCode !== null || child.signalCode) {
    return;
  }
  if (process.platform === 'win32' && child.pid) {
    try {
      const killer = spawnImpl('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', onError);
      killer.once('exit', (code) => {
        if (code !== 0 && child.exitCode === null && !child.signalCode) {
          onError(new Error('Failed to terminate CLI process tree.'));
        }
      });
      return;
    } catch (error) {
      onError(error);
      return;
    }
  }
  try {
    child.kill();
  } catch (error) {
    // Already gone.
  }
}

class AiManager {
  constructor({ config, root, store, spawnImpl = spawn, env = process.env, refreshUpdateCheckImpl = refreshUpdateCheck, readLocalVersionImpl = readLocalCliVersion }) {
    this.config = config;
    this.root = root;
    this.store = store;
    this.spawnImpl = spawnImpl;
    this.env = env;
    this.refreshUpdateCheckImpl = refreshUpdateCheckImpl;
    this.readLocalVersionImpl = readLocalVersionImpl;
    this.updateCheckInFlight = false;
    // One CLI process per tab, exactly as a terminal pane runs one shell per
    // tab. Keyed by tab id because that is what the socket carries.
    this.runtimes = new Map();
    // claude takes several seconds to answer with its command list, and the
    // answer is the same for every tab, so the first one pays for all of them.
    this.commandCache = new Map();
  }

  updateConfig(config) {
    this.config = config;
    for (const runtime of this.runtimes.values()) {
      runtime.adapter.config = config;
    }
  }

  getOrCreate(tabId) {
    const existing = this.runtimes.get(tabId);
    if (existing) {
      return existing;
    }
    const target = this.store.findAiTabById(tabId);
    if (!target) {
      throw new Error(`Unknown AI tab: ${tabId}`);
    }
    const runtime = this.createRuntime(tabId, target);
    this.runtimes.set(tabId, runtime);
    return runtime;
  }

  // The runtime's own pane id is only cached at creation, so a tab dragged to
  // another pane leaves it stale; message/session store lookups would then
  // read and write under the pane it left, not the one it landed in.
  moveTab(tabId, paneId) {
    const runtime = this.runtimes.get(tabId);
    if (runtime) runtime.paneId = paneId;
  }

  createRuntime(tabId, target) {
    const cwd = normalizeCwd(target.tab.cwd || target.pane.cwd, this.root);
    const env = shellEnv(this.config, process.env);
    const runtime = {
      tabId,
      paneId: target.pane.id,
      provider: target.tab.provider,
      status: 'starting',
      model: target.tab.provider === 'claude'
        ? resolveClaudeModel(this.config, cwd, env)
        : this.config.ai?.codex_model || '',
      effort: target.tab.provider === 'claude'
        ? resolveClaudeEffort(this.config, cwd, env)
        : this.config.ai?.codex_effort || '',
      commands: this.commandCache.get(target.tab.provider) || [],
      // Distinguishes "this CLI has none" from "it has not answered yet".
      commandsReady: this.commandCache.has(target.tab.provider),
      capabilities: {},
      // Set once the CLI announces a session; a process that dies before that
      // never got as far as talking to us.
      ready: false,
      clients: new Set(),
      child: null,
      lines: null,
      adapter: null,
      stderr: '',
      // Events land in memory and are flushed at turn boundaries: save() is a
      // synchronous whole-file write that every pane shares.
      dirty: false
    };
    const Adapter = target.tab.provider === 'codex' ? CodexAdapter : ClaudeAdapter;
    runtime.adapter = new Adapter({
      config: this.config,
      cwd,
      env,
      write: (message) => this.writeToCli(runtime, message),
      onEvent: (event) => this.recordEvent(runtime, event),
      onDelta: (delta) => this.recordDelta(runtime, delta),
      onSession: (sessionId) => {
        if (sessionId) {
          runtime.ready = true;
          this.store.setAiSession(runtime.paneId, tabId, sessionId);
        }
      },
      onStatus: (status) => this.setStatus(runtime, status)
    });

    const commandLine = runtime.adapter.commandLine({ sessionId: target.tab.sessionId });
    const cli = cliProcess(commandLine);
    let child;
    try {
      child = this.spawnImpl(cli.command, cli.args, {
        cwd,
        // shell.extra_path exists so panes can find npm's global folder, which
        // is where claude and codex live.
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (error) {
      runtime.status = 'stopped';
      this.recordEvent(runtime, {
        role: 'system',
        kind: 'error',
        text: `The ${runtime.provider} CLI could not be started: ${error.message}`
      });
      return runtime;
    }
    runtime.child = child;
    this.debugLog(runtime, `## ${commandLine}`);

    runtime.lines = readline.createInterface({ input: child.stdout });
    runtime.lines.on('line', (line) => {
      this.debugLog(runtime, `<< ${line}`);
      runtime.adapter.handleLine(line);
    });
    child.stderr.on('data', (chunk) => {
      // Only the tail matters: it is what the exit message quotes.
      runtime.stderr = `${runtime.stderr}${chunk}`.slice(-2000);
    });
    child.on('error', (error) => this.handleExit(runtime, null, error.message));
    child.on('exit', (code) => this.handleExit(runtime, code, ''));

    runtime.adapter.start({ sessionId: target.tab.sessionId });
    this.maybeRefreshUpdateCheck();
    this.announceUpdateIfAvailable(runtime);
    return runtime;
  }

  // Checked at most once a day; a cache miss or a still-fresh one is a no-op,
  // so opening tabs all day does not mean opening a network request all day.
  maybeRefreshUpdateCheck() {
    if (this.updateCheckInFlight) {
      return;
    }
    const cache = readUpdateCache(this.root);
    if (cache && Date.now() - (cache.checkedAt || 0) < UPDATE_CHECK_INTERVAL_MS) {
      return;
    }
    this.updateCheckInFlight = true;
    Promise.resolve(this.refreshUpdateCheckImpl(this.root, this.env))
      .catch(() => {})
      .finally(() => { this.updateCheckInFlight = false; });
  }

  // Reads whatever the last completed check found; a check still in flight
  // simply has nothing to say yet and is picked up next time a tab spawns.
  // That check can be a day old and the CLI updated since, so the installed
  // version is read again before the pane is told to update.
  announceUpdateIfAvailable(runtime) {
    const cache = readUpdateCache(this.root);
    if (!cache || !isNewerVersion(cache.latestVersion, cache.localVersion)) {
      return;
    }
    Promise.resolve(this.readLocalVersionImpl(UPDATE_VERSION_COMMAND, this.env)).then((localVersion) => {
      if (localVersion && localVersion !== cache.localVersion) {
        writeUpdateCache(this.root, { ...cache, localVersion });
      }
      if (!isNewerVersion(cache.latestVersion, localVersion)) {
        return;
      }
      this.recordEvent(runtime, {
        role: 'system',
        kind: 'notice',
        text: `${UPDATE_CLI_LABEL} has an update available: ${localVersion} → ${cache.latestVersion}. Run npm install -g ${UPDATE_NPM_PACKAGE}@latest to update.`
      });
    }).catch(() => {});
  }

  // Written to disk rather than kept in the transcript: the CLI still gets the
  // full bytes for this turn, but state.json -- which every pane shares and
  // writes atomically as one file -- only ever holds a filename afterwards.
  saveAttachments(tabId, images) {
    if (!images.length) {
      return images;
    }
    const dir = attachmentsDir(this.root, tabId);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      return images.map((image) => ({ ...image, id: '' }));
    }
    return images.map((image) => {
      const ext = IMAGE_FILE_EXTENSIONS[image.mimeType];
      if (!ext) {
        return { ...image, id: '' };
      }
      const id = `${crypto.randomUUID()}.${ext}`;
      try {
        fs.writeFileSync(path.join(dir, id), Buffer.from(image.data, 'base64'));
      } catch (error) {
        return { ...image, id: '' };
      }
      return { ...image, id };
    });
  }

  writeToCli(runtime, message) {
    const line = JSON.stringify(message);
    this.debugLog(runtime, `>> ${line}`);
    if (runtime.child?.stdin.writable) {
      runtime.child.stdin.write(`${line}\n`);
    }
  }

  debugLog(runtime, line) {
    if (!this.config.ai?.debug_log) {
      return;
    }
    try {
      const dir = path.join(this.root, 'data');
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'ai-debug.log'), `${new Date().toISOString()} ${runtime.tabId} ${line}\n`);
    } catch (error) {
      // Diagnostics must never take the pane down with them.
    }
  }

  recordEvent(runtime, event) {
    const [stored] = this.store.appendAiMessages(runtime.paneId, runtime.tabId, [event]);
    if (!stored) {
      return;
    }
    runtime.dirty = true;
    this.broadcast(runtime, { type: 'event', event: stored });
    if (stored.kind === 'result' || stored.kind === 'error') {
      this.flush(runtime);
    }
  }

  // A reply's text arrives one token at a time; the first token creates the
  // bubble's message and every one after that patches it in place, so the
  // transcript ends up with one message per reply, same as before streaming,
  // just filled in gradually instead of all at once. `flush()` still only
  // writes state.json at a turn boundary, not on every token.
  recordDelta(runtime, delta) {
    const key = `${delta.turnId}:${delta.key}`;
    runtime.streaming = runtime.streaming || new Map();
    const eventId = runtime.streaming.get(key);
    if (!eventId) {
      const [stored] = this.store.appendAiMessages(runtime.paneId, runtime.tabId,
        [{ role: 'assistant', kind: 'text', text: delta.text, turnId: delta.turnId }]);
      if (!stored) {
        return;
      }
      if (!delta.done) {
        runtime.streaming.set(key, stored.id);
      }
      runtime.dirty = true;
      this.broadcast(runtime, { type: 'event', event: stored, streaming: !delta.done });
      return;
    }
    this.store.patchAiMessage(runtime.paneId, runtime.tabId, eventId, { text: delta.text });
    runtime.dirty = true;
    this.broadcast(runtime, { type: 'patch', id: eventId, text: delta.text, done: Boolean(delta.done) });
    if (delta.done) {
      runtime.streaming.delete(key);
    }
  }

  setStatus(runtime, status) {
    let modelChanged = false;
    if (Object.prototype.hasOwnProperty.call(status, 'model')) {
      modelChanged = status.model !== runtime.model;
      runtime.model = status.model;
    }
    if (Object.prototype.hasOwnProperty.call(status, 'effort')) {
      runtime.effort = status.effort;
    }
    if (Array.isArray(status.commands)) {
      runtime.commands = status.commands;
      runtime.commandsReady = true;
      this.commandCache.set(runtime.provider, status.commands);
      this.broadcast(runtime, { type: 'commands', commands: runtime.commands, ready: true });
    }
    if (status.capabilities) {
      runtime.capabilities = { ...status.capabilities, currentModel: runtime.model };
      this.broadcast(runtime, { type: 'capabilities', capabilities: runtime.capabilities });
    } else if (modelChanged && runtime.capabilities) {
      runtime.capabilities = { ...runtime.capabilities, currentModel: runtime.model };
      this.broadcast(runtime, { type: 'capabilities', capabilities: runtime.capabilities });
    }
    if (status.status) {
      runtime.status = status.status;
    }
    this.broadcast(runtime, { type: 'status', status: runtime.status, model: runtime.model, effort: runtime.effort });
  }

  broadcast(runtime, message) {
    const payload = JSON.stringify(message);
    for (const client of runtime.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  flush(runtime) {
    if (!runtime.dirty) {
      return;
    }
    runtime.dirty = false;
    this.store.save();
  }

  attach(tabId, ws) {
    let runtime;
    try {
      runtime = this.getOrCreate(tabId);
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
      ws.close(1011, 'Unknown AI tab');
      return;
    }
    runtime.clients.add(ws);

    const found = this.store.findAiTab(runtime.paneId, tabId);
    ws.send(JSON.stringify({
      type: 'hello',
      provider: runtime.provider,
      model: runtime.model,
      effort: runtime.effort,
      sessionId: found?.tab.sessionId || '',
      cwd: found?.tab.cwd || '',
      commands: runtime.commands,
      capabilities: runtime.capabilities,
      commandsReady: runtime.commandsReady,
      status: runtime.status,
      showThinking: found?.tab.showThinking !== false,
      showTools: found?.tab.showTools !== false,
      events: found?.tab.messages || [],
      // Anything still listed here has live buttons; a question that is absent
      // and unanswered was abandoned when its CLI died.
      pending: [...runtime.adapter.pending.keys()].map(String)
    }));

    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch (error) {
        return;
      }
      // The socket survives a CLI restart, so route through the replacement
      // runtime once it exists instead of the one attach() first created.
      this.handleClientMessage(this.runtimes.get(tabId) || runtime, message);
    });

    ws.on('close', () => {
      runtime.clients.delete(ws);
      // A closed tab is not an answer: pending requests stay pending so a
      // reload finds its buttons still live.
      if (!runtime.clients.size) {
        this.flush(runtime);
      }
    });
  }

  handleClientMessage(runtime, message) {
    if (message.type === 'prompt' && typeof message.text === 'string') {
      const text = message.text.trim();
      const images = this.saveAttachments(runtime.tabId, sanitizeImages(message.images));
      if (!text && !images.length) {
        return;
      }
      if (runtime.provider === 'codex' && text === '/new') {
        this.clearTab(runtime.paneId, runtime.tabId);
        return;
      }
      if (runtime.status === 'stopped') {
        // The replacement has to be up before the prompt can go anywhere.
        this.restart(runtime)
          .then((next) => next.adapter.sendPrompt(text, images))
          .catch(() => this.reportLost(runtime));
        return;
      }
      runtime.adapter.sendPrompt(text, images);
      return;
    }
    if (message.type === 'answer') {
      this.answer(
        runtime,
        message.requestId,
        message.groupId,
        Array.isArray(message.optionIds) ? message.optionIds : [],
        typeof message.text === 'string' ? message.text.trim().slice(0, 2000) : ''
      );
      return;
    }
    if (message.type === 'interrupt') {
      runtime.adapter.interrupt();
      return;
    }
    if (message.type === 'restart') {
      this.restart(runtime).catch(() => this.reportLost(runtime));
    }
  }

  answer(runtime, requestId, groupId, optionIds, text) {
    // The adapter owns the pending map, so it decides whether this is a live
    // request: a second click, or a click after the CLI died, answers nothing.
    if (!runtime.adapter.answer(String(requestId), groupId, optionIds, text)) {
      return;
    }
    const found = this.store.findAiTab(runtime.paneId, runtime.tabId);
    const event = (found?.tab.messages || []).find((candidate) => candidate.kind === 'question'
      && candidate.question.requestId === String(requestId)
      && (candidate.question.groupId || '') === String(groupId || '')
      && !candidate.answer);
    if (!event) {
      return;
    }
    const labels = optionIds.map((id) => event.question.options.find((option) => option.id === id)?.label || id);
    const answer = {
      optionIds,
      labels: text ? [...labels, text] : labels
    };
    this.store.patchAiMessage(runtime.paneId, runtime.tabId, event.id, { answer });
    this.broadcast(runtime, { type: 'patch', id: event.id, answer });
    runtime.dirty = true;
    this.flush(runtime);
  }

  handleExit(runtime, code, detail) {
    if (runtime.status === 'stopped') {
      return;
    }
    runtime.status = 'stopped';
    this.cancelPending(runtime);
    const stored = this.store.findAiTab(runtime.paneId, runtime.tabId);
    // A CLI that dies before it ever announced a session, while a resume id was
    // in play, has almost always been handed a session that no longer exists.
    // Dropping the id and starting over keeps the tab usable; the notice is
    // there because the messages on screen are no longer context the agent has.
    const resumeFailed = !runtime.ready && Boolean(stored?.tab.sessionId);
    if (resumeFailed) {
      this.store.setAiSession(runtime.paneId, runtime.tabId, '');
      this.recordEvent(runtime, {
        role: 'system',
        kind: 'notice',
        text: '--- New Session ---'
      });
    } else {
      const stderr = stripAnsi(runtime.stderr).trim();
      const reason = detail || (stderr ? stderr.slice(-240) : '');
      this.recordEvent(runtime, {
        role: 'system',
        kind: 'error',
        text: `The ${runtime.provider} CLI stopped${code === null ? '' : ` (exit ${code})`}.${reason ? ` ${reason}` : ''}`
      });
    }
    this.broadcast(runtime, { type: 'status', status: 'stopped' });
    const clients = [...runtime.clients];
    this.runtimes.delete(runtime.tabId);
    this.flush(runtime);
    if (resumeFailed && clients.length) {
      const next = this.getOrCreate(runtime.tabId);
      for (const client of clients) {
        next.clients.add(client);
      }
    }
  }

  // Nothing can answer these now, so their bubbles stop offering to.
  cancelPending(runtime) {
    const abandoned = new Set(runtime.adapter.takePending().map(String));
    if (!abandoned.size) {
      return;
    }
    const found = this.store.findAiTab(runtime.paneId, runtime.tabId);
    for (const event of found?.tab.messages || []) {
      if (event.kind !== 'question' || event.answer || !abandoned.has(event.question.requestId)) {
        continue;
      }
      const answer = { cancelled: true };
      this.store.patchAiMessage(runtime.paneId, runtime.tabId, event.id, { answer });
      this.broadcast(runtime, { type: 'patch', id: event.id, answer });
    }
    runtime.dirty = true;
  }

  // Resolves once the process is actually gone. Callers that immediately start
  // a replacement have to wait: two CLIs sharing one session would each fail to
  // load it, and the pane would fill with spurious restart notices.
  stopRuntime(runtime) {
    if (!runtime) {
      return Promise.resolve();
    }
    this.cancelPending(runtime);
    runtime.status = 'stopped';
    runtime.lines?.close();
    const child = runtime.child;
    const forget = () => {
      if (this.runtimes.get(runtime.tabId) === runtime) this.runtimes.delete(runtime.tabId);
    };
    this.flush(runtime);
    if (!child || child.exitCode !== null || child.signalCode) {
      forget();
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const done = () => {
        forget();
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const failed = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to terminate CLI process ${child.pid}: ${error.message}`));
      };
      child.once('exit', done);
      timer = setTimeout(() => failed(new Error('Timed out waiting for exit.')), 4000);
      timer.unref?.();
      terminateTree(child, this.spawnImpl, failed);
      if (child.exitCode !== null || child.signalCode) done();
    });
  }

  async restart(runtime) {
    const clients = [...runtime.clients];
    await this.stopRuntime(runtime);
    const next = this.getOrCreate(runtime.tabId);
    for (const client of clients) {
      next.clients.add(client);
    }
    this.broadcast(next, { type: 'status', status: next.status });
    return next;
  }

  // The tab went away while its CLI was being replaced. Nothing is left to
  // attach to, so the clients are simply told the pane is no longer running.
  reportLost(runtime) {
    this.broadcast(runtime, { type: 'status', status: 'stopped' });
  }

  killTab(tabId) {
    const runtime = this.runtimes.get(tabId);
    this.stopRuntime(runtime)
      .catch(() => this.stopRuntime(runtime))
      .catch((error) => console.error(error.message));
  }

  // Points a tab at a conversation the CLI already holds. The CLI itself is
  // what gets resumed; what is shown here is read back from the session file
  // it already wrote, so the tab is not left with just a note that something
  // continues off-screen.
  resumeSession(paneId, tabId, sessionId, label) {
    const found = this.store.findAiTab(paneId, tabId);
    if (!found) {
      return false;
    }
    const cwd = normalizeCwd(found.tab.cwd || found.pane.cwd, this.root);
    const history = readSessionTranscript(found.tab.provider, sessionId, cwd, this.env);
    this.store.clearAiTab(paneId, tabId);
    this.store.setAiSession(paneId, tabId, sessionId);
    const notice = label
      ? `Now continuing an earlier conversation: ${label}`
      : 'Now continuing an earlier conversation.';
    const runtime = this.runtimes.get(tabId);
    if (!runtime) {
      // Nothing is running yet, so the next attach picks the session up.
      if (history.length) {
        this.store.appendAiMessages(paneId, tabId, history);
      }
      this.store.appendAiMessages(paneId, tabId, [{ role: 'system', kind: 'notice', text: notice }]);
      this.store.save();
      return true;
    }
    const clients = [...runtime.clients];
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: 'cleared' }));
      }
    }
    this.stopRuntime(runtime).then(() => {
      const next = this.getOrCreate(tabId);
      for (const client of clients) {
        next.clients.add(client);
      }
      for (const event of history) {
        this.recordEvent(next, event);
      }
      this.recordEvent(next, { role: 'system', kind: 'notice', text: notice });
      this.flush(next);
    }).catch(() => {});
    return true;
  }

  // Anything that changes how the CLI was launched -- its working folder above
  // all -- only takes effect on a fresh process, because those are decided at
  // spawn time. The transcript and the resume id are kept: this is the same
  // conversation, continued somewhere else.
  restartTab(tabId, notice) {
    const runtime = this.runtimes.get(tabId);
    if (!runtime) {
      return;
    }
    if (notice) {
      this.recordEvent(runtime, { role: 'system', kind: 'notice', text: notice });
    }
    this.restart(runtime).catch(() => this.reportLost(runtime));
  }

  killPane(pane) {
    for (const tab of pane?.aiTabs || []) {
      this.killTab(tab.id);
    }
  }

  killSession(session) {
    for (const tab of session?.tabs || []) {
      for (const pane of tab.panes || []) {
        if (pane.type === 'ai') {
          this.killPane(pane);
        }
      }
    }
  }

  // Clearing drops the transcript and the resume id, then starts the CLI over:
  // keeping the process would leave the agent remembering what the user just
  // asked it to forget.
  clearTab(paneId, tabId) {
    if (!this.store.clearAiTab(paneId, tabId)) {
      return false;
    }
    try {
      fs.rmSync(attachmentsDir(this.root, tabId), { recursive: true, force: true });
    } catch (error) {
      // Nothing left to serve either way.
    }
    const runtime = this.runtimes.get(tabId);
    if (runtime) {
      const clients = [...runtime.clients];
      // The pane empties at once; the replacement CLI waits for the old process
      // to go, for the same reason restart() does.
      for (const client of clients) {
        if (client.readyState === client.OPEN) {
          client.send(JSON.stringify({ type: 'cleared' }));
        }
      }
      this.stopRuntime(runtime).then(() => {
        const next = this.getOrCreate(tabId);
        for (const client of clients) {
          next.clients.add(client);
        }
      }).catch(() => {});
    }
    return true;
  }

  shutdown() {
    for (const runtime of [...this.runtimes.values()]) {
      this.killTab(runtime.tabId);
    }
  }
}

module.exports = {
  AiManager,
  ClaudeAdapter,
  CodexAdapter,
  cliProcess,
  terminateTree,
  formatToolInput,
  suggestionLabel,
  decisionLabel,
  parseCliArgs,
  resolveClaudeModel,
  resolveClaudeEffort,
  claudeSyntheticReplyUpdate,
  readSessionTranscript,
  CODEX_MUTED_NOTIFICATIONS,
  isNewerVersion,
  readUpdateCache,
  writeUpdateCache,
  sanitizeImages,
  attachmentsDir
};
