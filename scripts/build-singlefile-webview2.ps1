param(
  [ValidateSet('online', 'offline')]
  [string]$Mode = 'online'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$config = Get-Content -Encoding UTF8 (Join-Path $projectRoot 'src-tauri\tauri.conf.json') | ConvertFrom-Json
$version = $config.version
$appExe = Join-Path $projectRoot 'src-tauri\target\release\packing-list.exe'
$outputRoot = Join-Path $projectRoot 'singlefile-release'
$workRoot = Join-Path $outputRoot "_build-$Mode"
$targetName = Join-Path $outputRoot ("packing-list-single-{0}-v{1}.exe" -f $Mode, $version)

if (!(Test-Path $appExe)) {
  throw "Missing app exe: $appExe"
}

if (Test-Path $workRoot) {
  Remove-Item -LiteralPath $workRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $workRoot | Out-Null
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$files = @(
  @{
    Source = $appExe
    Name = 'packing-list.exe'
  }
)

switch ($Mode) {
  'online' {
    $launcher = Join-Path $projectRoot 'singlefile-online-launcher.cmd'
    $runtime = Join-Path $projectRoot 'portable-assets\MicrosoftEdgeWebview2Setup.exe'
    if (!(Test-Path $runtime)) {
      throw "Missing online WebView2 installer: $runtime"
    }
    $files += @{ Source = $launcher; Name = 'run.cmd' }
    $files += @{ Source = $runtime; Name = 'MicrosoftEdgeWebview2Setup.exe' }
  }
  'offline' {
    $launcher = Join-Path $projectRoot 'singlefile-offline-launcher.cmd'
    $runtime = Join-Path $projectRoot 'portable-assets\MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
    if (!(Test-Path $runtime)) {
      throw "Missing offline WebView2 installer: $runtime"
    }
    $files += @{ Source = $launcher; Name = 'run.cmd' }
    $files += @{ Source = $runtime; Name = 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe' }
  }
}

foreach ($file in $files) {
  Copy-Item -LiteralPath $file.Source -Destination (Join-Path $workRoot $file.Name) -Force
}

$sedPath = Join-Path $workRoot "package-$Mode.sed"
$escapedOutput = $targetName.Replace('\', '\\')
$escapedSource = $workRoot.Replace('\', '\\')

$sourceList = @()
for ($i = 0; $i -lt $files.Count; $i++) {
  $sourceList += "FILE$i=`"$($files[$i].Name)`""
}

$stringsList = @()
for ($i = 0; $i -lt $files.Count; $i++) {
  $stringsList += "FILE$i=$($files[$i].Name)"
}

$sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$escapedOutput
FriendlyName=Packing List Single File ($Mode)
AppLaunched=run.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=run.cmd
UserQuietInstCmd=run.cmd
SourceFiles=SourceFiles
[SourceFiles]
SourceFiles0=$escapedSource
[SourceFiles0]
$(($sourceList -join "`r`n"))
[Strings]
FILECOUNT=$($files.Count)
$(($stringsList -join "`r`n"))
"@

[System.IO.File]::WriteAllText($sedPath, $sed, [System.Text.Encoding]::ASCII)

$iexpress = Join-Path $env:WINDIR 'System32\iexpress.exe'
& $iexpress /N $sedPath | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "IExpress failed with exit code $LASTEXITCODE"
}

Get-Item -LiteralPath $targetName | Select-Object FullName, Length, LastWriteTime
