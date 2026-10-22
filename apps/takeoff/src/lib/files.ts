import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import { mod } from "./platform";
import { systemSheets, zoneMatrix } from "./quantities";
import { basename, closePdf, openPdfPath, useDoc } from "./session";
import { drawingOf, emptyProject, migrateProject, UNTITLED } from "./types";

/** Ask before throwing away unsaved work. Returns true when it is fine to continue. */
export function confirmDiscard(): boolean {
  const { dirty, project } = useStore.getState();
  if (!dirty) return true;
  return window.confirm(`"${project.name}" tem alterações não salvas. Continuar sem salvar?`);
}

/** Start a fresh project (obra). Clears the viewer; PDFs are added afterwards. */
export async function newProject(meta: {
  name: string;
  client: string;
  site: string;
  system: string;
}): Promise<boolean> {
  if (!confirmDiscard()) return false;
  const store = useStore.getState();
  const project = { ...emptyProject(), ...meta };
  closePdf();
  store.resetProject(project, null);
  useStore.setState({ dirty: true });
  store.setStatus(`Takeoff "${project.name}" criado. Adicione as plantas (PDF) com ${mod("O")}.`);
  return true;
}

/** Close the current project and return to the welcome screen. */
export function closeProject(): boolean {
  if (!confirmDiscard()) return false;
  closePdf();
  useStore.getState().resetProject(emptyProject(), null);
  return true;
}

const PROJECT_FILTER = [{ name: "Arquivo Takeoff", extensions: ["takeoff.json", "json"] }];
const PDF_FILTER = [{ name: "Plantas PDF", extensions: ["pdf"] }];

export async function pickAndOpenPdf(): Promise<void> {
  const path = await open({ multiple: false, filters: PDF_FILTER });
  if (typeof path === "string") await openPdfFile(path);
}

/**
 * Add a PDF to the project (or switch to it when it is already there) and show it.
 * Markings and locations are kept per drawing; items are shared by the whole project.
 */
export async function openPdfFile(path: string): Promise<void> {
  const store = useStore.getState();
  const existing = store.project.drawings.find((d) => d.path === path);
  if (existing) {
    await switchDrawing(existing.id);
    return;
  }
  const { project } = store;
  const name = basename(path);
  const id = store.addDrawing(path, name);
  if (project.name === UNTITLED && project.drawings.length === 0) {
    store.setProjectMeta({ name: name.replace(/\.pdf$/i, "") });
  }
  await switchDrawing(id);
}

/** Make a drawing the active one and load its PDF (asking to relocate it when missing). */
export async function switchDrawing(id: string): Promise<void> {
  const store = useStore.getState();
  const drawing = drawingOf(store.project, id);
  if (!drawing) return;
  let path = drawing.path;
  if (!path || !(await invoke<boolean>("file_exists", { path }))) {
    store.setStatus(`PDF não encontrado: ${path ?? drawing.name}. Localize-o para religar.`);
    const picked = await open({
      multiple: false,
      filters: PDF_FILTER,
      title: `Localizar ${drawing.name}`,
    });
    if (typeof picked !== "string") return;
    path = picked;
    store.updateDrawing(id, { path, name: basename(path) });
  }
  store.setStatus(`Abrindo ${basename(path)}…`);
  try {
    await openPdfPath(path);
    useStore.getState().setActiveDrawing(id);
    useStore.getState().ensurePages(useDoc.getState().numPages);
    useStore.getState().setStatus(null);
  } catch (e) {
    store.setStatus(`Não foi possível abrir o PDF: ${e instanceof Error ? e.message : String(e)}`);
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
  store.pushRecent(path, store.project.name);
  store.setStatus(`Salvo: ${basename(path)}`);
  return true;
}

export async function openProjectFile(path: string): Promise<void> {
  if (!confirmDiscard()) return;
  const store = useStore.getState();
  let text: string;
  try {
    text = await invoke<string>("read_text", { path });
  } catch (e) {
    store.setStatus(
      `Não foi possível abrir o takeoff: ${e instanceof Error ? e.message : String(e)}`,
    );
    useStore.setState({ recentProjects: store.recentProjects.filter((r) => r.path !== path) });
    return;
  }
  const project = migrateProject(JSON.parse(text));
  closePdf();
  store.resetProject(project, path);
  store.pushRecent(path, project.name);
  const first = project.activeDrawingId ?? project.drawings[0]?.id;
  if (first) await switchDrawing(first);
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
  /** One worksheet per system, each with its sections (locations or groups). */
  sheets: { system: string; sections: { name: string; rows: SheetRow[] }[] }[];
  extrasPct: number;
  bdi: number;
  /** "Por Local" sheet: zone names and one quantity per zone for each item (empty when no zones). */
  zones: string[];
  byZone: { name: string; unit: string; qty: number[] }[];
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
  const matrix = project.zones.length ? zoneMatrix(project) : { columns: [], rows: [] };
  return {
    title: "Planilha Orçamentária - RLP ENGENHARIA e INSTALAÇÕES LTDA.",
    system: project.system || project.name,
    client: project.client,
    site: project.site,
    proposalNumber: project.proposalNumber,
    estimator: project.estimator,
    currency: project.currency,
    date: new Date().toLocaleDateString("pt-BR"),
    sheets: systemSheets(project).map((s) => ({
      system: s.system,
      sections: s.sections.map((sec) => ({
        name: sec.name,
        rows: sec.rows.map((r) => ({
          name: r.item.name,
          unit: unitLabel(r.unit),
          qty: r.qty,
          materialPrice: r.item.materialPrice,
          laborPrice: r.item.laborPrice,
        })),
      })),
    })),
    extrasPct: project.extrasPct,
    bdi: project.bdi,
    zones: matrix.columns.map((c) => c.name),
    byZone: matrix.rows.map((r) => ({ name: r.item.name, unit: unitLabel(r.unit), qty: r.qty })),
  };
}

/** Sheet unit abbreviations used on RLP budget sheets. */
const unitLabel = (u: string): string => (u === "un" ? "pç" : u);

export async function exportXlsx(): Promise<void> {
  const store = useStore.getState();
  const { project } = store;
  const path = await save({
    defaultPath: `Planilha Orçamentária - ${project.site || project.name || "Obra"}.xlsx`,
    filters: [{ name: "Planilha Excel", extensions: ["xlsx"] }],
  });
  if (!path) return;
  try {
    await invoke("export_xlsx", { path, sheet: sheetExport() });
    store.setStatus(`Exportado: ${basename(path)}`);
  } catch (e) {
    store.setStatus(`Falha na exportação: ${e instanceof Error ? e.message : String(e)}`);
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
  const first = project.activeDrawingId ?? project.drawings[0]?.id;
  if (!first) return false;
  useStore.getState().resetProject(project, null);
  useStore.getState().setStatus("Sessão restaurada do salvamento automático (não salva)");
  await switchDrawing(first);
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
