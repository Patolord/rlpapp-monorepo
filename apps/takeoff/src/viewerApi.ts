import type { Box } from "./lib/geom";

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
  deleteSelection(): void;
  selectAllOnPage(): void;
}

export const viewerApi: { current: ViewerApi | null } = { current: null };
