'use strict';

// Turns a raw ai-protocol-probe recording into a fixture safe to commit: the
// probe captures the operator's home path, session ids and the full list of
// their installed skills and plugins, none of which belongs in a public repo
// and none of which the adapter tests read.
//
//   node scripts/ai-fixture-sanitize.js <recording> <fixture>

const fs = require('fs');
const path = require('path');

// Fields the init frame carries purely to describe the local install.
const DROP_INIT_FIELDS = [
  'tools', 'mcp_servers', 'slash_commands', 'terminal_slash_commands',
  'agents', 'skills', 'plugins', 'memory_paths', 'output_style'
];

const IDS = new Map();

function fakeId(value, prefix, width) {
  if (!IDS.has(value)) {
    IDS.set(value, `${prefix}${String(IDS.size + 1).padStart(width, '0')}`);
  }
  return IDS.get(value);
}

function scrub(value, key) {
  if (typeof value === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      // Keeps the replacement a well-formed UUID so parsers that check the
      // shape behave the same against the fixture as against the real thing.
      return fakeId(value, '00000000-0000-4000-8000-', 12);
    }
    if (/^(toolu|msg|req|rs)_/.test(value)) {
      return fakeId(value, `${value.split('_')[0]}_`, 8);
    }
    return value
      .replace(/[A-Za-z]:\\Users\\[^\\"]+/g, 'C:\\Users\\user')
      .replace(/\/home\/[^/"]+/g, '/home/user');
  }
  if (Array.isArray(value)) {
    return value.map((entry) => scrub(entry, key));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [name, entry] of Object.entries(value)) {
      out[name] = scrub(entry, name);
    }
    return out;
  }
  return value;
}

function sanitizeLine(line) {
  const outbound = line.startsWith('>> ');
  const body = outbound ? line.slice(3) : line;
  let message;
  try {
    message = JSON.parse(body);
  } catch (error) {
    return null;
  }
  if (message.type === 'system' && message.subtype === 'init') {
    for (const field of DROP_INIT_FIELDS) {
      delete message[field];
    }
  }
  if (message.result?.thread) {
    delete message.result.thread.path;
  }
  const cleaned = JSON.stringify(scrub(message));
  return outbound ? `>> ${cleaned}` : cleaned;
}

const [source, target] = process.argv.slice(2);
if (!source || !target) {
  console.error('usage: node scripts/ai-fixture-sanitize.js <recording> <fixture>');
  process.exit(1);
}

const lines = fs.readFileSync(source, 'utf8').split('\n').filter(Boolean);
const output = lines.map(sanitizeLine).filter(Boolean);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${output.join('\n')}\n`);
console.log(`${source} -> ${target} (${output.length}/${lines.length} lines)`);
