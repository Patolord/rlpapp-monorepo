use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Formula, Workbook, Worksheet};
use serde::{Deserialize, Serialize};
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

/// Write binary content (the filled duct workbook) to a path, creating parent folders.
#[tauri::command]
fn write_file(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, data).map_err(|e| format!("{path}: {e}"))
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

#[derive(Serialize)]
struct HttpResponse {
    status: u16,
    body: String,
}

/// HTTP call to the company app (catalog download, material proposals) without browser CORS
/// restrictions. Non-2xx answers are returned, not errors, so the UI can explain 401/503.
#[tauri::command]
async fn http_request(
    method: String,
    url: String,
    headers: Option<std::collections::HashMap<String, String>>,
    body: Option<String>,
) -> Result<HttpResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .map_err(|e| e.to_string())?;
        let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
        let mut req = client.request(method, &url);
        for (name, value) in headers.unwrap_or_default() {
            req = req.header(name, value);
        }
        if let Some(body) = body {
            req = req.body(body);
        }
        let res = req.send().map_err(|e| e.to_string())?;
        let status = res.status().as_u16();
        let body = res.text().map_err(|e| e.to_string())?;
        Ok(HttpResponse { status, body })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Budget workbook in the RLP "Planilha Orçamentária" layout
// ---------------------------------------------------------------------------

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
struct Section {
    name: String,
    rows: Vec<SheetRow>,
}

/// A line of the stats block under TOTAL GERAL (see `FooterLine` in `src/lib/types.ts`).
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum FooterLine {
    Stat {
        label: String,
        value: f64,
    },
    Points {
        label: String,
        value: f64,
    },
    PerPoint {
        label: String,
    },
    Factor {
        label: String,
        /// "material" | "labor" | "total" (the tab's totals) or "manual" (`value`).
        base: String,
        #[serde(default)]
        value: Option<f64>,
        factor: f64,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SystemSheet {
    system: String,
    sections: Vec<Section>,
    bdi: f64,
    extras_pct: f64,
    #[serde(default)]
    footer: Vec<FooterLine>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SheetExport {
    title: String,
    #[allow(dead_code)]
    system: String,
    client: String,
    site: String,
    proposal_number: String,
    estimator: String,
    #[allow(dead_code)]
    currency: String,
    date: String,
    /// One worksheet per system, each with its sections (locations or groups).
    sheets: Vec<SystemSheet>,
    /// Project defaults; each sheet carries its own values.
    #[allow(dead_code)]
    extras_pct: f64,
    #[allow(dead_code)]
    bdi: f64,
}

// Column indices (0-based) of the budget sheets.
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

const NAVY: Color = Color::RGB(0x000080);
const HEADER_FILL: Color = Color::RGB(0xF2F2F2);
const CHOSEN_FILL: Color = Color::RGB(0xFFFF00);
const FMT_PRICE: &str = "#,##0.00;[Red]#,##0.00";
const FMT_ACCOUNTING: &str = "_(* #,##0.00_);_(* (#,##0.00);_(* \"-\"??_);_(@_)";
const FMT_MONEY_BRL: &str = "_-\"R$\" * #,##0.00_-;-\"R$\" * #,##0.00_-;_-\"R$\" * \"-\"??_-;_-@_-";

type R<T> = Result<T, String>;
fn xe(e: rust_xlsxwriter::XlsxError) -> String {
    e.to_string()
}

fn cell(col: u16, row: u32) -> String {
    let letter = (b'A' + col as u8) as char;
    format!("{letter}{}", row + 1)
}

/// Excel worksheet names: at most 31 chars, none of []:*?/\ and unique.
fn sheet_name(raw: &str, taken: &[String]) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| if "[]:*?/\\".contains(c) { '-' } else { c })
        .collect::<String>()
        .trim()
        .chars()
        .take(31)
        .collect();
    let base = if cleaned.is_empty() {
        "Orçamento".to_string()
    } else {
        cleaned
    };
    let mut name = base.clone();
    let mut n = 2;
    while taken.iter().any(|t| t.eq_ignore_ascii_case(&name)) {
        let suffix = format!(" ({n})");
        name = format!(
            "{}{}",
            base.chars().take(31 - suffix.len()).collect::<String>(),
            suffix
        );
        n += 1;
    }
    name
}

/// Formats shared by every budget sheet, built after the sample workbook (Arial, navy rows).
struct Styles {
    title: Format,
    date: Format,
    band_system: Format,
    band: Format,
    header: Format,
    text: Format,
    text_bold: Format,
    center: Format,
    center_wrap: Format,
    price: Format,
    acc_bold: Format,
    total_label: Format,
    total_acc: Format,
    total_big: Format,
    pct: Format,
    bdi_pct: Format,
    bdi_pct_chosen: Format,
    bdi_money: Format,
    bdi_money_chosen: Format,
    foot_label: Format,
    foot_unit: Format,
    foot_num: Format,
    foot_money: Format,
    foot_factor: Format,
    foot_head: Format,
}

impl Styles {
    fn new() -> Self {
        let arial = |size: f64| Format::new().set_font_name("Arial").set_font_size(size);
        // table rows: thin lines between columns, hairlines between rows (see the samples)
        let row = |f: Format| {
            f.set_font_color(NAVY)
                .set_border_top(FormatBorder::Hair)
                .set_border_bottom(FormatBorder::Hair)
                .set_border_left(FormatBorder::Thin)
                .set_border_right(FormatBorder::Thin)
                .set_align(FormatAlign::VerticalCenter)
        };
        Styles {
            title: arial(16.0)
                .set_bold()
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter)
                .set_border_top(FormatBorder::Medium)
                .set_border_bottom(FormatBorder::Medium),
            date: arial(12.0)
                .set_align(FormatAlign::Center)
                .set_align(FormatAlign::VerticalCenter)
                .set_border_top(FormatBorder::Medium)
                .set_border_bottom(FormatBorder::Medium),
            band_system: arial(14.0).set_bold().set_font_color(NAVY),
            band: arial(12.0).set_bold(),
            header: arial(10.0)
                .set_bold()
                .set_align(FormatAlign::Center)
                .set_align(FormatAlign::VerticalCenter)
                .set_text_wrap()
                .set_border(FormatBorder::Thin)
                .set_background_color(HEADER_FILL),
            text: row(arial(10.0)).set_align(FormatAlign::Left),
            text_bold: row(arial(10.0).set_bold()).set_align(FormatAlign::Left),
            center: row(arial(10.0)).set_align(FormatAlign::Center),
            center_wrap: row(arial(10.0))
                .set_align(FormatAlign::Center)
                .set_text_wrap(),
            price: row(arial(10.0))
                .set_num_format(FMT_PRICE)
                .set_align(FormatAlign::Right),
            acc_bold: row(arial(10.0).set_bold())
                .set_num_format(FMT_ACCOUNTING)
                .set_align(FormatAlign::Right),
            total_label: arial(12.0)
                .set_bold()
                .set_align(FormatAlign::VerticalCenter)
                .set_border_top(FormatBorder::Medium)
                .set_border_bottom(FormatBorder::Medium),
            total_acc: arial(12.0)
                .set_bold()
                .set_num_format(FMT_ACCOUNTING)
                .set_align(FormatAlign::VerticalCenter)
                .set_border(FormatBorder::Medium),
            total_big: arial(14.0)
                .set_bold()
                .set_num_format(FMT_ACCOUNTING)
                .set_align(FormatAlign::VerticalCenter)
                .set_border(FormatBorder::Medium),
            pct: row(arial(10.0))
                .set_num_format("0%")
                .set_align(FormatAlign::Center),
            bdi_pct: arial(10.0)
                .set_num_format("0%")
                .set_align(FormatAlign::Center),
            bdi_pct_chosen: arial(10.0)
                .set_bold()
                .set_num_format("0%")
                .set_align(FormatAlign::Center)
                .set_background_color(CHOSEN_FILL),
            bdi_money: arial(10.0).set_num_format(FMT_MONEY_BRL),
            bdi_money_chosen: arial(10.0)
                .set_bold()
                .set_num_format(FMT_MONEY_BRL)
                .set_background_color(CHOSEN_FILL),
            foot_label: arial(10.0)
                .set_bold()
                .set_font_color(NAVY)
                .set_align(FormatAlign::Right),
            foot_unit: arial(10.0)
                .set_font_color(NAVY)
                .set_align(FormatAlign::Center),
            foot_num: arial(10.0)
                .set_font_color(NAVY)
                .set_num_format(FMT_PRICE)
                .set_align(FormatAlign::Right),
            foot_money: arial(10.0)
                .set_font_color(NAVY)
                .set_num_format(FMT_MONEY_BRL),
            foot_factor: arial(10.0)
                .set_font_color(NAVY)
                .set_num_format("0.00")
                .set_align(FormatAlign::Right),
            foot_head: arial(10.0).set_bold().set_align(FormatAlign::Center),
        }
    }
}

/// Clone `base` with the medium bars of the A..J box: its outer edges and the bar between the
/// UNITÁRIO and TOTAL blocks (left of H).
fn boxed(base: &Format, col: u16) -> Format {
    let mut f = base.clone();
    if col == COL_ITEM || col == COL_T_MAT {
        f = f.set_border_left(FormatBorder::Medium);
    }
    if col == COL_T_TOT {
        f = f.set_border_right(FormatBorder::Medium);
    }
    f
}

/// Title band plus the Cliente / Obra / Proposta / Orçamentista block (rows 0..=6).
fn write_header_block(ws: &mut Worksheet, st: &Styles, x: &SheetExport, system: &str) -> R<()> {
    ws.merge_range(
        0,
        COL_ITEM,
        0,
        COL_T_MAT,
        &x.title,
        &boxed(&st.title, COL_ITEM),
    )
    .map_err(xe)?;
    ws.merge_range(
        0,
        COL_T_LAB,
        0,
        COL_T_TOT,
        &x.date,
        &boxed(&st.date, COL_T_TOT),
    )
    .map_err(xe)?;
    ws.set_row_height(0, 21.0).map_err(xe)?;
    let lines = [
        system.to_uppercase(),
        "Planilha Orçamentária".to_string(),
        format!("Cliente: {}", x.client),
        format!("Obra: {}", x.site),
        format!("Número Proposta: {}", x.proposal_number),
        format!("Orçamentista: {}", x.estimator),
    ];
    for (i, line) in lines.iter().enumerate() {
        let r = 1 + i as u32;
        let base = if i == 0 { &st.band_system } else { &st.band };
        ws.write_string_with_format(r, COL_ITEM, line, &boxed(base, COL_ITEM))
            .map_err(xe)?;
        for c in (COL_ITEM + 1)..=COL_T_TOT {
            ws.write_blank(r, c, &boxed(&st.band, c)).map_err(xe)?;
        }
        ws.set_row_height(r, 18.0).map_err(xe)?;
    }
    Ok(())
}

/// Two-row column header. `totals` are the three labels of the right-hand TOTAL block.
fn write_column_header(ws: &mut Worksheet, st: &Styles, totals: [&str; 3]) -> R<()> {
    let (h0, h1) = (7, 8);
    // medium line above the first header row and below the second
    let top = st.header.clone().set_border_top(FormatBorder::Medium);
    let bottom = st.header.clone().set_border_bottom(FormatBorder::Medium);
    let both = top.clone().set_border_bottom(FormatBorder::Medium);
    for (c, label) in [
        (COL_ITEM, "ITEM"),
        (COL_DESC, "DESCRIÇÃO"),
        (COL_UNIT, "UNID."),
        (COL_QTY, "QUANT."),
    ] {
        ws.merge_range(h0, c, h1, c, label, &boxed(&both, c))
            .map_err(xe)?;
    }
    ws.merge_range(h0, COL_U_MAT, h0, COL_U_TOT, "UNITÁRIO", &top)
        .map_err(xe)?;
    ws.merge_range(
        h0,
        COL_T_MAT,
        h0,
        COL_T_TOT,
        "TOTAL",
        &boxed(&top, COL_T_MAT).set_border_right(FormatBorder::Medium),
    )
    .map_err(xe)?;
    for (c, label) in [
        (COL_U_MAT, "MATERIAL"),
        (COL_U_LAB, "M. DE OBRA"),
        (COL_U_TOT, "TOTAL"),
        (COL_T_MAT, totals[0]),
        (COL_T_LAB, totals[1]),
        (COL_T_TOT, totals[2]),
    ] {
        ws.write_string_with_format(h1, c, label, &boxed(&bottom, c))
            .map_err(xe)?;
    }
    ws.set_row_height(h1, 13.5).map_err(xe)?;
    Ok(())
}

/// A bordered, otherwise empty row inside the A..J box.
fn write_blank_row(ws: &mut Worksheet, st: &Styles, r: u32) -> R<()> {
    for c in COL_ITEM..=COL_T_TOT {
        ws.write_blank(r, c, &boxed(&st.text, c)).map_err(xe)?;
    }
    ws.set_row_height(r, 12.75).map_err(xe)?;
    Ok(())
}

/// G = E + F, H/I/J = ROUND(unit × qty, 2) for a priced row.
fn write_line_formulas(ws: &mut Worksheet, st: &Styles, r: u32) -> R<()> {
    ws.write_formula_with_format(
        r,
        COL_U_TOT,
        Formula::new(format!("={}+{}", cell(COL_U_MAT, r), cell(COL_U_LAB, r))),
        &st.acc_bold,
    )
    .map_err(xe)?;
    for (c, unit_col) in [
        (COL_T_MAT, COL_U_MAT),
        (COL_T_LAB, COL_U_LAB),
        (COL_T_TOT, COL_U_TOT),
    ] {
        ws.write_formula_with_format(
            r,
            c,
            Formula::new(format!(
                "=ROUND({}*{},2)",
                cell(unit_col, r),
                cell(COL_QTY, r)
            )),
            &boxed(&st.acc_bold, c),
        )
        .map_err(xe)?;
    }
    ws.set_row_height(r, 12.75).map_err(xe)?;
    Ok(())
}

/// "Sub-Total item N" line closing a local: H/I/J sum the section's rows `first..=last`.
fn write_subtotal_row(
    ws: &mut Worksheet,
    st: &Styles,
    r: u32,
    n: usize,
    first: u32,
    last: u32,
) -> R<()> {
    ws.write_blank(r, COL_ITEM, &boxed(&st.center, COL_ITEM))
        .map_err(xe)?;
    ws.write_string_with_format(r, COL_DESC, format!("Sub-Total item {n}"), &st.text_bold)
        .map_err(xe)?;
    for c in COL_UNIT..=COL_U_TOT {
        ws.write_blank(r, c, &st.text).map_err(xe)?;
    }
    for c in [COL_T_MAT, COL_T_LAB, COL_T_TOT] {
        ws.write_formula_with_format(
            r,
            c,
            Formula::new(format!("=SUM({}:{})", cell(c, first), cell(c, last))),
            &boxed(&st.acc_bold, c),
        )
        .map_err(xe)?;
    }
    ws.set_row_height(r, 12.75).map_err(xe)?;
    Ok(())
}

/// `SUM(J24,J110,...)` over the given rows of one column; `0` when there are none.
fn sum_of_rows(col: u16, rows: &[u32]) -> String {
    if rows.is_empty() {
        return "0".to_string();
    }
    let refs: Vec<String> = rows.iter().map(|&r| cell(col, r)).collect();
    format!("SUM({})", refs.join(","))
}

fn set_budget_layout(ws: &mut Worksheet) -> R<()> {
    for (c, w) in [
        (COL_ITEM, 5.7),
        (COL_DESC, 92.7),
        (COL_UNIT, 6.1),
        (COL_QTY, 8.7),
        (COL_U_MAT, 15.3),
        (COL_U_LAB, 15.7),
        (COL_U_TOT, 15.4),
        (COL_T_MAT, 17.0),
        (COL_T_LAB, 17.1),
        (COL_T_TOT, 17.9),
    ] {
        ws.set_column_width(c, w).map_err(xe)?;
    }
    ws.set_landscape();
    ws.set_paper_size(9); // A4
    ws.set_print_scale(75);
    ws.set_margins(0.24, 0.31, 0.63, 0.2, 0.2, 0.2);
    ws.set_repeat_rows(7, 8).map_err(xe)?;
    ws.set_freeze_panes(9, 0).map_err(xe)?;
    Ok(())
}

/// Row indices (0-based) of the TOTAL GERAL line and of the tab's own BDI in its ladder,
/// needed by the Resumo references.
struct SystemTotals {
    sheet: String,
    total_row: u32,
    bdi_row: u32,
}

fn write_system_sheet(
    ws: &mut Worksheet,
    st: &Styles,
    x: &SheetExport,
    sys: &SystemSheet,
) -> R<SystemTotals> {
    write_header_block(ws, st, x, &sys.system)?;
    write_column_header(ws, st, ["MATERIAL", "M. DE OBRA", "TOTAL"])?;
    let mut r: u32 = 9;
    write_blank_row(ws, st, r)?;
    r += 1;
    let mut subtotal_rows: Vec<u32> = Vec::new();

    for (si, section) in sys.sections.iter().enumerate() {
        let n = si + 1;
        let section_row = r;
        ws.write_string_with_format(r, COL_ITEM, n.to_string(), &boxed(&st.center, COL_ITEM))
            .map_err(xe)?;
        ws.write_string_with_format(r, COL_DESC, &section.name, &st.text_bold)
            .map_err(xe)?;
        for c in COL_UNIT..=COL_T_TOT {
            ws.write_blank(r, c, &boxed(&st.text, c)).map_err(xe)?;
        }
        ws.set_row_height(r, 12.75).map_err(xe)?;
        r += 1;
        let first = r;
        for (ri, row) in section.rows.iter().enumerate() {
            ws.write_string_with_format(
                r,
                COL_ITEM,
                format!("{n}.{}", ri + 1),
                &boxed(&st.center, COL_ITEM),
            )
            .map_err(xe)?;
            ws.write_string_with_format(r, COL_DESC, &row.name, &st.text)
                .map_err(xe)?;
            ws.write_string_with_format(r, COL_UNIT, &row.unit, &st.center_wrap)
                .map_err(xe)?;
            ws.write_number_with_format(r, COL_QTY, row.qty, &st.center_wrap)
                .map_err(xe)?;
            ws.write_number_with_format(r, COL_U_MAT, row.material_price, &st.price)
                .map_err(xe)?;
            ws.write_number_with_format(r, COL_U_LAB, row.labor_price, &st.price)
                .map_err(xe)?;
            write_line_formulas(ws, st, r)?;
            r += 1;
        }
        // an empty local sums its (blank) header row, so the sub-total reads "-"
        let (first, last) = if section.rows.is_empty() {
            (section_row, section_row)
        } else {
            (first, r - 1)
        };
        write_subtotal_row(ws, st, r, n, first, last)?;
        subtotal_rows.push(r);
        r += 1;
        write_blank_row(ws, st, r)?;
        r += 1;
    }

    // extras: Diversos (material), Transportes and Supervisão (labour)
    let items_sum = sum_of_rows(COL_T_TOT, &subtotal_rows);
    let base_n = sys.sections.len();
    let diversos_row = r;
    for (k, (label, is_material)) in [
        ("Diversos", true),
        ("Transportes", false),
        ("Supervisão e Projeto As Built", false),
    ]
    .iter()
    .enumerate()
    {
        ws.write_string_with_format(
            r,
            COL_ITEM,
            (base_n + k + 1).to_string(),
            &boxed(&st.center, COL_ITEM),
        )
        .map_err(xe)?;
        ws.write_string_with_format(r, COL_DESC, *label, &st.text_bold)
            .map_err(xe)?;
        ws.write_string_with_format(r, COL_UNIT, "vb", &st.center)
            .map_err(xe)?;
        ws.write_number_with_format(r, COL_QTY, 1.0, &st.center)
            .map_err(xe)?;
        let value = if k == 0 {
            format!("=ROUND(({items_sum}*{})/3,2)", sys.extras_pct / 100.0)
        } else {
            format!("={}", cell(COL_U_MAT, diversos_row))
        };
        if *is_material {
            ws.write_formula_with_format(r, COL_U_MAT, Formula::new(value), &st.price)
                .map_err(xe)?;
            ws.write_blank(r, COL_U_LAB, &st.price).map_err(xe)?;
        } else {
            ws.write_blank(r, COL_U_MAT, &st.price).map_err(xe)?;
            ws.write_formula_with_format(r, COL_U_LAB, Formula::new(value), &st.price)
                .map_err(xe)?;
        }
        write_line_formulas(ws, st, r)?;
        r += 1;
    }
    let last_priced_row = r - 1;
    write_blank_row(ws, st, r)?;
    r += 1;

    // TOTAL GERAL: every local's sub-total plus the three extras
    let total_formula = |c: u16| {
        format!(
            "={}+SUM({}:{})",
            sum_of_rows(c, &subtotal_rows),
            cell(c, diversos_row),
            cell(c, last_priced_row)
        )
    };
    ws.merge_range(
        r,
        COL_ITEM,
        r,
        COL_U_TOT,
        "TOTAL GERAL",
        &boxed(&st.total_label, COL_ITEM),
    )
    .map_err(xe)?;
    for c in [COL_T_MAT, COL_T_LAB] {
        ws.write_formula_with_format(r, c, Formula::new(total_formula(c)), &st.total_acc)
            .map_err(xe)?;
    }
    ws.write_formula_with_format(
        r,
        COL_T_TOT,
        Formula::new(total_formula(COL_T_TOT)),
        &st.total_big,
    )
    .map_err(xe)?;
    ws.set_row_height(r, 18.75).map_err(xe)?;
    let total_row = r;
    r += 1;

    let bdi_row = write_footer(ws, st, sys, total_row, r)?;
    set_budget_layout(ws)?;
    Ok(SystemTotals {
        sheet: String::new(),
        total_row,
        bdi_row,
    })
}

/// Label of a footer line: bold navy, right-aligned in DESCRIÇÃO, "vb" in UNID.
fn write_footer_label(ws: &mut Worksheet, st: &Styles, r: u32, label: &str) -> R<()> {
    ws.write_string_with_format(r, COL_DESC, label, &st.foot_label)
        .map_err(xe)?;
    ws.write_string_with_format(r, COL_UNIT, "vb", &st.foot_unit)
        .map_err(xe)?;
    ws.set_row_height(r, 12.75).map_err(xe)?;
    Ok(())
}

/// The stats block under TOTAL GERAL (points, value per point, amount × factor lines), then the
/// BDI ladder: the tab's own BDI first, highlighted, followed by the usual options, with a
/// VENDA (per point) column when the tab has a points line. Returns the row of the tab's BDI.
fn write_footer(
    ws: &mut Worksheet,
    st: &Styles,
    sys: &SystemSheet,
    total_row: u32,
    start: u32,
) -> R<u32> {
    let mut r = start;
    let total = |c: u16| cell(c, total_row);
    let mut points_cell: Option<String> = None;
    for line in &sys.footer {
        match line {
            FooterLine::Stat { label, value } | FooterLine::Points { label, value } => {
                write_footer_label(ws, st, r, label)?;
                ws.write_number_with_format(r, COL_U_MAT, *value, &st.foot_num)
                    .map_err(xe)?;
                if matches!(line, FooterLine::Points { .. }) {
                    points_cell = Some(cell(COL_U_MAT, r));
                }
            }
            FooterLine::PerPoint { label } => {
                write_footer_label(ws, st, r, label)?;
                let f = match &points_cell {
                    Some(p) => format!("=IF({p}=0,0,ROUND({}/{p},2))", total(COL_T_TOT)),
                    None => "=0".to_string(),
                };
                ws.write_formula_with_format(r, COL_U_MAT, Formula::new(f), &st.foot_money)
                    .map_err(xe)?;
            }
            FooterLine::Factor {
                label,
                base,
                value,
                factor,
            } => {
                write_footer_label(ws, st, r, label)?;
                let base_col = match base.as_str() {
                    "material" => Some(COL_T_MAT),
                    "labor" => Some(COL_T_LAB),
                    "total" => Some(COL_T_TOT),
                    _ => None,
                };
                match base_col {
                    Some(c) => ws
                        .write_formula_with_format(
                            r,
                            COL_U_MAT,
                            Formula::new(format!("={}", total(c))),
                            &st.foot_num,
                        )
                        .map_err(xe)?,
                    None => ws
                        .write_number_with_format(
                            r,
                            COL_U_MAT,
                            value.unwrap_or(0.0),
                            &st.foot_num,
                        )
                        .map_err(xe)?,
                };
                ws.write_number_with_format(r, COL_U_LAB, *factor, &st.foot_factor)
                    .map_err(xe)?;
                ws.write_formula_with_format(
                    r,
                    COL_U_TOT,
                    Formula::new(format!(
                        "=ROUND({}*{},2)",
                        cell(COL_U_MAT, r),
                        cell(COL_U_LAB, r)
                    )),
                    &st.foot_num,
                )
                .map_err(xe)?;
            }
        }
        r += 1;
    }
    if !sys.footer.is_empty() {
        r += 1;
    }

    // BDI ladder with its header
    ws.write_string_with_format(r, COL_T_MAT, "BDI", &st.foot_head)
        .map_err(xe)?;
    if points_cell.is_some() {
        ws.write_string_with_format(r, COL_T_LAB, "VENDA", &st.foot_head)
            .map_err(xe)?;
    }
    ws.write_string_with_format(r, COL_T_TOT, "TOTAL", &st.foot_head)
        .map_err(xe)?;
    r += 1;
    let bdi_row = r;
    let mut factors = vec![sys.bdi];
    for f in [1.30, 1.35, 1.40, 1.45, 1.50] {
        if (f - sys.bdi).abs() > 1e-9 {
            factors.push(f);
        }
    }
    for (k, f) in factors.iter().enumerate() {
        let chosen = k == 0;
        let (pct, money) = if chosen {
            (&st.bdi_pct_chosen, &st.bdi_money_chosen)
        } else {
            (&st.bdi_pct, &st.bdi_money)
        };
        ws.write_number_with_format(r, COL_T_MAT, *f, pct)
            .map_err(xe)?;
        ws.write_formula_with_format(
            r,
            COL_T_TOT,
            Formula::new(format!(
                "=ROUND({}*{},2)",
                total(COL_T_TOT),
                cell(COL_T_MAT, r)
            )),
            money,
        )
        .map_err(xe)?;
        if let Some(p) = &points_cell {
            ws.write_formula_with_format(
                r,
                COL_T_LAB,
                Formula::new(format!(
                    "=IF({p}=0,0,ROUND({}/{p},2))",
                    cell(COL_T_TOT, r)
                )),
                money,
            )
            .map_err(xe)?;
        }
        ws.set_row_height(r, 15.0).map_err(xe)?;
        r += 1;
    }
    Ok(bdi_row)
}

/// "Resumo" sheet: one line per system referencing that system's TOTAL GERAL.
fn write_resumo(
    ws: &mut Worksheet,
    st: &Styles,
    x: &SheetExport,
    totals: &[SystemTotals],
) -> R<()> {
    write_header_block(ws, st, x, "Resumo Geral")?;
    write_column_header(ws, st, ["BDI", "TOTAL", "TOTAL PROPOSTA"])?;
    let mut r: u32 = 9;
    write_blank_row(ws, st, r)?;
    r += 1;
    ws.write_string_with_format(r, COL_ITEM, "1", &boxed(&st.center, COL_ITEM))
        .map_err(xe)?;
    ws.write_string_with_format(r, COL_DESC, "Resumo", &st.text_bold)
        .map_err(xe)?;
    for c in COL_UNIT..=COL_T_TOT {
        ws.write_blank(r, c, &boxed(&st.text, c)).map_err(xe)?;
    }
    ws.set_row_height(r, 12.75).map_err(xe)?;
    r += 1;
    let first = r;
    for (i, t) in totals.iter().enumerate() {
        let sheet_ref = format!("'{}'", t.sheet.replace('\'', "''"));
        ws.write_string_with_format(
            r,
            COL_ITEM,
            format!("1.{}", i + 1),
            &boxed(&st.center, COL_ITEM),
        )
        .map_err(xe)?;
        ws.write_string_with_format(r, COL_DESC, &t.sheet, &st.text)
            .map_err(xe)?;
        ws.write_string_with_format(r, COL_UNIT, "pç", &st.center)
            .map_err(xe)?;
        ws.write_number_with_format(r, COL_QTY, 1.0, &st.center)
            .map_err(xe)?;
        ws.write_formula_with_format(
            r,
            COL_U_MAT,
            Formula::new(format!("={sheet_ref}!{}", cell(COL_T_MAT, t.total_row))),
            &st.price,
        )
        .map_err(xe)?;
        ws.write_formula_with_format(
            r,
            COL_U_LAB,
            Formula::new(format!("={sheet_ref}!{}", cell(COL_T_LAB, t.total_row))),
            &st.price,
        )
        .map_err(xe)?;
        ws.write_formula_with_format(
            r,
            COL_U_TOT,
            Formula::new(format!("={}+{}", cell(COL_U_MAT, r), cell(COL_U_LAB, r))),
            &st.acc_bold,
        )
        .map_err(xe)?;
        ws.write_formula_with_format(
            r,
            COL_T_MAT,
            Formula::new(format!("={sheet_ref}!{}", cell(COL_T_MAT, t.bdi_row))),
            &boxed(&st.pct, COL_T_MAT),
        )
        .map_err(xe)?;
        ws.write_formula_with_format(
            r,
            COL_T_LAB,
            Formula::new(format!(
                "=ROUND({}*{},2)",
                cell(COL_T_MAT, r),
                cell(COL_U_TOT, r)
            )),
            &st.acc_bold,
        )
        .map_err(xe)?;
        ws.write_formula_with_format(
            r,
            COL_T_TOT,
            Formula::new(format!("={}", cell(COL_T_LAB, r))),
            &boxed(&st.acc_bold, COL_T_TOT),
        )
        .map_err(xe)?;
        ws.set_row_height(r, 12.75).map_err(xe)?;
        r += 1;
    }
    let last = (r - 1).max(first);
    write_blank_row(ws, st, r)?;
    r += 1;
    ws.merge_range(
        r,
        COL_ITEM,
        r,
        COL_QTY,
        "TOTAL",
        &boxed(&st.total_label, COL_ITEM),
    )
    .map_err(xe)?;
    for c in [COL_U_MAT, COL_U_LAB, COL_U_TOT, COL_T_LAB, COL_T_TOT] {
        ws.write_formula_with_format(
            r,
            c,
            Formula::new(format!("=SUM({}:{})", cell(c, first), cell(c, last))),
            if c == COL_T_TOT {
                &st.total_big
            } else {
                &st.total_acc
            },
        )
        .map_err(xe)?;
    }
    ws.write_formula_with_format(
        r,
        COL_T_MAT,
        Formula::new(format!(
            "=IF({g}=0,0,{i}/{g})",
            g = cell(COL_U_TOT, r),
            i = cell(COL_T_LAB, r)
        )),
        &st.total_acc,
    )
    .map_err(xe)?;
    ws.set_row_height(r, 18.75).map_err(xe)?;
    set_budget_layout(ws)?;
    Ok(())
}

#[tauri::command]
fn export_xlsx(path: String, sheet: SheetExport) -> Result<(), String> {
    let st = Styles::new();
    let mut wb = Workbook::new();
    let mut names: Vec<String> = vec!["Resumo".to_string()];
    // Resumo first in the tab order; it is filled after the system sheets exist.
    wb.add_worksheet().set_name("Resumo").map_err(xe)?;
    let mut totals = Vec::new();
    for sys in &sheet.sheets {
        let name = sheet_name(&sys.system, &names);
        names.push(name.clone());
        let ws = wb.add_worksheet();
        ws.set_name(&name).map_err(xe)?;
        let t = write_system_sheet(ws, &st, &sheet, sys)?;
        totals.push(SystemTotals { sheet: name, ..t });
    }
    let resumo = wb.worksheet_from_index(0).map_err(xe)?;
    write_resumo(resumo, &st, &sheet, &totals)?;
    wb.save(&path).map_err(xe)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            read_file,
            read_text,
            write_text,
            write_file,
            file_exists,
            autosave_path,
            catalog_path,
            http_request,
            export_xlsx
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_budget_workbook() {
        let sheet = SheetExport {
            title: "Planilha Orçamentária - RLP ENGENHARIA e INSTALAÇÕES LTDA.".into(),
            system: "Sistema de Pressurização de Escadas".into(),
            client: "S2A".into(),
            site: "Gavea".into(),
            proposal_number: "26.00001PRC".into(),
            estimator: "Fernanda".into(),
            currency: "BRL".into(),
            date: "22/10/2026".into(),
            sheets: vec![
                SystemSheet {
                    system: "Pressurização".into(),
                    bdi: 1.25,
                    extras_pct: 5.0,
                    footer: vec![
                        FooterLine::Points {
                            label: "Número de pontos".into(),
                            value: 4.0,
                        },
                        FooterLine::PerPoint {
                            label: "Valor por ponto".into(),
                        },
                        FooterLine::Factor {
                            label: "Instalação".into(),
                            base: "labor".into(),
                            value: None,
                            factor: 2.0,
                        },
                    ],
                    sections: vec![
                        Section {
                            name: "Térreo".into(),
                            rows: vec![SheetRow {
                                name: "Dutos e Conexões Flangeados".into(),
                                unit: "m".into(),
                                qty: 13.64,
                                material_price: 120.0,
                                labor_price: 40.0,
                            }],
                        },
                        Section {
                            name: "1º Pavimento".into(),
                            rows: vec![SheetRow {
                                name: "Grelha de insuflamento 400x400mm".into(),
                                unit: "pç".into(),
                                qty: 2.0,
                                material_price: 350.0,
                                labor_price: 0.0,
                            }],
                        },
                    ],
                },
                SystemSheet {
                    system: "Exaustão Mec.".into(),
                    bdi: 1.42,
                    extras_pct: 5.0,
                    footer: vec![],
                    sections: vec![],
                },
            ],
            extras_pct: 5.0,
            bdi: 1.42,
        };
        let path = std::env::temp_dir().join("takeoff-test-export.xlsx");
        export_xlsx(path.to_string_lossy().into_owned(), sheet).expect("export");
        let meta = std::fs::metadata(&path).expect("file written");
        assert!(meta.len() > 2000, "workbook too small: {}", meta.len());
    }

    #[test]
    fn sheet_names_are_excel_safe_and_unique() {
        let taken = vec!["Resumo".to_string(), "AC".to_string()];
        assert_eq!(sheet_name("AC", &taken), "AC (2)");
        assert_eq!(
            sheet_name("Exaustão: Mec/Coifa", &taken),
            "Exaustão- Mec-Coifa"
        );
        assert_eq!(sheet_name("", &taken), "Orçamento");
        assert_eq!(sheet_name(&"x".repeat(40), &taken).chars().count(), 31);
    }
}
