import type { PageMap, Similarity } from "../lib/align";
import type { PageSize } from "../lib/session";
import type { Slice } from "./shared";

/** What the revision dialog answers: where each old page goes and how it is aligned. */
export interface RevisionChoice {
  pageMap: PageMap;
  /** Per old page; null = no alignment (identity). */
  transforms: (Similarity | null)[];
}

/** A drawing waiting for the revision dialog: both PDFs are open in the session. */
export interface RevisionRequest {
  drawingId: string;
  /** File names shown in the dialog. */
  oldName: string;
  newName: string;
  /** Session keys of the open documents (see `session.openDoc`). */
  oldKey: string;
  newKey: string;
  oldSizes: PageSize[];
  newSizes: PageSize[];
  /** Markings and regions on each old page, for the confirmation before dropping a page. */
  counts: number[];
  /** Settles the request: the user's choice, or null when the dialog was cancelled. */
  resolve(choice: RevisionChoice | null): void;
}

/** Drawing revisions: the replace dialog in progress and the compare overlay toggle. */
export interface RevisionSlice {
  revisionRequest: RevisionRequest | null;
  /** Show the previous revision of the drawing under the current one (old red, new blue). */
  compareRevision: boolean;
  setRevisionRequest(request: RevisionRequest | null): void;
  setCompareRevision(on: boolean): void;
}

export const createRevisionSlice: Slice<RevisionSlice> = (set) => ({
  revisionRequest: null,
  compareRevision: false,
  setRevisionRequest: (revisionRequest) => set({ revisionRequest }),
  setCompareRevision: (compareRevision) => set({ compareRevision }),
});
