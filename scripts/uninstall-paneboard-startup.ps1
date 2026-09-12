param(
  # install-paneboard-startup.ps1 reuses this script to clear a previous service
  # installation, and rewrites the shortcut itself afterwards.
  [switch]$KeepShortcut
)

$ErrorActionPreference = 'Stop'

$legacyService = Get-Service -Name 'wps7-server' -ErrorAction SilentlyContinue
$legacyTasks = @('wps7-server', 'wps7-tray', 'wps7-service-start', 'wps7-service-restart', 'wps7-service-stop')
$legacyTaskNames = @($legacyTasks | Where-Object { Get-ScheduledTask -TaskName $_ -ErrorAction SilentlyContinue })
$firewallRules = @(Get-NetFirewallRule -Group 'paneboard', 'wps7' -ErrorAction SilentlyContinue)

# Removing a service, elevated tasks or a firewall rule changes machine state.
# Nothing else here does, so a plain shortcut removal never asks for anything.
if ($legacyService -or $legacyTaskNames.Count -gt 0 -or $firewallRules.Count -gt 0) {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  if (!$principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($KeepShortcut) {
      $arguments += ' -KeepShortcut'
    }
    Write-Host 'Restarting as Administrator to remove the previous service registration...'
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -Wait -PassThru
    exit $process.ExitCode
  }

  foreach ($taskName in $legacyTaskNames) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  }
  if ($legacyService) {
    sc.exe stop wps7-server | Out-Null
    sc.exe delete wps7-server | Out-Null
  }
  if ($firewallRules.Count -gt 0) {
    $firewallRules | Remove-NetFirewallRule
  }
  Write-Host 'Removed the Paneboard service, its control tasks, and its firewall rules.'
}

if (!$KeepShortcut) {
  $shell = New-Object -ComObject WScript.Shell
  $startup = $shell.SpecialFolders.Item('Startup')
  foreach ($name in @('paneboard.lnk', 'wps7.lnk', 'wps7 tray.lnk')) {
    Remove-Item -LiteralPath (Join-Path $startup $name) -Force -ErrorAction SilentlyContinue
  }
  Write-Host 'Removed the Paneboard startup shortcut.'
}
