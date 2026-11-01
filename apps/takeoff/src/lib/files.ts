import { invoke } from "@tauri-apps/api/core";
import { downloadDir, tempDir } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { type RevisionChoice, useStore } from "../store";
import { asksSameBudget, identityForSave, type SaveKind } from "./appLink";
import { mergeCatalog } from "./catalog";
import { chooseDialog, confirmDialog } from "./dialogs";
import { resolveDiscipline } from "./discipline";
import { DUCT_TEMPLATE_URL, ductSheetInput, fillDuctWorkbook } from "./ductSheet";
import { isTauri, mod } from "./platform";
import {
  contentHash,
  copyPathFor,
  resolveDrawingPaths,
  unportableDrawings,
  withRelativePaths,
} from "./projectFile";
import { systemSheets } from "./quantities";
import {
  basename,
  closePdf,
  dropDoc,
  isDocOpen,
  loadPdf,
  type OpenDoc,
  openPdfPath,
  preloadPdfPath,
  retireDoc,
  revisionDocKey,
  session,
  useDoc,
} from "./session";
import { drawingOf, emptyProject, type FooterLine, migrateProject, UNTITLED } from "./types";
import { buildVrfWorkbook } from "./vrfSheet";

/** Ask before throwing away unsaved work. Returns true when it is fine to continue. */
export async function confirmDiscard(): Promise<boolean> {
  const { dirty, project } = useStore.getState();
  if (!dirty) return true;
  return confirmDialog(`"${project.name}" tem alterações não salvas. Continuar sem salvar?`);
}

/**
 * Start a fresh project (obra). Clears the viewer; the plantas chosen in the dialog are added
 * right away (the first one is shown), more can be added afterwards.
 */
export async function newProject(
  meta: { name: string; client: string; site: string; system: string },
  pdfs: string[] = [],
): Promise<boolean> {
  if (!(await confirmDiscard())) return false;
  const store = useStore.getState();
  const project = { ...emptyProject(), ...meta };
  closePdf();
  fileStamp = null;
  store.resetProject(project, null);
  useStore.setState({ dirty: true });
  if (pdfs.length > 0) {
    await openPdfFiles(pdfs);
    return true;
  }
  store.setStatus(`Takeoff "${project.name}" criado. Adicione as plantas (PDF) com ${mod("O")}.`);
  return true;
}

/** Close the current project and return to the welcome screen. */
export async function closeProject(): Promise<boolean> {
  if (!(await confirmDiscard())) return false;
  closePdf();
  fileStamp = null;
  useStore.getState().resetProject(emptyProject(), null);
  return true;
}

const PROJECT_FILTER = [{ name: "Arquivo Takeoff", extensions: ["takeoff.json", "json"] }];
const PDF_FILTER = [{ name: "Plantas PDF", extensions: ["pdf"] }];

/** Let the user choose one or more plantas (PDF); empty when the dialog is cancelled. */
export async function pickPdfs(title?: string): Promise<string[]> {
  const picked = await open({ multiple: true, filters: PDF_FILTER, title });
  return Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
}

export async function pickAndOpenPdf(): Promise<void> {
  const paths = await pickPdfs();
  if (paths.length > 0) await openPdfFiles(paths);
}

/**
 * Add a PDF to the project (or switch to it when it is already there) and show it.
 * Markings and locations are kept per drawing; items are shared by the whole project.
 */
export const openPdfFile = (path: string): Promise<void> => openPdfFiles([path]);

/**
 * Add several PDFs to the project at once (one undo step; those already there are kept) and
 * show the first of them. The others are parsed in the background so their tabs open instantly.
 */
export async function openPdfFiles(paths: string[]): Promise<void> {
  const store = useStore.getState();
  const { project } = store;
  const unique = [...new Set(paths)];
  if (unique.length === 0) return;
  const fresh = unique.filter((p) => !project.drawings.some((d) => d.path === p));
  const ids = store.addDrawings(fresh.map((path) => ({ path, name: basename(path) })));
  if (project.name === UNTITLED && project.drawings.length === 0 && fresh.length > 0) {
    store.setProjectMeta({ name: basename(fresh[0]).replace(/\.pdf$/i, "") });
  }
  const firstId =
    ids[0] ?? useStore.getState().project.drawings.find((d) => d.path === unique[0])?.id;
  if (firstId) await switchDrawing(firstId);
  if (ids.length > 1) useStore.getState().setStatus(`${ids.length} plantas adicionadas.`);
}

let warmTimer = 0;
/**
 * Parse and pre-render the other plantas of the takeoff while the user works, one at a time,
 * so switching tabs never waits. Starts a moment after the active one is ready.
 */
export function scheduleWarm(): void {
  if (!isTauri()) return;
  window.clearTimeout(warmTimer);
  warmTimer = window.setTimeout(() => void warmDrawings(), 1500);
}

async function warmDrawings(): Promise<void> {
  const { project } = useStore.getState();
  for (const d of project.drawings) {
    if (!d.path || d.id === project.activeDrawingId || isDocOpen(d.path)) continue;
    try {
      if (!(await invoke<boolean>("file_exists", { path: d.path }))) continue;
      await preloadPdfPath(d.path);
    } catch (e) {
      console.warn("preload failed", d.name, e);
    }
    // the takeoff may have changed meanwhile
    if (useStore.getState().project !== project) return warmDrawings();
  }
}

/** Drawing switches and replacements in progress (the viewer sync below waits for them). */
let switching = 0;

/** Make a drawing the active one and load its PDF (asking to relocate it when missing). */
export async function switchDrawing(id: string): Promise<void> {
  switching++;
  try {
    await showDrawing(id);
  } finally {
    switching--;
  }
}

/**
 * Keep the viewer on the active drawing's PDF when an edit changes which file that is (undo or
 * redo of a revision replacement). Returns the unsubscribe function.
 */
export function syncViewerWithDrawing(): () => void {
  return useStore.subscribe((s, prev) => {
    if (switching || s.project === prev.project) return;
    const id = s.project.activeDrawingId;
    if (!id || id !== prev.project.activeDrawingId) return;
    const d = drawingOf(s.project, id);
    if (!d?.path || d === drawingOf(prev.project, id)) return;
    const shown = session.activeKey;
    if (shown && shown !== d.path) void switchDrawing(id);
  });
}

async function showDrawing(id: string): Promise<void> {
  const store = useStore.getState();
  const drawing = drawingOf(store.project, id);
  if (!drawing) return;
  let path = drawing.path;
  if (path && isDocOpen(path)) {
    await openPdfPath(path);
    useStore.getState().setActiveDrawing(id);
    useStore.getState().ensurePages(useDoc.getState().numPages);
    return;
  }
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
    scheduleWarm();
  } catch (e) {
    store.setStatus(`Não foi possível abrir o PDF: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Replace a drawing's PDF with a new revision ("Rev B"): pick the file, map its pages (aligning
 * re-plotted sheets) in the revision dialog, and move the markings over as one undo step.
 */
export async function replaceDrawingPdf(id: string): Promise<void> {
  const drawing = drawingOf(useStore.getState().project, id);
  if (!drawing || useStore.getState().revisionRequest) return;
  const picked = await open({
    multiple: false,
    filters: PDF_FILTER,
    title: `Nova revisão de ${drawing.name}`,
  });
  if (typeof picked === "string") await replaceDrawingWith(id, picked);
}

/** Replace a drawing's PDF with the one at `path` (after the file pick; dev console in browser). */
export async function replaceDrawingWith(id: string, path: string): Promise<void> {
  switching++;
  try {
    await replaceWith(id, path);
  } catch (e) {
    useStore.getState().setStatus(`Não foi possível substituir a planta: ${errorText(e)}`);
  } finally {
    switching--;
  }
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function replaceWith(id: string, path: string): Promise<void> {
  // the drawing being replaced is shown: its document and page sizes are the dialog's old side
  const before = drawingOf(useStore.getState().project, id);
  if (useStore.getState().project.activeDrawingId !== id || session.activeKey !== before?.path) {
    await showDrawing(id);
  }
  const store = useStore.getState();
  const drawing = drawingOf(store.project, id);
  const oldKey = session.activeKey;
  if (!drawing?.path || store.project.activeDrawingId !== id || oldKey !== drawing.path) return;
  const oldSizes = useDoc.getState().sizes;
  // a revision saved over the same file: park the parsed old version so the path reads anew
  const samePath = drawing.path === path;
  const parked = `${path}#substituindo`;
  if (samePath) retireDoc(path, parked);
  let next: OpenDoc;
  try {
    store.setStatus(`Abrindo ${basename(path)}…`);
    next = await loadPdf(path);
  } catch (e) {
    if (samePath) retireDoc(parked, path);
    throw e;
  }
  store.setStatus(`${basename(path)} aberto: confira a correspondência das páginas`);
  const counts = oldSizes.map(() => 0);
  for (const m of [...store.project.measurements, ...store.project.zones]) {
    if (m.drawingId === id && m.page < counts.length) counts[m.page]++;
  }
  const choice = await new Promise<RevisionChoice | null>((resolve) =>
    store.setRevisionRequest({
      drawingId: id,
      oldName: drawing.name,
      newName: basename(path),
      oldKey: samePath ? parked : (drawing.path ?? path),
      newKey: next.key,
      oldSizes,
      newSizes: next.sizes,
      counts,
      resolve: (c) => {
        useStore.getState().setRevisionRequest(null);
        resolve(c);
      },
    }),
  );
  if (!choice) {
    if (samePath) {
      dropDoc(path);
      retireDoc(parked, path);
    }
    useStore.getState().setStatus(null);
    return;
  }
  const n = (p: { measurements: unknown[]; zones: unknown[] }) =>
    p.measurements.length + p.zones.length;
  const total = n(useStore.getState().project);
  useStore
    .getState()
    .replaceDrawing(id, path, choice.pageMap, choice.transforms, next.sizes.length);
  const after = useStore.getState().project;
  const rev = drawingOf(after, id)?.revisions?.at(-1);
  if (samePath) retireDoc(parked, rev ? revisionDocKey(path, rev) : `${path}#anterior`);
  await showDrawing(id);
  const dropped = total - n(after);
  useStore
    .getState()
    .setStatus(
      `${drawing.name} substituída por ${basename(path)}${dropped ? ` · ${dropped} marcações descartadas` : ""} · ${mod("Z")} desfaz`,
    );
}

/**
 * The project file as this window last read or wrote it. When the file sits in a folder synced
 * by OneDrive or SharePoint, another machine may have saved a newer version since: saving over
 * it would silently throw that version away.
 */
let fileStamp: { path: string; hash: string } | null = null;

/** Whether `path` no longer holds what this window last read or wrote there. */
async function changedOnDisk(path: string): Promise<boolean> {
  if (!isTauri() || fileStamp?.path !== path) return false;
  try {
    if (!(await invoke<boolean>("file_exists", { path }))) return false;
    const text = await invoke<string>("read_text", { path });
    return contentHash(text) !== fileStamp.hash;
  } catch {
    return false;
  }
}

/** Folders that are never synced, where a drawing will not be found on another machine. */
async function localOnlyDirs(): Promise<string[]> {
  if (!isTauri()) return [];
  const dirs = await Promise.all([downloadDir().catch(() => ""), tempDir().catch(() => "")]);
  return dirs.filter((d) => d !== "");
}

/**
 * Give the project the identity this save calls for (see `identityForSave`): an id when it has
 * none, and a new one for a copy that is another budget. A copy of a takeoff already sent to the
 * company app asks whether it is the same approved budget. Null when the user cancels.
 */
async function saveIdentity(kind: SaveKind): Promise<{ unlinked: boolean } | null> {
  const { project, setIdentity } = useStore.getState();
  let sameBudget = false;
  if (asksSameBudget(project, kind)) {
    const choice = await chooseDialog(
      `Este takeoff já foi enviado ao app como orçamento aprovado da obra ${project.sentToApp?.obraName}.\n\n` +
        "Mesmo orçamento: a cópia continua ligada a ele (por exemplo, uma revisão do orçamento aprovado); um novo envio atualiza o orçamento no app.\n" +
        "Outro orçamento: a cópia fica sem vínculo; um envio dela cria outro orçamento no app.",
      { yes: "Mesmo orçamento", no: "Outro orçamento", cancel: "Cancelar" },
    );
    if (choice === "cancel") return null;
    sameBudget = choice === "yes";
  }
  const next = identityForSave(project, kind, sameBudget);
  if (next !== project) setIdentity({ id: next.id, sentToApp: next.sentToApp });
  return { unlinked: project.sentToApp !== undefined && next.sentToApp === undefined };
}

/**
 * Save the takeoff. `as` (or no file yet) asks where; `suggestedPath` pre-fills that dialog.
 * Saving over a file that another machine changed meanwhile asks first (copy, reload or cancel).
 * `conflictCopy` marks that copy: it becomes another budget for the company app (new id).
 */
export async function saveProject(
  as = false,
  suggestedPath?: string,
  conflictCopy = false,
): Promise<boolean> {
  const store = useStore.getState();
  let path = store.filePath;
  if (!path || as) {
    const suggested = suggestedPath ?? `${store.project.name || "takeoff"}.takeoff.json`;
    const picked = await save({ defaultPath: suggested, filters: PROJECT_FILTER });
    if (!picked) return false;
    path = picked;
  } else if (await changedOnDisk(path)) {
    const choice = await chooseDialog(
      `"${basename(path)}" foi alterado em outra máquina depois que você o abriu ` +
        "(o OneDrive ou o SharePoint sincronizou uma versão mais nova). Salvar agora apagaria aquela versão.\n\n" +
        "Salvar como cópia: guarda as suas alterações num arquivo ao lado, sem mexer no original.\n" +
        "Recarregar: abre a versão nova e descarta as alterações feitas aqui.",
      { yes: "Salvar como cópia…", no: "Recarregar", cancel: "Cancelar" },
    );
    if (choice === "yes") return saveProject(true, copyPathFor(path), true);
    if (choice === "no") {
      if (await loadProjectFile(path)) {
        useStore
          .getState()
          .setStatus(`Recarregado: a versão de ${basename(path)} salva em outra máquina`);
      }
    }
    return false;
  }
  const kind: SaveKind = conflictCopy
    ? "conflictCopy"
    : store.filePath && path !== store.filePath
      ? "saveAs"
      : "save";
  const identity = await saveIdentity(kind);
  if (identity === null) return false;
  const project = useStore.getState().project;
  const contents = JSON.stringify(withRelativePaths(project, path), null, 2);
  await invoke("write_text", { path, contents });
  fileStamp = { path, hash: contentHash(contents) };
  store.setFilePath(path);
  store.markSaved();
  store.pushRecent(path, project.name);
  const away = unportableDrawings(project, path, await localOnlyDirs());
  const unlinked = identity.unlinked
    ? " · esta cópia não está ligada ao orçamento já enviado ao app (um envio dela cria outro)"
    : "";
  store.setStatus(
    away.length === 0
      ? `Salvo: ${basename(path)}${unlinked}`
      : away.length === 1
        ? `Salvo: ${basename(path)}${unlinked} · a planta ${away[0]} está fora da pasta do takeoff (Downloads ou outro disco) e não será encontrada em outra máquina. Mova-a para a pasta da obra.`
        : `Salvo: ${basename(path)}${unlinked} · ${away.length} plantas (${away.join(", ")}) estão fora da pasta do takeoff (Downloads ou outro disco) e não serão encontradas em outra máquina. Mova-as para a pasta da obra.`,
  );
  return true;
}

export async function openProjectFile(path: string): Promise<void> {
  if (!(await confirmDiscard())) return;
  await loadProjectFile(path);
}

/**
 * Read a takeoff file and show it, without asking about unsaved work. Drawings whose PDF is
 * not at its saved path on this machine are looked up beside the file (`relPath`): the same
 * OneDrive or SharePoint folder synced under another root.
 */
async function loadProjectFile(path: string): Promise<boolean> {
  const store = useStore.getState();
  let text: string;
  try {
    text = await invoke<string>("read_text", { path });
  } catch (e) {
    store.setStatus(
      `Não foi possível abrir o takeoff: ${e instanceof Error ? e.message : String(e)}`,
    );
    useStore.setState({ recentProjects: store.recentProjects.filter((r) => r.path !== path) });
    return false;
  }
  const { project, relinked } = await resolveDrawingPaths(
    migrateProject(JSON.parse(text)),
    path,
    (p) => invoke<boolean>("file_exists", { path: p }),
  );
  closePdf();
  store.resetProject(project, path);
  fileStamp = { path, hash: contentHash(text) };
  store.pushRecent(path, project.name);
  const first = project.activeDrawingId ?? project.drawings[0]?.id;
  if (first) await switchDrawing(first);
  if (relinked > 0) {
    useStore
      .getState()
      .setStatus(
        `${relinked === 1 ? "1 planta encontrada" : `${relinked} plantas encontradas`} pela pasta do takeoff, neste computador`,
      );
  }
  return true;
}

let noticedHash: string | null = null;
/**
 * Tell the user, once per version, that the open file was changed by another machine (called
 * when the window gets focus). Saving then offers to keep a copy or reload.
 */
export async function noticeExternalChange(): Promise<void> {
  const path = useStore.getState().filePath;
  if (!path || !(await changedOnDisk(path))) return;
  const text = await invoke<string>("read_text", { path }).catch(() => null);
  const hash = text === null ? null : contentHash(text);
  if (hash === null || hash === noticedHash) return;
  noticedHash = hash;
  useStore
    .getState()
    .setStatus(
      `${basename(path)} foi alterado em outra máquina. Ao salvar, você escolhe entre salvar uma cópia ou recarregar.`,
    );
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
  /** One worksheet per system, each with its sections (locations or groups) and its own BDI, extras and footer. */
  sheets: {
    system: string;
    sections: { name: string; rows: SheetRow[] }[];
    bdi: number;
    extrasPct: number;
    footer: FooterLine[];
  }[];
  /** Project defaults (kept for older readers of the payload). */
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
      ...resolveDiscipline(project, s.system),
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
  };
}

/** Sheet unit abbreviations used on RLP budget sheets. */
const unitLabel = (u: string): string => (u === "un" ? "pç" : u);

/** Fill RLP's "Levantamento Dutos" workbook for one discipline and save it. */
export async function exportDuctSheet(networkId: string): Promise<void> {
  const store = useStore.getState();
  const { project } = store;
  const network = project.items.find((i) => i.id === networkId);
  try {
    const res = await fetch(DUCT_TEMPLATE_URL);
    if (!res.ok) throw new Error(`modelo não encontrado (${res.status})`);
    const input = ductSheetInput(
      project,
      mergeCatalog(store.catalog),
      networkId,
      store.catalog.gaugeWeights,
    );
    const bytes = await fillDuctWorkbook(await res.arrayBuffer(), input);
    const name = `Levantamento Dutos - ${network?.name ?? "Rede"}${project.site ? ` - ${project.site}` : ""}.xlsx`;
    await saveXlsxBytes(name, bytes);
  } catch (e) {
    store.setStatus(`Falha na planilha de dutos: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Save an .xlsx built in memory: native dialog inside Tauri, a download in the browser. */
async function saveXlsxBytes(name: string, bytes: Uint8Array): Promise<void> {
  const store = useStore.getState();
  if (isTauri()) {
    const path = await save({
      defaultPath: name,
      filters: [{ name: "Planilha Excel", extensions: ["xlsx"] }],
    });
    if (!path) return;
    await invoke("write_file", { path, data: Array.from(bytes) });
    store.setStatus(`Exportado: ${basename(path)}`);
  } else {
    const url = URL.createObjectURL(
      new Blob([bytes as unknown as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    store.setStatus(`Exportado: ${name}`);
  }
}

/** Build the "Levantamento VRF" workbook for some (or every) VRF system and save it. */
export async function exportVrfSheet(systemIds?: string[]): Promise<void> {
  const store = useStore.getState();
  const { project } = store;
  try {
    const bytes = await buildVrfWorkbook(
      project,
      store.vrfPricing(),
      store.catalog.vrfBrands,
      systemIds,
    );
    const one = systemIds?.length === 1 ? project.items.find((i) => i.id === systemIds[0]) : null;
    const name = `Levantamento VRF - ${one?.name ?? "Sistemas"}${project.site ? ` - ${project.site}` : ""}.xlsx`;
    await saveXlsxBytes(name, bytes);
  } catch (e) {
    store.setStatus(`Falha na planilha VRF: ${e instanceof Error ? e.message : String(e)}`);
  }
}

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
  fileStamp = null;
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
