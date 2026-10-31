/**
 * Export of the location cutout report: the dialog's settings become plan options, the source
 * PDFs are read from disk (drawings whose PDF is missing are left out and listed on the cover),
 * the pages the user unticked are left out (`withoutPages`), the report is written with
 * lib/report/write (loaded on demand: pdf-lib stays out of the main bundle) and saved like the
 * xlsx exports. Progress goes to the status bar. `prepareReport` is shared with the dialog's live
 * preview, so the preview writes exactly what the export writes.
 */
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import type { Box } from "./geom";
import { isTauri } from "./platform";
import { pageKeys, skippedIndices, withoutPages } from "./report/pages";
import { planReport, type ReportOptions, type ReportPlan, type Size } from "./report/plan";
import type { ReportSettings } from "./report/settings";
import type { LoadedSource, LoadedSources, ReportFonts, WriteOptions } from "./report/write";
import { basename, ensureDocText, pageTransforms, session } from "./session";
import { drawingOf, type Project } from "./types";

export { DEFAULT_REPORT_SETTINGS, type ReportSettings } from "./report/settings";

/** Page sizes of the PDFs already open in the session (the dialog's live preview). */
export const sessionPageSize =
  (project: Project) =>
  (drawingId: string, page: number): Size | undefined => {
    const path = drawingOf(project, drawingId)?.path;
    const s = path ? session.openDoc(path)?.sizes[page] : undefined;
    return s ? { width: s.w, height: s.h } : undefined;
  };

/** Plan options for the settings; `pageSize` defaults to what the session knows. */
export function reportOptions(
  project: Project,
  s: ReportSettings,
  pageSize = sessionPageSize(project),
): ReportOptions {
  return {
    locationIds: s.locationIds,
    includeUnassigned: s.includeUnassigned,
    paper: s.paper,
    orientation: s.orientation,
    legibilityFloor: s.legibilityFloor,
    wholeSheet: s.wholeSheet,
    pageSize,
    vrfBrands: useStore.getState().catalog.vrfBrands,
  };
}

/** The project without the markings and regions of some drawings (their PDF is missing). */
export function withoutDrawings(project: Project, ids: ReadonlySet<string>): Project {
  if (ids.size === 0) return project;
  return {
    ...project,
    measurements: project.measurements.filter((m) => !ids.has(m.drawingId)),
    zones: project.zones.filter((z) => !ids.has(z.drawingId)),
  };
}

/** Drawings a plan draws from, in order. */
export const planDrawings = (plan: ReportPlan): string[] => [
  ...new Set(plan.pages.map((p) => p.drawingId)),
];

const devUrl = (path: string) => `/@fs/${path.replace(/\\/g, "/")}`;

/** Drawings (ids) whose PDF cannot be read. */
export async function missingDrawings(project: Project, ids: readonly string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) {
    const path = drawingOf(project, id)?.path;
    if (!path) {
      out.push(id);
      continue;
    }
    try {
      // Vite answers a missing /@fs/ file with the app's own page
      const ok = isTauri()
        ? await invoke<boolean>("file_exists", { path })
        : await fetch(devUrl(path), { method: "HEAD" }).then(
            (r) => r.ok && !r.headers.get("content-type")?.includes("text/html"),
          );
      if (!ok) out.push(id);
    } catch {
      out.push(id);
    }
  }
  return out;
}

async function readPdf(path: string): Promise<Uint8Array> {
  if (isTauri()) return new Uint8Array(await invoke<ArrayBuffer>("read_file", { path }));
  const res = await fetch(devUrl(path));
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return new Uint8Array(await res.arrayBuffer());
}

let fonts: Promise<ReportFonts> | null = null;

/** The report's fonts, fetched once per run of the app. */
function loadFonts(): Promise<ReportFonts> {
  const get = async (name: string) => {
    const res = await fetch(`/fonts/${name}`);
    if (!res.ok) throw new Error(`fonte ${name} não encontrada (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  };
  if (!fonts) {
    fonts = Promise.all([get("LiberationSans-Regular.ttf"), get("LiberationSans-Bold.ttf")]).then(
      ([regular, bold]) => ({ regular, bold }),
    );
    // a failed fetch is tried again next time
    fonts.catch(() => {
      fonts = null;
    });
  }
  return fonts;
}

const tick = () => new Promise<void>((r) => window.setTimeout(r, 0));

/**
 * Text runs of the sheets a plan shows, for the drawings open in the session (the report keeps
 * its labels off the drawing's own text); sheets of other drawings get none.
 */
export async function planTextBoxes(
  project: Project,
  plan: ReportPlan,
): Promise<(drawingId: string, page: number) => readonly Box[] | undefined> {
  const out = new Map<string, readonly Box[]>();
  const key = (drawingId: string, page: number) => `${drawingId}#${page}`;
  for (const { drawingId, page } of plan.pages) {
    if (out.has(key(drawingId, page))) continue;
    const path = drawingOf(project, drawingId)?.path;
    const boxes = path ? await ensureDocText(path, page) : undefined;
    if (boxes) out.set(key(drawingId, page), boxes);
  }
  return (drawingId, page) => out.get(key(drawingId, page));
}

/** Offer bytes as a browser download named `name`. */
function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(
    new Blob([bytes as unknown as ArrayBuffer], { type: "application/pdf" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  // in the document, and the URL alive until the browser has started the download: revoking it
  // at once makes Chromium save under its fallback name ("download")
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

/**
 * Source PDFs parsed for the report, per drawing: the dialog keeps one while it is open so the
 * preview reads and parses each PDF once (a drawing pointed at another file is read again), and
 * the export reuses it. A drawing whose PDF cannot be read is missing.
 */
export class ReportSources {
  private byDrawing = new Map<string, { path: string; source: Promise<LoadedSource | null> }>();

  async get(
    project: Project,
    ids: readonly string[],
  ): Promise<{ loaded: LoadedSources; missingIds: string[] }> {
    const loaded: LoadedSources = new Map();
    const missingIds: string[] = [];
    for (const id of ids) {
      const path = drawingOf(project, id)?.path;
      if (!path) {
        missingIds.push(id);
        continue;
      }
      let entry = this.byDrawing.get(id);
      if (!entry || entry.path !== path) {
        entry = { path, source: this.load(id, path) };
        this.byDrawing.set(id, entry);
      }
      const source = await entry.source;
      if (source) loaded.set(id, source);
      else missingIds.push(id);
    }
    return { loaded, missingIds };
  }

  private async load(id: string, path: string): Promise<LoadedSource | null> {
    // pdf-lib and fontkit load on the first report only (their own chunk)
    const { loadReportSources } = await import("./report/write");
    try {
      const bytes = await readPdf(path);
      const parsed = await loadReportSources({ [id]: { bytes, transforms: pageTransforms(path) } });
      return parsed.get(id) ?? null;
    } catch (e) {
      // unreadable or not a PDF: left out like a missing file
      console.warn(`report: cannot use ${path}`, e);
      return null;
    }
  }

  /** Forget every parsed PDF (the dialog closed). */
  clear(): void {
    this.byDrawing.clear();
  }
}

/** A report ready to write: the plan with real page sizes, the pages left out, the writer. */
export interface PreparedReport {
  /** The takeoff without the drawings whose PDF is missing. */
  project: Project;
  /** Every planned page, before leaving any out. */
  plan: ReportPlan;
  /** `pageKey` of each planned page. */
  keys: string[];
  /** Plan indices the user left out. */
  skipped: number[];
  /** The report as printed: the plan without the skipped pages, renumbered. */
  printed: ReportPlan;
  /** Drawings (ids) left out because their PDF is missing or unreadable. */
  missingIds: string[];
  /** Their names. */
  missing: string[];
  /** Write a plan (`printed`, or `plan` for a look at skipped pages) with these settings. */
  write(plan: ReportPlan, extra?: Partial<WriteOptions>): Promise<Uint8Array>;
}

/**
 * Plan the report for the settings with the source PDFs' real page sizes and leave out the
 * skipped pages (by `pageKey`). Shared by the preview and the export.
 */
export async function prepareReport(
  settings: ReportSettings,
  skippedKeys: readonly string[] = [],
  sources: ReportSources = new ReportSources(),
): Promise<PreparedReport> {
  const full = useStore.getState().project;
  const draft = planReport(full, settings.filter, reportOptions(full, settings));
  const { loaded, missingIds } = await sources.get(full, planDrawings(draft));
  const missing = missingIds.map((id) => drawingOf(full, id)?.name ?? id);
  const project = withoutDrawings(full, new Set(missingIds));
  const { sourcePageSize, writeReport } = await import("./report/write");
  const plan = planReport(
    project,
    settings.filter,
    reportOptions(project, settings, sourcePageSize(loaded)),
  );
  const skipped = skippedIndices(plan, skippedKeys);
  const base: WriteOptions = {
    project,
    fonts: await loadFonts(),
    textBoxes: await planTextBoxes(project, plan),
    prices: settings.prices,
    labels: settings.labels,
    kits: useStore.getState().catalog.kits,
    washOut: settings.washOut,
    cover: settings.cover,
    missing,
  };
  return {
    project,
    plan,
    keys: pageKeys(plan),
    skipped,
    printed: withoutPages(plan, skipped),
    missingIds,
    missing,
    write: (p, extra) => writeReport(p, loaded, { ...base, ...extra }),
  };
}

/**
 * Write the report and save it (native dialog in Tauri, a download in the browser), without the
 * pages whose key is in `skipped`. `sources` reuses PDFs the dialog already parsed. Returns the
 * names of the drawings left out because their PDF was missing, or null when cancelled.
 */
export async function exportReport(
  settings: ReportSettings,
  skipped: readonly string[] = [],
  sources?: ReportSources,
): Promise<string[] | null> {
  const store = useStore.getState();
  const full = store.project;
  const draft = planReport(full, settings.filter, reportOptions(full, settings));
  if (draft.pages.length === 0) {
    store.setStatus("Relatório vazio: nada do filtro nos locais escolhidos.");
    return [];
  }
  const name = `Relatório de recortes - ${full.site || full.name || "Obra"}.pdf`;
  let path: string | null = null;
  if (isTauri()) {
    path = await save({ defaultPath: name, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!path) return null;
  }
  try {
    store.setStatus("Relatório: lendo as plantas…");
    const report = await prepareReport(settings, skipped, sources);
    const { missing, printed } = report;
    if (printed.pages.length === 0) {
      useStore.getState().setStatus("Relatório vazio: todas as páginas foram omitidas.");
      return [];
    }
    const bytes = await report.write(printed, {
      onProgress: async (done, total) => {
        useStore
          .getState()
          .setStatus(
            done < total ? `Relatório: página ${done} de ${total}…` : "Relatório: gerando o PDF…",
          );
        await tick();
      },
    });
    if (path) {
      await invoke("write_file", { path, data: Array.from(bytes) });
    } else {
      download(bytes, name);
    }
    const saved = path ? basename(path) : name;
    useStore
      .getState()
      .setStatus(
        missing.length
          ? `Relatório salvo: ${saved} (${missing.length} planta(s) não encontrada(s) ficaram de fora)`
          : `Relatório salvo: ${saved}`,
      );
    return missing;
  } catch (e) {
    useStore
      .getState()
      .setStatus(`Falha no relatório: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}
