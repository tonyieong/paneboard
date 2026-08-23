const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const packageJson = require('../package.json');
const { setWindowsGuiSubsystem, subsystemOffset } = require('../scripts/set-windows-subsystem');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const traySource = fs.readFileSync(path.join(__dirname, '..', 'src', 'tray.js'), 'utf8');
const startupInstallerSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'install-wps7-startup.ps1'), 'utf8');

test('Windows package includes the bundled ConPTY runtime', () => {
  const assets = packageJson.pkg?.assets || [];
  assert.ok(
    assets.includes('node_modules/@homebridge/node-pty-prebuilt-multiarch/build/Release/conpty/**/*'),
    'pkg assets must include conpty.dll and OpenConsole.exe'
  );
  assert.ok(
    assets.includes('node_modules/@homebridge/node-pty-prebuilt-multiarch/build/Release/*.node'),
    'pkg assets must include the native node-pty modules'
  );
});

test('portable Windows restart waits for the old process before relaunching', () => {
  const waitIndex = mainSource.indexOf('Wait-Process -Id $ParentPid');
  const startIndex = mainSource.indexOf('Start-Process -FilePath $Executable');
  assert.ok(waitIndex >= 0, 'restart helper must wait for the parent process');
  assert.ok(startIndex > waitIndex, 'replacement must start after the parent exits');
  assert.match(mainSource, /spawn\('powershell\.exe'/);
});

test('portable tray includes the common status, logs and diagnostics actions', () => {
  for (const label of ['Status: running', 'Open Web UI', 'Save Now', 'Restart wps7', 'View Logs', 'Diagnostics', 'Exit']) {
    assert.match(traySource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('portable tray module remains valid JavaScript for pkg discovery', () => {
  assert.doesNotThrow(() => require('../src/tray'));
});

// The packaged exe runs on the windows subsystem with no console, so console
// output disappears. A tray that dies has to say so in data/runtime.log, or the
// server keeps running with no icon and nothing explaining why.
test('tray diagnostics reach the runtime log rather than a missing console', () => {
  assert.doesNotMatch(traySource, /console\.(error|log|warn)/);
  assert.match(traySource, /child\.on\('error'/);
  assert.match(traySource, /log\(`started pid=/);
  assert.match(traySource, /child\.on\('exit', \(code, signal\) => \{\s*\n\s*log\(`exited code=/);
  assert.match(mainSource, /log: \(message\) => appendRuntimeLog\(root, `tray \$\{message\}`\)/);
});

// Losing the icon strands a server that has no console and no other UI, so the
// tray is relaunched — but a tray that cannot start must not be retried forever.
test('a tray that dies on its own is relaunched, within a limit', () => {
  assert.match(traySource, /restartTimer = setTimeout\(launch, TRAY_RESTART_DELAY_MS\)/);
  assert.match(traySource, /if \(failures > TRAY_RESTART_LIMIT\)/);
  assert.match(traySource, /failures = Date\.now\(\) - startedAt >= TRAY_HEALTHY_MS \? 1 : failures \+ 1/);
  // Shutdown kills the tray itself; relaunching it there would strand a child.
  assert.match(traySource, /if \(stopping\) \{\s*\n\s*return;/);
  assert.match(traySource, /kill\(exitNode = true\) \{\s*\n\s*stopping = true;/);
  assert.match(traySource, /clearTimeout\(restartTimer\)/);
});

test('the tray Exit item stops the server', () => {
  assert.match(traySource, /\$exitItem = \$menu\.Items\.Add\('Exit'\)/);
  assert.match(traySource, /\$exitItem\.add_Click\(\{ \[Console\]::Out\.WriteLine\('exit'\)/);
  assert.match(traySource, /line === 'exit'\)\s*\{\s*\n\s*shutdown\(\);/);
  assert.match(mainSource, /shutdown: \(\) => stopRuntime\(\)/);
});

// A Windows service runs in session 0, where it has no interactive desktop and
// no access to the signed-in user's profile. Starting at logon instead is what
// puts terminal panes, GUI programs and CLI credentials in one session.
test('startup installs a logon shortcut rather than a service', () => {
  assert.match(startupInstallerSource, /\$runtimeRoot = Resolve-Wps7RuntimeRoot/);
  assert.match(startupInstallerSource, /\$shortcut\.TargetPath = \$executable/);
  assert.match(startupInstallerSource, /\$shortcut\.WorkingDirectory = \$runtimeRoot/);
  // Comments explain the removed service, so only the code is checked for it.
  const installerCode = startupInstallerSource.split(/\r?\n/).filter((line) => !line.trim().startsWith('#')).join('\n');
  assert.doesNotMatch(installerCode, /nssm|New-Service|Register-ScheduledTask/i);
  // No service account means nothing has to ask for a Windows password.
  assert.doesNotMatch(installerCode, /-AsSecureString|ObjectName/);
  // Exposing a PowerShell gateway on a LAN without a password stays refused.
  assert.match(startupInstallerSource, /auth\.password_hash/);
});

test('startup clears a previous service installation', () => {
  const uninstallSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'uninstall-wps7-startup.ps1'), 'utf8');
  assert.match(startupInstallerSource, /uninstall-wps7-startup\.ps1/);
  assert.match(startupInstallerSource, /Get-Service -Name 'wps7-server'/);
  for (const task of ['wps7-service-start', 'wps7-service-restart', 'wps7-service-stop']) {
    assert.ok(uninstallSource.includes(task), `${task} must be removed on uninstall`);
  }
  assert.match(uninstallSource, /sc\.exe delete wps7-server/);
  assert.match(uninstallSource, /Remove-NetFirewallRule/);
  // Only the steps that change machine state elevate; removing a shortcut does not.
  assert.match(uninstallSource, /if \(\$legacyService -or \$legacyTaskNames\.Count -gt 0 -or \$firewallRules\.Count -gt 0\)/);
});

test('moved installations include a path repair command', () => {
  const repairPath = path.join(__dirname, '..', 'scripts', 'repair-wps7-paths.ps1');
  assert.ok(fs.existsSync(repairPath), 'repair-wps7-paths.ps1 must exist');
  const repairSource = fs.readFileSync(repairPath, 'utf8');
  assert.equal(packageJson.scripts['startup:repair'], 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\repair-wps7-paths.ps1');
  assert.match(repairSource, /\$shortcut\.TargetPath = \$executable/);
  assert.match(repairSource, /wps7\.lnk/);
  // The shortcut is the only registration left, so repairing it needs no rights.
  assert.doesNotMatch(repairSource, /RunAs|Register-ScheduledTask|nssm/i);
});

test('the service stack is gone from the scripts and the npm commands', () => {
  const scripts = fs.readdirSync(path.join(__dirname, '..', 'scripts'));
  for (const removed of ['install-nssm.ps1', 'control-wps7-service.ps1', 'wps7-tray-companion.ps1']) {
    assert.ok(!scripts.includes(removed), `${removed} must not come back`);
  }
  assert.equal(packageJson.scripts['nssm:install'], undefined);
  // Both runtime modes existed for the service: NSSM owned the restart, and it
  // set WPS7_HEADLESS=1 because session 0 could not show a tray icon. Nothing
  // sets either now, so the server must not read them.
  assert.doesNotMatch(mainSource, /WPS7_SERVICE_MANAGED|serviceManaged|WPS7_HEADLESS|isHeadlessMode/);
  // The tray is unconditional, which is the whole point of running at logon.
  // It sits inside the listen-success callback of the port-fallback retry
  // helper, one indent level deeper than the old direct server.listen() call.
  assert.match(mainSource, /^ {6}trayController = startTray\(\{$/m);
});

test('Windows packaging refreshes generated folders without nesting them', () => {
  const command = packageJson.scripts['package:win'];
  assert.match(command, /Copy-Item scripts\\\* dist\\scripts/);
  assert.match(command, /Copy-Item assets\\\* dist\\assets/);
  assert.match(command, /Copy-Item plugin-panes\\\* dist\\plugin-panes/);
  // tools/ held nothing but the downloaded nssm.exe, so packaging no longer
  // has a directory to copy or an asset glob to embed.
  assert.doesNotMatch(command, /tools/);
  assert.ok(!(packageJson.pkg?.assets || []).includes('tools/**/*'));
});

test('Windows packaging clears stale nested resource folders', () => {
  const command = packageJson.scripts['package:win'];
  assert.match(command, /Remove-Item 'dist\\scripts\\scripts','dist\\assets\\assets','dist\\plugin-panes\\plugin-panes' -Recurse -Force -ErrorAction SilentlyContinue/);
});

test('packaging leaves the executable on the windows subsystem', { skip: process.platform !== 'win32' }, () => {
  assert.match(packageJson.scripts['package:win'], /node scripts\\set-windows-subsystem\.js dist\\wps7\.exe/);

  // The packaged exe is pkg's Node base with the project appended, so the base
  // this suite runs on carries the subsystem packaging has to rewrite. Only the
  // headers are needed, and the binary is far too large to copy for that.
  const head = Buffer.alloc(4096);
  const handle = fs.openSync(process.execPath, 'r');
  try {
    fs.readSync(handle, head, 0, head.length, 0);
  } finally {
    fs.closeSync(handle);
  }
  assert.equal(head.readUInt16LE(subsystemOffset(head)), 3, 'the pkg base is a console binary');

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-subsystem-'));
  try {
    // hostname.exe is a small console program, so the rewrite can be applied to
    // a real binary and the result actually run.
    const copy = path.join(directory, 'stand-in.exe');
    fs.copyFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'hostname.exe'), copy);
    const offset = subsystemOffset(fs.readFileSync(copy));

    assert.equal(setWindowsGuiSubsystem(copy), true);
    assert.equal(fs.readFileSync(copy).readUInt16LE(offset), 2);
    assert.equal(setWindowsGuiSubsystem(copy), false, 'rewriting an already patched exe is a no-op');
    assert.equal(spawnSync(copy).status, 0, 'the rewritten binary still runs');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a fatal error saves state and logs before the process exits', () => {
  assert.match(mainSource, /process\.on\('uncaughtException'/);
  assert.match(mainSource, /process\.on\('unhandledRejection'/);
  const handlerIndex = mainSource.indexOf('function handleFatalError');
  const saveIndex = mainSource.indexOf('store.save()', handlerIndex);
  const exitIndex = mainSource.indexOf('process.exit(1)', handlerIndex);
  assert.ok(handlerIndex >= 0, 'main must install a fatal error handler');
  assert.ok(saveIndex > handlerIndex && exitIndex > saveIndex, 'state must be saved before exiting');
});

test('request errors never send a stack trace to the client', () => {
  const handlerIndex = mainSource.indexOf('app.use((error, req, res, next)');
  assert.ok(handlerIndex >= 0, 'main must install an Express error handler');

  const lastRouteIndex = mainSource.lastIndexOf("app.post('/api/files/upload'");
  const websocketIndex = mainSource.indexOf('new WebSocketServer');
  assert.ok(handlerIndex > lastRouteIndex, 'the handler must come after the routes it protects');
  assert.ok(handlerIndex < websocketIndex, 'the handler must be installed before the server starts');

  // Express's built-in handler puts error.stack in the response body, which
  // exposes absolute paths from the host. A malformed JSON body reaches it.
  const handler = mainSource.slice(handlerIndex, websocketIndex);
  assert.doesNotMatch(handler, /error\.stack/);
  assert.doesNotMatch(handler, /error:\s*error\.message/);
  assert.match(handler, /res\.status\(status\)\.json/);
});

test('the redistributable ships its license notices', () => {
  const root = path.join(__dirname, '..');
  for (const file of ['LICENSE', 'THIRD-PARTY-LICENSES.md']) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} must exist`);
  }
  assert.equal(packageJson.license, 'MIT');
  const notices = fs.readFileSync(path.join(root, 'THIRD-PARTY-LICENSES.md'), 'utf8');
  for (const dependency of Object.keys(packageJson.dependencies)) {
    assert.ok(notices.includes(`### ${dependency}@`), `${dependency} must appear in THIRD-PARTY-LICENSES.md`);
  }
  for (const dependency of ['@xterm/addon-serialize', '@xterm/headless', 'rc']) {
    const start = notices.indexOf(`### ${dependency}@`);
    const end = notices.indexOf('\n### ', start + 1);
    const section = notices.slice(start, end === -1 ? undefined : end);
    assert.match(section, /```/, `${dependency} must include its license text`);
  }

  const runtimeLicense = path.join(root, 'licenses', 'node-v22.23.2-LICENSE');
  const fontLicense = path.join(root, 'licenses', 'OFL-1.1.txt');
  const excalidrawNotice = path.join(
    root,
    'plugin-panes',
    'whiteboard',
    'assets',
    'excalidraw',
    'excalidraw-with-preact.production.min.js.LICENSE.txt'
  );
  for (const file of [runtimeLicense, fontLicense, excalidrawNotice]) {
    assert.ok(fs.existsSync(file), `${path.relative(root, file)} must exist`);
  }
  assert.match(notices, /## Embedded Node\.js runtime[\s\S]*### Node\.js v22\.23\.2/);
  assert.match(notices, /Node\.js is licensed for use as follows:/);
  assert.match(notices, /SIL OPEN FONT LICENSE\s+Version 1\.1/);
  assert.match(notices, /regenerator-runtime -- Copyright \(c\) 2014-present/);
});
