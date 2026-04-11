use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult};

const CONFIG_FILE_NAME: &str = "storage-location.json";
const PORTABLE_STORAGE_DIR: &str = "packing-list-data";
pub const WRAPPER_DIR_ENV: &str = "PACKING_LIST_WRAPPER_DIR";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StorageLocationKind {
    User,
    Portable,
    Custom,
}

impl StorageLocationKind {
    pub fn from_str(value: &str) -> Option<Self> {
        match value.trim() {
            "user" => Some(Self::User),
            "portable" => Some(Self::Portable),
            "custom" => Some(Self::Custom),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageLocationConfig {
    pub kind: StorageLocationKind,
    pub custom_path: Option<String>,
    #[serde(default)]
    pub confirmed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageLocationInfo {
    pub kind: StorageLocationKind,
    pub effective_path: String,
    pub user_default_path: String,
    pub portable_default_path: String,
    pub custom_path: String,
    pub config_exists: bool,
}

fn simplify_path(path: PathBuf) -> PathBuf {
    path
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(CONFIG_FILE_NAME))
}

pub fn wrapper_dir() -> Result<PathBuf, String> {
    std::env::var_os(WRAPPER_DIR_ENV)
        .map(PathBuf::from)
        .filter(|path| path.exists())
        .or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(Path::to_path_buf))
        })
        .map(simplify_path)
        .ok_or_else(|| "failed to resolve wrapper directory".to_string())
}

pub fn portable_data_dir() -> Result<PathBuf, String> {
    Ok(wrapper_dir()?.join(PORTABLE_STORAGE_DIR))
}

pub fn user_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(simplify_path)
        .map_err(|e| e.to_string())
}

fn read_config(app: &AppHandle) -> Result<Option<StorageLocationConfig>, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let config = serde_json::from_str::<StorageLocationConfig>(&raw).map_err(|e| e.to_string())?;
    Ok(Some(config))
}

pub fn write_config(app: &AppHandle, config: &StorageLocationConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

fn resolve_config_dir(
    _app: &AppHandle,
    config: &StorageLocationConfig,
    user_dir: &Path,
    portable_dir: &Path,
) -> Result<PathBuf, String> {
    match config.kind {
        StorageLocationKind::User => Ok(user_dir.to_path_buf()),
        StorageLocationKind::Portable => Ok(portable_dir.to_path_buf()),
        StorageLocationKind::Custom => {
            let custom = config
                .custom_path
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "custom storage path is missing".to_string())?;
            Ok(simplify_path(PathBuf::from(custom)))
        }
    }
}

fn has_database(dir: &Path) -> bool {
    dir.join("packing_list.db").exists()
}

fn describe_candidate(path: &Path, has_data: bool) -> String {
    format!(
        "{}{}",
        path.display(),
        if has_data { "（已存在历史数据）" } else { "（暂无历史数据）" }
    )
}

fn pick_custom_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .ok_or_else(|| "storage selection cancelled".to_string())?
        .into_path()
        .map(simplify_path)
        .map_err(|e| e.to_string())
}

fn prompt_for_storage(
    app: &AppHandle,
    user_dir: &Path,
    portable_dir: &Path,
) -> Result<StorageLocationConfig, String> {
    let user_label = "使用用户目录".to_string();
    let portable_label = "使用 EXE 同目录".to_string();
    let custom_label = "自定义目录".to_string();
    let user_exists = has_database(user_dir);
    let portable_exists = has_database(portable_dir);

    let message = format!(
        "首次启动需要先确定数据存储位置。\n\n用户目录：{}\nEXE 同目录：{}\n\n请选择要使用的位置。以后可以在“设置”里修改。",
        describe_candidate(user_dir, user_exists),
        describe_candidate(portable_dir, portable_exists),
    );

    match app
        .dialog()
        .message(message)
        .title("选择数据存储位置")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::YesNoCancelCustom(
            user_label.clone(),
            portable_label.clone(),
            custom_label.clone(),
        ))
        .blocking_show_with_result()
    {
        MessageDialogResult::Yes => Ok(StorageLocationConfig {
            kind: StorageLocationKind::User,
            custom_path: None,
            confirmed: true,
        }),
        MessageDialogResult::No => Ok(StorageLocationConfig {
            kind: StorageLocationKind::Portable,
            custom_path: None,
            confirmed: true,
        }),
        MessageDialogResult::Custom(choice) if choice == user_label => Ok(StorageLocationConfig {
            kind: StorageLocationKind::User,
            custom_path: None,
            confirmed: true,
        }),
        MessageDialogResult::Custom(choice) if choice == portable_label => Ok(StorageLocationConfig {
            kind: StorageLocationKind::Portable,
            custom_path: None,
            confirmed: true,
        }),
        MessageDialogResult::Custom(choice) if choice == custom_label => Ok(StorageLocationConfig {
            kind: StorageLocationKind::Custom,
            custom_path: Some(pick_custom_dir(app)?.to_string_lossy().into_owned()),
            confirmed: true,
        }),
        MessageDialogResult::Custom(_) => Err("unexpected storage selection".to_string()),
        _ => Err("startup cancelled".to_string()),
    }
}

pub fn resolve_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let user_dir = user_data_dir(app)?;
    let portable_dir = portable_data_dir()?;

    if let Some(config) = read_config(app)? {
        if config.confirmed {
            return resolve_config_dir(app, &config, &user_dir, &portable_dir);
        }
    }

    let config = prompt_for_storage(app, &user_dir, &portable_dir)?;
    let resolved = resolve_config_dir(app, &config, &user_dir, &portable_dir)?;
    write_config(app, &config)?;
    Ok(resolved)
}

pub fn current_storage_info(app: &AppHandle) -> Result<StorageLocationInfo, String> {
    let user_dir = user_data_dir(app)?;
    let portable_dir = portable_data_dir()?;
    let config = read_config(app)?.unwrap_or(StorageLocationConfig {
        kind: StorageLocationKind::User,
        custom_path: None,
        confirmed: false,
    });
    let effective = resolve_config_dir(app, &config, &user_dir, &portable_dir)?;

    Ok(StorageLocationInfo {
        kind: config.kind,
        effective_path: effective.to_string_lossy().into_owned(),
        user_default_path: user_dir.to_string_lossy().into_owned(),
        portable_default_path: portable_dir.to_string_lossy().into_owned(),
        custom_path: config.custom_path.unwrap_or_default(),
        config_exists: read_config(app)?.is_some(),
    })
}
