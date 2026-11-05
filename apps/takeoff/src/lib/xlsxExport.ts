import { type BdiLayout, resolveDiscipline } from "./discipline";
import { disciplineTotals, systemSheets } from "./quantities";
import type { FooterLine, Project } from "./types";

/** Payload for the Rust `export_xlsx` command (Planilha Orçamentária layout). */
export interface SheetExport {
  title: string;
  system: string;
  client: string;
  site: string;
  proposalNumber: string;
  estimator: string;
  currency: string;
  date: string;
  /** One worksheet per system, each with its sections (locations or groups) and its own BDI, extras, footer and BDI layout. */
  sheets: {
    system: string;
    sections: { name: string; rows: SheetRow[] }[];
    bdi: number;
    extrasPct: number;
    footer: FooterLine[];
    bdiLayout: BdiLayout;
  }[];
  /** Project defaults (kept for older readers of the payload). */
  extrasPct: number;
  bdi: number;
  /** Whether the "Resumo" tab (one line per discipline tab) opens the workbook. */
  resumo: boolean;
}

export interface SheetRow {
  name: string;
  unit: string;
  qty: number;
  materialPrice: number;
  laborPrice: number;
}

/** What goes into the budget workbook: chosen in the "Exportar planilha" dialog. */
export interface XlsxExportOptions {
  /** Discipline tabs to write, in any order; null writes every one. */
  systems: string[] | null;
  /** How each tab is split: by location or by item group (the project's setting by default). */
  sectionsBy: Project["sectionsBy"];
  /** Open the workbook with the "Resumo" tab. */
  resumo: boolean;
  /** Leave out items whose quantity is zero (kept by default in group mode, to be filled by hand). */
  hideEmpty: boolean;
  /** Print the prices; off, the price columns stay blank ("-"): a quantity list for a supplier quote. */
  prices: boolean;
}

/** The export as it always was: every tab, the project's sections, Resumo, prices. */
export function defaultXlsxOptions(project: Project): XlsxExportOptions {
  return {
    systems: null,
    sectionsBy: project.sectionsBy,
    resumo: true,
    hideEmpty: false,
    prices: true,
  };
}

/** The discipline tabs the workbook would have, in tab order, with what each adds up to. */
export function xlsxTabs(project: Project): { system: string; proposal: number; rows: number }[] {
  const totals = disciplineTotals(project);
  return systemSheets(project).map((s) => ({
    system: s.system,
    proposal: totals.find((t) => t.system === s.system)?.proposal ?? 0,
    rows: s.sections.reduce((n, sec) => n + sec.rows.length, 0),
  }));
}

/** Sheet unit abbreviations used on RLP budget sheets. */
const unitLabel = (u: string): string => (u === "un" ? "pç" : u);

/** Build the `export_xlsx` payload for the project with the given options. */
export function buildSheetExport(
  project: Project,
  options: XlsxExportOptions = defaultXlsxOptions(project),
): SheetExport {
  const wanted = options.systems === null ? null : new Set(options.systems);
  const sheets = systemSheets({ ...project, sectionsBy: options.sectionsBy }).filter(
    (s) => wanted === null || wanted.has(s.system),
  );
  return {
    title: "Planilha Orçamentária - RLP ENGENHARIA e INSTALAÇÕES LTDA.",
    system: project.system || project.name,
    client: project.client,
    site: project.site,
    proposalNumber: project.proposalNumber,
    estimator: project.estimator,
    currency: project.currency,
    date: new Date().toLocaleDateString("pt-BR"),
    sheets: sheets.map((s) => ({
      system: s.system,
      ...resolveDiscipline(project, s.system),
      sections: s.sections
        .map((sec) => ({
          name: sec.name,
          rows: sec.rows
            .filter((r) => !options.hideEmpty || r.qty > 0)
            .map((r) => ({
              name: r.item.name,
              unit: unitLabel(r.unit),
              qty: r.qty,
              materialPrice: options.prices ? r.item.materialPrice : 0,
              laborPrice: options.prices ? r.item.laborPrice : 0,
            })),
        }))
        .filter((sec) => sec.rows.length > 0 || !options.hideEmpty),
    })),
    extrasPct: project.extrasPct,
    bdi: project.bdi,
    resumo: options.resumo,
  };
}

/**
 * Suggested file name: the site (or the takeoff's name), and the discipline when the workbook
 * holds a single tab, so partial exports do not overwrite one another.
 */
export function xlsxFileName(project: Project, sheet: SheetExport): string {
  const where = project.site || project.name || "Obra";
  const only = sheet.sheets.length === 1 ? sheet.sheets[0].system : null;
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return `Planilha Orçamentária - ${safe(where)}${only ? ` - ${safe(only)}` : ""}.xlsx`;
}
