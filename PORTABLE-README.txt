Portable package usage
======================

1. Start the app with `Start Packing List.cmd`.
2. Do not launch the bare `packing-list.exe` directly on a new machine.
3. The launcher keeps app data under `packing-list-data` next to the EXE.

WebView2
--------

This app needs Microsoft WebView2 Runtime on Windows.

The launcher supports three portable-friendly cases:

1. WebView2 is already installed on the computer.
2. A bundled installer is placed next to the launcher:
   - `MicrosoftEdgeWebview2Setup.exe`
   - `MicrosoftEdgeWebView2RuntimeInstallerX64.exe`
   - `MicrosoftEdgeWebView2RuntimeInstallerX86.exe`
3. A bundled fixed runtime folder is placed next to the launcher:
   - `Microsoft.WebView2.FixedVersionRuntime*`

Release packaging
-----------------

`release-portable.bat` creates a ZIP in `portable-release\`.
Publish that ZIP instead of the bare EXE.

Optional assets
---------------

If you want the ZIP to work on clean computers without manual preparation,
put one of the supported WebView2 installers or a fixed runtime folder under
`portable-assets\` before running `release-portable.bat`.
