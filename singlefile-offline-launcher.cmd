@echo off
setlocal

cd /d "%~dp0"

set "APP_EXE=%~dp0packing-list.exe"
set "APP_DATA_DIR=%LOCALAPPDATA%\PackingListSingle"
set "WEBVIEW_USER_DATA=%APP_DATA_DIR%\webview2-user-data"
set "WEBVIEW_STANDALONE_X64=%~dp0MicrosoftEdgeWebView2RuntimeInstallerX64.exe"

if not exist "%APP_EXE%" (
  echo [packing-list] ERROR: packing-list.exe not found.
  pause
  exit /b 1
)

if not exist "%APP_DATA_DIR%" mkdir "%APP_DATA_DIR%" >nul 2>nul
if not exist "%WEBVIEW_USER_DATA%" mkdir "%WEBVIEW_USER_DATA%" >nul 2>nul
set "WEBVIEW2_USER_DATA_FOLDER=%WEBVIEW_USER_DATA%"

call :has_webview2_runtime
if errorlevel 1 goto :install_runtime
goto :launch_app

:install_runtime
if not exist "%WEBVIEW_STANDALONE_X64%" (
  echo [packing-list] MicrosoftEdgeWebView2RuntimeInstallerX64.exe not found in package.
  pause
  exit /b 1
)

echo [packing-list] WebView2 Runtime not found. Starting offline installer...
"%WEBVIEW_STANDALONE_X64%" /silent /install
call :has_webview2_runtime
if errorlevel 1 (
  echo [packing-list] WebView2 Runtime install did not complete successfully.
  pause
  exit /b 1
)

:launch_app
start "" "%APP_EXE%"
exit /b 0

:has_webview2_runtime
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv >nul 2>nul && exit /b 0
reg query "HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv >nul 2>nul && exit /b 0
reg query "HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv >nul 2>nul && exit /b 0
exit /b 1
