use calamine::{open_workbook_auto, Reader};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Product {
    pub category: String,
    pub part_no: String,
    pub name: String,
    pub spec: String,
    pub brand: String,
    pub coo: String,
    pub net_weight: f64,
    pub dimension: String,
}

#[tauri::command]
pub fn read_inventory(path: String) -> Result<Vec<Product>, String> {
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
            row.iter().any(|cell| cell.contains("商品编号"))
                && row.iter().any(|cell| cell.contains("商品名称"))
        })
        .ok_or_else(|| "未识别到商品表头，请确认文件格式".to_string())?;

    let header_map = rows[header_row_index].clone();
    let mut products = Vec::new();

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

        let part_no = get_col("商品编号");
        if part_no.is_empty() {
            continue;
        }

        products.push(Product {
            category: get_col("商品类别"),
            part_no,
            name: get_col("商品名称"),
            spec: get_col("规格型号"),
            brand: get_col("品牌"),
            coo: get_col("产地"),
            net_weight: get_col("重量(kg)").parse::<f64>().unwrap_or(0.0),
            dimension: build_dimension(
                &get_col("长"),
                &get_col("宽"),
                &get_col("高"),
                &get_col("长宽高单位"),
            ),
        });
    }

    Ok(products)
}

fn build_dimension(length: &str, width: &str, height: &str, unit: &str) -> String {
    let values = [length, width, height]
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    if values.len() < 3 {
        return String::new();
    }

    let dimension = values.join("*");
    let unit = unit.trim();
    if unit.is_empty() {
        dimension
    } else {
        format!("{dimension}{unit}")
    }
}
