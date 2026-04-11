@echo off
setlocal

cd /d "%~dp0"

set "APP_EXE=%~dp0packing-list.exe"
set "APP_DATA_DIR=%~dp0packing-list-data"
set "WEBVIEW_USER_DATA=%APP_DATA_DIR%\webview2-user-data"
set "WEBVIEW_BOOTSTRAPPER=%~dp0MicrosoftEdgeWebview2Setup.exe"
set "WEBVIEW_STANDALONE_X64=%~dp0MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
set "WEBVIEW_STANDALONE_X86=%~dp0MicrosoftEdgeWebView2RuntimeInstallerX86.exe"
set "FIXED_RUNTIME_DIR="

if not exist "%APP_EXE%" (
  echo [packing-list] ERROR: packing-list.exe not found.
  pause
  exit /b 1
)

if not exist "%APP_DATA_DIR%" mkdir "%APP_DATA_DIR%" >nul 2>nul
if not exist "%WEBVIEW_USER_DATA%" mkdir "%WEBVIEW_USER_DATA%" >nul 2>nul
set "WEBVIEW2_USER_DATA_FOLDER=%WEBVIEW_USER_DATA%"

for /d %%D in ("%~dp0Microsoft.WebView2.FixedVersionRuntime*") do (
  set "FIXED_RUNTIME_DIR=%%~fD"
  goto :runtime_ready
)

call :has_webview2_runtime
if errorlevel 1 goto :runtime_missing
goto :runtime_ready

:runtime_missing
echo [packing-list] WebView2 Runtime was not detected.
echo.
if exist "%WEBVIEW_BOOTSTRAPPER%" (
  echo [packing-list] Launching bundled MicrosoftEdgeWebview2Setup.exe ...
  start /wait "" "%WEBVIEW_BOOTSTRAPPER%"
  call :has_webview2_runtime
  if not errorlevel 1 goto :runtime_ready
)
if exist "%WEBVIEW_STANDALONE_X64%" (
  echo [packing-list] Launching bundled MicrosoftEdgeWebView2RuntimeInstallerX64.exe ...
  start /wait "" "%WEBVIEW_STANDALONE_X64%"
  call :has_webview2_runtime
  if not errorlevel 1 goto :runtime_ready
)
if exist "%WEBVIEW_STANDALONE_X86%" (
  echo [packing-list] Launching bundled MicrosoftEdgeWebView2RuntimeInstallerX86.exe ...
  start /wait "" "%WEBVIEW_STANDALONE_X86%"
  call :has_webview2_runtime
  if not errorlevel 1 goto :runtime_ready
)

echo [packing-list] Cannot start because WebView2 Runtime is missing.
echo [packing-list] Put one of these files next to this launcher, then run it again:
echo [packing-list]   MicrosoftEdgeWebview2Setup.exe
echo [packing-list]   MicrosoftEdgeWebView2RuntimeInstallerX64.exe
echo [packing-list] Or bundle a folder named Microsoft.WebView2.FixedVersionRuntime* next to the EXE.
pause
exit /b 1

:runtime_ready
if defined FIXED_RUNTIME_DIR (
  set "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER=%FIXED_RUNTIME_DIR%"
)

start "" "%APP_EXE%"
exit /b 0

:has_webview2_runtime
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv >nul 2>nul && exit /b 0
reg query "HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv >nul 2>nul && exit /b 0
reg query "HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv >nul 2>nul && exit /b 0
exit /b 1
