param(
  [string]$ToolRoot = 'output/node_modules/android-sdk-tools',
  [string]$GoRoot = 'output/node_modules/android-toolchain/go'
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $repoRoot
$ToolRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot $ToolRoot))
$GoRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot $GoRoot))
$buildRoot = Join-Path $repoRoot 'output/node_modules/android-probe-build'
foreach ($target in @($ToolRoot, $GoRoot, $buildRoot)) {
  if (-not $target.StartsWith($repoRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'All build paths must stay inside this workspace' }
}
$jdk = Get-ChildItem -LiteralPath $ToolRoot -Directory -Filter 'jdk-17*' | Select-Object -First 1
if (-not $jdk) { throw 'A portable JDK 17 is required under ToolRoot' }
$buildTools = Join-Path $ToolRoot 'android-15'
$androidJar = Join-Path $ToolRoot 'android-35/android.jar'
foreach ($file in @($androidJar, (Join-Path $buildTools 'aapt2.exe'), (Join-Path $GoRoot 'bin/go.exe'))) {
  if (-not (Test-Path -LiteralPath $file)) { throw "Missing build tool: $file" }
}
foreach ($folder in @('res/drawable','res/xml','assets','classes','dex','native/lib/arm64-v8a','tmp')) {
  New-Item -ItemType Directory -Force (Join-Path $buildRoot $folder) | Out-Null
}
$env:GOPATH = Join-Path $repoRoot 'output/node_modules/android-toolchain/gopath'
$env:GOCACHE = Join-Path $repoRoot 'output/node_modules/android-toolchain/cache'
$env:GOTOOLCHAIN = 'local'
$env:GOTMPDIR = Join-Path $buildRoot 'tmp'
$env:TEMP = $env:GOTMPDIR
$env:TMP = $env:GOTMPDIR
$env:GOOS = 'android'
$env:GOARCH = 'arm64'
$env:CGO_ENABLED = '0'

function Invoke-Checked([string]$Program, [string[]]$Arguments) {
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}

$go = Join-Path $GoRoot 'bin/go.exe'
Push-Location (Join-Path $PSScriptRoot 'core')
try {
  Invoke-Checked $go @('build','-p=4','-buildmode=pie','-ldflags=-checklinkname=0 -s -w','-o',(Join-Path $buildRoot 'native/lib/arm64-v8a/libpaneboardcore.so'),'.')
  # Bundle direct and transitive modules actually compiled for Android.
  $modules = & $go list -deps -f '{{with .Module}}{{.Path}}|{{.Version}}|{{.Dir}}{{end}}' .
  if ($LASTEXITCODE -ne 0) { throw 'Could not enumerate Go licenses' }
  $modules = $modules | Where-Object { $_ } | Sort-Object -Unique
  $notices = [Text.StringBuilder]::new()
  [void]$notices.AppendLine('Paneboard Android - third-party notices')
  [void]$notices.AppendLine((Get-Content -LiteralPath (Join-Path $GoRoot 'LICENSE') -Raw))
  foreach ($module in $modules) {
    $parts = $module.Split('|')
    if ($parts[0] -eq 'paneboard.local/android-probe') { continue }
    if (-not $parts[2]) { continue }
    $licenses = Get-ChildItem -LiteralPath $parts[2] -File | Where-Object { $_.Name -match '^(LICENSE|LICENCE|COPYING|NOTICE)(\..*)?$' }
    if (-not $licenses) { throw "Review missing license for $($parts[0])" }
    [void]$notices.AppendLine("`n$($parts[0]) $($parts[1])")
    foreach ($license in $licenses) { [void]$notices.AppendLine((Get-Content -LiteralPath $license.FullName -Raw)) }
  }
  [IO.File]::WriteAllText((Join-Path $buildRoot 'assets/THIRD-PARTY-NOTICES.txt'), $notices.ToString())
} finally { Pop-Location }

Copy-Item -LiteralPath (Join-Path $repoRoot 'public/icon-192.png') -Destination (Join-Path $buildRoot 'res/drawable/icon.png')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'network-security-config.xml') -Destination (Join-Path $buildRoot 'res/xml/network_security_config.xml')
$java = Join-Path $jdk.FullName 'bin/java.exe'
$jar = Join-Path $jdk.FullName 'bin/jar.exe'
Invoke-Checked (Join-Path $jdk.FullName 'bin/javac.exe') @('-encoding','UTF-8','-source','8','-target','8','-classpath',$androidJar,'-d',(Join-Path $buildRoot 'classes'),(Join-Path $PSScriptRoot 'MainActivity.java'))
Invoke-Checked $jar @('cf',(Join-Path $buildRoot 'classes.jar'),'-C',(Join-Path $buildRoot 'classes'),'.')
Invoke-Checked $java @('-cp',(Join-Path $buildTools 'lib/d8.jar'),'com.android.tools.r8.D8','--min-api','28','--lib',$androidJar,'--output',(Join-Path $buildRoot 'dex'),(Join-Path $buildRoot 'classes.jar'))
Invoke-Checked (Join-Path $buildTools 'aapt2.exe') @('compile','--dir',(Join-Path $buildRoot 'res'),'-o',(Join-Path $buildRoot 'resources.zip'))
Invoke-Checked (Join-Path $buildTools 'aapt2.exe') @('link','-o',(Join-Path $buildRoot 'unsigned.apk'),'--manifest',(Join-Path $PSScriptRoot 'AndroidManifest.xml'),'-I',$androidJar,'-A',(Join-Path $buildRoot 'assets'),(Join-Path $buildRoot 'resources.zip'))
Invoke-Checked $jar @('uf',(Join-Path $buildRoot 'unsigned.apk'),'-C',(Join-Path $buildRoot 'dex'),'classes.dex','-C',(Join-Path $buildRoot 'native'),'lib')
Invoke-Checked (Join-Path $buildTools 'zipalign.exe') @('-f','-p','4',(Join-Path $buildRoot 'unsigned.apk'),(Join-Path $buildRoot 'aligned.apk'))
$signingRoot = Join-Path $repoRoot 'output/android-signing'
New-Item -ItemType Directory -Force $signingRoot | Out-Null
# Only this Windows account and SYSTEM may read the private signing material.
$signingAcl = [Security.AccessControl.DirectorySecurity]::new()
$signingAcl.SetAccessRuleProtection($true, $false)
$signingIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User
foreach ($sid in @($signingIdentity, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
  $signingAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
}
$existingAcl = Get-Acl -LiteralPath $signingRoot
$existingRules = @($existingAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
$expectedSids = @($signingIdentity.Value, 'S-1-5-18')
$privateAcl = $existingAcl.AreAccessRulesProtected -and $existingRules.Count -eq 2 -and @($existingRules | Where-Object {
  $_.IdentityReference.Value -notin $expectedSids -or $_.AccessControlType -ne 'Allow' -or $_.FileSystemRights -ne 'FullControl'
}).Count -eq 0
if (-not $privateAcl) { Set-Acl -LiteralPath $signingRoot -AclObject $signingAcl }
$keystore = Join-Path $signingRoot 'paneboard-release.p12'
$passwordFile = Join-Path $signingRoot 'keystore-password'
if ((Test-Path -LiteralPath $keystore) -and -not (Test-Path -LiteralPath $passwordFile)) { throw 'Release key password missing; restore signing backup, never replace the key' }
if ((Test-Path -LiteralPath $passwordFile) -and -not (Test-Path -LiteralPath $keystore)) { throw 'Release key missing; restore signing backup, never silently generate a replacement' }
if (-not (Test-Path -LiteralPath $passwordFile)) {
  $signingBytes = [byte[]]::new(32)
  [Security.Cryptography.RandomNumberGenerator]::Fill($signingBytes)
  [IO.File]::WriteAllText($passwordFile, [Convert]::ToBase64String($signingBytes))
}
$env:PANEBOARD_SIGNING_PASSWORD = [IO.File]::ReadAllText($passwordFile)
$apk = Join-Path $buildRoot 'Paneboard-1.0.apk'
$signer = Join-Path $buildTools 'lib/apksigner.jar'
try {
  if (-not (Test-Path -LiteralPath $keystore)) {
    Invoke-Checked (Join-Path $jdk.FullName 'bin/keytool.exe') @('-genkeypair','-keystore',$keystore,'-storetype','PKCS12','-storepass:env','PANEBOARD_SIGNING_PASSWORD','-keypass:env','PANEBOARD_SIGNING_PASSWORD','-alias','paneboard','-dname','CN=Paneboard Private','-keyalg','RSA','-keysize','3072','-validity','10000')
  }
  $lineage = Join-Path $signingRoot 'signing-lineage'
  $oldKey = Join-Path $buildRoot 'debug.keystore'
  if ((Test-Path -LiteralPath $oldKey) -and -not (Test-Path -LiteralPath $lineage)) {
    # Rotate the locally installed prototype identity without deleting its data.
    Invoke-Checked $java @('-jar',$signer,'rotate','--out',$lineage,'--old-signer','--ks',$oldKey,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--set-installed-data','true','--set-rollback','false','--new-signer','--ks',$keystore,'--ks-key-alias','paneboard','--ks-pass','env:PANEBOARD_SIGNING_PASSWORD')
  }
  $signArguments = @('-jar',$signer,'sign','--ks',$keystore,'--ks-key-alias','paneboard','--ks-pass','env:PANEBOARD_SIGNING_PASSWORD','--key-pass','env:PANEBOARD_SIGNING_PASSWORD','--v1-signing-enabled','false','--v2-signing-enabled','false','--v3-signing-enabled','true','--v4-signing-enabled','false','--debuggable-apk-permitted','false','--out',$apk)
  if (Test-Path -LiteralPath $lineage) { $signArguments += @('--lineage',$lineage,'--rotation-min-sdk-version','28') }
  $signArguments += (Join-Path $buildRoot 'aligned.apk')
  Invoke-Checked $java $signArguments
  Invoke-Checked $java @('-jar',$signer,'verify','--verbose','--print-certs',$apk)
} finally { Remove-Item Env:PANEBOARD_SIGNING_PASSWORD -ErrorAction SilentlyContinue }
$delivery = Join-Path $repoRoot 'output/android-release'
New-Item -ItemType Directory -Force $delivery | Out-Null
Copy-Item -LiteralPath $apk -Destination (Join-Path $delivery 'Paneboard-1.0.apk')
$checksum = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $delivery 'Paneboard-1.0.apk.sha256'), "$checksum  Paneboard-1.0.apk`n")
Write-Output "Built and verified: $apk"
