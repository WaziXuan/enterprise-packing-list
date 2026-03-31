use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackingListRecord {
    pub id: Option<i64>,
    pub company_id: i64,
    pub invoice_number: String,
    pub warehouse_number: String,
    pub consignee_company: String,
    pub consignee_address: String,
    pub consignee_contact: String,
    pub consignee_phone: String,
    pub consignee_mobile: String,
    pub delivery_company: String,
    pub delivery_address: String,
    pub delivery_contact: String,
    pub delivery_phone: String,
    pub pdf_path: String,
    pub items: Vec<PackingListItem>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackingListItem {
    pub box_number: i32,
    pub part_no: String,
    pub description: String,
    pub qty: i32,
    pub net_weight: f64,
    pub gross_weight: f64,
    pub dimension: String,
    pub brand: String,
    pub coo: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct HistorySummary {
    pub id: i64,
    pub company_id: i64,
    pub invoice_number: String,
    pub consignee_company: String,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn list_history(db: State<'_, Database>, keyword: String) -> Result<Vec<HistorySummary>, String> {
    let conn = db.conn.lock().unwrap();
    let sql = if keyword.is_empty() {
        "SELECT id, company_id, invoice_number, consignee_company, created_at, updated_at FROM packing_lists ORDER BY updated_at DESC".to_string()
    } else {
        format!(
            "SELECT id, company_id, invoice_number, consignee_company, created_at, updated_at FROM packing_lists WHERE invoice_number LIKE '%{kw}%' OR consignee_company LIKE '%{kw}%' ORDER BY updated_at DESC",
            kw = keyword.replace('\'', "''")
        )
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(HistorySummary {
                id: row.get(0)?,
                company_id: row.get(1)?,
                invoice_number: row.get(2)?,
                consignee_company: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

#[tauri::command]
pub fn load_packing_list(db: State<'_, Database>, id: i64) -> Result<PackingListRecord, String> {
    let conn = db.conn.lock().unwrap();
    let record = conn
        .query_row(
            "SELECT id, company_id, invoice_number, warehouse_number, consignee_company, consignee_address, consignee_contact, consignee_phone, consignee_mobile, delivery_company, delivery_address, delivery_contact, delivery_phone, pdf_path, created_at FROM packing_lists WHERE id=?1",
            rusqlite::params![id],
            |row| {
                Ok(PackingListRecord {
                    id: Some(row.get(0)?),
                    company_id: row.get(1)?,
                    invoice_number: row.get(2)?,
                    warehouse_number: row.get(3)?,
                    consignee_company: row.get(4)?,
                    consignee_address: row.get(5)?,
                    consignee_contact: row.get(6)?,
                    consignee_phone: row.get(7)?,
                    consignee_mobile: row.get(8)?,
                    delivery_company: row.get(9)?,
                    delivery_address: row.get(10)?,
                    delivery_contact: row.get(11)?,
                    delivery_phone: row.get(12)?,
                    pdf_path: row.get(13)?,
                    items: Vec::new(),
                    created_at: Some(row.get(14)?),
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT box_number, part_no, description, qty, net_weight, gross_weight, dimension, brand, coo FROM packing_list_items WHERE packing_list_id=?1 ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(rusqlite::params![id], |row| {
            Ok(PackingListItem {
                box_number: row.get(0)?,
                part_no: row.get(1)?,
                description: row.get(2)?,
                qty: row.get(3)?,
                net_weight: row.get(4)?,
                gross_weight: row.get(5)?,
                dimension: row.get(6)?,
                brand: row.get(7)?,
                coo: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut record = record;
    for item in items {
        record.items.push(item.map_err(|e| e.to_string())?);
    }
    Ok(record)
}

#[tauri::command]
pub fn save_packing_list(db: State<'_, Database>, record: PackingListRecord) -> Result<i64, String> {
    let conn = db.conn.lock().unwrap();
    let id = if let Some(existing_id) = record.id {
        conn.execute(
            "UPDATE packing_lists SET company_id=?1, invoice_number=?2, warehouse_number=?3, consignee_company=?4, consignee_address=?5, consignee_contact=?6, consignee_phone=?7, consignee_mobile=?8, delivery_company=?9, delivery_address=?10, delivery_contact=?11, delivery_phone=?12, pdf_path=?13, updated_at=CURRENT_TIMESTAMP WHERE id=?14",
            rusqlite::params![record.company_id, record.invoice_number, record.warehouse_number, record.consignee_company, record.consignee_address, record.consignee_contact, record.consignee_phone, record.consignee_mobile, record.delivery_company, record.delivery_address, record.delivery_contact, record.delivery_phone, record.pdf_path, existing_id],
        ).map_err(|e| e.to_string())?;
        // Delete old items
        conn.execute("DELETE FROM packing_list_items WHERE packing_list_id=?1", rusqlite::params![existing_id])
            .map_err(|e| e.to_string())?;
        existing_id
    } else {
        conn.execute(
            "INSERT INTO packing_lists (company_id, invoice_number, warehouse_number, consignee_company, consignee_address, consignee_contact, consignee_phone, consignee_mobile, delivery_company, delivery_address, delivery_contact, delivery_phone, pdf_path) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            rusqlite::params![record.company_id, record.invoice_number, record.warehouse_number, record.consignee_company, record.consignee_address, record.consignee_contact, record.consignee_phone, record.consignee_mobile, record.delivery_company, record.delivery_address, record.delivery_contact, record.delivery_phone, record.pdf_path],
        ).map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };

    // Insert items
    for (idx, item) in record.items.iter().enumerate() {
        conn.execute(
            "INSERT INTO packing_list_items (packing_list_id, box_number, part_no, description, qty, net_weight, gross_weight, dimension, brand, coo, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            rusqlite::params![id, item.box_number, item.part_no, item.description, item.qty, item.net_weight, item.gross_weight, item.dimension, item.brand, item.coo, idx as i32],
        ).map_err(|e| e.to_string())?;
    }

    Ok(id)
}

#[tauri::command]
pub fn delete_packing_list(db: State<'_, Database>, id: i64) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM packing_list_items WHERE packing_list_id=?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM packing_lists WHERE id=?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
