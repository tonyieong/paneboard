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
  throw "paneboard.exe was not found below $Root."
}

$runtimeRoot = Resolve-PaneboardRuntimeRoot
$executable = Join-Path $runtimeRoot 'paneboard.exe'

# The shortcut stores an absolute path, so moving the folder leaves it pointing
# at the old one. It is the only registration paneboard owns, which is why repairing
# a moved install needs no elevation.
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

Write-Host "Repaired startup shortcut: $shortcutPath -> $executable"
