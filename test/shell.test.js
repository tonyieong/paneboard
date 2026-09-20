const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveCmdShell, shellEnv, shellKind, shellTitle } = require('../src/shell');

for (const kind of ['cmd', 'powershell', 'fallback']) {
  test(`${kind} starts when its folder is the last PATH entry`, { skip: process.platform !== 'win32' }, () => {
    const system32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
    env.Path = kind === 'cmd' ? system32 : `${system32};${path.join(system32, 'WindowsPowerShell', 'v1.0')}`;
    // Use a child so the restricted PATH cannot affect other tests. The native
    // PTY reads this process environment, independently of its spawn options.
    const script = `
      const assert = require('node:assert/strict');
      const { resolveCmdShell, resolveShell } = require('./src/shell');
      const pty = require('@homebridge/node-pty-prebuilt-multiarch');
      const kind = process.argv[1];
      const shell = kind === 'cmd' ? resolveCmdShell() : resolveShell({ shell: {
        preferred: kind === 'fallback' ? 'paneboard-missing-shell.exe' : 'powershell.exe',
        fallback: 'powershell.exe', args: ['-NoProfile', '-Command', 'Write-Output PANEBOARD_PTY_OK']
      } });
      const proc = pty.spawn(shell.command, kind === 'cmd' ? ['/d', '/c', 'echo PANEBOARD_PTY_OK'] : shell.args,
        { cols: 100, rows: 30, cwd: process.cwd(), env: process.env, useConptyDll: false });
      let output = '';
      proc.onData((data) => { output += data; });
      proc.onExit(({ exitCode }) => {
        assert.equal(exitCode, 0);
        assert.match(output, /PANEBOARD_PTY_OK/);
        process.exit(0);
      });
    `;
    const result = spawnSync(process.execPath, ['-e', script, kind], {
      cwd: path.join(__dirname, '..'), env, encoding: 'utf8', timeout: 30000, windowsHide: true
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  });
}

test('extra_path folders are appended to PATH for the shell', () => {
  const env = shellEnv(
    { shell: { extra_path: ['C:\\Users\\someone\\AppData\\Roaming\\npm'] } },
    { PATH: 'C:\\Windows\\system32', TERM: 'xterm-256color' }
  );

  assert.equal(env.PATH, `C:\\Windows\\system32${path.delimiter}C:\\Users\\someone\\AppData\\Roaming\\npm`);
  assert.equal(env.TERM, 'xterm-256color');
});

test('shell env leaves PATH alone when there is nothing to add', () => {
  const base = { PATH: 'C:\\Windows\\system32' };

  assert.equal(shellEnv({}, base).PATH, base.PATH);
  assert.equal(shellEnv({ shell: { extra_path: [] } }, base).PATH, base.PATH);
  assert.equal(shellEnv({ shell: { extra_path: ['  '] } }, base).PATH, base.PATH);
  // Already on PATH, in the casing Windows happens to have stored.
  assert.equal(shellEnv({ shell: { extra_path: ['c:\\windows\\SYSTEM32'] } }, base).PATH, base.PATH);
});

// Windows spells the variable Path, and node-pty passes the environment through
// verbatim, so appending to a new PATH key would leave a second, ignored copy.
test('shell env extends the PATH variable Windows actually set', () => {
  const env = shellEnv(
    { shell: { extra_path: ['C:\\tools'] } },
    { Path: 'C:\\Windows\\system32' }
  );

  assert.equal(env.Path, `C:\\Windows\\system32${path.delimiter}C:\\tools`);
  assert.equal('PATH' in env, false);
});

test('shell kind only accepts the two shells a pane can run', () => {
  assert.equal(shellKind('cmd'), 'cmd');
  assert.equal(shellKind('powershell'), 'powershell');
  assert.equal(shellKind('bash'), 'powershell');
  assert.equal(shellKind(undefined), 'powershell');
  assert.equal(shellTitle('cmd'), 'CMD');
  assert.equal(shellTitle('powershell'), 'PowerShell');
});

// shell.preferred, shell.fallback and shell.args all describe PowerShell
// switches, so a cmd pane must ignore them rather than hand them to cmd.exe.
test('cmd panes run cmd.exe with no arguments of their own', () => {
  const cmd = resolveCmdShell();

  assert.match(cmd.command, /cmd\.exe$/i);
  assert.deepEqual(cmd.args, []);
});
