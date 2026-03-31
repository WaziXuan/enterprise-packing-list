use calamine::{open_workbook_auto, Reader};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Customer {
    pub id: String,
    pub name: String,
    pub contact: String,
    pub phone: String,
    pub address: String,
}

#[tauri::command]
pub fn read_customers(path: String) -> Result<Vec<Customer>, String> {
    let mut workbook =
        open_workbook_auto(&path).map_err(|e| format!("无法打开文件: {e}"))?;
    let sheet_names = workbook.sheet_names().to_vec();
    let sheet_name = sheet_names
        .first()
        .ok_or_else(|| "Excel 文件没有工作表".to_string())?;
    let range = workbook
        .worksheet_range(sheet_name)
        .map_err(|e| format!("无法读取工作表: {e}"))?;

    let rows: Vec<Vec<String>> = range
        .rows()
        .map(|row| row.iter().map(|cell| cell.to_string().trim().to_string()).collect())
        .collect();

    let header_row_index = rows
        .iter()
        .position(|row| {
            row.iter().any(|cell| cell.contains("客户编号"))
                && row.iter().any(|cell| cell.contains("客户名称"))
        })
        .ok_or_else(|| "未识别到客户表头，请确认文件格式".to_string())?;

    let header_map = rows[header_row_index].clone();
    let mut customers = Vec::new();

    for row in rows.iter().skip(header_row_index + 1) {
        if row.iter().all(|cell| cell.is_empty()) {
            continue;
        }

        let get_col = |name: &str| -> String {
            header_map
                .iter()
                .position(|header| header.contains(name))
                .and_then(|index| row.get(index))
                .map(|cell| cell.trim().to_string())
                .unwrap_or_default()
        };

        let name = get_col("客户名称");
        if name.is_empty() {
            continue;
        }

        let mobile = get_col("手机");
        let telephone = if mobile.is_empty() {
            get_col("座机")
        } else {
            mobile
        };

        customers.push(Customer {
            id: get_col("客户编号"),
            name,
            contact: get_col("联系人"),
            phone: telephone,
            address: get_col("联系地址"),
        });
    }

    Ok(customers)
}
