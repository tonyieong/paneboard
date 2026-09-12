const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listAiSessions, claudeProjectDir } = require('../src/ai-sessions');

// The shapes here are the ones the CLIs actually write; see the note in
// src/ai-sessions.js for how they were established.
function writeClaudeSession(home, cwd, id, records) {
  const dir = claudeProjectDir(cwd, home);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.jsonl`), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

function writeCodexSession(home, cwd, id, extra = [], padding = 0) {
  const dir = path.join(home, 'sessions', '2026', '08', '18');
  fs.mkdirSync(dir, { recursive: true });
  const meta = {
    timestamp: '2026-08-18T00:00:00Z',
    type: 'session_meta',
    payload: { id, cwd, originator: 'test', instructions: 'x'.repeat(padding) }
  };
  const lines = [meta, ...extra].map((r) => JSON.stringify(r)).join('\n');
  fs.writeFileSync(path.join(dir, `rollout-2026-08-18T00-00-00-${id}.jsonl`), lines + '\n');
}

function tempHome(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `paneboard-${label}-`));
}

test('claude sessions are listed for the folder they ran in', () => {
  const home = tempHome('claude');
  const cwd = 'C:\\work\\project';
  writeClaudeSession(home, cwd, 'aaa', [
    { type: 'queue-operation', sessionId: 'aaa' },
    { type: 'user', cwd, message: { content: [{ type: 'text', text: 'fix the retry helper' }] } },
    { type: 'assistant', cwd, message: { content: [{ type: 'text', text: 'done' }] } }
  ]);

  const sessions = listAiSessions('claude', cwd, { USERPROFILE: 'unused', CLAUDE_CONFIG_DIR: home });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'aaa');
  assert.equal(sessions[0].title, 'fix the retry helper');
});

// Every character of the path becomes a dash, so two folders can land in the
// same directory; the cwd inside each record is what settles it.
test('a claude session recorded in another folder is not offered', () => {
  const home = tempHome('claude');
  const cwd = 'C:\\work\\project';
  writeClaudeSession(home, cwd, 'mine', [
    { type: 'user', cwd, message: { content: [{ type: 'text', text: 'mine' }] } }
  ]);
  writeClaudeSession(home, cwd, 'theirs', [
    { type: 'user', cwd: 'D:\\somewhere\\else', message: { content: [{ type: 'text', text: 'theirs' }] } }
  ]);

  const sessions = listAiSessions('claude', cwd, { CLAUDE_CONFIG_DIR: home });
  assert.deepEqual(sessions.map((s) => s.id), ['mine']);
});

// A tab starts its CLI as soon as it opens, so sessions with nothing in them
// pile up and would crowd out the ones worth returning to.
test('a session with no messages is left out', () => {
  const home = tempHome('claude');
  const cwd = 'C:\\work\\project';
  writeClaudeSession(home, cwd, 'empty', [{ type: 'queue-operation', sessionId: 'empty' }]);
  writeClaudeSession(home, cwd, 'used', [
    { type: 'user', cwd, message: { content: [{ type: 'text', text: 'hello' }] } }
  ]);

  assert.deepEqual(listAiSessions('claude', cwd, { CLAUDE_CONFIG_DIR: home }).map((s) => s.id), ['used']);
});

test('codex sessions are matched by the folder recorded in their metadata', () => {
  const home = tempHome('codex');
  const cwd = 'C:\\work\\project';
  writeCodexSession(home, cwd, '019d0000-0000-7000-8000-000000000001', [
    { type: 'event_msg', payload: { type: 'user_message', message: 'run the tests' } }
  ]);
  writeCodexSession(home, 'C:\\elsewhere', '019d0000-0000-7000-8000-000000000002', [
    { type: 'event_msg', payload: { type: 'user_message', message: 'not this one' } }
  ]);

  const sessions = listAiSessions('codex', cwd, { CODEX_HOME: home });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].title, 'run the tests');
  assert.equal(sessions[0].id, '019d0000-0000-7000-8000-000000000001');
});

// Regression: codex writes its whole system prompt before the first user
// message, on a single ~22 KB metadata line. Reading too little, or discarding
// the last line of a short read, left every codex session untitled and dropped.
test('a codex session is still titled when its metadata line is huge', () => {
  const home = tempHome('codex');
  const cwd = 'C:\\work\\project';
  writeCodexSession(home, cwd, '019d0000-0000-7000-8000-000000000003', [
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'the real question' }] } }
  ], 40 * 1024);

  const sessions = listAiSessions('codex', cwd, { CODEX_HOME: home });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].title, 'the real question');
});

// Regression: codex 0.153+ stopped writing a dedicated user_message event and
// wraps the same turn in item_completed/UserMessage instead, which left every
// session recorded by a current CLI untitled -- and therefore filtered out of
// the list entirely, since a title-less session is assumed to have nothing in it.
test('a codex session recorded by a current CLI is still titled', () => {
  const home = tempHome('codex');
  const cwd = 'C:\\work\\project';
  writeCodexSession(home, cwd, '019d0000-0000-7000-8000-000000000004', [
    {
      type: 'event_msg',
      payload: {
        type: 'item_completed',
        item: { type: 'UserMessage', content: [{ type: 'text', text: 'why is the retry helper flaky' }] }
      }
    }
  ]);

  const sessions = listAiSessions('codex', cwd, { CODEX_HOME: home });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].title, 'why is the retry helper flaky');
});

test('an unknown folder simply has no sessions', () => {
  const home = tempHome('claude');
  assert.deepEqual(listAiSessions('claude', 'C:\\nothing\\here', { CLAUDE_CONFIG_DIR: home }), []);
  assert.deepEqual(listAiSessions('claude', '', { CLAUDE_CONFIG_DIR: home }), []);
});

test('a drop-in provider does not inherit another CLI session store', () => {
  const home = tempHome('claude');
  const cwd = 'C:\\work\\project';
  writeClaudeSession(home, cwd, 'claude-only', [
    { type: 'user', cwd, message: { content: [{ type: 'text', text: 'private conversation' }] } }
  ]);

  assert.deepEqual(listAiSessions('drop-in-agent', cwd, { CLAUDE_CONFIG_DIR: home }), []);
});
