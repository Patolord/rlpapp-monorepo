/**
 * A stand-in for the app in the agent tests: a takeoff in memory, a catalog and one drawing
 * whose "PDF" is whatever the test says (text runs, a room outline, symbol hits). No canvas, no
 * pdf.js, so the tools and the protocol run under vitest's node environment.
 */
import { type CatalogEntry, type CatalogStore, emptyCatalogStore } from "../catalog";
import type { MagicResult } from "../pdf/magic";
import type { TextBox } from "../pdf/text";
import { emptyProject, type Project } from "../types";
import type { AgentContext, DrawingDoc, PageView, Region, SimilarHit } from "./context";
import { type AgentMemory, type AgentMemoryInput, addLocalMemory, emptyMemory } from "./memory";
import { ViewLog } from "./viewLog";

export interface FakeDoc {
  sizes?: { w: number; h: number }[];
  text?: TextBox[];
  room?: MagicResult | null;
  hits?: SimilarHit[];
  /** Runs while a room is being traced: what the user does while the agent waits. */
  whileTracing?: () => void;
}

export interface FakeApp {
  ctx: AgentContext;
  project(): Project;
  memory(): AgentMemory;
  /** Add an entry already in use, as a person teaching the memory would. */
  teach(input: AgentMemoryInput): void;
  /** Replace the open takeoff, as the user opening another file would. */
  open(next: Project): void;
  /** Status-bar lines the tools sent. */
  notices: string[];
  /** Regions view_page was asked for. */
  views: {
    page: number;
    region: Region;
    opts: { maxPx: number; grid: boolean; markings: boolean };
  }[];
  /** How many undo steps the tools made. */
  commits: number;
  /** Whether the last room detection was asked to ignore hairlines. */
  ignoreThin: boolean;
}

export const textRun = (text: string, cx: number, cy: number): TextBox => ({
  text,
  cx,
  cy,
  h: 8,
  minX: cx - 20,
  maxX: cx + 20,
  minY: cy - 4,
  maxY: cy + 4,
});

export const catalogEntry = (name: string, unit: string, extra: Partial<CatalogEntry> = {}) => ({
  name,
  group: "Geral",
  unit,
  materialPrice: 10,
  laborPrice: 2,
  ...extra,
});

export function fakeApp(
  init: { project?: Partial<Project>; catalog?: Partial<CatalogStore>; doc?: FakeDoc } = {},
): FakeApp {
  let project: Project = {
    ...emptyProject(),
    name: "Obra teste",
    client: "Tegra",
    drawings: [{ id: "d1", path: "C:/obra/planta.pdf", name: "planta.pdf", pages: [] }],
    activeDrawingId: "d1",
    ...init.project,
  };
  let memory = emptyMemory();
  const catalog: CatalogStore = { ...emptyCatalogStore(), ...init.catalog };
  const app: FakeApp = {
    notices: [],
    views: [],
    commits: 0,
    ignoreThin: false,
    project: () => project,
    memory: () => memory,
    teach(input) {
      memory = addLocalMemory(memory, input, false).memory;
    },
    open(next) {
      project = next;
    },
    ctx: undefined as unknown as AgentContext,
  };
  const doc: DrawingDoc = {
    sizes: init.doc?.sizes ?? [{ w: 1000, h: 800 }],
    text: async () => init.doc?.text ?? [],
    async view(page, region, opts): Promise<PageView> {
      app.views.push({ page, region, opts });
      return {
        png: "PNG",
        region,
        pxPerPt: opts.maxPx / Math.max(region.w, region.h),
        gridStep: opts.grid ? 100 : 0,
      };
    },
    async detectRoom(_page, _seed, opts) {
      app.ignoreThin = opts?.ignoreThin ?? false;
      init.doc?.whileTracing?.();
      return init.doc?.room === undefined ? null : init.doc.room;
    },
    findSimilar: async (_page, _box, minScore) =>
      (init.doc?.hits ?? []).filter((h) => h.score >= minScore),
  };
  app.ctx = {
    seen: new ViewLog(),
    project: () => project,
    commit(mutate) {
      const next = mutate(project);
      if (next === project) return;
      project = next;
      app.commits++;
    },
    catalog: () => catalog,
    doc: async () => doc,
    activePage: () => 0,
    memory: async () => memory,
    async proposeMemory(input) {
      const stored = addLocalMemory(memory, input, true);
      memory = stored.memory;
      return stored.result;
    },
    notify: (message) => app.notices.push(message),
  };
  return app;
}
