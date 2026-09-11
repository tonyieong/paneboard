'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Lists the conversations each CLI has already recorded on this machine, so a
// tab can be pointed back at one of them.
//
// Both CLIs write a session to disk as JSONL and both accept its id later --
// claude with --resume, codex with thread/resume -- so the list is read from
// those files rather than from a live process. That keeps it available while a
// tab is idle, or stopped, or has never been started.

const MAX_SESSIONS = 40;
const MAX_TITLE = 90;
// Two passes: a small read is enough to tell which folder a session belongs to,
// and only the survivors are read far enough to reach the first thing the user
// typed. Codex writes the whole system prompt ahead of it.
const HEAD_BYTES = 64 * 1024;
const TITLE_BYTES = 512 * 1024;
const CLAUDE_HOME_ENV = 'CLAUDE_CONFIG_DIR';
const CODEX_HOME_ENV = 'CODEX_HOME';

function homeDir(env) {
  return env.USERPROFILE || env.HOME || os.homedir();
}

// The folder name claude derives from a working directory: every character
// that is not a letter or a digit becomes a dash. The records inside carry the
// cwd as well, so a mismatch here is caught rather than trusted.
function claudeProjectDir(cwd, home) {
  return path.join(home, 'projects', String(cwd).replace(/[^A-Za-z0-9]/g, '-'));
}

function readHead(file, bytes) {
  let handle;
  try {
    handle = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(bytes);
    const read = fs.readSync(handle, buffer, 0, bytes, 0);
    return buffer.subarray(0, read).toString('utf8');
  } catch (error) {
    return '';
  } finally {
    if (handle !== undefined) {
      try {
        fs.closeSync(handle);
      } catch (error) {
        // Nothing useful to do about a failed close here.
      }
    }
  }
}

function parseLines(text) {
  const records = [];
  // A line the read cut in half simply fails to parse and is skipped; dropping
  // the last one outright threw away the only record when a single line, and
  // codex writes a 22 KB session_meta, filled the whole read.
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      // A partial or malformed record says nothing about the session.
    }
  }
  return records;
}

// claude writes {type:'text'}; codex writes {type:'input_text'} in a
// response_item and {type:'text'|'Text'} (case varies by item kind) in a
// rollout's item_completed event.
function blockText(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block === 'string') return block;
      const type = String(block?.type || '').toLowerCase();
      if (block?.text && (type === 'text' || type === 'input_text')) return block.text;
    }
  }
  return '';
}

// The first thing the user typed makes a far better label than a timestamp.
// The reminders and caveats injected around a conversation do not.
function usableTitle(text) {
  const trimmed = String(text || '').replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed.startsWith('<') || trimmed.startsWith('Caveat:')) {
    return '';
  }
  return trimmed.slice(0, MAX_TITLE);
}

function claudeCwd(records) {
  for (const record of records) {
    if (record.cwd) return String(record.cwd);
  }
  return '';
}

function claudeTitle(records) {
  for (const record of records) {
    if (record.type !== 'user' || record.isSidechain) continue;
    const title = usableTitle(blockText(record.message?.content));
    if (title) return title;
  }
  return '';
}

function codexMeta(records) {
  return records.find((record) => record.type === 'session_meta')?.payload || {};
}

function codexTitle(records) {
  for (const record of records) {
    const payload = record.payload || {};
    // Current rollout files (codex 0.153+) wrap the user's turn in
    // item_completed/UserMessage instead of a dedicated user_message event;
    // both are read so a session from an older CLI still gets a title.
    let text = '';
    if (payload.type === 'item_completed' && payload.item?.type === 'UserMessage') {
      text = blockText(payload.item.content);
    } else if (payload.type === 'user_message') {
      text = payload.message;
    } else if (payload.role === 'user') {
      // The event carries the message as the user sent it; the response item is
      // the same text wrapped for the model.
      text = blockText(payload.content);
    }
    const title = usableTitle(text);
    if (title) return title;
  }
  return '';
}

function collectFiles(dir, match, depth = 0) {
  if (depth > 5) return [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full, match, depth + 1));
    } else if (match(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

// Newest first: a long-running install holds thousands of these.
function newest(files, limit) {
  return files
    .map((file) => {
      try {
        return { file, at: fs.statSync(file).mtime };
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}

function samePath(a, b) {
  if (!a || !b) return false;
  const clean = (value) => String(value).replace(/[\\/]+$/, '').toLowerCase();
  return clean(a) === clean(b);
}

function listClaude(cwd, env) {
  const home = env[CLAUDE_HOME_ENV] || path.join(homeDir(env), '.claude');
  const files = collectFiles(claudeProjectDir(cwd, home), (name) => name.endsWith('.jsonl'));
  return newest(files, MAX_SESSIONS)
    .map(({ file, at }) => {
      const head = parseLines(readHead(file, HEAD_BYTES));
      // Flattening every character to a dash could in principle collide, so a
      // session is only offered if it recorded this cwd.
      if (claudeCwd(head) && !samePath(claudeCwd(head), cwd)) {
        return null;
      }
      return {
        id: path.basename(file, '.jsonl'),
        at: at.toISOString(),
        title: claudeTitle(head) || claudeTitle(parseLines(readHead(file, TITLE_BYTES)))
      };
    })
    .filter(Boolean);
}

function listCodex(cwd, env) {
  const home = env[CODEX_HOME_ENV] || path.join(homeDir(env), '.codex');
  const files = collectFiles(path.join(home, 'sessions'),
    (name) => name.startsWith('rollout-') && name.endsWith('.jsonl'));
  // Codex keeps every project in the same dated folders, so the recorded cwd is
  // the only way to tell them apart; scan a wider window before filtering or a
  // busy day elsewhere hides this folder's sessions.
  return newest(files, MAX_SESSIONS * 8)
    .map(({ file, at }) => {
      const meta = codexMeta(parseLines(readHead(file, HEAD_BYTES)));
      if (!samePath(meta.cwd, cwd)) {
        return null;
      }
      return {
        id: String(meta.id || path.basename(file, '.jsonl').slice(-36)),
        at: at.toISOString(),
        title: codexTitle(parseLines(readHead(file, TITLE_BYTES)))
      };
    })
    .filter(Boolean)
    .slice(0, MAX_SESSIONS);
}

function listAiSessions(provider, cwd, env = process.env) {
  if (!cwd || !['claude', 'codex'].includes(provider)) {
    return [];
  }
  const sessions = provider === 'codex' ? listCodex(cwd, env) : listClaude(cwd, env);
  // A tab spawns its CLI as soon as it opens, so empty sessions accumulate;
  // there is nothing to resume in one, and they would crowd out the rest.
  return sessions.filter((session) => session.title);
}

module.exports = { listAiSessions, claudeProjectDir };
