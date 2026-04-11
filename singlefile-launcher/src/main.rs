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

    run_app(&app_path, &webview_user_data, &wrapper_dir)
}
