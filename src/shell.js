const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function resolveCommand(command) {
  if (path.isAbsolute(command) && fs.existsSync(command)) {
    return command;
  }
  const result = spawnSync('where.exe', [command], { windowsHide: true, encoding: 'utf8' });
  if (result.status === 0) {
    // Pass the resolved path to ConPTY: its native PATH search can fail even
    // when where.exe succeeds (for example, for the final PATH entry).
    const resolved = result.stdout.split(/\r?\n/).map((line) => line.trim())
      .find((candidate) => path.isAbsolute(candidate) && fs.existsSync(candidate));
    if (resolved) return resolved;
  }

  const knownPaths = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'PowerShell', '7', 'pwsh.exe')
  ];
  return knownPaths.find((candidate) => path.basename(candidate).toLowerCase() === command.toLowerCase() && fs.existsSync(candidate)) || '';
}

const SHELL_KINDS = new Set(['powershell', 'cmd']);

function shellKind(value) {
  return SHELL_KINDS.has(value) ? value : 'powershell';
}

function shellTitle(kind) {
  return shellKind(kind) === 'cmd' ? 'CMD' : 'PowerShell';
}

// A cmd pane runs the shell Windows ships. shell.preferred, shell.fallback and
// shell.args all describe PowerShell, and cmd.exe would reject those switches.
function resolveCmdShell() {
  return {
    command: resolveCommand('cmd.exe') || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'),
    args: []
  };
}

function resolveShell(config) {
  const preferred = resolveCommand(config.shell.preferred);
  if (preferred) {
    return {
      command: preferred,
      args: config.shell.args || [],
      usingFallback: false
    };
  }

  const fallback = resolveCommand(config.shell.fallback) || config.shell.fallback;
  return {
    command: fallback,
    args: config.shell.args || [],
    usingFallback: true,
    message: 'PowerShell 7 was not found. Install it from https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows'
  };
}

// paneboard inherits the PATH it had at logon, so a tool folder added after that --
// npm's global folder, where claude and codex live, is the usual one -- is
// missing until paneboard restarts, and the shell answers "not recognized" for
// commands that work in a normal terminal. shell.extra_path adds them back.
// Appending rather than prepending keeps a machine-wide tool the one that wins.
function shellEnv(config, env = process.env) {
  const key = Object.keys(env).find((name) => name.toLowerCase() === 'path') || 'PATH';
  const current = env[key] || '';
  const existing = new Set(current.split(path.delimiter).filter(Boolean).map((entry) => entry.toLowerCase()));
  const additions = (config.shell?.extra_path || [])
    .map((entry) => String(entry).trim())
    .filter((entry) => entry && !existing.has(entry.toLowerCase()));
  if (!additions.length) {
    return { ...env };
  }
  return {
    ...env,
    [key]: [current, ...additions].filter(Boolean).join(path.delimiter)
  };
}

function normalizeCwd(cwd, root) {
  if (cwd && fs.existsSync(cwd)) {
    return cwd;
  }
  return root || path.dirname(process.execPath);
}

module.exports = {
  normalizeCwd,
  resolveCmdShell,
  resolveShell,
  shellEnv,
  shellKind,
  shellTitle
};
