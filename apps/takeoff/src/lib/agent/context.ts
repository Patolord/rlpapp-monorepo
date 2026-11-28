/**
 * What the agent tools need from the app, as an interface: the takeoff, the catalog, the
 * drawings' pages (text, pictures, the pixel-based detectors) and the memory. The real one
 * (appContext.ts) binds the store and the open PDFs; tests pass a fake.
 */
import type { CatalogStore } from "../catalog";
import type { Pt } from "../geom";
import type { MagicResult } from "../pdf/magic";
import type { TextBox } from "../pdf/text";
import type { Drawing, Project } from "../types";
import type { AgentMemory, AgentMemoryInput, MemoryAdded } from "./memory";
import type { ViewLog } from "./viewLog";

export interface PageSize {
  w: number;
  h: number;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageView {
  /** PNG of the region, base64 without the `data:` prefix. */
  png: string;
  /** The page-space region the picture covers (the request clamped to the page). */
  region: Region;
  /** Picture pixels per page point. */
  pxPerPt: number;
  /** Spacing of the coordinate grid in page points; 0 when the grid is off. */
  gridStep: number;
}

export interface SimilarHit {
  /** Centre of the match in page points. */
  x: number;
  y: number;
  /** 0..1 similarity to the boxed symbol (1 = the same picture). */
  score: number;
}

/** One drawing's PDF, by 0-based page. Everything here reads the rendered page, not its layers. */
export interface DrawingDoc {
  sizes: PageSize[];
  /** Positioned text runs; empty when the PDF carries its text as outlines or is a scan. */
  text(page: number): Promise<TextBox[]>;
  /** A picture of a region, with the takeoff's markings and a coordinate grid when asked. */
  view(
    page: number,
    region: Region,
    opts: { maxPx: number; grid: boolean; markings: boolean },
  ): Promise<PageView>;
  /**
   * Outline of the enclosed space around a point (flood fill on the rendered page). With
   * ignoreThin, hairlines (ceiling hatch, text, grid axes) are not walls.
   */
  detectRoom(page: number, seed: Pt, opts?: { ignoreThin?: boolean }): Promise<MagicResult | null>;
  /** Every place on the page that looks like the boxed symbol (image correlation). */
  findSimilar(page: number, box: Region, minScore: number): Promise<SimilarHit[]>;
}

export interface AgentContext {
  project(): Project;
  /** Apply an edit as one undo step (the store's commit); returning the same project is a no-op. */
  commit(mutate: (p: Project) => Project): void;
  catalog(): CatalogStore;
  /** The drawing's PDF, opened if needed; throws a ToolError when its file cannot be read. */
  doc(drawing: Drawing): Promise<DrawingDoc>;
  /** 0-based page shown in the app, the default of tools called without a page. */
  activePage(): number;
  /** The company's memory, fetched now when possible, else the copy cached on this machine. */
  memory(): Promise<AgentMemory>;
  /**
   * Store an entry proposed by the agent for the whole company (it waits as a proposal).
   * Rejects with a message for the user when it cannot be stored (signed out, refused).
   */
  proposeMemory(input: AgentMemoryInput): Promise<MemoryAdded>;
  /** A short line for the app's status bar, so the user sees what the agent is doing. */
  notify(message: string): void;
  /** What the agent has looked at closely enough to read, for review_takeoff. */
  readonly seen: ViewLog;
}
