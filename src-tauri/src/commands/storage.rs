use crate::db::Database;
use crate::storage_config::{
    current_storage_info, portable_data_dir, user_data_dir, write_config, StorageLocationConfig,
    StorageLocationInfo, StorageLocationKind,
};
use rusqlite::{backup::Backup, Connection};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::AppHandle;
use tauri::State;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveStorageLocationResult {
    pub location: StorageLocationInfo,
    pub migrated: bool,
}

fn resolve_target_dir(
    app: &AppHandle,
    kind: StorageLocationKind,
    custom_path: &Option<String>,
) -> Result<PathBuf, String> {
    match kind {
        StorageLocationKind::User => user_data_dir(app),
        StorageLocationKind::Portable => portable_data_dir(),
        StorageLocationKind::Custom => {
            let path = custom_path
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "custom storage path is required".to_string())?;
            Ok(PathBuf::from(path))
        }
    }
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }

    fs::create_dir_all(target).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        if metadata.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else {
            fs::copy(&source_path, &target_path).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn remove_dir_contents(path: &Path) {
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                let _ = fs::remove_dir_all(&entry_path);
            } else {
                let _ = fs::remove_file(&entry_path);
            }
        }
    }
}

fn migrate_live_data(db: &Database, target_dir: &Path) -> Result<bool, String> {
    let source_dir = db.app_data_dir.read().unwrap().clone();
    if source_dir == target_dir {
        return Ok(false);
    }

    fs::create_dir_all(target_dir).map_err(|e| e.to_string())?;
    let source_db = source_dir.join("packing_list.db");
    let target_db = target_dir.join("packing_list.db");
    let source_exports = source_dir.join("exports");
    let target_exports = target_dir.join("exports");

    let mut guard = db.conn.lock().unwrap();
    guard
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| e.to_string())?;

    let mut target_conn = Connection::open(&target_db).map_err(|e| e.to_string())?;
    {
        let backup = Backup::new(&*guard, &mut target_conn).map_err(|e| e.to_string())?;
        backup
            .run_to_completion(5, Duration::from_millis(250), None)
            .map_err(|e| e.to_string())?;
    }

    copy_dir_recursive(&source_exports, &target_exports)?;

    let old_conn = std::mem::replace(&mut *guard, target_conn);
    drop(old_conn);
    drop(guard);

    *db.app_data_dir.write().unwrap() = target_dir.to_path_buf();

    if source_db.exists() {
        let _ = fs::remove_file(&source_db);
    }
    if source_exports.exists() {
        let _ = fs::remove_dir_all(&source_exports);
    }
    remove_dir_contents(&source_dir);
    let _ = fs::remove_dir(&source_dir);

    Ok(true)
}

#[tauri::command]
pub fn load_storage_location(app: AppHandle) -> Result<StorageLocationInfo, String> {
    current_storage_info(&app)
}

#[tauri::command]
pub fn save_storage_location(
    app: AppHandle,
    db: State<'_, Database>,
    kind: String,
    custom_path: Option<String>,
) -> Result<SaveStorageLocationResult, String> {
    let kind = StorageLocationKind::from_str(&kind)
        .ok_or_else(|| "invalid storage location kind".to_string())?;

    let normalized_custom_path = match kind {
        StorageLocationKind::Custom => {
            let path = custom_path
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "custom storage path is required".to_string())?;
            Some(path.to_string())
        }
        _ => None,
    };

    let target_dir = resolve_target_dir(&app, kind, &normalized_custom_path)?;
    let migrated = migrate_live_data(&db, &target_dir)?;

    write_config(
        &app,
        &StorageLocationConfig {
            kind,
            custom_path: normalized_custom_path,
            confirmed: true,
        },
    )?;

    Ok(SaveStorageLocationResult {
        location: current_storage_info(&app)?,
        migrated,
    })
}

/// Returns true when this app was launched by a full singlefile launcher
/// that has already extracted a lite launcher to AppData.
#[tauri::command]
pub fn check_shrink_available() -> bool {
    let launcher = env::var("PACKING_LIST_LAUNCHER_EXE").unwrap_or_default();
    let lite = env::var("PACKING_LIST_LITE_EXE").unwrap_or_default();
    !launcher.is_empty() && !lite.is_empty()
        && PathBuf::from(&launcher).exists()
        && PathBuf::from(&lite).exists()
}

/// Replace the full launcher EXE with the lite launcher via a CMD swap script.
/// The app keeps running; the swap takes effect the next time the launcher is opened.
#[tauri::command]
pub fn shrink_to_lite() -> Result<(), String> {
    let launcher_str = env::var("PACKING_LIST_LAUNCHER_EXE")
        .map_err(|_| "launcher path not available".to_string())?;
    let lite_str = env::var("PACKING_LIST_LITE_EXE")
        .map_err(|_| "lite EXE path not available".to_string())?;

    let launcher = PathBuf::from(&launcher_str);
    let lite = PathBuf::from(&lite_str);

    if !lite.exists() {
        return Err("lite EXE not found".to_string());
    }

    // Rename: replace "-full-" with "-lite-" in the launcher filename if present.
    let target = launcher
        .file_name()
        .and_then(|n| n.to_str())
        .map(|name| name.replace("-full-", "-lite-"))
        .map(|new_name| launcher.with_file_name(new_name))
        .unwrap_or_else(|| launcher.clone());

    let temp_dir = env::temp_dir();
    let cmd_path = temp_dir.join("packing-list-swap.cmd");

    let script = format!(
        "@echo off\r\n\
         timeout /t 1 /nobreak >nul\r\n\
         copy /y \"{lite_str}\" \"{target}\" >nul\r\n\
         del \"%~f0\"\r\n",
        lite_str = lite.to_string_lossy(),
        target = target.to_string_lossy(),
    );
    fs::write(&cmd_path, script.as_bytes()).map_err(|e| e.to_string())?;

    Command::new("cmd")
        .args(["/c", "start", "/min", "\"\"", cmd_path.to_str().unwrap()])
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}
