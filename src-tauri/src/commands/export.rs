use crate::commands::company::Company;
use crate::commands::history::PackingListRecord;
use crate::db::Database;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
pub struct ExportResult {
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PrintHtmlResult {
    pub html: String,
}

fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn labeled_div(label: &str, value: &str) -> String {
    if value.trim().is_empty() {
        return String::new();
    }
    format!("<div>{}{}</div>", label, escape_html(value))
}

fn fetch_company(db: &Database, company_id: i64) -> Result<Option<Company>, String> {
    let conn = db.conn.lock().unwrap();
    let result = conn.query_row(
        "SELECT id, name, address, contact_person, phone, logo_path, stamp_path FROM companies WHERE id=?1",
        rusqlite::params![company_id],
        |row| {
            Ok(Company {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                address: row.get(2)?,
                contact_person: row.get(3)?,
                phone: row.get(4)?,
                logo_path: row.get(5)?,
                stamp_path: row.get(6)?,
            })
        },
    );
    match result {
        Ok(company) => Ok(Some(company)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

fn resolve_export_dir(db: &Database) -> Result<PathBuf, String> {
    let conn = db.conn.lock().unwrap();
    let export_dir = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key='export_dir'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_default();
    drop(conn);

    let dir = if export_dir.trim().is_empty() {
        db.app_data_dir.join("exports")
    } else {
        PathBuf::from(export_dir)
    };

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Read an image file and return a data URI string for embedding in HTML.
fn image_to_data_uri(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        _ => "image/png",
    };
    Some(format!("data:{mime};base64,{}", BASE64.encode(&bytes)))
}

fn build_print_html(record: &PackingListRecord, company: Option<&Company>) -> String {
    let company_name = company.map(|c| c.name.as_str()).unwrap_or("");
    let company_address = company.map(|c| c.address.as_str()).unwrap_or("");
    let company_contact = company.map(|c| c.contact_person.as_str()).unwrap_or("");
    let company_phone = company.map(|c| c.phone.as_str()).unwrap_or("");

    // Logo and stamp as embedded base64 data URIs
    let logo_html = company
        .and_then(|c| image_to_data_uri(&c.logo_path))
        .map(|uri| format!(r#"<img src="{uri}" style="height:60px;max-width:200px;object-fit:contain;" />"#))
        .unwrap_or_default();

    let stamp_html = company
        .and_then(|c| image_to_data_uri(&c.stamp_path))
        .map(|uri| format!(r#"<img src="{uri}" style="width:120px;height:120px;object-fit:contain;opacity:0.9;" />"#))
        .unwrap_or_default();

    // Build item rows
    let item_rows: String = record
        .items
        .iter()
        .map(|item| {
            format!(
                "<tr>\
                    <td class='cell-center cell-box'>{box_no}</td>\
                    <td class='cell-center cell-nowrap cell-part-no'>{part_no}</td>\
                    <td class='cell-center cell-nowrap cell-description'>{desc}</td>\
                    <td class='cell-center'>{qty}</td>\
                    <td class='cell-center'>{nw:.2}</td>\
                    <td class='cell-center'>{gw:.2}</td>\
                    <td class='cell-center cell-nowrap'>{dim}</td>\
                    <td class='cell-center cell-nowrap'>{brand}</td>\
                    <td class='cell-center cell-nowrap'>{coo}</td>\
                </tr>",
                box_no = item.box_number,
                part_no = escape_html(&item.part_no),
                desc = escape_html(&item.description),
                qty = item.qty,
                nw = item.net_weight,
                gw = item.gross_weight,
                dim = escape_html(&item.dimension),
                brand = escape_html(&item.brand),
                coo = escape_html(&item.coo),
            )
        })
        .collect::<Vec<_>>()
        .join("");

    let total_qty: i32 = record.items.iter().map(|i| i.qty).sum();
    let total_nw: f64 = record.items.iter().map(|i| i.net_weight).sum();
    let total_gw: f64 = record.items.iter().map(|i| i.gross_weight).sum();
    let cartons = record.items.len();

    format!(
        r#"<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <title>Packing List - {invoice}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: "Microsoft YaHei", Arial, sans-serif;
      font-size: 10pt;
      color: #000;
      background: #fff;
      padding: 10mm 8mm;
    }}
    .sheet {{
      width: 100%;
      max-width: 190mm;
      margin: 0 auto;
    }}
    /* ─── Header ─── */
    .company-banner {{
      display: grid;
      grid-template-columns: 140px 1fr;
      grid-template-rows: 72px 32px 32px;
      border: 1px solid #000;
      background: #fff;
      margin-bottom: 0;
    }}
    .logo-block {{
      grid-row: 1 / span 3;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      border-right: 1px solid #000;
      padding: 6px;
      overflow: hidden;
    }}
    .logo-block img {{
      width: 100%;
      height: 100%;
      object-fit: contain;
    }}
    .company-name {{
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 23pt;
      font-weight: 700;
      line-height: 1.1;
      text-align: center;
      padding: 0 12px;
    }}
    .company-line {{
      display: flex;
      align-items: center;
      padding: 0 10px;
      border-top: 1px solid rgba(0, 0, 0, 0.18);
      font-size: 10.5pt;
    }}
    .pl-title {{
      border: 1px solid #000;
      border-top: none;
      font-size: 17pt;
      font-weight: 700;
      text-align: center;
      padding: 10px 0;
      margin-bottom: 0;
    }}
    .meta-table,
    .addr-table,
    .items-table,
    .summary-table {{
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }}
    .meta-table {{
      margin-bottom: 0;
    }}
    .meta-table td {{
      border: 1px solid #000;
      font-size: 10.5pt;
      height: 34px;
      vertical-align: middle;
    }}
    .meta-label {{
      width: 22%;
      background: #edf2de;
      font-weight: 700;
      text-align: center;
      white-space: nowrap;
    }}
    .meta-value {{
      background: #fff;
      text-align: center;
      font-weight: 600;
    }}
    .addr-table {{
      margin-bottom: 0;
    }}
    .addr-table th,
    .addr-table td {{
      border: 1px solid #000;
    }}
    .addr-table th {{
      background: #edf2de;
      font-size: 10.5pt;
      font-weight: 700;
      text-align: center;
      height: 30px;
      vertical-align: middle;
    }}
    .addr-body {{
      background: #fff;
      color: #000;
      height: 138px;
      vertical-align: top;
      padding: 8px 10px;
      font-size: 10.5pt;
      line-height: 1.45;
      text-align: left;
    }}
    .addr-body .lead {{
      font-weight: 700;
      margin-bottom: 3px;
    }}
    /* ─── Table ─── */
    .items-table {{
      font-size: 8pt;
      margin-bottom: 0;
    }}
    .items-table th,
    .items-table td {{
      border: 1px solid #000;
      padding: 3px 4px;
      vertical-align: middle;
    }}
    .items-table th {{
      background: #edf2de;
      font-weight: 700;
      text-align: center;
      height: 30px;
      white-space: nowrap;
      font-size: 7.2pt;
      letter-spacing: -0.15px;
    }}
    .items-table tbody td {{
      background: #fff;
    }}
    .cell-center {{
      text-align: center;
    }}
    .cell-nowrap {{
      white-space: nowrap;
      overflow: hidden;
      text-overflow: clip;
    }}
    .cell-part-no {{
      font-size: 7.5pt;
      letter-spacing: -0.15px;
    }}
    .cell-description {{
      font-size: 7.8pt;
    }}
    .items-table tfoot td {{
      border: 1px solid #000;
      height: 31px;
      vertical-align: middle;
    }}
    .tfoot-label {{
      text-align: center;
      font-weight: 700;
      background: #fff;
    }}
    .tfoot-value {{
      text-align: center;
      font-weight: 700;
      background: #fff;
    }}
    .summary-table td {{
      border: none;
      height: 30px;
      font-size: 10.5pt;
      vertical-align: middle;
    }}
    .summary-label {{
      text-align: center;
      font-weight: 700;
      white-space: nowrap;
    }}
    .summary-value {{
      background: #fff;
      border: none;
      text-align: center;
      font-weight: 700;
    }}
    /* ─── Signature ─── */
    .sig-row {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 18px;
      padding-top: 8px;
    }}
    .sig-cell {{ font-size: 10pt; }}
    .sig-cell .sig-label {{ font-weight: 600; margin-bottom: 40px; }}
    .sig-cell .sig-stamp {{ text-align: center; }}
    /* ─── Print ─── */
    @media print {{
      body {{ padding: 0; }}
      @page {{
        size: A4;
        margin: 8mm 8mm;
      }}
    }}
  </style>
</head>
<body>
  <div class="sheet">
  <!-- Company header -->
  <div class="company-banner">
    <div class="logo-block">{logo_html}</div>
    <div class="company-name">{company_name}</div>
    <div class="company-line">{company_address}</div>
    <div class="company-line">ATTN: {company_contact}&nbsp;&nbsp;&nbsp;TEL: {company_phone}</div>
  </div>

  <!-- Title -->
  <div class="pl-title">Packing List</div>

  <!-- Invoice meta -->
  <table class="meta-table">
    <tr>
      <td class="meta-label">Invoice Number：</td>
      <td class="meta-value">{invoice}</td>
      <td class="meta-label">入倉號：</td>
      <td class="meta-value">{warehouse}</td>
    </tr>
  </table>

  <!-- Consignee / Delivery -->
  <table class="addr-table">
    <tr>
      <th>Consignee Address</th>
      <th>Delivery Address (Deliver To)</th>
    </tr>
    <tr>
      <td class="addr-body">
        <div class="lead">{consignee_company}</div>
        {consignee_address_line}
        {consignee_contact_line}
        {consignee_phone_line}
        {consignee_mobile_line}
      </td>
      <td class="addr-body">
        <div class="lead">{delivery_company}</div>
        {delivery_address_line}
        {delivery_contact_line}
        {delivery_phone_line}
      </td>
    </tr>
  </table>

  <!-- Items table -->
  <table class="items-table">
    <colgroup>
      <col style="width:5%">
      <col style="width:17%">
      <col style="width:23.5%">
      <col style="width:7.5%">
      <col style="width:8%">
      <col style="width:8%">
      <col style="width:13.5%">
      <col style="width:9%">
      <col style="width:8.5%">
    </colgroup>
    <thead>
      <tr>
        <th>Box #</th>
        <th>Part No.</th>
        <th>Description of Product</th>
        <th>QTY</th>
        <th>N.W./kg</th>
        <th>G.W./kg</th>
        <th>Dimension/cm</th>
        <th>Brand</th>
        <th>COO</th>
      </tr>
    </thead>
    <tbody>
      {item_rows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" class="tfoot-label">Total</td>
        <td class="tfoot-value">{total_qty}</td>
        <td class="tfoot-value">{total_nw:.2}</td>
        <td class="tfoot-value">{total_gw:.2}</td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <table class="summary-table">
    <tr>
      <td style="width:24%"></td>
      <td class="summary-label" style="width:22%">Total</td>
      <td class="summary-value" style="width:16%">({cartons})</td>
      <td style="width:38%; text-align:left; padding-left:8px; font-weight:700;">Cartons Only</td>
    </tr>
    <tr>
      <td></td>
      <td class="summary-label">Total G.W.</td>
      <td class="summary-value">{total_gw:.2}</td>
      <td style="text-align:left; padding-left:8px;">kg (estimated)</td>
    </tr>
  </table>

  <!-- Signature -->
  <div class="sig-row">
    <div class="sig-cell">
      <div class="sig-label">Confirmed and received by :</div>
      <div>Authorized Signature</div>
    </div>
    <div class="sig-cell">
      <div class="sig-label">For and on behalf of :</div>
      <div class="sig-stamp">{stamp_html}</div>
      <div>Authorized Signature</div>
    </div>
  </div>
  </div>
</body>
</html>"#,
        company_name = escape_html(company_name),
        company_address = escape_html(company_address),
        company_contact = escape_html(company_contact),
        company_phone = escape_html(company_phone),
        logo_html = logo_html,
        stamp_html = stamp_html,
        invoice = escape_html(&record.invoice_number),
        warehouse = escape_html(&record.warehouse_number),
        consignee_company = escape_html(&record.consignee_company),
        consignee_address_line = labeled_div("地址：", &record.consignee_address),
        consignee_contact_line = labeled_div("联系人：", &record.consignee_contact),
        consignee_phone_line = labeled_div("电话：", &record.consignee_phone),
        consignee_mobile_line = labeled_div("手机：", &record.consignee_mobile),
        delivery_company = escape_html(&record.delivery_company),
        delivery_address_line = labeled_div("地址：", &record.delivery_address),
        delivery_contact_line = labeled_div("联系人：", &record.delivery_contact),
        delivery_phone_line = labeled_div("电话：", &record.delivery_phone),
        item_rows = item_rows,
        total_qty = total_qty,
        total_nw = total_nw,
        total_gw = total_gw,
        cartons = cartons,
    )
}

/// Generate a print-ready HTML string with embedded logo and stamp (base64).
/// The frontend opens it as a Blob URL and calls window.print().
#[tauri::command]
pub fn generate_print_html(
    db: State<'_, Database>,
    record: PackingListRecord,
) -> Result<PrintHtmlResult, String> {
    let company = fetch_company(&db, record.company_id)?;
    let html = build_print_html(&record, company.as_ref());
    Ok(PrintHtmlResult { html })
}

/// Legacy: export HTML to a file in the export directory.
#[tauri::command]
pub fn export_packing_list_html(
    db: State<'_, Database>,
    record: PackingListRecord,
) -> Result<ExportResult, String> {
    let export_dir = resolve_export_dir(&db)?;
    let company = fetch_company(&db, record.company_id)?;
    let invoice = if record.invoice_number.trim().is_empty() {
        "packing-list".to_string()
    } else {
        record
            .invoice_number
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                    ch
                } else {
                    '_'
                }
            })
            .collect::<String>()
    };
    let file_name = format!("{}_{}.html", invoice, chrono_like_timestamp());
    let file_path = export_dir.join(file_name);
    let html = build_print_html(&record, company.as_ref());
    fs::write(&file_path, html).map_err(|e| e.to_string())?;
    Ok(ExportResult {
        file_path: file_path.to_string_lossy().to_string(),
    })
}

/// Open a local file with the system default application (Windows shell).
#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Export packing list as XLSX to the given file path (chosen by frontend save dialog).
#[tauri::command]
pub fn export_packing_list_xlsx(
    db: State<'_, Database>,
    record: PackingListRecord,
    save_path: String,
) -> Result<(), String> {
    use rust_xlsxwriter::*;

    let company = fetch_company(&db, record.company_id)?.unwrap_or(Company {
        id: None,
        name: String::new(),
        address: String::new(),
        contact_person: String::new(),
        phone: String::new(),
        logo_path: String::new(),
        stamp_path: String::new(),
    });

    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();

    // ── Column widths (approximate match to reference) ──
    sheet.set_column_width(0, 8).map_err(|e| e.to_string())?;   // Box #
    sheet.set_column_width(1, 28).map_err(|e| e.to_string())?;  // Part No.
    sheet.set_column_width(2, 22).map_err(|e| e.to_string())?;  // Description
    sheet.set_column_width(3, 12).map_err(|e| e.to_string())?;  // QTY
    sheet.set_column_width(4, 12).map_err(|e| e.to_string())?;  // N.W./kg
    sheet.set_column_width(5, 12).map_err(|e| e.to_string())?;  // G.W./kg
    sheet.set_column_width(6, 14).map_err(|e| e.to_string())?;  // Dimension
    sheet.set_column_width(7, 12).map_err(|e| e.to_string())?;  // Brand
    sheet.set_column_width(8, 10).map_err(|e| e.to_string())?;  // COO

    // ── Formats ──
    let fmt_company = Format::new()
        .set_bold()
        .set_font_size(16.0)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter);

    let fmt_addr = Format::new()
        .set_font_size(10.0)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter);

    let fmt_attn = Format::new()
        .set_font_size(10.0)
        .set_bold()
        .set_align(FormatAlign::Left);

    let fmt_title = Format::new()
        .set_bold()
        .set_font_size(18.0)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let fmt_meta_label = Format::new()
        .set_bold()
        .set_font_size(10.0)
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter);

    let fmt_meta_value = Format::new()
        .set_font_size(10.0)
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter);

    let fmt_addr_header = Format::new()
        .set_bold()
        .set_font_size(10.0)
        .set_border(FormatBorder::Thin)
        .set_background_color(Color::Theme(4, 4))
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let fmt_addr_cell = Format::new()
        .set_font_size(10.0)
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::Top)
        .set_text_wrap();

    let fmt_th = Format::new()
        .set_bold()
        .set_font_size(10.0)
        .set_border(FormatBorder::Thin)
        .set_background_color(Color::RGB(0xF0F0F0))
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let fmt_td = Format::new()
        .set_font_size(9.5)
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::VerticalCenter);

    let fmt_td_center = Format::new()
        .set_font_size(9.5)
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let fmt_total_label = Format::new()
        .set_bold()
        .set_font_size(10.0)
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let fmt_total_val = Format::new()
        .set_bold()
        .set_font_size(10.0)
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let fmt_sig_label = Format::new()
        .set_bold()
        .set_font_size(10.0)
        .set_align(FormatAlign::Left);

    let fmt_plain = Format::new()
        .set_font_size(10.0)
        .set_align(FormatAlign::Left);

    // ── Row 0: Company name (spans all columns) ──
    sheet.set_row_height(0, 36).map_err(|e| e.to_string())?;
    sheet.merge_range(0, 0, 0, 8, &company.name, &fmt_company).map_err(|e| e.to_string())?;

    // ── Row 1: Address ──
    sheet.set_row_height(1, 15).map_err(|e| e.to_string())?;
    sheet.merge_range(1, 0, 1, 8, &company.address, &fmt_addr).map_err(|e| e.to_string())?;

    // ── Row 2: ATTN / TEL ──
    sheet.set_row_height(2, 18).map_err(|e| e.to_string())?;
    let attn_line = format!("ATTN: {}   TEL: {}", company.contact_person, company.phone);
    sheet.merge_range(2, 0, 2, 8, &attn_line, &fmt_attn).map_err(|e| e.to_string())?;

    // ── Row 3: Separator ──
    sheet.set_row_height(3, 4).map_err(|e| e.to_string())?;

    // ── Row 4: "Packing List" title ──
    sheet.set_row_height(4, 30).map_err(|e| e.to_string())?;
    sheet.merge_range(4, 0, 4, 8, "Packing List", &fmt_title).map_err(|e| e.to_string())?;

    // ── Row 5: Invoice Number / 入倉號 ──
    sheet.set_row_height(5, 22).map_err(|e| e.to_string())?;
    sheet.write_with_format(5, 0, "Invoice Number：", &fmt_meta_label).map_err(|e| e.to_string())?;
    sheet.merge_range(5, 1, 5, 3, &record.invoice_number, &fmt_meta_value).map_err(|e| e.to_string())?;
    sheet.write_with_format(5, 4, "入倉號：", &fmt_meta_label).map_err(|e| e.to_string())?;
    sheet.merge_range(5, 5, 5, 8, &record.warehouse_number, &fmt_meta_value).map_err(|e| e.to_string())?;

    // ── Row 6: Consignee / Delivery headers ──
    sheet.set_row_height(6, 20).map_err(|e| e.to_string())?;
    sheet.merge_range(6, 0, 6, 3, "Consignee Address", &fmt_addr_header).map_err(|e| e.to_string())?;
    sheet.merge_range(6, 4, 6, 8, "Delivery Address (Deliver To)", &fmt_addr_header).map_err(|e| e.to_string())?;

    // ── Row 7-10: Address block (build multiline strings) ──
    let consignee_text = build_addr_text(
        &record.consignee_company,
        &record.consignee_address,
        &record.consignee_contact,
        &record.consignee_phone,
        &record.consignee_mobile,
    );
    let delivery_text = build_addr_text(
        &record.delivery_company,
        &record.delivery_address,
        &record.delivery_contact,
        &record.delivery_phone,
        "",
    );
    sheet.set_row_height(7, 72).map_err(|e| e.to_string())?;
    sheet.merge_range(7, 0, 7, 3, &consignee_text, &fmt_addr_cell).map_err(|e| e.to_string())?;
    sheet.merge_range(7, 4, 7, 8, &delivery_text, &fmt_addr_cell).map_err(|e| e.to_string())?;

    // ── Row 8: Table header ──
    let header_row = 8u32;
    sheet.set_row_height(header_row, 20).map_err(|e| e.to_string())?;
    for (col, label) in ["Box #", "Part No.", "Description of Product", "QTY",
                          "N.W./kg", "G.W./kg", "Dimension/cm", "Brand", "COO"].iter().enumerate() {
        sheet.write_with_format(header_row, col as u16, *label, &fmt_th).map_err(|e| e.to_string())?;
    }

    // ── Rows 9+: Items ──
    let mut row = header_row + 1;
    for item in &record.items {
        sheet.set_row_height(row, 18).map_err(|e| e.to_string())?;
        sheet.write_with_format(row, 0, item.box_number as f64, &fmt_td_center).map_err(|e| e.to_string())?;
        sheet.write_with_format(row, 1, &item.part_no, &fmt_td_center).map_err(|e| e.to_string())?;
        sheet.write_with_format(row, 2, &item.description, &fmt_td_center).map_err(|e| e.to_string())?;
        sheet.write_with_format(row, 3, item.qty as f64, &fmt_td_center).map_err(|e| e.to_string())?;
        sheet.write_with_format(row, 4, item.net_weight, &fmt_td_center).map_err(|e| e.to_string())?;
        sheet.write_with_format(row, 5, item.gross_weight, &fmt_td_center).map_err(|e| e.to_string())?;
        sheet.write_with_format(row, 6, &item.dimension, &fmt_td_center).map_err(|e| e.to_string())?;
        sheet.write_with_format(row, 7, &item.brand, &fmt_td_center).map_err(|e| e.to_string())?;
        sheet.write_with_format(row, 8, &item.coo, &fmt_td_center).map_err(|e| e.to_string())?;
        row += 1;
    }

    // ── Totals ──
    let total_qty: i32 = record.items.iter().map(|i| i.qty).sum();
    let total_nw: f64 = record.items.iter().map(|i| i.net_weight).sum();
    let total_gw: f64 = record.items.iter().map(|i| i.gross_weight).sum();
    let cartons = record.items.len();

    sheet.set_row_height(row, 18).map_err(|e| e.to_string())?;
    sheet.merge_range(row, 0, row, 2, "Total", &fmt_total_label).map_err(|e| e.to_string())?;
    sheet.write_with_format(row, 3, total_qty as f64, &fmt_total_val).map_err(|e| e.to_string())?;
    sheet.write_with_format(row, 4, total_nw, &fmt_total_val).map_err(|e| e.to_string())?;
    sheet.write_with_format(row, 5, total_gw, &fmt_total_val).map_err(|e| e.to_string())?;
    sheet.merge_range(row, 6, row, 8, "", &fmt_td).map_err(|e| e.to_string())?;
    row += 1;

    sheet.set_row_height(row, 18).map_err(|e| e.to_string())?;
    sheet.merge_range(row, 0, row, 2, "Total", &fmt_total_label).map_err(|e| e.to_string())?;
    let cartons_text = format!("({}) Cartons Only", cartons);
    sheet.merge_range(row, 3, row, 8, &cartons_text, &fmt_total_val).map_err(|e| e.to_string())?;
    row += 1;

    sheet.set_row_height(row, 18).map_err(|e| e.to_string())?;
    sheet.merge_range(row, 0, row, 2, "Total G.W.", &fmt_total_label).map_err(|e| e.to_string())?;
    let gw_text = format!("{:.2} kg (estimated)", total_gw);
    sheet.merge_range(row, 3, row, 8, &gw_text, &fmt_total_val).map_err(|e| e.to_string())?;
    row += 1;

    // ── Signature row ──
    sheet.set_row_height(row, 14).map_err(|e| e.to_string())?;
    row += 1;
    sheet.set_row_height(row, 18).map_err(|e| e.to_string())?;
    sheet.merge_range(row, 0, row, 3, "Confirmed and received by :", &fmt_sig_label).map_err(|e| e.to_string())?;
    sheet.merge_range(row, 4, row, 8, "For and on behalf of :", &fmt_sig_label).map_err(|e| e.to_string())?;
    row += 2;
    sheet.set_row_height(row, 18).map_err(|e| e.to_string())?;
    sheet.merge_range(row, 0, row, 3, "Authorized Signature", &fmt_plain).map_err(|e| e.to_string())?;
    sheet.merge_range(row, 4, row, 8, "Authorized Signature", &fmt_plain).map_err(|e| e.to_string())?;

    // ── Embed logo if present ──
    if let Some(logo_bytes) = company.logo_path.as_str().is_empty().then_some(None).unwrap_or_else(|| fs::read(&company.logo_path).ok()) {
        let img = Image::new_from_buffer(&logo_bytes).map_err(|e| e.to_string())?;
        sheet.insert_image_fit_to_cell(0, 0, &img, false).map_err(|e| e.to_string())?;
    }

    workbook.save(&save_path).map_err(|e| e.to_string())?;
    Ok(())
}

fn build_addr_text(company: &str, address: &str, contact: &str, phone: &str, mobile: &str) -> String {
    let mut parts = vec![];
    if !company.is_empty() { parts.push(company.to_string()); }
    if !address.is_empty() { parts.push(format!("地址：{}", address)); }
    if !contact.is_empty() { parts.push(format!("联系人：{}", contact)); }
    if !phone.is_empty() { parts.push(format!("电话：{}", phone)); }
    if !mobile.is_empty() { parts.push(format!("手机：{}", mobile)); }
    parts.join("\n")
}

fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    secs.to_string()
}
