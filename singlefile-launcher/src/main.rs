#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod assets {
    include!(concat!(env!("OUT_DIR"), "/asset_bindings.rs"));
}

use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

const APP_FILE_NAME: &str = "packing-list.exe";
const WRAPPER_DIR_ENV: &str = "PACKING_LIST_WRAPPER_DIR";
const FORCE_WEBVIEW2_INSTALL_ENV: &str = "PACKING_LIST_FORCE_WEBVIEW2_INSTALL";

fn local_app_data_dir() -> io::Result<PathBuf> {
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "LOCALAPPDATA is missing"))
}

fn launcher_dir() -> io::Result<PathBuf> {
    env::current_exe()?
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "launcher directory is missing"))
}

fn ensure_dir(path: &Path) -> io::Result<()> {
    fs::create_dir_all(path)
}

fn write_if_changed(path: &Path, bytes: &[u8]) -> io::Result<()> {
    match fs::read(path) {
        Ok(existing) if existing == bytes => Ok(()),
        _ => fs::write(path, bytes),
    }
}

fn has_webview2_runtime() -> bool {
    let keys = [
        r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        r"HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    ];

    keys.iter().any(|key| {
        Command::new("reg")
            .args(["query", key, "/v", "pv"])
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    })
}

fn wait_for_webview2_runtime(timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        if has_webview2_runtime() {
            return true;
        }

        if Instant::now() >= deadline {
            return false;
        }

        thread::sleep(Duration::from_millis(500));
    }
}

fn force_webview2_install() -> bool {
    matches!(
        env::var(FORCE_WEBVIEW2_INSTALL_ENV)
            .ok()
            .as_deref()
            .map(str::trim),
        Some("1") | Some("true") | Some("TRUE") | Some("yes") | Some("YES")
    )
}

fn install_webview2(runtime_path: &Path) -> io::Result<()> {
    let status = Command::new(runtime_path)
        .args(["/silent", "/install"])
        .status()?;

    if status.success() {
        Ok(())
    } else {
        Err(io::Error::new(
            io::ErrorKind::Other,
            format!("runtime installer exited with status {status}"),
        ))
    }
}

fn run_app(
    app_path: &Path,
    webview_user_data: &Path,
    wrapper_dir: &Path,
) -> io::Result<()> {
    let mut command = Command::new(app_path);
    command.current_dir(wrapper_dir);
    command.env("WEBVIEW2_USER_DATA_FOLDER", webview_user_data);
    command.env(WRAPPER_DIR_ENV, wrapper_dir);
    let _child = command.spawn()?;
    Ok(())
}

// --- Self-replace logic (offline build only) ---

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn ask_replace_with_online() -> bool {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut core::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            utype: u32,
        ) -> i32;
    }

    let text = to_wide(
        "WebView2 已安装完成。\n\n\
         当前文件内含 WebView2 离线安装包（约 192 MB），现在已不再需要。\n\n\
         是否将当前文件替换为轻量版（约 18 MB）？\n\n\
         轻量版功能完全相同，替换后将自动启动应用。",
    );
    let caption = to_wide("Packing List — 节省空间");

    // MB_YESNO | MB_ICONQUESTION = 0x0024
    let result = unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            0x0024,
        )
    };
    result == 6 // IDYES
}

fn replace_self_with_lite(current_exe: &Path) -> io::Result<()> {
    let temp_dir = env::temp_dir();
    let temp_exe = temp_dir.join("packing-list-lite-tmp.exe");
    let cmd_path = temp_dir.join("packing-list-swap.cmd");

    fs::write(&temp_exe, assets::ONLINE_EXE_BYTES)?;

    // Rename: replace "-full-" with "-lite-" in the filename if present.
    let target_exe = current_exe
        .file_name()
        .and_then(|n| n.to_str())
        .map(|name| name.replace("-full-", "-lite-"))
        .map(|new_name| current_exe.with_file_name(new_name))
        .unwrap_or_else(|| current_exe.to_path_buf());

    let target_str = target_exe.to_string_lossy();
    let temp_str = temp_exe.to_string_lossy();

    // Wait for this process to exit, move the lite EXE into place, then launch it.
    let script = format!(
        "@echo off\r\n\
         timeout /t 2 /nobreak >nul\r\n\
         move /y \"{temp_str}\" \"{target_str}\" >nul\r\n\
         start \"\" \"{target_str}\"\r\n\
         del \"%~f0\"\r\n"
    );
    fs::write(&cmd_path, script.as_bytes())?;

    Command::new("cmd")
        .args(["/c", "start", "/min", "\"\"", cmd_path.to_str().unwrap()])
        .spawn()?;

    Ok(())
}

fn main() -> io::Result<()> {
    let wrapper_dir = launcher_dir()?;

    let base_dir = local_app_data_dir()?.join("PackingListSingle").join(assets::MODE);
    let app_dir = base_dir.join("app");
    let runtime_dir = base_dir.join("runtime");
    let webview_user_data = base_dir.join("webview2-user-data");

    ensure_dir(&app_dir)?;
    ensure_dir(&runtime_dir)?;
    ensure_dir(&webview_user_data)?;

    let app_path = app_dir.join(APP_FILE_NAME);
    let runtime_path = runtime_dir.join(assets::RUNTIME_FILE_NAME);

    write_if_changed(&app_path, assets::APP_EXE_BYTES)?;
    write_if_changed(&runtime_path, assets::RUNTIME_EXE_BYTES)?;

    let runtime_missing = !has_webview2_runtime();
    if runtime_missing || force_webview2_install() {
        install_webview2(&runtime_path)?;
    }

    if !wait_for_webview2_runtime(Duration::from_secs(10)) {
        return Err(io::Error::new(
            io::ErrorKind::Other,
            "WebView2 Runtime is still missing after installation",
        ));
    }

    // Offer to replace this large full EXE with the lightweight lite version.
    // Only shown when WebView2 was actually just installed (not already present).
    if runtime_missing && assets::HAS_ONLINE_EXE {
        if let Ok(current_exe) = env::current_exe() {
            if ask_replace_with_online() {
                if replace_self_with_lite(&current_exe).is_ok() {
                    // CMD helper will launch the lite EXE after we exit.
                    return Ok(());
                }
                // Replacement failed — fall through and start the app normally.
            }
        }
    }

    run_app(&app_path, &webview_user_data, &wrapper_dir)
}
