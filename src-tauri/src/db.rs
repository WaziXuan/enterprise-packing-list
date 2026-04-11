use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};

pub struct Database {
    pub conn: Mutex<Connection>,
    pub app_data_dir: RwLock<PathBuf>,
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|_| rusqlite::Error::InvalidPath(app_data_dir.clone()))?;
        let db_path = app_data_dir.join("packing_list.db");
        let conn = Connection::open(db_path)?;
        let db = Self {
            conn: Mutex::new(conn),
            app_data_dir: RwLock::new(app_data_dir),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS companies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                address TEXT DEFAULT '',
                contact_person TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                logo_path TEXT DEFAULT '',
                stamp_path TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS packing_lists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER REFERENCES companies(id),
                invoice_number TEXT DEFAULT '',
                warehouse_number TEXT DEFAULT '',
                consignee_company TEXT DEFAULT '',
                consignee_address TEXT DEFAULT '',
                consignee_contact TEXT DEFAULT '',
                consignee_phone TEXT DEFAULT '',
                consignee_mobile TEXT DEFAULT '',
                delivery_company TEXT DEFAULT '',
                delivery_address TEXT DEFAULT '',
                delivery_contact TEXT DEFAULT '',
                delivery_phone TEXT DEFAULT '',
                pdf_path TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS packing_list_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                packing_list_id INTEGER REFERENCES packing_lists(id) ON DELETE CASCADE,
                box_number INTEGER DEFAULT 0,
                part_no TEXT DEFAULT '',
                description TEXT DEFAULT '',
                qty INTEGER DEFAULT 0,
                net_weight REAL DEFAULT 0.0,
                gross_weight REAL DEFAULT 0.0,
                dimension TEXT DEFAULT '',
                brand TEXT DEFAULT '',
                coo TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS form_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                packing_list_id INTEGER,
                action_label TEXT NOT NULL DEFAULT '',
                invoice_number TEXT DEFAULT '',
                consignee_company TEXT DEFAULT '',
                payload_json TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_form_snapshots_created_at
            ON form_snapshots(created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_form_snapshots_lookup
            ON form_snapshots(invoice_number, consignee_company, action_label);
            ",
        )?;
        Ok(())
    }
}
