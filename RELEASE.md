# Portable Release

Use this command:

```bat
npm.cmd run release:portable
```

The release script now builds a real portable package instead of publishing a bare EXE.

It does these steps in order:

1. Build the frontend into `dist`
2. Build the Tauri portable EXE
3. Create `portable-release\packing-list-portable-v<version>\`
4. Copy these files into the package:
   - `packing-list.exe`
   - `Start Packing List.cmd`
   - `README.txt`
   - `storage-mode.txt` with `portable`
5. Copy optional WebView2 assets from `portable-assets\` if present
6. Zip the package folder into `portable-release\packing-list-portable-v<version>.zip`

Publish this ZIP:

```text
portable-release\packing-list-portable-v<version>.zip
```

Do not publish only this file on its own:

```text
src-tauri\target\release\packing-list.exe
```

## Optional WebView2 assets

If the target computer may not have WebView2 installed, put one of these into `portable-assets\` before running the release script:

```text
portable-assets\MicrosoftEdgeWebview2Setup.exe
portable-assets\MicrosoftEdgeWebView2RuntimeInstallerX64.exe
portable-assets\MicrosoftEdgeWebView2RuntimeInstallerX86.exe
portable-assets\Microsoft.WebView2.FixedVersionRuntime*
```

The packaging script will copy them into the portable ZIP automatically.

## Single-file EXE releases

If you want to ship exactly one EXE to the user, there are now two wrapper builds:

```bat
npm.cmd run build:single-online
npm.cmd run build:single-offline
```

Outputs:

```text
singlefile-release\packing-list-single-online-v<version>.exe
singlefile-release\packing-list-single-offline-v<version>.exe
```

Asset requirements under `portable-assets\`:

```text
portable-assets\MicrosoftEdgeWebview2Setup.exe
portable-assets\MicrosoftEdgeWebView2RuntimeInstallerX64.exe
```

Behavior:

1. `single-online` bundles the small online WebView2 bootstrapper.
2. `single-offline` bundles the offline x64 WebView2 installer.
3. Both EXEs self-extract at launch, check for WebView2, install it if missing, then start `packing-list.exe`.

## Quick checks before publishing

1. Open the packaged app with `Start Packing List.cmd`
2. Confirm `packing-list-data\` is created next to the EXE
3. Confirm the app starts on a machine that does not have your old user profile paths
4. If possible, test once on a clean Windows machine
