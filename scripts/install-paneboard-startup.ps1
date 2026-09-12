param(
  [string]$Root = (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path

function Resolve-PaneboardRuntimeRoot {
  if (Test-Path -LiteralPath (Join-Path $Root 'paneboard.exe')) {
    return $Root
  }
  $distRoot = Join-Path $Root 'dist'
  if (Test-Path -LiteralPath (Join-Path $distRoot 'paneboard.exe')) {
    return $distRoot
  }
  throw "paneboard.exe was not found below $Root. Run npm run package:win first."
}

function Read-PaneboardConfigValue {
  param(
    [string]$RuntimeRoot,
    [string]$Section,
    [string]$Key,
    [string]$Default
  )
  $configPath = Join-Path $RuntimeRoot 'config.toml'
  if (!(Test-Path -LiteralPath $configPath)) {
    return $Default
  }
  $currentSection = ''
  foreach ($line in Get-Content -LiteralPath $configPath) {
    $trimmed = $line.Trim()
    if ($trimmed -match '^\[(.+)\]$') {
      $currentSection = $Matches[1]
      continue
    }
    if ($currentSection -eq $Section -and $trimmed -match "^$Key\s*=\s*(.+)$") {
      return $Matches[1].Trim().Trim('"')
    }
  }
  return $Default
}

$runtimeRoot = Resolve-PaneboardRuntimeRoot
$executable = Join-Path $runtimeRoot 'paneboard.exe'

$serverHost = Read-PaneboardConfigValue -RuntimeRoot $runtimeRoot -Section 'server' -Key 'host' -Default '127.0.0.1'
$passwordHash = Read-PaneboardConfigValue -RuntimeRoot $runtimeRoot -Section 'auth' -Key 'password_hash' -Default ''
if ($serverHost -eq '0.0.0.0' -and !$passwordHash) {
  throw 'Refusing to expose Paneboard on the LAN without an auth.password_hash. Set a strong password or use host = "127.0.0.1".'
}

# Earlier versions ran the server as an NSSM service, which put it in session 0
# with no interactive desktop: GUI programs started from a terminal pane were
# invisible, and the account the service ran as owned neither the signed-in CLI
# credentials nor the user's mapped drives. Removing that registration is the
# one step here that changes machine state, so it is the one step that elevates.
$legacyTasks = @('wps7-server', 'wps7-tray', 'wps7-service-start', 'wps7-service-restart', 'wps7-service-stop')
$legacyService = Get-Service -Name 'wps7-server' -ErrorAction SilentlyContinue
$legacyTaskNames = @($legacyTasks | Where-Object { Get-ScheduledTask -TaskName $_ -ErrorAction SilentlyContinue })
$legacyFirewall = @(Get-NetFirewallRule -Group 'wps7' -ErrorAction SilentlyContinue)
if ($legacyService -or $legacyTaskNames.Count -gt 0 -or $legacyFirewall.Count -gt 0) {
  $uninstall = Join-Path $runtimeRoot 'scripts\uninstall-paneboard-startup.ps1'
  if (!(Test-Path -LiteralPath $uninstall)) {
    $uninstall = Join-Path (Split-Path -Parent $PSCommandPath) 'uninstall-paneboard-startup.ps1'
  }
  Write-Host 'Removing the previous service installation (this needs Administrator once)...'
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$uninstall`" -KeepShortcut"
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Removing the previous installation failed with exit code $($process.ExitCode)."
  }
}

# A Startup shortcut runs as the logged-in user in their own session, so no
# service account, no stored password, and no elevation are involved.
$shell = New-Object -ComObject WScript.Shell
$shortcutPath = Join-Path $shell.SpecialFolders.Item('Startup') 'paneboard.lnk'
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $executable
$shortcut.WorkingDirectory = $runtimeRoot
$shortcut.Description = 'Paneboard terminal workspace'
$shortcut.Save()

# Retire only an old-brand shortcut pointing at this installation.
$oldShortcutPath = Join-Path $shell.SpecialFolders.Item('Startup') 'wps7.lnk'
if (Test-Path -LiteralPath $oldShortcutPath) {
  $oldShortcut = $shell.CreateShortcut($oldShortcutPath)
  if ($oldShortcut.TargetPath -eq (Join-Path $runtimeRoot 'wps7.exe')) {
    Remove-Item -LiteralPath $oldShortcutPath -Force
  }
}

if ($serverHost -eq '0.0.0.0') {
  $serverPort = [int](Read-PaneboardConfigValue -RuntimeRoot $runtimeRoot -Section 'server' -Key 'port' -Default '5000')
  Write-Host "Allowing inbound TCP $serverPort in Windows Firewall (this needs Administrator)..."
  $rule = "New-NetFirewallRule -DisplayName 'paneboard TCP $serverPort' -Group 'paneboard' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $serverPort -Profile Any | Out-Null"
  Start-Process -FilePath 'powershell.exe' -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"$rule`"" -Verb RunAs -Wait
}

Write-Host "Installed startup shortcut: $shortcutPath"
Write-Host "Paneboard starts at logon in your own session, with its tray icon."
Write-Host "Start it now by running: $executable"
