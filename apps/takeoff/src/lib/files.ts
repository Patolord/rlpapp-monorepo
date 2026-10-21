import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import { buildQuote } from "./quantities";
import { basename, openPdfPath } from "./session";
import { migrateProject } from "./types";

const PROJECT_FILTER = [{ name: "Takeoff project", extensions: ["takeoff.json", "json"] }];
const PDF_FILTER = [{ name: "PDF drawings", extensions: ["pdf"] }];

export async function pickAndOpenPdf(): Promise<void> {
  const path = await open({ multiple: false, filters: PDF_FILTER });
  if (typeof path === "string") await openPdfFile(path);
}

export async function openPdfFile(path: string): Promise<void> {
  const store = useStore.getState();
  store.setStatus(`Opening ${basename(path)}…`);
  try {
    await openPdfPath(path);
    const { project } = useStore.getState();
    if (project.pdfPath !== path) {
      // a different drawing: start a fresh project around it unless the current one is empty
      const fresh = project.measurements.length === 0 && project.items.length === 0;
      if (fresh) {
        store.resetProject({
          ...project,
          pdfPath: path,
          pdfName: basename(path),
          name: basename(path).replace(/\.pdf$/i, ""),
          pages: [],
        });
      } else {
        store.commit((p) => ({ ...p, pdfPath: path, pdfName: basename(path) }));
      }
    }
    useStore.getState().setPage(0);
    useStore.getState().setStatus(null);
  } catch (e) {
    store.setStatus(`Could not open PDF: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function saveProject(as = false): Promise<boolean> {
  const store = useStore.getState();
  let path = store.filePath;
  if (!path || as) {
    const suggested = `${store.project.name || "takeoff"}.takeoff.json`;
    const picked = await save({ defaultPath: suggested, filters: PROJECT_FILTER });
    if (!picked) return false;
    path = picked;
  }
  await invoke("write_text", { path, contents: JSON.stringify(store.project, null, 2) });
  store.setFilePath(path);
  store.markSaved();
  store.setStatus(`Saved ${basename(path)}`);
  return true;
}

export async function openProjectFile(path: string): Promise<void> {
  const store = useStore.getState();
  const text = await invoke<string>("read_text", { path });
  const project = migrateProject(JSON.parse(text));
  store.resetProject(project, path);
  if (project.pdfPath) {
    const exists = await invoke<boolean>("file_exists", { path: project.pdfPath });
    if (exists) {
      await openPdfPath(project.pdfPath);
      useStore.getState().setPage(0);
    } else {
      store.setStatus(`PDF not found: ${project.pdfPath}. Open it to relink.`);
      const picked = await open({
        multiple: false,
        filters: PDF_FILTER,
        title: "Locate the drawing PDF",
      });
      if (typeof picked === "string") {
        await openPdfPath(picked);
        useStore.getState().commit((p) => ({ ...p, pdfPath: picked, pdfName: basename(picked) }));
        useStore.getState().setPage(0);
      }
    }
  }
}

export async function pickAndOpenProject(): Promise<void> {
  const path = await open({ multiple: false, filters: PROJECT_FILTER });
  if (typeof path === "string") await openProjectFile(path);
}

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
  groups: { name: string; rows: SheetRow[] }[];
  extrasPct: number;
  bdi: number;
}

export interface SheetRow {
  name: string;
  unit: string;
  qty: number;
  materialPrice: number;
  laborPrice: number;
}

export function sheetExport(): SheetExport {
  const { project } = useStore.getState();
  const quote = buildQuote(project);
  return {
    title: "Planilha Orçamentária - RLP ENGENHARIA e INSTALAÇÕES LTDA.",
    system: project.system || project.name,
    client: project.client,
    site: project.site,
    proposalNumber: project.proposalNumber,
    estimator: project.estimator,
    currency: project.currency,
    date: new Date().toLocaleDateString("pt-BR"),
    groups: quote.groups.map((g) => ({
      name: g.name,
      rows: g.lines.map((l) => ({
        name: l.item.name,
        unit: unitLabel(l.unit),
        qty: l.qty,
        materialPrice: l.item.materialPrice,
        laborPrice: l.item.laborPrice,
      })),
    })),
    extrasPct: project.extrasPct,
    bdi: project.bdi,
  };
}

/** Sheet unit abbreviations used on RLP budget sheets. */
const unitLabel = (u: string): string => (u === "un" ? "pç" : u);

export async function exportXlsx(): Promise<void> {
  const store = useStore.getState();
  const { project } = store;
  const path = await save({
    defaultPath: `Planilha Orçamentária - ${project.site || project.name || "Obra"}.xlsx`,
    filters: [{ name: "Excel workbook", extensions: ["xlsx"] }],
  });
  if (!path) return;
  try {
    await invoke("export_xlsx", { path, sheet: sheetExport() });
    store.setStatus(`Exported ${basename(path)}`);
  } catch (e) {
    store.setStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

let autosavePath: string | null = null;

export async function autosave(): Promise<void> {
  const store = useStore.getState();
  if (!store.dirty) return;
  autosavePath ??= await invoke<string>("autosave_path");
  await invoke("write_text", { path: autosavePath, contents: JSON.stringify(store.project) });
}

export async function restoreAutosave(): Promise<boolean> {
  autosavePath ??= await invoke<string>("autosave_path");
  const exists = await invoke<boolean>("file_exists", { path: autosavePath });
  if (!exists) return false;
  const text = await invoke<string>("read_text", { path: autosavePath });
  const project = migrateProject(JSON.parse(text));
  if (!project.pdfPath) return false;
  useStore.getState().resetProject(project, null);
  useStore.getState().setStatus("Restored autosaved session (unsaved)");
  await openPdfPath(project.pdfPath);
  useStore.setState({ dirty: true });
  return true;
}

export async function hasAutosave(): Promise<boolean> {
  try {
    autosavePath ??= await invoke<string>("autosave_path");
    return await invoke<boolean>("file_exists", { path: autosavePath });
  } catch {
    return false;
  }
}
