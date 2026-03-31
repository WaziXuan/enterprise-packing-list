use crate::commands::history::PackingListRecord;
use crate::db::Database;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormSnapshotSummary {
    pub id: i64,
    pub packing_list_id: Option<i64>,
    pub action_label: String,
    pub invoice_number: String,
    pub consignee_company: String,
    pub created_at: String,
}

fn cleanup_old_snapshots(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM form_snapshots WHERE created_at < datetime('now', '-7 days')",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_form_snapshot(
    db: State<'_, Database>,
    record: PackingListRecord,
    action_label: String,
) -> Result<i64, String> {
    let conn = db.conn.lock().unwrap();
    cleanup_old_snapshots(&conn)?;

    let payload_json = serde_json::to_string(&record).map_err(|e| e.to_string())?;
    let invoice_number = record.invoice_number.trim().to_string();
    let consignee_company = record.consignee_company.trim().to_string();

    let latest: Option<(String, String)> = conn
        .query_row(
            "SELECT payload_json, action_label FROM form_snapshots ORDER BY id DESC LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    if let Some((latest_payload, latest_action)) = latest {
        if latest_payload == payload_json && latest_action == action_label {
            return Ok(0);
        }
    }

    conn.execute(
        "INSERT INTO form_snapshots (packing_list_id, action_label, invoice_number, consignee_company, payload_json) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            record.id,
            action_label,
            invoice_number,
            consignee_company,
            payload_json
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn list_form_snapshots(
    db: State<'_, Database>,
    keyword: String,
) -> Result<Vec<FormSnapshotSummary>, String> {
    let conn = db.conn.lock().unwrap();
    cleanup_old_snapshots(&conn)?;

    let keyword = keyword.trim();
    let like_keyword = format!("%{}%", keyword.replace('%', "\\%").replace('_', "\\_"));
    let mut stmt = if keyword.is_empty() {
        conn.prepare(
            "SELECT id, packing_list_id, action_label, invoice_number, consignee_company, created_at
             FROM form_snapshots
             ORDER BY created_at DESC, id DESC
             LIMIT 200",
        )
    } else {
        conn.prepare(
            "SELECT id, packing_list_id, action_label, invoice_number, consignee_company, created_at
             FROM form_snapshots
             WHERE action_label LIKE ?1 ESCAPE '\\'
                OR invoice_number LIKE ?1 ESCAPE '\\'
                OR consignee_company LIKE ?1 ESCAPE '\\'
                OR created_at LIKE ?1 ESCAPE '\\'
             ORDER BY created_at DESC, id DESC
             LIMIT 200",
        )
    }
    .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    if keyword.is_empty() {
        let rows = stmt
            .query_map([], |row| {
                Ok(FormSnapshotSummary {
                    id: row.get(0)?,
                    packing_list_id: row.get(1)?,
                    action_label: row.get(2)?,
                    invoice_number: row.get(3)?,
                    consignee_company: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            list.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        let rows = stmt
            .query_map(rusqlite::params![like_keyword], |row| {
                Ok(FormSnapshotSummary {
                    id: row.get(0)?,
                    packing_list_id: row.get(1)?,
                    action_label: row.get(2)?,
                    invoice_number: row.get(3)?,
                    consignee_company: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            list.push(row.map_err(|e| e.to_string())?);
        }
    }
    Ok(list)
}

#[tauri::command]
pub fn load_form_snapshot(
    db: State<'_, Database>,
    id: i64,
) -> Result<PackingListRecord, String> {
    let conn = db.conn.lock().unwrap();
    cleanup_old_snapshots(&conn)?;

    let payload_json: String = conn
        .query_row(
            "SELECT payload_json FROM form_snapshots WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    serde_json::from_str(&payload_json).map_err(|e| e.to_string())
}
