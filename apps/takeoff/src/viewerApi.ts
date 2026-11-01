import type { Box, Pt } from "./lib/geom";

/** Imperative hooks into the Viewer for hotkeys, toolbar buttons and side panels. */
export interface ViewerApi {
  hasDraft(): boolean;
  finishDraft(): void;
  cancelDraft(): void;
  popDraft(): void;
  fit(): void;
  /**
   * Glides the camera so a page-space box (a region, a marking) sits centred in the view.
   * Call after switching to the box's drawing and page; it waits for the page size if needed.
   */
  focusBox(box: Box): void;
  zoomBy(factor: number): void;
  /** Esc during a vertex drag: restores the geometry; false when no vertex is being dragged. */
  cancelDrag(): boolean;
  /** Removes the vertex under the pointer (select tool); false when there is none. */
  removeHoveredVertex(): boolean;
  deleteSelection(): void;
  selectAllOnPage(): void;
  /** Page-space point under the mouse, or null when the pointer is off the canvas (paste target). */
  cursorPage(): Pt | null;
}

export const viewerApi: { current: ViewerApi | null } = { current: null };
