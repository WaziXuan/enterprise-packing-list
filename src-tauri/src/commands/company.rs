use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Company {
    pub id: Option<i64>,
    pub name: String,
    pub address: String,
    pub contact_person: String,
    pub phone: String,
    pub logo_path: String,
    pub stamp_path: String,
}

#[tauri::command]
pub fn list_companies(db: State<'_, Database>) -> Result<Vec<Company>, String> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, address, contact_person, phone, logo_path, stamp_path FROM companies ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Company {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                address: row.get(2)?,
                contact_person: row.get(3)?,
                phone: row.get(4)?,
                logo_path: row.get(5)?,
                stamp_path: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut companies = Vec::new();
    for row in rows {
        companies.push(row.map_err(|e| e.to_string())?);
    }
    Ok(companies)
}

#[tauri::command]
pub fn save_company(db: State<'_, Database>, company: Company) -> Result<i64, String> {
    let conn = db.conn.lock().unwrap();
    if let Some(id) = company.id {
        conn.execute(
            "UPDATE companies SET name=?1, address=?2, contact_person=?3, phone=?4, logo_path=?5, stamp_path=?6 WHERE id=?7",
            rusqlite::params![company.name, company.address, company.contact_person, company.phone, company.logo_path, company.stamp_path, id],
        ).map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO companies (name, address, contact_person, phone, logo_path, stamp_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![company.name, company.address, company.contact_person, company.phone, company.logo_path, company.stamp_path],
        ).map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }
}

#[tauri::command]
pub fn delete_company(db: State<'_, Database>, id: i64) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM companies WHERE id=?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
