/**
 * Application state (zustand), split into slices by concern. Every slice sees the whole state:
 * `commit` in the project slice re-derives duct/VRF/weight items, the view slice resets the
 * selection when the page changes, and so on. Components import `useStore` from here.
 */
import { create } from "zustand";
import { activeDrawing } from "../lib/types";
import { type CatalogSlice, createCatalogSlice } from "./catalog";
import { createDuctSlice, type DuctSlice } from "./ducts";
import { createItemsSlice, type ItemsSlice } from "./items";
import { createProjectSlice, type ProjectSlice } from "./project";
import { createRevisionSlice, type RevisionSlice } from "./revisions";
import { createSimilarSlice, type SimilarSlice } from "./similar";
import { createViewSlice, type ViewSlice } from "./view";
import { createVrfSlice, type VrfSlice } from "./vrf";

export type State = ProjectSlice &
  ItemsSlice &
  DuctSlice &
  VrfSlice &
  CatalogSlice &
  SimilarSlice &
  RevisionSlice &
  ViewSlice;

export const useStore = create<State>()((...a) => ({
  ...createProjectSlice(...a),
  ...createItemsSlice(...a),
  ...createDuctSlice(...a),
  ...createVrfSlice(...a),
  ...createCatalogSlice(...a),
  ...createSimilarSlice(...a),
  ...createRevisionSlice(...a),
  ...createViewSlice(...a),
}));

// compare needs a previous revision: once the drawing in view has none (a replacement undone,
// another drawing shown) the toggle is hidden, so turn it off rather than let it come back alone
useStore.subscribe((s) => {
  if (s.compareRevision && !activeDrawing(s.project)?.revisions?.length) {
    s.setCompareRevision(false);
  }
});

export type { ProjectMeta } from "./project";
export type { RevisionChoice, RevisionRequest } from "./revisions";
export {
  type Calibration,
  KIND_OF_TOOL,
  type PendingZone,
  TOOL_OF_KIND,
  type Tool,
} from "./shared";
export type { SimilarMatch, SimilarPreview } from "./similar";
export type { PanelTab, SystemPanel } from "./view";
export { DRAWER_MIN, SIDEBAR_MIN } from "./view";
