'use strict';

// Records the raw wire protocol of the Claude Code and Codex CLIs so the AI pane
// adapters can be written against real frames instead of guessed field names.
// Every line the CLI emits is appended verbatim to a fixture file under
// test/fixtures; the summary printed to stdout is only a reading aid.
//
//   node scripts/ai-protocol-probe.js claude [--mode <permission-mode>]
//   node scripts/ai-protocol-probe.js codex
//
// The probe asks the agent to run one harmless command and then to ask a
// question back, which is what exercises the permission and choice paths.

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const TIMEOUT_MS = 180000;
const FIXTURE_DIR = path.join(__dirname, '..', 'test', 'fixtures');

const PROMPT = [
  'Do exactly two things, in order.',
  '1. Use the Write tool to create a file called probe.txt in the current directory containing the single word: probe-ok',
  '2. Then use the AskUserQuestion tool to ask me whether I prefer tabs or spaces for indentation.',
  'Do not do anything else.'
].join('\n');

function parseArgs(argv) {
  const target = argv[2];
  const options = {};
  for (let index = 3; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      options.mode = argv[index + 1];
      index += 1;
    }
    if (arg === '--suggest') {
      options.suggest = true;
    }
    if (arg === '--prompt') {
      options.prompt = argv[index + 1];
      index += 1;
    }
    if (arg === '--partial') {
      options.partial = true;
    }
  }
  return { target, options };
}

function probeCwd() {
  const dir = path.join(os.tmpdir(), 'wps7-ai-probe');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// claude and codex are npm shims, so on Windows they only resolve through the
// command interpreter -- the same trick src/usage.js uses for the usage pane.
function cliProcess(commandLine) {
  if (process.platform === 'win32') {
    return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', commandLine] };
  }
  const [command, ...args] = commandLine.split(' ');
  return { command, args };
}

function createRecorder(name) {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const file = path.join(FIXTURE_DIR, name);
  const stream = fs.createWriteStream(file, { flags: 'w' });
  return {
    file,
    write(line) {
      stream.write(`${line}\n`);
    },
    close() {
      stream.end();
    }
  };
}

function summarize(message) {
  if (message.type === 'assistant') {
    const kinds = (message.message?.content || []).map((block) => block.type).join(', ');
    return `assistant [${kinds}]`;
  }
  if (message.type === 'user') {
    const kinds = (message.message?.content || []).map((block) => block.type).join(', ');
    return `user [${kinds}]`;
  }
  if (message.type === 'system') {
    return `system subtype=${message.subtype} session=${message.session_id} model=${message.model}`;
  }
  if (message.type === 'result') {
    return `result subtype=${message.subtype}`;
  }
  if (message.type === 'control_request') {
    return `control_request ${JSON.stringify(message).slice(0, 4000)}`;
  }
  return message.type || JSON.stringify(message).slice(0, 200);
}

function probeClaude(options) {
  const { mode } = options;
  const permissionMode = mode || 'default';
  const flags = [
    'claude --print',
    '--output-format stream-json',
    '--input-format stream-json',
    '--verbose',
    '--permission-prompt-tool stdio',
    '--replay-user-messages',
    `--permission-mode ${permissionMode}`
  ];
  if (permissionMode === 'bypassPermissions') {
    flags.push('--allow-dangerously-skip-permissions');
  }
  if (options.partial) {
    // Streams content_block_delta frames for the reply as it is generated,
    // instead of only the completed text block at the end.
    flags.push('--include-partial-messages');
  }
  const cli = cliProcess(flags.join(' '));
  const recorder = createRecorder(`claude-${permissionMode}${options.suggest ? '-suggest' : ''}${options.partial ? '-partial' : ''}.ndjson`);
  console.log(`# ${flags.join(' ')}`);
  console.log(`# recording to ${recorder.file}\n`);

  const child = spawn(cli.command, cli.args, {
    cwd: probeCwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });

  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const lines = readline.createInterface({ input: child.stdout });
  const timer = setTimeout(() => finish('timed out'), TIMEOUT_MS);
  let settled = false;

  function finish(reason) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    console.log(`\n# done: ${reason}`);
    recorder.close();
    lines.close();
    try {
      child.stdin.end();
      child.kill();
    } catch (error) {}
  }

  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  child.on('error', (error) => finish(`spawn failed: ${error.message}`));
  child.on('exit', (code) => finish(`cli exited with ${code}`));

  lines.on('line', (line) => {
    recorder.write(line);
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      console.log(`!! unparsable: ${line.slice(0, 200)}`);
      return;
    }
    console.log(summarize(message));
    if (message.type === 'control_request') {
      // Answering keeps the run moving; the recorded request is the point.
      const requestId = message.request_id || message.requestId || message.request?.request_id;
      const request = message.request || {};
      const response = { behavior: 'allow' };
      if (options.suggest && request.permission_suggestions?.length) {
        // Probing whether taking the CLI's own suggestion is accepted, and
        // whether it really stops the next identical request.
        response.updatedPermissions = request.permission_suggestions;
      }
      if (request.tool_name === 'AskUserQuestion') {
        // Probing how an answer must be shaped: the tool input carries an
        // `answers` map, so allowing without it reads as "did not answer".
        const questions = request.input?.questions || [];
        const answers = {};
        for (const question of questions) {
          answers[question.question] = question.options?.[0]?.label || '';
        }
        response.updatedInput = { ...request.input, answers };
      }
      console.log(`   -> allow request_id=${requestId} ${JSON.stringify(response.updatedInput || {})}`);
      const reply = {
        type: 'control_response',
        response: { subtype: 'success', request_id: requestId, response }
      };
      recorder.write(`>> ${JSON.stringify(reply)}`);
      send(reply);
      return;
    }
    if (message.type === 'result') {
      finish('result received');
    }
  });

  send({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: options.prompt || PROMPT }] } });
}

function probeCodex() {
  const cli = cliProcess('codex app-server');
  const recorder = createRecorder('codex-app-server.jsonl');
  console.log('# codex app-server');
  console.log(`# recording to ${recorder.file}\n`);

  const child = spawn(cli.command, cli.args, {
    cwd: probeCwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });

  const send = (message) => {
    recorder.write(`>> ${JSON.stringify(message)}`);
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  const lines = readline.createInterface({ input: child.stdout });
  const timer = setTimeout(() => finish('timed out'), TIMEOUT_MS);
  let settled = false;
  let threadId = '';

  function finish(reason) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    console.log(`\n# done: ${reason}`);
    recorder.close();
    lines.close();
    try {
      child.stdin.end();
      child.kill();
    } catch (error) {}
  }

  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  child.on('error', (error) => finish(`spawn failed: ${error.message}`));
  child.on('exit', (code) => finish(`cli exited with ${code}`));

  lines.on('line', (line) => {
    recorder.write(line);
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      console.log(`!! unparsable: ${line.slice(0, 200)}`);
      return;
    }
    if (message.method && message.id !== undefined) {
      console.log(`request ${message.method} ${JSON.stringify(message.params).slice(0, 3000)}`);
      // Approve whatever it asks so the turn can finish and be recorded.
      send({ jsonrpc: '2.0', id: message.id, result: { decision: 'accept' } });
      return;
    }
    if (message.method) {
      console.log(`notify ${message.method} ${JSON.stringify(message.params).slice(0, 600)}`);
      if (message.method === 'turn/completed') {
        finish('turn completed');
      }
      return;
    }
    console.log(`response id=${message.id} ${JSON.stringify(message.result || message.error).slice(0, 600)}`);
    if (message.id === 1) {
      send({ method: 'initialized', params: {} });
      send({ method: 'thread/start', id: 2, params: {} });
      return;
    }
    if (message.id === 2) {
      threadId = message.result?.thread?.id || message.result?.threadId || '';
      console.log(`# threadId=${threadId}`);
      send({
        method: 'turn/start',
        id: 3,
        params: { threadId, input: [{ type: 'text', text: PROMPT }] }
      });
    }
  });

  send({
    method: 'initialize',
    id: 1,
    params: { clientInfo: { name: 'wps7-probe', title: 'WPS7 probe', version: '0.1.0' } }
  });
}

const { target, options } = parseArgs(process.argv);
if (target === 'claude') {
  probeClaude(options);
} else if (target === 'codex') {
  probeCodex();
} else {
  console.error('usage: node scripts/ai-protocol-probe.js <claude|codex> [--mode <permission-mode>]');
  process.exit(1);
}
