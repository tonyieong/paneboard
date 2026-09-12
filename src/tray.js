const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const SysTrayModule = require('systray2');

const SysTray = SysTrayModule.default || SysTrayModule;

// A tray that survives this long was usable, so the next death is treated as
// a fresh problem rather than part of a failing run.
const TRAY_HEALTHY_MS = 30000;
const TRAY_RESTART_DELAY_MS = 2000;
const TRAY_RESTART_LIMIT = 5;

function startTray({ root, url, port, save, openBrowser, restart, shutdown, log = () => {} }) {
  if (process.platform === 'win32') {
    return startWindowsNotifyIconTray({ root, url, port, save, openBrowser, restart, shutdown, log });
  }
  return startPortableTray({ root, url, port, save, openBrowser, restart, shutdown, log });
}

function startWindowsNotifyIconTray({ root, url, port, save, openBrowser, restart, shutdown, log }) {
  const trayDir = path.join(root, 'data', 'tray');
  fs.mkdirSync(trayDir, { recursive: true });
  const scriptPath = path.join(trayDir, 'paneboard-notifyicon.ps1');
  fs.writeFileSync(scriptPath, windowsNotifyIconScript(), 'utf8');
  const iconPath = realIconPath(root);

  let child = null;
  let stopping = false;
  let failures = 0;
  let restartTimer = null;

  function launch() {
    const startedAt = Date.now();
    let stdout = '';
    child = spawn('powershell.exe', [
      '-NoProfile',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-IconPath',
      iconPath,
      '-Root',
      root,
      '-Url',
      url,
      '-Port',
      String(port),
      '-ServerPid',
      String(process.pid)
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() || '';
      for (const line of lines) {
        if (line === 'open') {
          openBrowser(url);
        } else if (line === 'save') {
          save();
        } else if (line === 'restart') {
          restart();
        } else if (line === 'exit') {
          shutdown();
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      const message = chunk.toString('utf8').trim();
      if (message) {
        log(`stderr: ${message}`);
      }
    });
    // Without a handler a failed spawn raises an unhandled 'error' event, which
    // the fatal handler turns into an exit of the whole server.
    child.on('error', (error) => {
      log(`failed to start: ${error.message}`);
    });
    child.on('exit', (code, signal) => {
      log(`exited code=${code} signal=${signal || 'none'}`);
      if (stopping) {
        return;
      }
      // The icon is the only way into a server that has no console, so losing
      // it strands the process. A tray that ran long enough to be usable starts
      // the count over; one that keeps dying immediately is broken, and
      // relaunching it forever would just spin.
      failures = Date.now() - startedAt >= TRAY_HEALTHY_MS ? 1 : failures + 1;
      if (failures > TRAY_RESTART_LIMIT) {
        log(`not restarting after ${failures} failed starts`);
        return;
      }
      log(`restarting in ${TRAY_RESTART_DELAY_MS}ms (attempt ${failures})`);
      restartTimer = setTimeout(launch, TRAY_RESTART_DELAY_MS);
      restartTimer.unref();
    });
    log(`started pid=${child.pid || 'unknown'}`);
  }

  launch();

  return {
    kill(exitNode = true) {
      stopping = true;
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      if (child && !child.killed) {
        child.kill();
      }
      if (exitNode) {
        process.exit(0);
      }
    }
  };
}

function windowsNotifyIconScript() {
  return `
param(
  [Parameter(Mandatory=$true)][string]$IconPath,
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string]$Url,
  [Parameter(Mandatory=$true)][int]$Port,
  [Parameter(Mandatory=$true)][int]$ServerPid
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$icon = New-Object System.Drawing.Icon($IconPath)
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = $icon
$notifyIcon.Text = "Paneboard terminal workspace (port $Port)"
$notifyIcon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$statusItem = $menu.Items.Add("Status: running (port $Port)")
$statusItem.Enabled = $false
$menu.Items.Add('-') | Out-Null
$openItem = $menu.Items.Add('Open Web UI')
$saveItem = $menu.Items.Add('Save Now')
$restartItem = $menu.Items.Add('Restart Paneboard')
$menu.Items.Add('-') | Out-Null
$logsItem = $menu.Items.Add('View Logs')
$diagnosticsItem = $menu.Items.Add('Diagnostics')
$menu.Items.Add('-') | Out-Null
$exitItem = $menu.Items.Add('Exit')

$openItem.add_Click({ [Console]::Out.WriteLine('open'); [Console]::Out.Flush() })
$saveItem.add_Click({ [Console]::Out.WriteLine('save'); [Console]::Out.Flush() })
$restartItem.add_Click({ [Console]::Out.WriteLine('restart'); [Console]::Out.Flush() })
$logsItem.add_Click({ Start-Process explorer.exe -ArgumentList (Join-Path $Root 'data') })
$diagnosticsItem.add_Click({
  $newline = [Environment]::NewLine
  $message = 'Status: running' + $newline + "URL: $Url" + $newline + "Server PID: $ServerPid" + $newline + "Data: $(Join-Path $Root 'data')"
  [System.Windows.Forms.MessageBox]::Show($message, 'Paneboard Diagnostics', 'OK', 'Information') | Out-Null
})
$exitItem.add_Click({ [Console]::Out.WriteLine('exit'); [Console]::Out.Flush() })
$notifyIcon.add_DoubleClick({ [Console]::Out.WriteLine('open'); [Console]::Out.Flush() })
$notifyIcon.ContextMenuStrip = $menu

try {
  [System.Windows.Forms.Application]::Run()
} finally {
  $notifyIcon.Visible = $false
  $notifyIcon.Dispose()
  $icon.Dispose()
}
`.trim();
}

function startPortableTray({ root, url, port, save, openBrowser, restart, shutdown, log }) {
  const icon = realIconPath(root);
  const statusItem = {
    title: `Status: running (port ${port})`,
    tooltip: '',
    checked: false,
    enabled: false
  };
  const openItem = {
    title: 'Open Web UI',
    tooltip: 'Open Paneboard in your browser',
    checked: false,
    enabled: true,
    click: () => openBrowser(url)
  };
  const saveItem = {
    title: 'Save Now',
    tooltip: 'Save sessions now',
    checked: false,
    enabled: true,
    click: save
  };
  const exitItem = {
    title: 'Exit',
    tooltip: 'Save and exit Paneboard',
    checked: false,
    enabled: true,
    click: shutdown
  };
  const restartItem = {
    title: 'Restart Paneboard',
    tooltip: 'Restart Paneboard',
    checked: false,
    enabled: true,
    click: restart
  };

  const tray = new SysTray({
    menu: {
      icon,
      title: 'Paneboard',
      tooltip: `Paneboard terminal workspace (port ${port})`,
      items: [statusItem, SysTray.separator, openItem, saveItem, restartItem, SysTray.separator, exitItem]
    },
    debug: Boolean(process.env.PANEBOARD_TRAY_DEBUG ?? process.env.WPS7_TRAY_DEBUG),
    copyDir: path.join(root, 'data', 'tray')
  });

  tray.onClick((action) => {
    if (action.item.click) {
      action.item.click();
    }
  });

  tray.ready().then(() => {
    tray.onError((error) => {
      log(`error: ${error.message || error}`);
    });
    tray.onExit((code) => {
      log(`exited code=${code}`);
    });
  }).catch((error) => {
    log(`failed to start: ${error.message}`);
  });

  return tray;
}

function realIconPath(root) {
  const source = path.join(__dirname, '..', 'assets', 'paneboard.ico');
  if (!process.pkg) {
    return source;
  }

  const targetDir = path.join(root, 'data');
  const target = path.join(targetDir, 'paneboard.ico');
  fs.mkdirSync(targetDir, { recursive: true });
  if (!fs.existsSync(target)) {
    fs.copyFileSync(source, target);
  }
  return target;
}

module.exports = {
  startTray
};
