use crate::db::Database;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub customer_path: String,
    pub inventory_path: String,
    pub export_dir: String,
    pub customer_imported_at: String,
    pub inventory_imported_at: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            customer_path: String::new(),
            inventory_path: String::new(),
            export_dir: String::new(),
            customer_imported_at: String::new(),
            inventory_imported_at: String::new(),
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
