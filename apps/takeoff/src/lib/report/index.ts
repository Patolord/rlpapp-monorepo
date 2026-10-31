/**
 * Location cutout report, the pure core: filter, coordinates and page plan. No PDF library and
 * no UI here; the writer and the dialog build on it.
 *
 * How the writer consumes it:
 *
 * 1. The dialog builds a `ReportFilter` (axes, or a preset from `reportPresets`), lists
 *    `locationCandidates(project, filter)` (grey out those with 0 markings) and calls
 *    `planReport(project, filter, options)` for the live preview (`cover.locations[].pagesLabel`:
 *    "Pavimento 3: 1 mapa + 6 folhas").
 * 2. The writer draws `plan.cover` (optional), then each of `plan.pages` into
 *    `plan.layout`: header (project fields, `heading`, drawing and page, `plan.filterLabel`),
 *    frame, list (`rows` by measured `qty`, then `ducts` and `vrf`), footer ("página n de N",
 *    `alsoIn` labels). Pages with `rowsScope: "page"` list only what they own (each marking on
 *    exactly one of them); key maps and single cutouts list the region total. A region holds
 *    everything inside its polygon, nested rooms included. The cover's `locations[]` are
 *    summed over their cutouts, so they overlap when a location contains others
 *    (`cover.nested`, `containsLocations`: print a note); `totals` counts each marking once.
 * 3. Frame: embed the source page clipped to `rectToPdfUserSpace(page.crop, transform)` with
 *    `userToFrameTransform(transform, page.crop, page.zoom)` as its matrix and draw it at the
 *    frame's bottom-left corner with scale 1; `transform` is the pdf.js viewport transform at
 *    scale 1 captured for that drawing page. The crop fills the frame exactly at `zoom`. Draw
 *    `polygon` (wash-out mask outside it), the markings in `measurementIds` and, on key maps,
 *    the `frames` with their labels, all through `pageToFrame(pt, page.crop, page.zoom)`. The
 *    scale bar comes from `page.scale` and `page.zoom`.
 * 4. Pages the user unticks in the preview are keyed by `pageKey` (stable across re-plans) and
 *    left out with `withoutPages(plan, indices)`, which renumbers every page reference.
 */
export {
  applyTransform,
  composeTransforms,
  fromPdfUserSpace,
  invertTransform,
  type PageRotation,
  type PageView,
  pageToFrame,
  rectFromPdfUserSpace,
  rectToPdfUserSpace,
  toPdfUserSpace,
  userToFrameTransform,
  type ViewportTransform,
  viewportSize,
  viewportTransform,
} from "./coords";
export {
  describeFilter,
  disciplinaAtual,
  type FilterOptions,
  filterOptions,
  isEmptyFilter,
  itemDiscipline,
  matches,
  matchingItemIds,
  type ReportFilter,
  type ReportPreset,
  reportPresets,
  soDutos,
  soVrf,
} from "./filter";
export {
  cropFocusBox,
  omittedNote,
  pageKey,
  pageKeys,
  skippedIndices,
  withoutPages,
} from "./pages";
export {
  DEFAULT_LEGIBILITY_FLOOR,
  DEFAULT_MARGIN_PCT,
  DEFAULT_MAX_ZOOM,
  DEFAULT_MIN_MARGIN,
  DEFAULT_TILE_OVERLAP,
  type DuctBreakdownRow,
  type KeymapFrame,
  type LocationCandidate,
  locationCandidates,
  type Orientation,
  PAPER_SIZES,
  type Paper,
  pagesLabel,
  planReport,
  type Rect,
  type ReportCover,
  type ReportItemRow,
  type ReportLayout,
  type ReportLists,
  type ReportLocationSummary,
  type ReportOptions,
  type ReportPage,
  type ReportPageKind,
  type ReportPlan,
  type RowsScope,
  reportLayout,
  type SheetRef,
  type Size,
  type Tile,
  tileGrid,
  tileLabel,
  tileRowName,
  UNASSIGNED_NAME,
  type VrfBreakdownRow,
} from "./plan";
