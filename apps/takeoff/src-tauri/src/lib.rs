use serde::Deserialize;
use tauri::Manager;
use tauri::ipc::Response;

/// Read a file as raw bytes (returned as a binary IPC response, no base64/JSON overhead).
#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    std::fs::read(&path)
        .map(Response::new)
        .map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
fn write_text(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, contents).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).is_file()
}

/// Location of the crash-safe autosave file inside the app data directory.
#[tauri::command]
fn autosave_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir
        .join("autosave.takeoff.json")
        .to_string_lossy()
        .into_owned())
}

/// Location of the user material catalog inside the app data directory.
#[tauri::command]
fn catalog_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("catalog.json").to_string_lossy().into_owned())
}

/// Download text (the company material catalog) without browser CORS restrictions.
#[tauri::command]
async fn fetch_text(url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .map_err(|e| e.to_string())?;
        let res = client.get(&url).send().map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("HTTP {}", res.status()));
        }
        res.text().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SheetRow {
    name: String,
    unit: String,
    qty: f64,
    material_price: f64,
    labor_price: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SheetGroup {
    name: String,
    rows: Vec<SheetRow>,
}

/// Budget sheet in the RLP "Planilha Orçamentária" layout.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SheetExport {
    title: String,
    system: String,
    client: String,
    site: String,
    proposal_number: String,
    estimator: String,
    #[allow(dead_code)]
    currency: String,
    date: String,
    groups: Vec<SheetGroup>,
    extras_pct: f64,
    bdi: f64,
    /// "Por Local" sheet: zone names and, per item, one quantity per zone.
    #[serde(default)]
    zones: Vec<String>,
    #[serde(default)]
    by_zone: Vec<ZoneRow>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ZoneRow {
    name: String,
    unit: String,
    qty: Vec<f64>,
}

/// Item × location quantity table on a second worksheet (only when zones exist).
fn write_zone_sheet(wb: &mut rust_xlsxwriter::Workbook, sheet: &SheetExport) -> Result<(), String> {
    use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Formula};
    if sheet.zones.is_empty() {
        return Ok(());
    }
    let err = |e: rust_xlsxwriter::XlsxError| e.to_string();
    let ws = wb.add_worksheet();
    ws.set_name("Por Local").map_err(err)?;
    let title = Format::new().set_bold().set_font_size(12.0);
    let header = Format::new()
        .set_bold()
        .set_align(FormatAlign::Center)
        .set_text_wrap()
        .set_border(FormatBorder::Thin)
        .set_background_color(Color::RGB(0xD9E1F2));
    let text = Format::new().set_border(FormatBorder::Thin);
    let center = Format::new()
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Center);
    let qty = Format::new()
        .set_border(FormatBorder::Thin)
        .set_num_format("#,##0.00");
    let qty_bold = qty
        .clone()
        .set_bold()
        .set_background_color(Color::RGB(0xF2F2F2));

    let last_col = (2 + sheet.zones.len()) as u16;
    ws.merge_range(
        0,
        0,
        0,
        last_col,
        &format!("Quantidades por local - {}", sheet.site),
        &title,
    )
    .map_err(err)?;
    ws.write_string(1, 0, format!("Cliente: {}", sheet.client))
        .map_err(err)?;
    let h = 3;
    ws.write_string_with_format(h, 0, "ITEM", &header)
        .map_err(err)?;
    ws.write_string_with_format(h, 1, "UNID.", &header)
        .map_err(err)?;
    for (i, z) in sheet.zones.iter().enumerate() {
        ws.write_string_with_format(h, 2 + i as u16, z, &header)
            .map_err(err)?;
    }
    ws.write_string_with_format(h, last_col, "TOTAL", &header)
        .map_err(err)?;
    let mut r = h + 1;
    for row in &sheet.by_zone {
        ws.write_string_with_format(r, 0, &row.name, &text)
            .map_err(err)?;
        ws.write_string_with_format(r, 1, &row.unit, &center)
            .map_err(err)?;
        for (i, q) in row.qty.iter().enumerate() {
            ws.write_number_with_format(r, 2 + i as u16, *q, &qty)
                .map_err(err)?;
        }
        ws.write_formula_with_format(
            r,
            last_col,
            Formula::new(format!("=SUM({}:{})", cell(2, r), cell(last_col - 1, r))),
            &qty_bold,
        )
        .map_err(err)?;
        r += 1;
    }
    ws.set_column_width(0, 48).map_err(err)?;
    ws.set_column_width(1, 8).map_err(err)?;
    for c in 2..=last_col {
        ws.set_column_width(c, 14).map_err(err)?;
    }
    ws.set_freeze_panes(h + 1, 2).map_err(err)?;
    Ok(())
}

// Column indices (0-based) of the sheet.
const COL_ITEM: u16 = 0; // A
const COL_DESC: u16 = 1; // B
const COL_UNIT: u16 = 2; // C
const COL_QTY: u16 = 3; // D
const COL_U_MAT: u16 = 4; // E
const COL_U_LAB: u16 = 5; // F
const COL_U_TOT: u16 = 6; // G
const COL_T_MAT: u16 = 7; // H
const COL_T_LAB: u16 = 8; // I
const COL_T_TOT: u16 = 9; // J

fn cell(col: u16, row: u32) -> String {
    let letter = (b'A' + col as u8) as char;
    format!("{letter}{}", row + 1)
}

#[tauri::command]
fn export_xlsx(path: String, sheet: SheetExport) -> Result<(), String> {
    use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Formula, Workbook};
    let err = |e: rust_xlsxwriter::XlsxError| e.to_string();

    let mut wb = Workbook::new();
    let ws = wb.add_worksheet();
    ws.set_name("Orçamento").map_err(err)?;

    let title = Format::new().set_bold().set_font_size(12.0);
    let subtitle = Format::new().set_bold().set_font_size(11.0);
    let plain = Format::new();
    let header = Format::new()
        .set_bold()
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin)
        .set_background_color(Color::RGB(0xD9E1F2));
    let text = Format::new().set_border(FormatBorder::Thin).set_text_wrap();
    let text_bold = text
        .clone()
        .set_bold()
        .set_background_color(Color::RGB(0xF2F2F2));
    let center = Format::new()
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Center);
    let center_bold = center
        .clone()
        .set_bold()
        .set_background_color(Color::RGB(0xF2F2F2));
    let qty = Format::new()
        .set_border(FormatBorder::Thin)
        .set_num_format("#,##0.00");
    let money = Format::new()
        .set_border(FormatBorder::Thin)
        .set_num_format("#,##0.00");
    let money_bold = money
        .clone()
        .set_bold()
        .set_background_color(Color::RGB(0xF2F2F2));
    let money_total = money
        .clone()
        .set_bold()
        .set_background_color(Color::RGB(0xD9E1F2));
    let factor = Format::new()
        .set_border(FormatBorder::Thin)
        .set_num_format("0.00")
        .set_align(FormatAlign::Center);

    // ---- header block ----
    ws.merge_range(0, COL_ITEM, 0, COL_T_MAT, &sheet.title, &title)
        .map_err(err)?;
    ws.merge_range(0, COL_T_LAB, 0, COL_T_TOT, &sheet.date, &plain)
        .map_err(err)?;
    ws.merge_range(
        1,
        COL_ITEM,
        1,
        COL_T_TOT,
        &sheet.system.to_uppercase(),
        &subtitle,
    )
    .map_err(err)?;
    ws.merge_range(2, COL_ITEM, 2, COL_T_TOT, "Planilha Orçamentária", &plain)
        .map_err(err)?;
    ws.write_string(3, COL_ITEM, format!("Cliente: {}", sheet.client))
        .map_err(err)?;
    ws.write_string(4, COL_ITEM, format!("Obra: {}", sheet.site))
        .map_err(err)?;
    ws.write_string(
        5,
        COL_ITEM,
        format!("Número Proposta: {}", sheet.proposal_number),
    )
    .map_err(err)?;
    ws.write_string(6, COL_ITEM, format!("Orçamentista: {}", sheet.estimator))
        .map_err(err)?;

    // ---- two-row column header ----
    let h0 = 7;
    let h1 = 8;
    for (c, label) in [
        (COL_ITEM, "ITEM"),
        (COL_DESC, "DESCRIÇÃO"),
        (COL_UNIT, "UNID."),
        (COL_QTY, "QUANT."),
    ] {
        ws.merge_range(h0, c, h1, c, label, &header).map_err(err)?;
    }
    ws.merge_range(h0, COL_U_MAT, h0, COL_U_TOT, "UNITÁRIO", &header)
        .map_err(err)?;
    ws.merge_range(h0, COL_T_MAT, h0, COL_T_TOT, "TOTAL", &header)
        .map_err(err)?;
    for (c, label) in [
        (COL_U_MAT, "MATERIAL"),
        (COL_U_LAB, "M. DE OBRA"),
        (COL_U_TOT, "TOTAL"),
        (COL_T_MAT, "MATERIAL"),
        (COL_T_LAB, "M. DE OBRA"),
        (COL_T_TOT, "TOTAL"),
    ] {
        ws.write_string_with_format(h1, c, label, &header)
            .map_err(err)?;
    }

    // ---- item rows ----
    let mut r: u32 = 10;
    let first_item_row = r;
    let mut last_item_row = r;

    // Writes the unit-total and line-total formulas shared by every priced row.
    let write_line_formulas = |ws: &mut rust_xlsxwriter::Worksheet, r: u32| -> Result<(), String> {
        ws.write_formula_with_format(
            r,
            COL_U_TOT,
            Formula::new(format!("={}+{}", cell(COL_U_MAT, r), cell(COL_U_LAB, r))),
            &money,
        )
        .map_err(err)?;
        ws.write_formula_with_format(
            r,
            COL_T_MAT,
            Formula::new(format!(
                "=ROUND({}*{},2)",
                cell(COL_U_MAT, r),
                cell(COL_QTY, r)
            )),
            &money,
        )
        .map_err(err)?;
        ws.write_formula_with_format(
            r,
            COL_T_LAB,
            Formula::new(format!(
                "=ROUND({}*{},2)",
                cell(COL_U_LAB, r),
                cell(COL_QTY, r)
            )),
            &money,
        )
        .map_err(err)?;
        ws.write_formula_with_format(
            r,
            COL_T_TOT,
            Formula::new(format!(
                "=ROUND({}*{},2)",
                cell(COL_U_TOT, r),
                cell(COL_QTY, r)
            )),
            &money,
        )
        .map_err(err)?;
        Ok(())
    };

    for (gi, group) in sheet.groups.iter().enumerate() {
        let n = gi + 1;
        let group_row = r;
        ws.write_string_with_format(r, COL_ITEM, n.to_string(), &center_bold)
            .map_err(err)?;
        ws.write_string_with_format(r, COL_DESC, &group.name, &text_bold)
            .map_err(err)?;
        ws.write_string_with_format(r, COL_UNIT, "TOTAL ITEM", &center_bold)
            .map_err(err)?;
        ws.write_blank(r, COL_QTY, &center_bold).map_err(err)?;
        for c in COL_U_LAB..=COL_T_TOT {
            ws.write_blank(r, c, &money_bold).map_err(err)?;
        }
        r += 1;
        let first = r;
        for (ri, row) in group.rows.iter().enumerate() {
            ws.write_string_with_format(r, COL_ITEM, format!("{n}.{}", ri + 1), &center)
                .map_err(err)?;
            ws.write_string_with_format(r, COL_DESC, &row.name, &text)
                .map_err(err)?;
            ws.write_string_with_format(r, COL_UNIT, &row.unit, &center)
                .map_err(err)?;
            ws.write_number_with_format(r, COL_QTY, row.qty, &qty)
                .map_err(err)?;
            ws.write_number_with_format(r, COL_U_MAT, row.material_price, &money)
                .map_err(err)?;
            ws.write_number_with_format(r, COL_U_LAB, row.labor_price, &money)
                .map_err(err)?;
            write_line_formulas(ws, r)?;
            last_item_row = r;
            r += 1;
        }
        let last = if group.rows.is_empty() { first } else { r - 1 };
        ws.write_formula_with_format(
            group_row,
            COL_U_MAT,
            Formula::new(format!(
                "=SUM({}:{})",
                cell(COL_T_TOT, first),
                cell(COL_T_TOT, last)
            )),
            &money_bold,
        )
        .map_err(err)?;
        r += 1; // blank spacer
    }

    // ---- extras: Diversos (material), Transportes and Supervisão (labour) ----
    let items_sum = format!(
        "SUM({}:{})",
        cell(COL_T_TOT, first_item_row),
        cell(COL_T_TOT, last_item_row.max(first_item_row))
    );
    let base_n = sheet.groups.len();
    let extras = [
        ("Diversos", true),
        ("Transportes", false),
        ("Supervisão e Projeto As Built", false),
    ];
    let diversos_row = r;
    for (k, (label, is_material)) in extras.iter().enumerate() {
        ws.write_string_with_format(r, COL_ITEM, (base_n + k + 1).to_string(), &center)
            .map_err(err)?;
        ws.write_string_with_format(r, COL_DESC, *label, &text)
            .map_err(err)?;
        ws.write_string_with_format(r, COL_UNIT, "vb", &center)
            .map_err(err)?;
        ws.write_number_with_format(r, COL_QTY, 1.0, &qty)
            .map_err(err)?;
        let value = if k == 0 {
            format!("=ROUND(({items_sum}*{})/3,2)", sheet.extras_pct / 100.0)
        } else {
            format!("={}", cell(COL_U_MAT, diversos_row))
        };
        if *is_material {
            ws.write_formula_with_format(r, COL_U_MAT, Formula::new(value), &money)
                .map_err(err)?;
            ws.write_blank(r, COL_U_LAB, &money).map_err(err)?;
        } else {
            ws.write_blank(r, COL_U_MAT, &money).map_err(err)?;
            ws.write_formula_with_format(r, COL_U_LAB, Formula::new(value), &money)
                .map_err(err)?;
        }
        write_line_formulas(ws, r)?;
        r += 1;
    }
    let last_priced_row = r - 1;
    r += 1;

    // ---- TOTAL GERAL ----
    ws.merge_range(r, COL_ITEM, r, COL_U_TOT, "TOTAL GERAL", &text_bold)
        .map_err(err)?;
    for c in [COL_T_MAT, COL_T_LAB, COL_T_TOT] {
        ws.write_formula_with_format(
            r,
            c,
            Formula::new(format!(
                "=SUM({}:{})",
                cell(c, first_item_row),
                cell(c, last_priced_row)
            )),
            &money_total,
        )
        .map_err(err)?;
    }
    let total_row = r;
    r += 1;

    // ---- BDI options: the project's factor first, then the usual ladder ----
    let mut factors = vec![sheet.bdi];
    for f in [1.30, 1.35, 1.40, 1.45, 1.50] {
        if (f - sheet.bdi).abs() > 1e-9 {
            factors.push(f);
        }
    }
    for (k, f) in factors.iter().enumerate() {
        ws.write_string_with_format(
            r,
            COL_T_MAT,
            if k == 0 { "BDI (proposta)" } else { "BDI" },
            if k == 0 { &text_bold } else { &text },
        )
        .map_err(err)?;
        ws.write_number_with_format(r, COL_T_LAB, *f, &factor)
            .map_err(err)?;
        ws.write_formula_with_format(
            r,
            COL_T_TOT,
            Formula::new(format!(
                "=ROUND({}*{},2)",
                cell(COL_T_TOT, total_row),
                cell(COL_T_LAB, r)
            )),
            if k == 0 { &money_total } else { &money },
        )
        .map_err(err)?;
        r += 1;
    }

    // ---- layout ----
    ws.set_column_width(COL_ITEM, 7).map_err(err)?;
    ws.set_column_width(COL_DESC, 62).map_err(err)?;
    ws.set_column_width(COL_UNIT, 11).map_err(err)?;
    ws.set_column_width(COL_QTY, 9).map_err(err)?;
    for c in COL_U_MAT..=COL_T_TOT {
        ws.set_column_width(c, 13).map_err(err)?;
    }
    ws.set_freeze_panes(9, 0).map_err(err)?;
    ws.set_landscape();
    ws.set_paper_size(9); // A4
    ws.set_print_fit_to_pages(1, 0);
    ws.set_repeat_rows(h0, h1).map_err(err)?;

    write_zone_sheet(&mut wb, &sheet)?;
    wb.save(&path).map_err(err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            read_text,
            write_text,
            file_exists,
            autosave_path,
            catalog_path,
            fetch_text,
            export_xlsx
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_budget_sheet() {
        let sheet = SheetExport {
            title: "Planilha Orçamentária - RLP ENGENHARIA e INSTALAÇÕES LTDA.".into(),
            system: "Sistema de Pressurização de Escadas".into(),
            client: "S2A".into(),
            site: "Gavea".into(),
            proposal_number: "26.00001PRC".into(),
            estimator: "Fernanda".into(),
            currency: "BRL".into(),
            date: "21/10/2026".into(),
            groups: vec![
                SheetGroup {
                    name: "Rede de Dutos".into(),
                    rows: vec![SheetRow {
                        name: "Dutos e Conexões Flangeados".into(),
                        unit: "m".into(),
                        qty: 13.64,
                        material_price: 120.0,
                        labor_price: 40.0,
                    }],
                },
                SheetGroup {
                    name: "Bocas de Ar".into(),
                    rows: vec![SheetRow {
                        name: "Grelha de insuflamento 400x400mm".into(),
                        unit: "pç".into(),
                        qty: 2.0,
                        material_price: 350.0,
                        labor_price: 0.0,
                    }],
                },
            ],
            extras_pct: 5.0,
            bdi: 1.42,
            zones: vec!["Térreo".into(), "1º Pavimento".into()],
            by_zone: vec![ZoneRow {
                name: "Dutos e Conexões Flangeados".into(),
                unit: "m".into(),
                qty: vec![8.2, 5.44],
            }],
        };
        let path = std::env::temp_dir().join("takeoff-test-export.xlsx");
        export_xlsx(path.to_string_lossy().into_owned(), sheet).expect("export");
        let meta = std::fs::metadata(&path).expect("file written");
        assert!(meta.len() > 2000, "workbook too small: {}", meta.len());
    }
}
