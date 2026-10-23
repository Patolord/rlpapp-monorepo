/**
 * Application state (zustand), split into slices by concern. Every slice sees the whole state:
 * `commit` in the project slice re-derives duct/VRF/weight items, the view slice resets the
 * selection when the page changes, and so on. Components import `useStore` from here.
 */
import { create } from "zustand";
import { type CatalogSlice, createCatalogSlice } from "./catalog";
import { createDuctSlice, type DuctSlice } from "./ducts";
import { createItemsSlice, type ItemsSlice } from "./items";
import { createProjectSlice, type ProjectSlice } from "./project";
import { createSimilarSlice, type SimilarSlice } from "./similar";
import { createViewSlice, type ViewSlice } from "./view";
import { createVrfSlice, type VrfSlice } from "./vrf";

export type State = ProjectSlice &
  ItemsSlice &
  DuctSlice &
  VrfSlice &
  CatalogSlice &
  SimilarSlice &
  ViewSlice;

export const useStore = create<State>()((...a) => ({
  ...createProjectSlice(...a),
  ...createItemsSlice(...a),
  ...createDuctSlice(...a),
  ...createVrfSlice(...a),
  ...createCatalogSlice(...a),
  ...createSimilarSlice(...a),
  ...createViewSlice(...a),
}));

export type { ProjectMeta } from "./project";
export {
  type Calibration,
  KIND_OF_TOOL,
  type PendingZone,
  TOOL_OF_KIND,
  type Tool,
} from "./shared";
export type { SimilarMatch, SimilarPreview } from "./similar";
export { SIDEBAR_MIN } from "./view";
