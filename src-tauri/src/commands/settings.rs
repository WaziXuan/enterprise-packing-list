use crate::db::Database;
use serde::{Deserialize, Serialize};
use tauri::State;

fn default_theme_mode() -> String {
    "system".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AppSettings {
    pub customer_path: String,
    pub inventory_path: String,
    pub export_dir: String,
    pub customer_imported_at: String,
    pub inventory_imported_at: String,
    pub theme_mode: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            customer_path: String::new(),
            inventory_path: String::new(),
            export_dir: String::new(),
            customer_imported_at: String::new(),
            inventory_imported_at: String::new(),
            theme_mode: default_theme_mode(),
        }
    }
}

#[tauri::command]
pub fn load_settings(db: State<'_, Database>) -> Result<AppSettings, String> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT key, value FROM app_settings")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let mut settings = AppSettings::default();
    for row in rows {
        let (key, value) = row.map_err(|e| e.to_string())?;
        match key.as_str() {
            "customer_path" => settings.customer_path = value,
            "inventory_path" => settings.inventory_path = value,
            "export_dir" => settings.export_dir = value,
            "customer_imported_at" => settings.customer_imported_at = value,
            "inventory_imported_at" => settings.inventory_imported_at = value,
            "theme_mode" => settings.theme_mode = value,
            _ => {}
        }
    }

    Ok(settings)
}

#[tauri::command]
pub fn save_settings(
    db: State<'_, Database>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let conn = db.conn.lock().unwrap();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    for (key, value) in [
        ("customer_path", settings.customer_path.as_str()),
        ("inventory_path", settings.inventory_path.as_str()),
        ("export_dir", settings.export_dir.as_str()),
        ("customer_imported_at", settings.customer_imported_at.as_str()),
        ("inventory_imported_at", settings.inventory_imported_at.as_str()),
        ("theme_mode", settings.theme_mode.as_str()),
    ] {
        tx.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![key, value],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(settings)
}

#[tauri::command]
pub fn load_theme_mode(db: State<'_, Database>) -> Result<String, String> {
    let conn = db.conn.lock().unwrap();
    let value = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'theme_mode'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| default_theme_mode());

    Ok(value)
}

#[tauri::command]
pub fn save_theme_mode(db: State<'_, Database>, theme_mode: String) -> Result<String, String> {
    let normalized = match theme_mode.as_str() {
        "light" | "dark" | "system" => theme_mode,
        _ => default_theme_mode(),
    };

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES ('theme_mode', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![normalized.as_str()],
    )
    .map_err(|e| e.to_string())?;

    Ok(normalized)
}
