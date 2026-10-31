/**
 * Export of the location cutout report: the dialog's settings become plan options, the source
 * PDFs are read from disk (drawings whose PDF is missing are left out and listed on the cover),
 * the report is written with lib/report/write (loaded on demand: pdf-lib stays out of the main
 * bundle) and saved like the xlsx exports. Progress goes to the status bar.
 */
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import type { Box } from "./geom";
import { isTauri } from "./platform";
import type { ReportFilter } from "./report/filter";
import { planReport, type ReportOptions, type ReportPlan, type Size } from "./report/plan";
import type { ReportFonts, ReportSource } from "./report/write";
import { basename, ensureDocText, pageTransforms, session } from "./session";
import { drawingOf, type Project } from "./types";

/** Everything the report dialog chooses. */
export interface ReportSettings {
  filter: ReportFilter;
  /** Locations to include; undefined = all. */
  locationIds?: string[];
  includeUnassigned: boolean;
  paper: "A4" | "A3";
  orientation: "landscape" | "portrait";
  prices: boolean;
  labels: boolean;
  washOut: boolean;
  cover: boolean;
  legibilityFloor: number;
  wholeSheet: boolean;
}

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  filter: {},
  includeUnassigned: false,
  paper: "A4",
  orientation: "landscape",
  prices: false,
  labels: true,
  washOut: true,
  cover: true,
  legibilityFloor: 0.5,
  wholeSheet: false,
};

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
      const ok = isTauri()
        ? await invoke<boolean>("file_exists", { path })
        : (await fetch(devUrl(path), { method: "HEAD" })).ok;
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

async function loadFonts(): Promise<ReportFonts> {
  const get = async (name: string) => {
    const res = await fetch(`/fonts/${name}`);
    if (!res.ok) throw new Error(`fonte ${name} não encontrada (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  };
  const [regular, bold] = await Promise.all([
    get("LiberationSans-Regular.ttf"),
    get("LiberationSans-Bold.ttf"),
  ]);
  return { regular, bold };
}

const tick = () => new Promise<void>((r) => window.setTimeout(r, 0));

/**
 * Text runs of the sheets a plan shows, for the drawings open in the session (the report keeps
 * its labels off the drawing's own text); sheets of other drawings get none.
 */
async function planTextBoxes(
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
 * Write the report and save it (native dialog in Tauri, a download in the browser). Returns the
 * names of the drawings left out because their PDF was missing, or null when cancelled.
 */
export async function exportReport(settings: ReportSettings): Promise<string[] | null> {
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
    const missingIds = await missingDrawings(full, planDrawings(draft));
    const missing = missingIds.map((id) => drawingOf(full, id)?.name ?? id);
    const project = withoutDrawings(full, new Set(missingIds));
    const sources: Record<string, ReportSource> = {};
    for (const id of planDrawings(draft)) {
      const d = drawingOf(project, id);
      if (!d?.path || missingIds.includes(id)) continue;
      sources[id] = { bytes: await readPdf(d.path), transforms: pageTransforms(d.path) };
    }
    // pdf-lib and fontkit load on the first export only (their own chunk)
    const { loadReportSources, sourcePageSize, writeReport } = await import("./report/write");
    const loaded = await loadReportSources(sources);
    const plan = planReport(
      project,
      settings.filter,
      reportOptions(project, settings, sourcePageSize(loaded)),
    );
    const bytes = await writeReport(plan, loaded, {
      project,
      fonts: await loadFonts(),
      textBoxes: await planTextBoxes(project, plan),
      prices: settings.prices,
      labels: settings.labels,
      washOut: settings.washOut,
      cover: settings.cover,
      missing,
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
