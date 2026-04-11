@echo off
setlocal

cd /d "%~dp0"

echo [packing-list] Building frontend...
call npm.cmd run build
if errorlevel 1 exit /b %errorlevel%

echo [packing-list] Building portable EXE...
node .\node_modules\@tauri-apps\cli\tauri.js build --no-bundle --config src-tauri/tauri.portable.conf.json
if errorlevel 1 exit /b %errorlevel%

set "APP_EXE=src-tauri\target\release\packing-list.exe"
set "PORTABLE_ROOT=portable-release"

if not exist "%APP_EXE%" (
  echo [packing-list] ERROR: portable EXE not found: %APP_EXE%
  exit /b 1
)

echo [packing-list] Packaging portable release...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$config = Get-Content -Encoding UTF8 'src-tauri/tauri.conf.json' | ConvertFrom-Json;" ^
  "$version = $config.version;" ^
  "$packageName = 'packing-list-portable-v' + $version;" ^
  "$root = Join-Path (Get-Location) '%PORTABLE_ROOT%';" ^
  "$packageDir = Join-Path $root $packageName;" ^
  "$zipPath = Join-Path $root ($packageName + '.zip');" ^
  "if (Test-Path $packageDir) { Remove-Item -LiteralPath $packageDir -Recurse -Force; }" ^
  "if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force; }" ^
  "New-Item -ItemType Directory -Path $packageDir -Force | Out-Null;" ^
  "Copy-Item -LiteralPath '%APP_EXE%' -Destination (Join-Path $packageDir 'packing-list.exe');" ^
  "Copy-Item -LiteralPath 'portable-launcher.cmd' -Destination (Join-Path $packageDir 'Start Packing List.cmd');" ^
  "Copy-Item -LiteralPath 'PORTABLE-README.txt' -Destination (Join-Path $packageDir 'README.txt');" ^
  "[System.IO.File]::WriteAllText((Join-Path $packageDir 'storage-mode.txt'), 'portable', [System.Text.UTF8Encoding]::new($false));" ^
  "$assetsDir = Join-Path (Get-Location) 'portable-assets';" ^
  "if (Test-Path $assetsDir) {" ^
  "  Get-ChildItem -LiteralPath $assetsDir -File | Where-Object { $_.Name -in @('MicrosoftEdgeWebview2Setup.exe', 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe', 'MicrosoftEdgeWebView2RuntimeInstallerX86.exe') } | ForEach-Object {" ^
  "    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $packageDir $_.Name);" ^
  "  };" ^
  "  Get-ChildItem -LiteralPath $assetsDir -Directory | Where-Object { $_.Name -like 'Microsoft.WebView2.FixedVersionRuntime*' } | ForEach-Object {" ^
  "    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $packageDir $_.Name) -Recurse -Force;" ^
  "  };" ^
  "}" ^
  "Compress-Archive -LiteralPath $packageDir -DestinationPath $zipPath -CompressionLevel Optimal;"
if errorlevel 1 exit /b %errorlevel%

echo [packing-list] Portable artifact:
echo   %CD%\%APP_EXE%
echo [packing-list] Portable package folder:
echo   %CD%\%PORTABLE_ROOT%
echo [packing-list] Publish the ZIP inside portable-release, not the bare EXE.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-Item -LiteralPath '%APP_EXE%' | " ^
  "Select-Object FullName,Length,LastWriteTime,@{Name='FileVersion';Expression={$_.VersionInfo.FileVersion}},@{Name='ProductVersion';Expression={$_.VersionInfo.ProductVersion}} | Format-List; " ^
  "Get-FileHash -LiteralPath '%APP_EXE%' -Algorithm SHA256 | Format-List"
if errorlevel 1 exit /b %errorlevel%

endlocal
