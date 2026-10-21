/** Imperative hooks into the Viewer for hotkeys and toolbar buttons. */
export interface ViewerApi {
  hasDraft(): boolean;
  finishDraft(): void;
  cancelDraft(): void;
  popDraft(): void;
  fit(): void;
  zoomBy(factor: number): void;
  deleteSelection(): void;
  selectAllOnPage(): void;
}

export const viewerApi: { current: ViewerApi | null } = { current: null };
