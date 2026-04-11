@echo off
setlocal

cd /d "%~dp0"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=online"

set "RUNTIME_EXE="
if /I "%MODE%"=="online" set "RUNTIME_EXE=%CD%\portable-assets\MicrosoftEdgeWebview2Setup.exe"
if /I "%MODE%"=="offline" set "RUNTIME_EXE=%CD%\portable-assets\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"

if "%RUNTIME_EXE%"=="" (
  echo [packing-list] ERROR: mode must be online or offline.
  exit /b 1
)

if not exist "%RUNTIME_EXE%" (
  echo [packing-list] ERROR: runtime installer not found:
  echo   %RUNTIME_EXE%
  exit /b 1
)

echo [packing-list] Building frontend...
call npm.cmd run build
if errorlevel 1 exit /b %errorlevel%

echo [packing-list] Building release EXE...
node .\node_modules\@tauri-apps\cli\tauri.js build --no-bundle --config src-tauri/tauri.portable.conf.json
if errorlevel 1 exit /b %errorlevel%

echo [packing-list] Building single-file package (%MODE%)...
for /f %%i in ('node -e "console.log(JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')).version)"') do set "APP_VERSION=%%i"
if "%APP_VERSION%"=="" (
  echo [packing-list] ERROR: failed to read app version.
  exit /b 1
)

set "PACKING_LIST_MODE=%MODE%"
set "PACKING_LIST_APP_EXE=%CD%\src-tauri\target\release\packing-list.exe"
set "PACKING_LIST_RUNTIME_EXE=%RUNTIME_EXE%"
set "CARGO_TARGET_DIR=%CD%\singlefile-release\cargo-target-%MODE%"

cargo build --release --manifest-path "%CD%\singlefile-launcher\Cargo.toml"
if errorlevel 1 exit /b %errorlevel%

if not exist "%CD%\singlefile-release" mkdir "%CD%\singlefile-release"
copy /Y "%CARGO_TARGET_DIR%\release\packing-list-singlefile-launcher.exe" "%CD%\singlefile-release\packing-list-single-%MODE%-v%APP_VERSION%.exe" >nul
if errorlevel 1 exit /b %errorlevel%

echo [packing-list] Single-file artifact:
echo   %CD%\singlefile-release\packing-list-single-%MODE%-v%APP_VERSION%.exe

endlocal
