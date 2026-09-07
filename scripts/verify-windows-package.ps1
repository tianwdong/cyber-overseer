$ErrorActionPreference = 'Stop'
$installer = (Get-ChildItem release/windows/*-setup.exe | Select-Object -First 1).FullName
if (!$installer) { throw 'Installer missing' }
$installDir = Join-Path $env:RUNNER_TEMP 'Cyber Overseer 安装验证'
$install = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Install failed: $($install.ExitCode)" }
$executable = Join-Path $installDir 'Cyber Overseer.exe'
if (!(Test-Path $executable)) { throw 'Installed application missing' }
$out = Join-Path $env:RUNNER_TEMP 'overseer-package-stdout.log'
$err = Join-Path $env:RUNNER_TEMP 'overseer-package-stderr.log'
# No developer Python on PATH. The packaged smoke also checks sys.executable.
$savedPath = $env:PATH
try {
  $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
  Remove-Item Env:CYBER_OVERSEER_PYTHON -ErrorAction SilentlyContinue
  $process = Start-Process -FilePath $executable -ArgumentList @('--smoke','--interface-only') -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
  if (!$process.WaitForExit(180000)) { Stop-Process -Id $process.Id; throw 'Packaged smoke timed out' }
  Get-Content $out
  Get-Content $err
  if ($process.ExitCode -ne 0) { throw "Packaged smoke failed: $($process.ExitCode)" }
  if (!(Select-String -Path $out -Pattern 'packaged-runtime' -Quiet)) { throw 'Bundled runtime proof missing' }
} finally { $env:PATH = $savedPath }
$uninstaller = Join-Path $installDir 'Uninstall Cyber Overseer.exe'
if (!(Test-Path $uninstaller)) { throw 'Uninstaller missing' }
$uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
if ($uninstall.ExitCode -ne 0) { throw "Uninstall failed: $($uninstall.ExitCode)" }
for ($i=0; $i -lt 30 -and (Test-Path $executable); $i++) { Start-Sleep -Seconds 1 }
if (Test-Path $executable) { throw 'Installed executable remains after uninstall' }
$hash = (Get-FileHash -Algorithm SHA256 $installer).Hash.ToLower()
"$hash  $(Split-Path -Leaf $installer)" | Set-Content -Encoding ascii "$installer.sha256"
