@echo off
setlocal

cd /d "%~dp0"

echo [packing-list] Stopping old GUI and dev server...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$listener = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue; " ^
  "if ($listener) { $listener | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }; " ^
  "Get-Process packing-list -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"

echo [packing-list] Starting GUI...
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
call npm run tauri dev

endlocal
