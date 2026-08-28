const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { StateStore } = require('../src/state');
const { AiManager: ClaudeAiManager, ClaudeAdapter, formatToolInput, parseCliArgs, resolveClaudeEffort } = require('../plugin-panes/claude/server');
const { AiManager: CodexAiManager, CodexAdapter, decisionLabel } = require('../plugin-panes/codex/server');

const defaultConfig = { ai: { claude_args: '--dangerously-skip-permissions' } };

// The recordings under test/fixtures come from scripts/ai-protocol-probe.js,
// so these tests run against frames the CLI actually emitted rather than an
// interpretation of its documentation.
function fixtureLines(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')
    .trim()
    .split('\n')
    // Lines the probe sent are prefixed; only the CLI's own output is replayed.
    .filter((line) => !line.startsWith('>> '));
}

function drive(name, { config = defaultConfig } = {}) {
  const events = [];
  const deltas = [];
  const written = [];
  const statuses = [];
  let sessionId = '';
  const adapter = new ClaudeAdapter({
    config,
    write: (message) => written.push(message),
    onEvent: (event) => events.push(event),
    onDelta: (delta) => deltas.push(delta),
    onSession: (value) => { sessionId = value; },
    onStatus: (status) => statuses.push(status)
  });
  for (const line of fixtureLines(name)) {
    adapter.handleLine(line);
  }
  return { adapter, events, deltas, written, statuses, get sessionId() { return sessionId; } };
}

test('a recorded claude turn becomes thinking, tool and text events', () => {
  const { events, sessionId } = drive('claude-default.ndjson');

  assert.match(sessionId, /^[0-9a-f-]{36}$/);
  const kinds = events.map((event) => event.kind);
  // The AskUserQuestion call and its result are absent on purpose: they are
  // drawn as the choice prompt between them, not as raw tool traffic.
  assert.deepEqual(kinds, ['tool_use', 'question', 'tool_result', 'question', 'text', 'result']);

  const write = events.find((event) => event.kind === 'tool_use');
  assert.equal(write.tool.name, 'Write');
  assert.match(write.tool.input, /probe\.txt/);
  assert.equal(write.tool.status, 'running');

  const result = events.find((event) => event.kind === 'tool_result');
  assert.equal(result.result.isError, false);
});

// The recording has an empty thinking block: it carries a signature and no
// text, and an empty bubble is worse than no bubble.
test('empty thinking blocks produce no bubble', () => {
  const { events } = drive('claude-default.ndjson');
  assert.equal(events.some((event) => event.kind === 'thinking'), false);
});

// Recorded with --include-partial-messages, so the reply's text arrives as
// content_block_delta frames before the completed assistant message that
// today's other fixtures only ever show as one whole block.
test('a claude reply streams as growing deltas rather than one block at the end', () => {
  const { events, deltas } = drive('claude-default-partial.ndjson');
  const texts = events.filter((event) => event.kind === 'text');

  // The whole reply arrives through onDelta, not as a separate onEvent text.
  assert.equal(texts.length, 0);
  assert.ok(deltas.length > 1);
  assert.equal(deltas.at(-1).done, true);
  assert.ok(deltas.slice(0, -1).every((delta) => delta.done === false));
  for (let i = 1; i < deltas.length; i += 1) {
    assert.ok(deltas[i].text.length >= deltas[i - 1].text.length);
    assert.ok(deltas[i].text.startsWith(deltas[i - 1].text));
  }
  assert.equal(deltas.at(-1).text, '你好！喵~');
});

// The CLI wraps each completed block alone in its own content array, so a
// text block that comes after thinking arrives here at local position 0 even
// though content_block_delta streamed it under true index 1. Matching by
// that recomputed position used to miss, producing a duplicate plain text
// event alongside the still-open streamed one.
test('a text block streamed after thinking is not duplicated as a separate event', () => {
  const events = [];
  const deltas = [];
  const adapter = new ClaudeAdapter({
    config: defaultConfig,
    write: () => {},
    onEvent: (event) => events.push(event),
    onDelta: (delta) => deltas.push(delta),
    onSession: () => {},
    onStatus: () => {}
  });
  for (const line of [
    { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'thinking...' }] } },
    { type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } } },
    { type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Hel' } } },
    { type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'lo' } } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } }
  ]) {
    adapter.handleLine(JSON.stringify(line));
  }

  const texts = events.filter((event) => event.kind === 'text');
  assert.equal(texts.length, 0);
  assert.equal(deltas.at(-1).done, true);
  assert.equal(deltas.at(-1).text, 'Hello');
});

test('a permission request offers the CLI\'s own suggestion alongside allow and deny', () => {
  const { events } = drive('claude-default.ndjson');
  const question = events.find((event) => event.kind === 'question' && event.question.prompt.startsWith('Run '));

  assert.equal(question.question.prompt, 'Run Write?');
  assert.match(question.question.detail, /probe\.txt/);
  assert.deepEqual(question.question.options.map((option) => option.id), ['allow', 'suggestion:0', 'deny']);
  assert.equal(question.question.options[1].label, 'Allow edits for the rest of this session');
});

test('answering a permission request with the CLI suggestion sends it back verbatim', () => {
  const { adapter, events, written } = drive('claude-default.ndjson');
  const question = events.find((event) => event.kind === 'question' && event.question.prompt.startsWith('Run '));

  assert.equal(adapter.answer(question.question.requestId, '', ['suggestion:0']), true);
  const reply = written.at(-1);
  assert.equal(reply.response.request_id, question.question.requestId);
  assert.equal(reply.response.response.behavior, 'allow');
  assert.deepEqual(reply.response.response.updatedPermissions, [
    { type: 'setMode', mode: 'acceptEdits', destination: 'session' }
  ]);
});

test('denying a permission request reports a deny rather than a silent allow', () => {
  const { adapter, events, written } = drive('claude-default.ndjson');
  const question = events.find((event) => event.kind === 'question' && event.question.prompt.startsWith('Run '));

  adapter.answer(question.question.requestId, '', ['deny']);
  assert.equal(written.at(-1).response.response.behavior, 'deny');
});

// The options shown must be the ones the model wrote, not a generic yes/no.
test('an agent question keeps the labels and descriptions the CLI supplied', () => {
  const { events } = drive('claude-default.ndjson');
  const question = events.filter((event) => event.kind === 'question').at(-1);

  assert.deepEqual(question.question.options.map((option) => option.label), ['Tabs', 'Spaces']);
  assert.match(question.question.options[0].hint, /tab/i);
  assert.equal(question.question.multi, false);
});

// Allowing without an answers map reads to the CLI as "the user did not
// answer", which is the bug this shape exists to avoid.
test('answering an agent question returns the tool input with an answers map', () => {
  const { adapter, events, written } = drive('claude-default.ndjson');
  const question = events.filter((event) => event.kind === 'question').at(-1);

  adapter.answer(question.question.requestId, question.question.groupId, ['Tabs']);
  const reply = written.at(-1);
  assert.equal(reply.response.response.behavior, 'allow');
  assert.deepEqual(
    reply.response.response.updatedInput.answers,
    { [question.question.prompt]: 'Tabs' }
  );
  assert.ok(Array.isArray(reply.response.response.updatedInput.questions));
});

// Bypassing permissions is the default because a terminal pane already runs
// anything; it must not also swallow the agent's own questions.
test('bypassing permissions still surfaces the agent\'s question', () => {
  const { events } = drive('claude-bypassPermissions.ndjson');
  const questions = events.filter((event) => event.kind === 'question');

  assert.equal(questions.length, 1);
  assert.deepEqual(questions[0].question.options.map((option) => option.label), ['Tabs', 'Spaces']);
  assert.equal(events.some((event) => event.kind === 'question' && event.question.prompt.startsWith('Run ')), false);
});

test('every event in a turn shares one turn id', () => {
  const events = [];
  const adapter = new ClaudeAdapter({
    config: defaultConfig,
    write: () => {},
    onEvent: (event) => events.push(event),
    onSession: () => {},
    onStatus: () => {}
  });

  adapter.sendPrompt('hello');
  for (const line of fixtureLines('claude-default.ndjson')) {
    adapter.handleLine(line);
  }

  const turnIds = new Set(events.map((event) => event.turnId).filter(Boolean));
  assert.equal(turnIds.size, 1);
  // The result frame closes the turn, so anything after it starts a new one.
  assert.equal(events.at(-1).kind, 'result');
});

test('a dead CLI leaves no request that can still be answered', () => {
  const { adapter, events } = drive('claude-default.ndjson');
  const question = events.find((event) => event.kind === 'question' && event.question.prompt.startsWith('Run '));

  const abandoned = adapter.takePending();
  assert.ok(abandoned.includes(question.question.requestId));
  assert.equal(adapter.answer(question.question.requestId, '', ['allow']), false);
});

test('the claude command line reflects its extra arguments, model and resume id', () => {
  const adapter = new ClaudeAdapter({
    config: { ai: { claude_args: '--permission-mode default', claude_model: 'opus', claude_effort: 'high' } },
    write: () => {},
    onEvent: () => {},
    onSession: () => {},
    onStatus: () => {}
  });

  const line = adapter.commandLine({ sessionId: 'abc-123' });
  assert.match(line, /--permission-mode default/);
  assert.match(line, /--model opus/);
  assert.match(line, /--effort high/);
  assert.match(line, /--resume abc-123/);
  assert.match(line, /--permission-prompt-tool stdio/);
  assert.doesNotMatch(line, /--allow-dangerously-skip-permissions/);

  const bypass = new ClaudeAdapter({
    config: defaultConfig, write: () => {}, onEvent: () => {}, onSession: () => {}, onStatus: () => {}
  }).commandLine({});
  assert.match(bypass, /--dangerously-skip-permissions/);
  assert.doesNotMatch(bypass, /--resume/);

  const custom = new ClaudeAdapter({
    config: { ai: { claude_args: '--permission-mode bypassPermissions --allow-dangerously-skip-permissions' } },
    write: () => {}, onEvent: () => {}, onSession: () => {}, onStatus: () => {}
  }).commandLine({});
  assert.match(custom, /--permission-mode bypassPermissions --allow-dangerously-skip-permissions/);
});

test('claude reports the active model and configured reasoning effort', () => {
  const statuses = [];
  const adapter = new ClaudeAdapter({
    config: { ai: { claude_effort: 'high' } },
    write: () => {}, onEvent: () => {}, onSession: () => {},
    onStatus: (status) => statuses.push(status)
  });

  adapter.handleLine(JSON.stringify({
    type: 'system', subtype: 'init', session_id: 'session-1', model: 'claude-sonnet-5'
  }));

  assert.deepEqual(
    statuses.find((status) => status.model),
    { status: 'idle', model: 'claude-sonnet-5', effort: 'high' }
  );
});

// /model and /effort are dispatched as plain text and answered the same way --
// the CLI marks its reply model: "<synthetic>" rather than routing it through
// the model, and the confirmation carries no structured field for the new
// value, unlike the 'system' init frame, which only repeats it on the next
// turn. Without parsing this text the pane's own badge never learns of an
// effort change at all, and lags a full turn behind for a model change.
test('a /model reply updates the reported model immediately, without waiting for the next turn', () => {
  const statuses = [];
  const adapter = new ClaudeAdapter({
    config: { ai: {} }, write: () => {}, onEvent: () => {}, onSession: () => {},
    onStatus: (status) => statuses.push(status)
  });
  adapter.handleLine(JSON.stringify({
    type: 'system', subtype: 'init', session_id: 'session-1', model: 'claude-sonnet-5'
  }));
  const effortBefore = adapter.effort;
  adapter.handleLine(JSON.stringify({
    type: 'assistant',
    message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: 'Set model to Opus 5 for this session only' }] }
  }));

  assert.equal(adapter.model, 'Opus 5');
  // /model does not touch the reasoning effort, so it must survive untouched.
  assert.deepEqual(statuses.at(-1), { model: 'Opus 5', effort: effortBefore });
});

test('a /effort reply updates the reported effort, which the init frame never carries', () => {
  const statuses = [];
  const adapter = new ClaudeAdapter({
    config: { ai: {} }, write: () => {}, onEvent: () => {}, onSession: () => {},
    onStatus: (status) => statuses.push(status)
  });
  adapter.handleLine(JSON.stringify({
    type: 'system', subtype: 'init', session_id: 'session-1', model: 'claude-sonnet-5'
  }));
  adapter.handleLine(JSON.stringify({
    type: 'assistant',
    message: {
      model: '<synthetic>',
      role: 'assistant',
      content: [{ type: 'text', text: 'Set effort level to high (this session only): burns fastest' }]
    }
  }));

  assert.equal(adapter.effort, 'high');
  assert.deepEqual(statuses.at(-1), { model: 'claude-sonnet-5', effort: 'high' });

  adapter.handleLine(JSON.stringify({
    type: 'assistant',
    message: {
      model: '<synthetic>',
      role: 'assistant',
      content: [{ type: 'text', text: 'Current model: Opus 5 (effort: medium)\nUsage: /model <name>.' }]
    }
  }));
  assert.equal(adapter.model, 'Opus 5');
  assert.equal(adapter.effort, 'medium');

  // A real assistant reply that merely mentions models must never be mistaken
  // for the CLI's own local confirmation.
  adapter.handleLine(JSON.stringify({
    type: 'assistant',
    message: {
      model: 'claude-sonnet-5',
      role: 'assistant',
      content: [{ type: 'text', text: 'Current model: Opus 5 (effort: max)' }]
    }
  }));
  assert.equal(adapter.effort, 'medium');
});

test('claude resolves the effective effort from its environment and scoped settings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-claude-effort-'));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'project');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ effortLevel: 'low' }));
  fs.writeFileSync(path.join(cwd, '.claude', 'settings.json'), JSON.stringify({ effortLevel: 'medium' }));
  fs.writeFileSync(path.join(cwd, '.claude', 'settings.local.json'), JSON.stringify({ effortLevel: 'high' }));

  const env = { USERPROFILE: home };
  assert.equal(resolveClaudeEffort({ ai: {} }, cwd, env), 'high');
  assert.equal(resolveClaudeEffort({ ai: { claude_effort: 'xhigh' } }, cwd, env), 'xhigh');
  assert.equal(resolveClaudeEffort({ ai: { claude_effort: 'xhigh' } }, cwd, {
    ...env,
    CLAUDE_CODE_EFFORT_LEVEL: 'medium'
  }), 'medium');
  assert.equal(resolveClaudeEffort({ ai: {} }, path.join(root, 'empty'), { USERPROFILE: path.join(root, 'other') }), 'auto');
});

test('claude reports a persisted CLI effort when wps7 has no override', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-claude-effort-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ effortLevel: 'medium' }));
  const statuses = [];
  const adapter = new ClaudeAdapter({
    config: { ai: {} }, cwd: root, env: { USERPROFILE: home },
    write: () => {}, onEvent: () => {}, onSession: () => {},
    onStatus: (status) => statuses.push(status)
  });

  adapter.handleLine(JSON.stringify({
    type: 'system', subtype: 'init', session_id: 'session-1', model: 'claude-sonnet-5'
  }));

  assert.deepEqual(statuses.find((status) => status.model), {
    status: 'idle', model: 'claude-sonnet-5', effort: 'medium'
  });
});

test('CLI arguments reject shell syntax instead of reaching cmd.exe', () => {
  assert.deepEqual(parseCliArgs('--yolo -c sandbox_mode=danger-full-access'), [
    '--yolo', '-c', 'sandbox_mode=danger-full-access'
  ]);
  assert.equal(parseCliArgs('--yolo & echo pwned'), null);
});

// Regression: quoting these produced `--resume "<id>"`, and because Windows
// runs the line through cmd.exe the quotes reached claude as part of the value,
// which answered `Provided value ""<id>"" is not a UUID` and exited.
test('command line values are passed unquoted, and unsafe ones are dropped', () => {
  const adapter = new ClaudeAdapter({
    config: { ai: { claude_model: 'opus "quoted"', claude_effort: 'high & echo pwned' } },
    write: () => {}, onEvent: () => {}, onSession: () => {}, onStatus: () => {}
  });

  const line = adapter.commandLine({ sessionId: '2f1c5f6e-0000-4000-8000-000000000001' });
  assert.doesNotMatch(line, /"/);
  assert.match(line, /--resume 2f1c5f6e-0000-4000-8000-000000000001/);
  // A value that could add arguments of its own is left out entirely.
  assert.doesNotMatch(line, /--model/);
  assert.doesNotMatch(line, /--effort/);
  assert.doesNotMatch(line, /echo pwned/);
});

test('tool arguments are rendered as the thing they actually are', () => {
  assert.deepEqual(formatToolInput({ command: 'git status' }), { text: 'git status', language: 'bash' });
  assert.equal(formatToolInput({ file_path: 'a.txt', old_string: 'x', new_string: 'y' }).language, 'diff');
  assert.match(formatToolInput({ file_path: 'a.txt', content: 'hi' }).text, /a\.txt\n\nhi/);
  assert.equal(formatToolInput({ pattern: '*.js' }).language, 'json');
  assert.deepEqual(formatToolInput(undefined), { text: '', language: '' });
});

function driveCodex({ config = { ai: {} }, fixture = 'codex-app-server.jsonl' } = {}) {
  const events = [];
  const deltas = [];
  const written = [];
  const statuses = [];
  let sessionId = '';
  const adapter = new CodexAdapter({
    config,
    write: (message) => written.push(message),
    onEvent: (event) => events.push(event),
    onDelta: (delta) => deltas.push(delta),
    onSession: (value) => { sessionId = value; },
    onStatus: (status) => statuses.push(status)
  });
  adapter.start({});
  for (const line of fixtureLines(fixture)) {
    adapter.handleLine(line);
  }
  return { adapter, events, deltas, written, statuses, get sessionId() { return sessionId; } };
}

function answerCodexRequest(adapter, written, method, result) {
  const request = written.findLast((message) => message.method === method);
  assert.ok(request, `${method} should have been requested`);
  adapter.handleLine(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
}

test('a recorded codex session completes the handshake and reports its thread id', () => {
  const { adapter, written, sessionId } = driveCodex();

  assert.equal(written[0].method, 'initialize');
  assert.equal(written[0].params.capabilities.experimentalApi, true);
  // The reply's own tokens are streamed to the pane, so they must reach us;
  // Raw reasoning and tool-output deltas stay muted at the protocol level,
  // while the display-safe reasoning summary must reach the pane.
  assert.ok(!written[0].params.capabilities.optOutNotificationMethods.includes('item/agentMessage/delta'));
  assert.ok(written[0].params.capabilities.optOutNotificationMethods.includes('item/reasoning/textDelta'));
  assert.ok(!written[0].params.capabilities.optOutNotificationMethods.includes('item/reasoning/summaryTextDelta'));
  assert.equal(written[1].method, 'initialized');
  assert.equal(written[2].method, 'thread/start');
  assert.equal(sessionId, adapter.threadId);
  assert.ok(sessionId);
});

test('codex builds a thinking event from streamed reasoning summaries', () => {
  const events = [];
  const adapter = new CodexAdapter({
    config: { ai: {} },
    write: () => {},
    onEvent: (event) => events.push(event),
    onSession: () => {},
    onStatus: () => {}
  });

  for (const [summaryIndex, delta] of [
    [1, 'Checking '],
    [0, 'Inspecting '],
    [1, 'the tests.'],
    [0, 'the code.']
  ]) {
    adapter.handleLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'item/reasoning/summaryTextDelta',
      params: { itemId: 'reason-1', summaryIndex, turnId: 'turn-1', delta }
    }));
  }
  adapter.handleLine(JSON.stringify({
    jsonrpc: '2.0',
    method: 'item/completed',
    params: { item: { type: 'reasoning', id: 'reason-1', summary: [], content: [] } }
  }));

  assert.deepEqual(
    events.filter((event) => event.kind === 'thinking').map((event) => event.text),
    ['Inspecting the code.\n\nChecking the tests.']
  );
});

test('a codex reply streams as growing deltas rather than one block at the end', () => {
  const { events, deltas } = driveCodex();
  const texts = events.filter((event) => event.kind === 'text');
  const reply = deltas.filter((delta) => delta.key === 'msg_00000006');

  // The whole reply arrives through onDelta, not as a separate onEvent text.
  assert.equal(texts.length, 0);
  assert.ok(reply.length > 1);
  assert.equal(reply.at(-1).done, true);
  assert.ok(reply.slice(0, -1).every((delta) => delta.done === false));
  // Each delta carries the accumulated text so far, growing monotonically,
  // and the final one matches the CLI's own authoritative full text.
  for (let i = 1; i < reply.length; i += 1) {
    assert.ok(reply[i].text.length >= reply[i - 1].text.length);
    assert.ok(reply[i].text.startsWith(reply[i - 1].text));
  }
  assert.match(reply.at(-1).text, /comply/);
  assert.ok(reply.every((delta) => delta.turnId === reply[0].turnId));
});

test('codex command results are shown in the transcript', () => {
  const { adapter, events } = driveCodex();

  adapter.handleLine(JSON.stringify({
    jsonrpc: '2.0', method: 'item/completed',
    params: { item: { type: 'contextCompaction', id: 'compact-1' } }
  }));
  adapter.handleLine(JSON.stringify({
    jsonrpc: '2.0', method: 'item/completed',
    params: { item: { type: 'exitedReviewMode', id: 'review-1', review: 'No findings.' } }
  }));

  assert.match(events.at(-2).text, /compacted/);
  assert.equal(events.at(-1).text, 'No findings.');
});

// availableDecisions is the CLI stating which choices apply this time, so it
// wins over the protocol's full list.
test('a codex approval uses the decisions the CLI offered', () => {
  const { adapter, events, written } = driveCodex();
  adapter.handleLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 77,
    method: 'item/commandExecution/requestApproval',
    params: {
      itemId: 'i1', threadId: 't', turnId: 'u', startedAtMs: 1,
      command: 'rm -rf build', availableDecisions: ['accept', 'decline']
    }
  }));

  const question = events.filter((event) => event.kind === 'question').at(-1);
  assert.deepEqual(question.question.options.map((option) => option.id), ['accept', 'decline']);
  assert.equal(question.question.detail, 'rm -rf build');

  adapter.answer('77', '', ['accept']);
  assert.deepEqual(written.at(-1), { jsonrpc: '2.0', id: 77, result: { decision: 'accept' } });
});

test('a codex approval falls back to the full decision set when none is offered', () => {
  const { adapter, events } = driveCodex();
  adapter.handleLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 78,
    method: 'item/fileChange/requestApproval',
    params: { itemId: 'i2', threadId: 't', turnId: 'u', startedAtMs: 1, reason: 'edit src/main.js' }
  }));

  const question = events.filter((event) => event.kind === 'question').at(-1);
  assert.deepEqual(
    question.question.options.map((option) => option.id),
    ['accept', 'acceptForSession', 'decline', 'cancel']
  );
});

test('a codex question is answered against the question id the CLI gave it', () => {
  const { adapter, events, written } = driveCodex();
  adapter.handleLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 90,
    method: 'item/tool/requestUserInput',
    params: {
      itemId: 'i3', threadId: 't', turnId: 'u', isBlocking: true,
      questions: [{
        id: 'q-indent', header: 'Indent', question: 'Tabs or spaces?',
        options: [{ label: 'Tabs', description: 'tab characters' }, { label: 'Spaces', description: 'spaces' }]
      }]
    }
  }));

  const question = events.filter((event) => event.kind === 'question').at(-1);
  assert.deepEqual(question.question.options.map((option) => option.label), ['Tabs', 'Spaces']);

  adapter.answer('90', '0', ['Tabs']);
  assert.deepEqual(written.at(-1).result, { answers: { 'q-indent': { answers: ['Tabs'] } } });
});

// An unanswered server request would stall the turn forever.
test('an unknown codex request is refused rather than left hanging', () => {
  const { adapter, written } = driveCodex();
  adapter.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'some/futureRequest', params: {} }));

  assert.equal(written.at(-1).id, 99);
  assert.match(written.at(-1).error.message, /does not handle/);
});

test('a prompt typed before the handshake finishes is sent once the thread exists', () => {
  const written = [];
  const adapter = new CodexAdapter({
    config: { ai: { codex_model: 'gpt-5', codex_effort: 'high' } },
    write: (message) => written.push(message),
    onEvent: () => {},
    onSession: () => {},
    onStatus: () => {}
  });

  adapter.start({});
  adapter.sendPrompt('list the files');
  assert.equal(written.some((message) => message.method === 'turn/start'), false);

  adapter.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));
  adapter.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { thread: { id: 'thread-9' } } }));

  const turn = written.find((message) => message.method === 'turn/start');
  assert.equal(turn.params.threadId, 'thread-9');
  assert.deepEqual(turn.params.input, [{ type: 'text', text: 'list the files' }]);
  assert.equal(turn.params.model, 'gpt-5');
  assert.equal(turn.params.effort, 'high');
  assert.equal(turn.params.approvalPolicy, undefined);
});

// Losing the thread silently would leave the pane looking fine while the agent
// had forgotten everything on screen.
test('a failed codex resume says so and starts a fresh thread', () => {
  const events = [];
  const written = [];
  const adapter = new CodexAdapter({
    config: { ai: {} },
    write: (message) => written.push(message),
    onEvent: (event) => events.push(event),
    onSession: () => {},
    onStatus: () => {}
  });

  adapter.start({ sessionId: 'gone-thread' });
  adapter.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));
  assert.equal(written.at(-1).method, 'thread/resume');

  adapter.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -1, message: 'no such thread' } }));
  assert.equal(written.at(-1).method, 'thread/start');
  assert.equal(events.at(-1).kind, 'notice');
  assert.equal(events.at(-1).text, '--- New Session ---');
});

// A restarted thread reports the CLI's own default model, which must not
// silently overwrite a model/reasoning the user picked with /model or
// /reasoning -- otherwise the status bar and later turns drift back to the
// CLI default the moment a resume fails.
test('a model chosen with /model survives a thread restart after a failed resume', () => {
  const written = [];
  const adapter = new CodexAdapter({
    config: { ai: {} },
    write: (message) => written.push(message),
    onEvent: () => {},
    onSession: () => {},
    onStatus: () => {}
  });

  adapter.start({});
  adapter.handleLine(JSON.stringify({ jsonrpc: '2.0', id: written.at(-1).id, result: {} }));
  adapter.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: written.at(-1).id, result: { thread: { id: 'thread-1' }, model: 'gpt-5.6-sol', reasoningEffort: 'medium' }
  }));

  adapter.sendPrompt('/model gpt-5.6-codex');
  adapter.sendPrompt('/reasoning high');
  assert.equal(adapter.currentModel, 'gpt-5.6-codex');
  assert.equal(adapter.currentEffort, 'high');

  // The thread is lost and a resume fails, forcing a fresh thread/start whose
  // result carries the CLI's own default model again.
  adapter.start({ sessionId: 'gone-thread' });
  adapter.handleLine(JSON.stringify({ jsonrpc: '2.0', id: written.at(-1).id, result: {} }));
  assert.equal(written.at(-1).method, 'thread/resume');
  adapter.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: written.at(-1).id, error: { code: -1, message: 'no such thread' }
  }));
  assert.equal(written.at(-1).method, 'thread/start');
  adapter.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: written.at(-1).id, result: { thread: { id: 'thread-new' }, model: 'gpt-5.6-sol', reasoningEffort: 'medium' }
  }));

  assert.equal(adapter.currentModel, 'gpt-5.6-codex');
  assert.equal(adapter.currentEffort, 'high');
});

test('codex decision ids are labelled from the protocol vocabulary', () => {
  assert.equal(decisionLabel('acceptForSession'), 'Accept for this session');
  assert.equal(decisionLabel('cancel'), 'Decline and stop the turn');
  assert.equal(decisionLabel({ acceptWithExecpolicyAmendment: { execpolicy_amendment: [] } }), 'acceptWithExecpolicyAmendment');
});

test('codex global arguments are placed before app-server and yolo reaches its config', () => {
  const adapter = new CodexAdapter({
    config: { ai: { codex_args: '--yolo' } },
    write: () => {}, onEvent: () => {}, onSession: () => {}, onStatus: () => {}
  });
  assert.equal(
    adapter.commandLine(),
    'codex -c approval_policy=never -c sandbox_mode=danger-full-access app-server'
  );

  const plain = new CodexAdapter({
    config: { ai: { codex_args: '--yolo & echo pwned' } },
    write: () => {}, onEvent: () => {}, onSession: () => {}, onStatus: () => {}
  });
  assert.equal(plain.commandLine(), 'codex app-server');
});

// --- manager ---------------------------------------------------------------

let nextFakePid = 4242;

function fakeChild() {
  const child = new EventEmitter();
  // Distinct pids, so a fake taskkill can end exactly the process it names.
  child.pid = nextFakePid;
  nextFakePid += 1;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.stdin.writable = true;
  child.exitCode = null;
  child.signalCode = null;
  child.written = [];
  child.stdin.on('data', (chunk) => child.written.push(chunk.toString()));
  return child;
}

function fakeSocket() {
  const socket = {
    OPEN: 1,
    readyState: 1,
    sent: [],
    handlers: {},
    closed: null,
    send: (raw) => socket.sent.push(JSON.parse(raw)),
    close: (code, reason) => { socket.closed = { code, reason }; },
    on: (event, fn) => { socket.handlers[event] = fn; },
    fire: (event, data) => socket.handlers[event]?.(data)
  };
  return socket;
}

function managerFixture({ provider = 'claude', config = {}, env } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-ai-'));
  const store = new StateStore(root);
  store.load();
  const pane = store.createAiPane(store.state.sessions[0].tabs[0].panes[0].id, provider);
  const spawns = [];
  const Manager = provider === 'codex' ? CodexAiManager : ClaudeAiManager;
  const manager = new Manager({
    config: { ai: { claude_args: '--permission-mode bypassPermissions --allow-dangerously-skip-permissions', ...config } },
    root,
    store,
    ...(env ? { env } : {}),
    spawnImpl: (command, args, options) => {
      const child = fakeChild();
      spawns.push({ command, args, options, child });
      // taskkill really does end the process it names, and the manager waits
      // for that exit before starting a replacement, so the fake does too.
      if (command === 'taskkill') {
        const pid = Number(args[args.indexOf('/pid') + 1]);
        for (const call of spawns) {
          if (call.command !== 'taskkill' && call.child.pid === pid && call.child.exitCode === null) {
            call.child.exitCode = 1;
            queueMicrotask(() => call.child.emit('exit', 1));
          }
        }
      }
      return child;
    }
  });
  return { root, store, manager, pane, tabId: pane.activeAiTabId, spawns };
}

function cliChild(spawns) {
  return spawns.find((call) => call.command !== 'taskkill').child;
}

// Restarting waits for the old process to exit, so the replacement only appears
// after the fake exit has been delivered.
function settle() {
  return new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
}

test('attaching starts one CLI per tab and replays the transcript', () => {
  const { manager, store, pane, tabId, spawns } = managerFixture();
  store.appendAiMessages(pane.id, tabId, [{ role: 'user', kind: 'text', text: 'earlier question' }]);

  const socket = fakeSocket();
  manager.attach(tabId, socket);

  assert.equal(spawns.length, 1);
  assert.match(spawns[0].args.join(' '), /claude --print/);
  const hello = socket.sent[0];
  assert.equal(hello.type, 'hello');
  assert.equal(hello.provider, 'claude');
  assert.equal(hello.events[0].text, 'earlier question');
  assert.deepEqual(hello.pending, []);
});

// The route wires moveTab up the same way TerminalManager#moveTerminal is:
// see src/main.js's moveTabRoute('ai', ...).
test('moving a tab to another pane repoints its runtime, so history reads and writes follow it', () => {
  const { manager, store, pane, tabId } = managerFixture();
  store.createAiTab(pane.id, 'claude'); // a pane can't be dragged out of its last tab
  const otherPane = store.createAiPane(pane.id, 'claude');

  manager.attach(tabId, fakeSocket());
  assert.equal(manager.runtimes.get(tabId).paneId, pane.id);

  assert.ok(store.moveTab('ai', pane.id, tabId, 0, otherPane.id));
  manager.moveTab(tabId, otherPane.id);

  assert.equal(manager.runtimes.get(tabId).paneId, otherPane.id);
  store.appendAiMessages(otherPane.id, tabId, [{ role: 'user', kind: 'text', text: 'after move' }]);
  assert.equal(store.findAiTab(otherPane.id, tabId).tab.messages.at(-1).text, 'after move');
});

test('a prompt reaches the CLI and its reply reaches every client', () => {
  const { manager, tabId, spawns } = managerFixture();
  const first = fakeSocket();
  const second = fakeSocket();
  manager.attach(tabId, first);
  manager.attach(tabId, second);

  first.fire('message', JSON.stringify({ type: 'prompt', text: 'hello there' }));
  const child = cliChild(spawns);
  assert.match(child.written.join(''), /"text":"hello there"/);

  child.stdout.write(`${JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'hi back' }] }
  })}\n`);

  return new Promise((resolve) => setImmediate(() => {
    for (const socket of [first, second]) {
      const event = socket.sent.filter((message) => message.type === 'event').at(-1);
      assert.equal(event.event.text, 'hi back');
    }
    resolve();
  }));
});

test('a streamed reply patches one stored message instead of appending one per token', () => {
  const { manager, store, pane, tabId, spawns } = managerFixture();
  let saveCalls = 0;
  store.save = new Proxy(store.save, { apply: (target, thisArg, args) => { saveCalls += 1; return Reflect.apply(target, thisArg, args); } });
  const socket = fakeSocket();
  manager.attach(tabId, socket);
  const child = cliChild(spawns);

  for (const line of [
    { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } } },
    { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } }
  ]) {
    child.stdout.write(`${JSON.stringify(line)}\n`);
  }

  return settle().then(() => {
    const messages = store.findAiTab(pane.id, tabId).tab.messages;
    const replies = messages.filter((message) => message.kind === 'text' && message.role === 'assistant');
    assert.equal(replies.length, 1);
    assert.equal(replies[0].text, 'Hello');

    const created = socket.sent.filter((message) => message.type === 'event' && message.event.id === replies[0].id);
    assert.equal(created.length, 1);
    assert.equal(created[0].streaming, true);
    assert.equal(created[0].event.text, 'Hel');

    const patches = socket.sent.filter((message) => message.type === 'patch' && message.id === replies[0].id);
    assert.deepEqual(patches.map((patch) => [patch.text, patch.done]), [['Hello', false], ['Hello', true]]);

    // Tokens patch the in-memory transcript only; disk writes stay at turn
    // boundaries (a 'result'/'error' frame), same as before streaming existed.
    assert.equal(saveCalls, 0);
  });
});

// A reload must not read as a decision; the buttons have to still work.
test('a client disconnecting leaves a pending question answerable', () => {
  const { manager, store, pane, tabId, spawns } = managerFixture();
  const socket = fakeSocket();
  manager.attach(tabId, socket);
  const child = cliChild(spawns);

  child.stdout.write(`${JSON.stringify({
    type: 'control_request',
    request_id: 'req-live',
    request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' } }
  })}\n`);

  return new Promise((resolve) => setImmediate(() => {
    socket.fire('close');

    const reopened = fakeSocket();
    manager.attach(tabId, reopened);
    const hello = reopened.sent[0];
    assert.deepEqual(hello.pending, ['req-live']);
    const question = hello.events.find((event) => event.kind === 'question');
    assert.equal(question.answer, undefined);

    reopened.fire('message', JSON.stringify({ type: 'answer', requestId: 'req-live', optionIds: ['allow'] }));
    assert.match(child.written.join(''), /"behavior":"allow"/);
    const stored = store.findAiTab(pane.id, tabId).tab.messages.find((event) => event.kind === 'question');
    assert.deepEqual(stored.answer.labels, ['Allow']);
    resolve();
  }));
});

test('clicking an option twice only answers the CLI once', () => {
  const { manager, tabId, spawns } = managerFixture();
  const socket = fakeSocket();
  manager.attach(tabId, socket);
  const child = cliChild(spawns);

  child.stdout.write(`${JSON.stringify({
    type: 'control_request',
    request_id: 'req-double',
    request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' } }
  })}\n`);

  return new Promise((resolve) => setImmediate(() => {
    const answer = JSON.stringify({ type: 'answer', requestId: 'req-double', optionIds: ['allow'] });
    socket.fire('message', answer);
    socket.fire('message', answer);

    const replies = child.written.join('').match(/control_response/g) || [];
    assert.equal(replies.length, 1);
    resolve();
  }));
});

// A dead CLI can never answer, so the buttons stop pretending otherwise.
test('a CLI that exits cancels its outstanding questions and says why', () => {
  const { manager, store, pane, tabId, spawns } = managerFixture();
  const socket = fakeSocket();
  manager.attach(tabId, socket);
  const child = cliChild(spawns);

  child.stdout.write(`${JSON.stringify({
    type: 'control_request',
    request_id: 'req-doomed',
    request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' } }
  })}\n`);

  return new Promise((resolve) => setImmediate(() => {
    child.stderr.write('claude: not logged in');
    setImmediate(() => {
      child.emit('exit', 1);

      const patch = socket.sent.find((message) => message.type === 'patch');
      assert.equal(patch.answer.cancelled, true);
      const error = store.findAiTab(pane.id, tabId).tab.messages.find((event) => event.kind === 'error');
      assert.match(error.text, /exit 1/);
      assert.match(error.text, /not logged in/);
      assert.equal(socket.sent.filter((message) => message.type === 'status').at(-1).status, 'stopped');
      resolve();
    });
  }));
});

// The CLI is a grandchild of the process we hold, so a plain kill would orphan
// it and leave it holding files the packaged build has to replace.
test('closing a pane kills the whole CLI process tree', { skip: process.platform !== 'win32' }, () => {
  const { manager, pane, tabId, spawns } = managerFixture();
  manager.attach(tabId, fakeSocket());

  manager.killPane(pane);

  const kill = spawns.find((call) => call.command === 'taskkill');
  assert.ok(kill, 'expected taskkill to be used');
  assert.deepEqual(kill.args, ['/pid', String(cliChild(spawns).pid), '/t', '/f']);
  assert.equal(manager.runtimes.size, 0);
});

test('shutting down stops every tab', { skip: process.platform !== 'win32' }, () => {
  const { manager, store, pane, spawns } = managerFixture();
  const second = store.createAiTab(pane.id, 'claude');
  manager.attach(pane.aiTabs[0].id, fakeSocket());
  manager.attach(second.id, fakeSocket());
  assert.equal(manager.runtimes.size, 2);

  manager.shutdown();

  assert.equal(manager.runtimes.size, 0);
  assert.equal(spawns.filter((call) => call.command === 'taskkill').length, 2);
});

// Clearing has to end the CLI session too, or the next prompt resumes the
// conversation the user just cleared.
test('clearing a tab drops the transcript, the resume id and the process', async () => {
  const { manager, store, pane, tabId, spawns } = managerFixture();
  const socket = fakeSocket();
  manager.attach(tabId, socket);
  store.appendAiMessages(pane.id, tabId, [{ role: 'user', kind: 'text', text: 'forget me' }]);
  store.setAiSession(pane.id, tabId, 'session-1');

  assert.equal(manager.clearTab(pane.id, tabId), true);

  const tab = store.findAiTab(pane.id, tabId).tab;
  assert.deepEqual(tab.messages, []);
  assert.equal(tab.sessionId, '');
  assert.ok(socket.sent.some((message) => message.type === 'cleared'));

  await settle();
  // The replacement is a genuinely new process, and it is not told to resume
  // the conversation that was just cleared.
  const launches = spawns.filter((call) => call.command !== 'taskkill');
  assert.equal(launches.length, 2);
  assert.doesNotMatch(launches.at(-1).args.join(' '), /--resume/);
});

// A stale session id would otherwise leave the tab permanently broken: every
// launch would resume a session the CLI has forgotten and exit straight away.
test('a CLI that dies before starting drops the stale resume id and retries', () => {
  const { manager, store, pane, tabId, spawns } = managerFixture();
  store.setAiSession(pane.id, tabId, 'stale-session');
  const socket = fakeSocket();
  manager.attach(tabId, socket);
  assert.match(spawns[0].args.join(' '), /--resume stale-session/);

  cliChild(spawns).emit('exit', 1);

  assert.equal(store.findAiTab(pane.id, tabId).tab.sessionId, '');
  const notice = store.findAiTab(pane.id, tabId).tab.messages.at(-1);
  assert.equal(notice.kind, 'notice');
  assert.equal(notice.text, '--- New Session ---');
  // The replacement starts clean rather than resuming the same dead session.
  const relaunch = spawns.filter((call) => call.command !== 'taskkill').at(-1);
  assert.doesNotMatch(relaunch.args.join(' '), /--resume/);
});

// A prompt sent while a resume attempt is still in flight used to be echoed
// straight away, so a failure notice that arrived moments later always landed
// below it -- looking as if sending that prompt was what broke the session.
test('a prompt sent while a codex resume is pending appears after its failure notice', async () => {
  const { manager, store, pane, tabId, spawns } = managerFixture({ provider: 'codex' });
  store.setAiSession(pane.id, tabId, 'stale-thread');
  const socket = fakeSocket();
  manager.attach(tabId, socket);
  socket.fire('message', JSON.stringify({ type: 'prompt', text: 'hello' }));

  const child = cliChild(spawns);
  const lines = () => child.written.join('').trim().split('\n').map((line) => JSON.parse(line));
  const init = lines()[0];
  child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: init.id, result: {} })}\n`);
  await settle();

  const resume = lines().at(-1);
  assert.equal(resume.method, 'thread/resume');
  child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: resume.id, error: { code: -1, message: 'no such thread' } })}\n`);
  await settle();

  const start = lines().at(-1);
  assert.equal(start.method, 'thread/start');
  child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: start.id, result: { thread: { id: 'thread-new' } } })}\n`);
  await settle();

  const events = store.findAiTab(pane.id, tabId).tab.messages;
  assert.deepEqual(events.map((event) => event.kind), ['notice', 'text']);
  assert.equal(events[0].text, '--- New Session ---');
  assert.equal(events[1].role, 'user');
  assert.equal(events[1].text, 'hello');
});

test('a tab that resumes passes its stored session id to the CLI', () => {
  const { manager, store, pane, tabId, spawns } = managerFixture();
  store.setAiSession(pane.id, tabId, 'session-42');

  manager.attach(tabId, fakeSocket());

  assert.match(cliChild(spawns) && spawns[0].args.join(' '), /--resume session-42/);
});

test('an unknown tab is refused instead of spawning anything', () => {
  const { manager, spawns } = managerFixture();
  const socket = fakeSocket();

  manager.attach('no-such-tab', socket);

  assert.equal(spawns.length, 0);
  assert.equal(socket.sent[0].type, 'error');
  assert.equal(socket.closed.code, 1011);
});


// The folder is decided when the process is spawned, which is why changing it
// has to relaunch the CLI rather than just update the label.
test('a tab starts its CLI in its own folder', () => {
  const { manager, store, pane, tabId, spawns, root } = managerFixture();
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-work-'));
  store.setAiTabCwd(pane.id, tabId, elsewhere);

  manager.attach(tabId, fakeSocket());

  assert.equal(spawns[0].options.cwd, elsewhere);
  assert.notEqual(spawns[0].options.cwd, root);
});

test('restarting a tab relaunches the CLI and says why', async () => {
  const { manager, store, pane, tabId, spawns } = managerFixture();
  const socket = fakeSocket();
  manager.attach(tabId, socket);
  const first = cliChild(spawns);

  manager.restartTab(tabId, 'The working folder is now D:/work.');
  await settle();

  const notice = store.findAiTab(pane.id, tabId).tab.messages.at(-1);
  assert.equal(notice.kind, 'notice');
  assert.match(notice.text, /working folder/i);
  const relaunched = spawns.filter((call) => call.command !== 'taskkill').at(-1);
  assert.notEqual(relaunched.child, first);
  // The socket follows the new process, so the pane keeps working.
  assert.equal(manager.runtimes.get(tabId).clients.has(socket), true);
});


// Regression: the replacement used to be spawned in the same tick as the kill.
// Two app-servers then shared one session file, and the second failed to load
// it -- the pane filled with "could not be resumed" notices after every folder
// change.
test('a replacement CLI waits for the old process to exit', async () => {
  const { manager, tabId, spawns } = managerFixture();
  manager.attach(tabId, fakeSocket());
  const launches = () => spawns.filter((call) => call.command !== 'taskkill').length;
  assert.equal(launches(), 1);

  manager.restartTab(tabId);
  // The kill has been issued but the old process has not reported back yet.
  assert.equal(spawns.some((call) => call.command === 'taskkill'), true);
  assert.equal(launches(), 1, 'must not start a second CLI while the first is alive');

  await settle();
  assert.equal(launches(), 2);
});

// Regression: codex logs to stderr in colour, and the transcript quotes stderr
// when a process dies, so raw escape sequences were reaching the bubble.
test('a stopped CLI is quoted without terminal colour codes', async () => {
  const { manager, store, pane, tabId, spawns } = managerFixture();
  manager.attach(tabId, fakeSocket());
  const child = cliChild(spawns);

  child.stderr.write('[2m2026-08-18T01:03:07Z[0m [31mERROR[0m failed to load skill');
  await settle();
  child.emit('exit', 1);
  await settle();

  const error = store.findAiTab(pane.id, tabId).tab.messages.find((event) => event.kind === 'error');
  assert.match(error.text, /ERROR failed to load skill/);
  assert.doesNotMatch(error.text, new RegExp(String.fromCharCode(27)));
  assert.doesNotMatch(error.text, new RegExp('\\[31m'));
});


// The tool's own contract is that "Other" is offered automatically and never
// listed among the options, so a pane that renders only the listed options
// silently drops the answer the user meant to give.
test('an agent question accepts an answer typed by the user', () => {
  const { adapter, events, written } = drive('claude-default.ndjson');
  const question = events.filter((event) => event.kind === 'question').at(-1);
  assert.equal(question.question.allowFreeText, true);

  adapter.answer(question.question.requestId, question.question.groupId, [], 'neither, use 4 spaces');
  const answers = written.at(-1).response.response.updatedInput.answers;
  assert.deepEqual(answers, { [question.question.prompt]: 'neither, use 4 spaces' });
});

test('a codex question accepts a typed answer when the CLI allows one', () => {
  const { adapter, events, written } = driveCodex();
  adapter.handleLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 91,
    method: 'item/tool/requestUserInput',
    params: {
      itemId: 'i4', threadId: 't', turnId: 'u', isBlocking: true,
      questions: [{ id: 'q-free', header: 'Name', question: 'What should I call it?', isOther: true, options: [] }]
    }
  }));

  const question = events.filter((event) => event.kind === 'question').at(-1);
  assert.equal(question.question.allowFreeText, true);

  adapter.answer('91', '0', [], 'retry-helper');
  assert.deepEqual(written.at(-1).result, { answers: { 'q-free': { answers: ['retry-helper'] } } });
});

// A permission prompt is a fixed set of decisions; typing at it means nothing.
test('a permission request offers no free-text answer', () => {
  const { events } = drive('claude-default.ndjson');
  const permission = events.find((event) => event.kind === 'question' && event.question.prompt.startsWith('Run '));
  assert.equal(permission.question.allowFreeText, false);
});

// A crashed CLI has to be recoverable without guessing.
test('a stopped tab can be restarted from the client', async () => {
  const { manager, tabId, spawns } = managerFixture();
  const socket = fakeSocket();
  manager.attach(tabId, socket);
  const launches = () => spawns.filter((call) => call.command !== 'taskkill').length;

  cliChild(spawns).emit('exit', 1);
  await settle();
  assert.equal(socket.sent.filter((m) => m.type === 'status').at(-1).status, 'stopped');

  socket.fire('message', JSON.stringify({ type: 'restart' }));
  await settle();
  assert.equal(launches(), 2);
  assert.equal(manager.runtimes.get(tabId).clients.has(socket), true);
});


// The CLI says nothing at all until it is given a prompt, so waiting for the
// init frame left the list empty until after the first reply. The initialize
// control request answers immediately, and with more detail.
test('the command list arrives before the first prompt', () => {
  const statuses = [];
  const written = [];
  const adapter = new ClaudeAdapter({
    config: defaultConfig,
    write: (message) => written.push(message),
    onEvent: () => {},
    onSession: () => {},
    onStatus: (status) => statuses.push(status)
  });

  adapter.start();
  const asked = written.find((message) => message.request?.subtype === 'initialize');
  assert.ok(asked, 'the adapter should ask for the session details up front');

  adapter.handleLine(JSON.stringify({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: asked.request_id,
      response: {
        commands: [
          { name: 'model', description: 'Change the model', argumentHint: '<model>' },
          { name: 'context', description: 'Show context usage', argumentHint: '' }
        ]
      }
    }
  }));

  const announced = statuses.find((status) => status.commands);
  assert.deepEqual(announced.commands.map((command) => command.name), ['model', 'context']);
  // The hint is what tells the reader that a bare /model does nothing.
  assert.equal(announced.commands[0].argumentHint, '<model>');
  assert.equal(announced.commands[0].description, 'Change the model');
});

test('claude reports its resolved model before the first prompt', () => {
  const statuses = [];
  const written = [];
  const adapter = new ClaudeAdapter({
    config: defaultConfig,
    env: {},
    write: (message) => written.push(message),
    onEvent: () => {},
    onSession: () => {},
    onStatus: (status) => statuses.push(status)
  });

  adapter.start();
  const asked = written.find((message) => message.request?.subtype === 'initialize');
  adapter.handleLine(JSON.stringify({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: asked.request_id,
      response: {
        commands: [],
        models: [
          { value: 'default', resolvedModel: 'claude-sonnet-5' },
          { value: 'opus', resolvedModel: 'claude-opus-5' }
        ]
      }
    }
  }));

  assert.deepEqual(statuses.find((status) => status.model), {
    model: 'claude-sonnet-5', effort: 'auto'
  });
  assert.equal(written.length, 1, 'discovering the model must not send a conversation prompt');
});

// Only the init frame says which commands belong to the local terminal, and
// the CLI's own note is that a remote UI should hide them.
test('terminal-bound commands are dropped once the CLI names them', () => {
  const statuses = [];
  const written = [];
  const adapter = new ClaudeAdapter({
    config: defaultConfig,
    write: (message) => written.push(message),
    onEvent: () => {},
    onSession: () => {},
    onStatus: (status) => statuses.push(status)
  });

  adapter.start();
  const asked = written.find((message) => message.request?.subtype === 'initialize');
  adapter.handleLine(JSON.stringify({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: asked.request_id,
      response: { commands: [{ name: 'compact' }, { name: 'doctor' }, { name: 'color' }] }
    }
  }));
  assert.deepEqual(adapter.commands.map((command) => command.name), ['compact', 'doctor', 'color']);

  adapter.handleLine(JSON.stringify({
    type: 'system',
    subtype: 'init',
    session_id: '00000000-0000-4000-8000-000000000001',
    model: 'claude-sonnet-5',
    slash_commands: ['compact', 'doctor', 'color'],
    terminal_slash_commands: ['doctor', 'color']
  }));
  assert.deepEqual(adapter.commands.map((command) => command.name), ['compact']);
});

test('codex reports only the slash commands the pane can dispatch', () => {
  const adapter = new CodexAdapter({
    config: { ai: {} }, write: () => {}, onEvent: () => {}, onSession: () => {}, onStatus: () => {}
  });
  assert.deepEqual(adapter.commands, [
    'compact', 'review', 'new', 'fork', 'model', 'reasoning', 'mode', 'skills', 'personality', 'permissions'
  ]);
  assert.equal(adapter.commands.includes('plan'), false);
});

test('a codex tab gives its supported slash commands to the pane', () => {
  const { manager, tabId } = managerFixture({
    provider: 'codex', config: { codex_model: 'gpt-5.6-codex', codex_effort: 'high' }
  });
  const socket = fakeSocket();

  manager.attach(tabId, socket);

  assert.deepEqual(socket.sent[0].commands, [
    'compact', 'review', 'new', 'fork', 'model', 'reasoning', 'mode', 'skills', 'personality', 'permissions'
  ]);
  assert.equal(socket.sent[0].model, 'gpt-5.6-codex');
  assert.equal(socket.sent[0].effort, 'high');
});

test('codex publishes the models, reasoning levels, skills and permission profiles it discovers', () => {
  const { adapter, written, statuses } = driveCodex();
  adapter.refreshCapabilities();

  answerCodexRequest(adapter, written, 'model/list', {
    data: [{
      id: 'gpt-5.6-codex', displayName: 'GPT-5.6 Codex', description: 'Coding model',
      isDefault: true, defaultReasoningEffort: 'high', supportsPersonality: true,
      supportedReasoningEfforts: [
        { reasoningEffort: 'medium', description: 'Faster' },
        { reasoningEffort: 'high', description: 'Deeper' }
      ]
    }]
  });
  answerCodexRequest(adapter, written, 'skills/list', {
    data: [{ cwd: 'C:/work', errors: [], skills: [
      { name: 'ui-audit', path: 'C:/skills/ui-audit/SKILL.md', description: 'Audit the UI', enabled: true, scope: 'user' },
      { name: 'disabled', path: 'C:/skills/disabled/SKILL.md', description: 'Off', enabled: false, scope: 'user' }
    ] }]
  });
  answerCodexRequest(adapter, written, 'permissionProfile/list', {
    data: [
      { id: 'workspace', description: 'Workspace access', allowed: true },
      { id: 'blocked', description: 'Unavailable', allowed: false }
    ]
  });
  answerCodexRequest(adapter, written, 'collaborationMode/list', {
    data: [
      { name: 'Default', mode: 'default', model: null, reasoning_effort: null },
      { name: 'Plan', mode: 'plan', model: 'gpt-5.6-codex', reasoning_effort: 'high' }
    ]
  });

  const capabilities = statuses.filter((status) => status.capabilities).at(-1).capabilities;
  assert.equal(capabilities.models[0].id, 'gpt-5.6-codex');
  assert.deepEqual(capabilities.models[0].reasoningEfforts.map((item) => item.id), ['medium', 'high']);
  assert.deepEqual(capabilities.skills.map((skill) => skill.name), ['ui-audit']);
  assert.deepEqual(capabilities.permissionProfiles.map((profile) => profile.id), ['workspace']);
  assert.deepEqual(capabilities.collaborationModes.map((mode) => mode.id), ['default', 'plan']);
  assert.deepEqual(capabilities.personalities, ['none', 'friendly', 'pragmatic']);
});

test('codex sends selected skills as structured app-server input', () => {
  const { adapter, written } = driveCodex();
  answerCodexRequest(adapter, written, 'skills/list', {
    data: [{ cwd: 'C:/work', errors: [], skills: [
      { name: 'ui-audit', path: 'C:/skills/ui-audit/SKILL.md', description: 'Audit the UI', enabled: true, scope: 'user' }
    ] }]
  });

  adapter.sendPrompt('Use $ui-audit to inspect this pane');

  assert.deepEqual(written.at(-1).params.input, [
    { type: 'text', text: 'Use $ui-audit to inspect this pane' },
    { type: 'skill', name: 'ui-audit', path: 'C:/skills/ui-audit/SKILL.md' }
  ]);
});

test('a prompt sent during a codex turn steers that turn', () => {
  const { adapter, written } = driveCodex();
  adapter.handleLine(JSON.stringify({
    jsonrpc: '2.0', method: 'turn/started', params: { turn: { id: 'turn-live' } }
  }));

  adapter.sendPrompt('Also check the tests');

  assert.equal(written.at(-1).method, 'turn/steer');
  assert.deepEqual(written.at(-1).params, {
    threadId: adapter.threadId,
    expectedTurnId: 'turn-live',
    input: [{ type: 'text', text: 'Also check the tests' }]
  });
});

test('codex can fork the current thread without discarding the transcript', () => {
  const { adapter, events, written } = driveCodex();
  const previous = adapter.threadId;

  adapter.sendPrompt('/fork');
  assert.equal(written.at(-1).method, 'thread/fork');
  assert.deepEqual(written.at(-1).params, { threadId: previous });
  adapter.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: written.at(-1).id, result: { thread: { id: 'forked-thread' } }
  }));

  assert.equal(adapter.threadId, 'forked-thread');
  assert.match(events.at(-1).text, /forked/i);
});

test('codex applies personality and a discovered permission profile to later turns', () => {
  const { adapter, events, written } = driveCodex();
  adapter.refreshCapabilities();
  answerCodexRequest(adapter, written, 'permissionProfile/list', {
    data: [{ id: 'workspace', description: 'Workspace access', allowed: true }]
  });

  adapter.sendPrompt('/personality pragmatic');
  adapter.sendPrompt('/permissions workspace');
  adapter.handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: {} }));
  adapter.sendPrompt('continue');

  assert.equal(written.at(-1).params.personality, 'pragmatic');
  assert.equal(written.at(-1).params.permissions, 'workspace');
  assert.match(events.filter((event) => event.kind === 'notice').at(-1).text, /workspace/);
});

test('codex applies a discovered collaboration mode to later turns', () => {
  const { adapter, written } = driveCodex();
  adapter.refreshCapabilities();
  answerCodexRequest(adapter, written, 'collaborationMode/list', {
    data: [{ name: 'Plan', mode: 'plan', model: 'gpt-5.6-codex', reasoning_effort: 'high' }]
  });

  adapter.sendPrompt('/mode plan');
  adapter.handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: {} }));
  adapter.sendPrompt('plan the change');

  assert.deepEqual(written.at(-1).params.collaborationMode, {
    mode: 'plan',
    settings: {
      model: 'gpt-5.6-codex',
      reasoning_effort: 'high',
      developer_instructions: null
    }
  });
  assert.equal(written.at(-1).params.model, undefined);
});

test('codex dispatches supported slash commands through app-server', () => {
  const { adapter, written } = driveCodex();

  adapter.sendPrompt('/compact');
  assert.equal(written.at(-1).method, 'thread/compact/start');
  assert.deepEqual(written.at(-1).params, { threadId: adapter.threadId });

  adapter.sendPrompt('/review');
  assert.equal(written.at(-1).method, 'review/start');
  assert.deepEqual(written.at(-1).params, {
    threadId: adapter.threadId,
    delivery: 'inline',
    target: { type: 'uncommittedChanges' }
  });
});

test('codex changes model and reasoning for later turns without replacing the thread', () => {
  const { adapter, events, statuses, written } = driveCodex();
  const threadId = adapter.threadId;

  adapter.sendPrompt('/model gpt-5.6-codex');
  adapter.sendPrompt('/reasoning high');
  adapter.handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: {} }));
  adapter.sendPrompt('continue the task');

  const request = written.at(-1);
  assert.equal(adapter.threadId, threadId);
  assert.equal(request.method, 'turn/start');
  assert.equal(request.params.threadId, threadId);
  assert.equal(request.params.model, 'gpt-5.6-codex');
  assert.equal(request.params.effort, 'high');
  const notices = events.filter((event) => event.kind === 'notice');
  assert.match(notices.at(-2).text, /Model changed to gpt-5\.6-codex/);
  assert.match(notices.at(-1).text, /Reasoning effort changed to high/);
  assert.deepEqual(
    statuses.filter((status) => status.effort).at(-1),
    { model: 'gpt-5.6-codex', effort: 'high' }
  );
});

test('bare codex model and reasoning commands report the current values', () => {
  const { adapter, events } = driveCodex({
    config: { ai: { codex_model: 'gpt-5.6-codex', codex_effort: 'medium' } }
  });

  adapter.sendPrompt('/model');
  adapter.sendPrompt('/reasoning');

  const notices = events.filter((event) => event.kind === 'notice');
  assert.match(notices.at(-2).text, /Current model: gpt-5\.6-sol/);
  assert.match(notices.at(-1).text, /Current reasoning effort: high/);
});

test('codex rejects an invalid reasoning level without sending it as a prompt', () => {
  const { adapter, events, written } = driveCodex();
  const before = written.length;

  adapter.sendPrompt('/reasoning enormous');

  assert.equal(written.length, before);
  assert.match(events.at(-1).text, /minimal, low, medium, high, or xhigh/);
});

test('new starts a blank conversation in the same codex tab', async () => {
  const { manager, store, pane, tabId, spawns } = managerFixture({ provider: 'codex' });
  const socket = fakeSocket();
  manager.attach(tabId, socket);
  store.appendAiMessages(pane.id, tabId, [{ role: 'user', kind: 'text', text: 'forget me' }]);
  store.setAiSession(pane.id, tabId, 'old-thread');

  socket.fire('message', JSON.stringify({ type: 'prompt', text: '/new' }));
  await settle();

  const tab = store.findAiTab(pane.id, tabId).tab;
  assert.deepEqual(tab.messages, []);
  assert.equal(tab.sessionId, '');
  assert.ok(socket.sent.some((message) => message.type === 'cleared'));
  const launches = spawns.filter((call) => call.command !== 'taskkill');
  assert.equal(launches.length, 2);
});

test('codex leaves unsupported TUI slash commands as plain text', () => {
  const { adapter, written } = driveCodex();
  adapter.handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: {} }));

  adapter.sendPrompt('/plan');

  const request = written.at(-1);
  assert.equal(request.method, 'turn/start');
  assert.deepEqual(request.params.input, [{ type: 'text', text: '/plan' }]);
});

test('a tab hands its command list to every client', async () => {
  const { manager, tabId, spawns } = managerFixture();
  const socket = fakeSocket();
  manager.attach(tabId, socket);
  assert.deepEqual(socket.sent[0].commands, []);

  const child = cliChild(spawns);
  const asked = JSON.parse(child.written.join('').trim().split('\n')[0]);
  assert.equal(asked.request.subtype, 'initialize');
  child.stdout.write(JSON.stringify({
    type: 'control_response',
    response: { subtype: 'success', request_id: asked.request_id, response: { commands: [{ name: 'compact' }] } }
  }) + '\n');
  await settle();

  const announced = socket.sent.filter((message) => message.type === 'commands').at(-1);
  assert.deepEqual(announced.commands.map((command) => command.name), ['compact']);
  // A client that joins later gets the same list without waiting for a frame.
  const second = fakeSocket();
  manager.attach(tabId, second);
  assert.deepEqual(second.sent[0].commands.map((command) => command.name), ['compact']);
});


// The transcript belongs to the conversation the tab was following. Pointing
// it at another one replaces that record rather than mixing the two, and the
// CLI still holds the real history.
test('resuming an earlier session replaces the transcript and restarts the CLI', async () => {
  const { manager, store, pane, tabId, spawns } = managerFixture();
  manager.attach(tabId, fakeSocket());
  store.appendAiMessages(pane.id, tabId, [{ role: 'user', kind: 'text', text: 'the old conversation' }]);

  assert.equal(manager.resumeSession(pane.id, tabId, 'session-from-yesterday', 'fix the retry helper'), true);
  await settle();

  const tab = store.findAiTab(pane.id, tabId).tab;
  assert.equal(tab.sessionId, 'session-from-yesterday');
  assert.equal(tab.messages.some((event) => event.text === 'the old conversation'), false);
  assert.match(tab.messages.at(-1).text, /fix the retry helper/);
  assert.equal(tab.messages.at(-1).kind, 'notice');
  // The replacement process is told to resume the chosen conversation.
  const relaunch = spawns.filter((call) => call.command !== 'taskkill').at(-1);
  assert.match(relaunch.args.join(' '), /--resume session-from-yesterday/);
});

// The tab lost its own view of the conversation, but the CLI already wrote it
// to disk; resuming reads that file back so the pane is not left with just a
// note that something continues off-screen.
test('resuming an earlier session shows the transcript the CLI already wrote', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-claude-home-'));
  const { manager, store, pane, tabId } = managerFixture({ env: { CLAUDE_CONFIG_DIR: home } });
  store.setAiTabCwd(pane.id, tabId, manager.root);
  manager.attach(tabId, fakeSocket());

  const dir = path.join(home, 'projects', manager.root.replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'session-from-yesterday.jsonl'), [
    { type: 'user', cwd: manager.root, message: { content: [{ type: 'text', text: 'fix the retry helper' }] } },
    { type: 'assistant', cwd: manager.root, message: { content: [{ type: 'text', text: 'done, tests pass' }] } }
  ].map((record) => JSON.stringify(record)).join('\n') + '\n');

  assert.equal(manager.resumeSession(pane.id, tabId, 'session-from-yesterday', 'fix the retry helper'), true);
  await settle();

  const tab = store.findAiTab(pane.id, tabId).tab;
  assert.deepEqual(tab.messages.map((event) => `${event.role}:${event.kind}:${event.text}`), [
    'user:text:fix the retry helper',
    'assistant:text:done, tests pass',
    'system:notice:Now continuing an earlier conversation: fix the retry helper'
  ]);
});

// claude records a slash command it ran locally the same way as a real turn,
// wrapped in tags the CLI itself recognises; showing that wrapper as if the
// user had typed it would be as misleading as the notice this whole feature
// replaced.
test('resuming a claude session leaves out the CLI\'s own local-command records', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-claude-home-'));
  const { manager, store, pane, tabId } = managerFixture({ env: { CLAUDE_CONFIG_DIR: home } });
  store.setAiTabCwd(pane.id, tabId, manager.root);
  manager.attach(tabId, fakeSocket());

  const dir = path.join(home, 'projects', manager.root.replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'session-with-caveat.jsonl'), [
    { type: 'user', cwd: manager.root, message: { content: [{ type: 'text', text: '<local-command-caveat>Caveat: ...</local-command-caveat>' }] } },
    { type: 'user', cwd: manager.root, message: { content: [{ type: 'text', text: '<command-name>/login</command-name>' }] } },
    { type: 'user', cwd: manager.root, message: { content: [{ type: 'text', text: 'why does claude keep logging out' }] } },
    { type: 'assistant', cwd: manager.root, message: { content: [{ type: 'text', text: 'the token expired' }] } }
  ].map((record) => JSON.stringify(record)).join('\n') + '\n');

  assert.equal(manager.resumeSession(pane.id, tabId, 'session-with-caveat', ''), true);
  await settle();

  const tab = store.findAiTab(pane.id, tabId).tab;
  assert.deepEqual(tab.messages.map((event) => `${event.role}:${event.text}`), [
    'user:why does claude keep logging out',
    'assistant:the token expired',
    'system:Now continuing an earlier conversation.'
  ]);
});

// codex logs a real turn twice: once as event_msg, the clean record of what
// was actually said, and once as response_item, which also carries whatever
// context codex injected ahead of it (AGENTS.md, recommended plugins). Only
// the former is safe to show back to the user.
test('resuming a codex session leaves out injected AGENTS.md and plugin context', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-codex-home-'));
  const { manager, store, pane, tabId } = managerFixture({ provider: 'codex', env: { CODEX_HOME: home } });
  store.setAiTabCwd(pane.id, tabId, manager.root);
  manager.attach(tabId, fakeSocket());

  const dir = path.join(home, 'sessions', '2026', '08', '25');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'rollout-2026-08-25T09-00-00-session-from-yesterday.jsonl'), [
    { type: 'session_meta', payload: { id: 'session-from-yesterday', cwd: manager.root } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<recommended_plugins>\nHere is a list...' }] } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'add a bookmark feature' }] } },
    { type: 'event_msg', payload: { type: 'user_message', message: 'add a bookmark feature' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'thinking about it' }] } },
    { type: 'event_msg', payload: { type: 'agent_message', phase: 'commentary', message: 'thinking about it' } },
    { type: 'event_msg', payload: { type: 'agent_message', phase: 'final_answer', message: 'added the bookmark toggle' } }
  ].map((record) => JSON.stringify(record)).join('\n') + '\n');

  assert.equal(manager.resumeSession(pane.id, tabId, 'session-from-yesterday', ''), true);
  await settle();

  const tab = store.findAiTab(pane.id, tabId).tab;
  assert.deepEqual(tab.messages.map((event) => `${event.role}:${event.text}`), [
    'user:add a bookmark feature',
    'assistant:added the bookmark toggle',
    'system:Now continuing an earlier conversation.'
  ]);
});

test('resuming a tab that has never been started just records the choice', () => {
  const { manager, store, pane, tabId, spawns } = managerFixture();

  assert.equal(manager.resumeSession(pane.id, tabId, 'session-x', ''), true);

  assert.equal(store.findAiTab(pane.id, tabId).tab.sessionId, 'session-x');
  // Nothing was running, so nothing had to be stopped or started.
  assert.equal(spawns.length, 0);
});

test('resuming an unknown tab reports failure', () => {
  const { manager, pane } = managerFixture();
  assert.equal(manager.resumeSession(pane.id, 'no-such-tab', 'session-x', ''), false);
});
