# Epic: editing, revisions and location cutout report

Status: implemented · Tracking PR: the PR that adds this document

These are the gaps that cost estimators the most time today, plus a CI guard so the work lands
safely. The medium items from the review (area cut-outs, notes on the drawing, per-item
show/hide, page rotation) are out of scope for this epic.

Each step ships as its own PR against `main` and leaves the app releasable. The steps are built
in parallel, in two waves (see "Delivery" below), so the table order is the merge order, not
the build order.

| # | Feature | Why this position | Size |
| - | ------- | ----------------- | ---- |
| 0 | CI on pull requests | Cheap, and it guards every PR that follows | S |
| 1 | Edit vertices of existing markings | Biggest daily time-saver; adds the select-mode handle plumbing | M |
| 2 | Copy and paste markings | Reuses select-mode plumbing; adds the `cloneMarkings` helper | S–M |
| 3 | Replace a drawing with a new revision | Own point-transform helper (`align.ts`); adds compare overlay | L |
| 4a | Cutout report: pure core (filter, page plan, coordinates) | New files only; all layout decisions, unit-tested | M |
| 4b | Cutout report: PDF writer, dialog, overlay refactor | Builds on 4a; new `pdf-lib` dependency | M–L |

---

## 0. CI on pull requests

**Problem.** `check-types` and `test` run only inside `release.yml`, only on the Windows build,
and only when a release is tagged. `lint` never runs. `main` fails lint right now (3
auto-fixable errors in `src/components/CatalogPalette.tsx` and `src/lib/catalog.test.ts`).

**Scope**
- Run `bun run format` / `biome check --write` so `bun run lint` passes on `main`.
- New `.github/workflows/ci.yml`, run `on: pull_request` and `push` to `main`:
  - Job `web` (ubuntu-latest): `oven-sh/setup-bun` → `bun install --frozen-lockfile` →
    `bun run check-types` → `bun run lint` → `bun run test`.
  - Job `rust` (ubuntu-latest): install the Tauri Linux deps (`libwebkit2gtk-4.1-dev`,
    `libayatana-appindicator3-dev`, `librsvg2-dev`), `swatinem/rust-cache@v2`, then
    `cargo fmt --check` and `cargo clippy --locked -- -D warnings` in `src-tauri`.
    Run `bun run build` first, or create an empty `dist/`, because `tauri::generate_context!`
    needs `frontendDist` to exist.
  - `concurrency: ci-${{ github.ref }}` with `cancel-in-progress: true`.
- Keep the release workflow's own `check-types && test` step as a last gate.
- README "Quality gates": say that CI runs these on every PR.

**Done when** a PR shows two green checks, and a deliberate lint, type or test error turns one
of them red. (Branch protection is set by hand in GitHub settings; note it in the PR.)

---

## 1. Edit vertices of existing markings

**Problem.** In select mode, a drag moves whole markings only (`Drag` union in
`src/components/Viewer.tsx`: `pan | move | rect | similar | legend | marquee`). To fix one wrong
point you delete the marking and redraw it, and you lose its duct/VRF spec, repeat and vertical.

**UX**
- With **one** linear / area / duct / VRF marking or **one** zone selected, the overlay draws a
  square handle on each vertex. Linear-type markings also get a small midpoint handle on each
  segment.
- Drag a vertex handle → move that point. Snapping (`S`) and ortho (`Shift`) apply exactly as when
  drawing (use `helpers.effective(raw)`, measured against the neighbouring vertex for ortho).
- Drag a midpoint handle → insert a vertex there and drag it.
- `Alt`+click a vertex or `Delete`/`Backspace` while hovering one → remove it, but never go below
  2 points (linear) or 3 (area / zone). The `Backspace` order becomes: draft point → hovered
  vertex → selection.
- Count marks need no handles; they already move with a drag.
- The cursor changes over handles; the live length/area label updates while dragging.
- `Esc` during a drag cancels and restores the original geometry.

**Implementation**
- `Viewer.tsx`: add `{ kind: "vertex"; id: string; index: number; insert: boolean; orig: Pt[] }` to
  `Drag`. In `onPointerDown` → `case "select"`, check handles **before** `hitTest`, so the
  handles of a selected marking win over overlapping markings. A preview in `st.current`
  (like `moveDelta`) keeps pointer-move edits out of React. Commit **once** on pointer-up.
- New pure helpers in `src/lib/geom.ts`: `hitVertex(points, raw, tol)`,
  `hitMidpoint(points, raw, tol)`, `insertVertex`, `removeVertex(points, i, min)`.
  Unit-test them in `geom.test.ts`.
- Store: `updateMeasurement(id, { points })` and `updateZone(id, { points })` already exist and
  are single undo steps. Add `setPoints(id, points)`, which finds out whether the id is a
  measurement or a zone, so the Viewer doesn't branch.
- **Kit links:** measurements that share a `linkId` share geometry. Editing one applies the
  same new `points` to every measurement in the link, in one `commit`.
- **VRF topology:** runs join by shared endpoints (`VrfSpec.parent` is only the override). When
  an endpoint is dragged, other VRF runs on the page whose endpoint matched it (within
  `1e-6`) move with it. Same for duct runs. Hold `Ctrl` to detach. Test it in `vrfTree.test.ts`,
  so the tree reads the same before and after a connected drag.
- `src/lib/overlay.ts`: `drawHandles(ctx, points, view, { midpoints })`.

**Done when** a rectangle, polygon, duct run and zone can be reshaped; `Ctrl+Z` undoes a reshape
in one step; kit siblings follow; the VRF schematic stays connected after an endpoint drag;
`geom` and `vrfTree` tests cover the new helpers.

---

## 2. Copy and paste markings

**Problem.** Similar (not identical) floors and sheets get redrawn by hand. "Repeat" covers only
identical copies.

**UX**
- `Ctrl+C` copies the selection (measurements and zones). `Ctrl+V` pastes it on the current page
  of the current drawing, centred on the cursor (or in place if the cursor is off the canvas),
  and leaves the pasted copies selected so they can be dragged right away.
- `Ctrl+Shift+V` → paste **in place** (same page coordinates). This is the usual case for
  identical floors on another sheet.
- `Ctrl+D` → duplicate with a small offset on the same page.
- Pasting onto a page with a different scale shows a status warning ("escala diferente: as
  quantidades serão recalculadas"). Geometry is in PDF points, so quantities follow the target
  page's scale automatically; the warning only explains why the numbers changed.
- Locations follow geometry: `locationOf` is evaluated at quote time, so pasted markings fall
  into whatever zone they land in. A pasted **zone** keeps its location (another region of the
  same location). That matches "a condenser on the roof and its evaporator on the floor are one
  location".

**Implementation**
- New `src/lib/clone.ts` → `cloneMarkings(project, ids, target: { drawingId, page }, transform:
  (p: Pt) => Pt): { measurements, zones }`. It makes fresh ids, remaps `linkId`s to new link
  ids (kit groups stay grouped, apart from the originals), and remaps `VrfSpec.parent` when the
  parent is part of the copy (otherwise it is dropped). It keeps `duct`, `vrf`, `vertical`,
  `repeat` and `itemId`. A pure function; unit-test it in `clone.test.ts`.
- Store (`view` slice): `clipboard: { measurements; zones; anchor: Pt } | null`. It is
  in-memory only and is not saved with the project. Items are project-wide, so `itemId`s stay
  valid within the session; on paste, skip markings whose item no longer exists.
- Store (`items` slice): `pasteMarkings(clip, target, offset)` → one `commit`; it sets
  `selection` to the new ids.
- `hotkeys.ts`: add `c`, `v` (+`shift`) and `d` to the `ctrl` switch. Leave `c` alone inside
  editable targets (already handled by `isEditableTarget`).
- `SelectionBar.tsx`: "Copiar" / "Duplicar" buttons for discoverability.

**Done when** copying a mixed selection (count + duct + kit group + zone) and pasting it on
another drawing gives independent markings with correct quantities. Undo removes the whole paste
in one step. `clone.test.ts` covers link remapping and VRF parents.

---

## 3. Replace a drawing with a new revision

**Problem.** When the client sends "Rev B", the only way to point a drawing at another file is
the relocate prompt for a **missing** PDF (`switchDrawing` in `src/lib/files.ts`). Nothing lets
you swap a PDF on purpose, keep the markings and see what changed.

**UX**
- Drawing tab context action **"Substituir por nova revisão…"** (`DrawingTabs.tsx`) → pick
  a PDF → **revision dialog**:
  - Page mapping table: old page → new page (default 1:1; "—" drops that page's markings,
    after a confirmation that shows the count). It warns when the page counts differ.
  - For each mapped page whose size differs (or on request), an **alignment** step: click the same
    two reference points (e.g. two grid-line crossings) on the old and new page, with snapping on.
    That gives a similarity transform (translate + uniform scale + rotation), applied to that
    page's markings, zones and calibration.
  - With the same size and no alignment, the transform is identity.
- After replacing, a **compare overlay** toggle in the status bar shows the previous revision
  under the current one: old in red, new in blue, black where they match (render both pages,
  tint, `multiply`). It helps spot moved walls and markings that need a vertex edit (step 1).
- The drawing keeps a short revision history, so the overlay and an "undo replacement" still
  work after reopening.

**Implementation**
- Model (`src/lib/types.ts`): `Drawing.revisions?: { path: string; name: string; replacedAt:
  number }[]` (oldest first). Optional field, so no `version` bump is needed. Add a migration test in
  `types.test.ts` to confirm older files load unchanged.
- New `src/lib/align.ts`: `similarityFrom2Points(a1, a2, b1, b2) => (p: Pt) => Pt`, plus
  `scaleOf(transform)` so a page's `PageScale` is adjusted (a drawing re-plotted at another
  paper size keeps its real-world scale). Unit tests.
- Store (`project` slice): `replaceDrawing(id, path, pageMap: (number | null)[], transforms:
  ((p: Pt) => Pt)[])` → one `commit` that pushes the old path into `revisions`, rewrites
  `pages`, maps the `page` of each marking and zone, applies transforms (with a `transformMarkings`
  helper in `align.ts`, in place, so this step does not depend on step 2) and drops unmapped pages. One undo step reverts all of it.
- `src/lib/files.ts`: `replaceDrawingPdf(id)` opens the new PDF (`openPdfPath`), reads page
  sizes from `useDoc`, opens the dialog and calls `replaceDrawing`. The snap index and visual
  caches for the drawing must be invalidated (`session.ts`).
- Compare overlay: `src/lib/pdf/render.ts` already renders pages to canvases. Add a second
  `PageRenderer` for the previous revision's document (`session` keeps it open next to the
  current one; `MAX_OPEN` eviction must not drop it while the overlay is on). Composite it in
  `Viewer.tsx` under the base layer.
- New `RevisionDialog.tsx`, using `Dialog.tsx` primitives.

**Done when** replacing a drawing with a same-size revision keeps every marking in place;
replacing with a re-scaled or shifted revision and aligning by two points lands the markings
on the new geometry and keeps quantities correct; page add/remove is handled through the map;
the compare overlay shows differences; undo restores the previous PDF and markings.

---

## 4. Location cutout report (marked-up PDF)

**Problem.** The only output is the Excel budget. Clients and contractors ask to *see* what was
counted and measured, and usually only for one trade. A ductwork contractor wants the duct runs
of each area with their sections, not the whole set of sheets with every discipline drawn on it.

**What it produces.** A PDF report made of **cutouts**. Each cutout is one region (zone) of a
location: the part of the drawing inside it, with the filtered markings drawn on top, next to
the list of items measured there. The original drawing stays vector (sharp at any zoom).

### UX

Project menu → **"Relatório de recortes (PDF)…"** (`Ctrl+Shift+E`) opens a dialog with three
choices and a live preview of the first pages:

1. **What to include (filter).** Combinable, all on by default:
   - **Discipline** (`Item.system`, the budget tab: Exaustão, Pressurização…).
   - **Category** (`Item.group`: Rede de Dutos, Bocas de Ar, Equipamentos, Sistema VRF…).
   - **Items:** tick specific items inside the chosen categories.
   - A preset row for the common cases: *"Só dutos"* (category Rede de Dutos + duct runs),
     *"Só VRF"*, *"Tudo da disciplina atual"*. Presets just set the filters above.

   Only markings of the selected items are drawn, only their rows appear in the lists, and
   **locations with nothing selected are left out**. So "Só dutos" gives a report with only the
   areas that actually have ductwork.
2. **Which locations.** A list of locations with checkboxes, showing for each one the number of
   regions and how many filtered markings it holds. Locations with none are greyed out. "Sem
   local" (markings outside every location) is offered as an optional extra cutout per page.
3. **Layout.** Paper (A4 / A3, landscape by default); include prices (**off** by default, since the
   report goes to contractors); show labels (quantity next to each marking, duct section `a×b`
   on duct runs); dim the area outside the location polygon (on by default); cover page with a
   summary table (on by default).

### Page layout (one cutout)

- **Header:** project, client, proposal number, location name (×repeat when the region
  repeats), drawing name and page, filter in use ("Disciplina: Exaustão · Categoria: Rede de
  Dutos"), date.
- **Drawing frame** (about 70 % of the page): the original page cropped to the cutout, the
  zone outline, the area outside the polygon washed out in white at ~70 % so the location stands
  out, the filtered markings in their item colours and symbols, and a scale bar computed
  from the page's calibrated `PageScale` and the output zoom (so the contractor can measure off
  the print).
- **Item list** (side or bottom panel): one row per item. Columns: colour/symbol swatch, item,
  unit, quantity in this region (`totalsByRegion`, so repeats are applied). Material/labour/total
  columns appear only if prices are on. The list uses the same rounding as the Quote tab.
- **Duct and VRF runs:** derived items ("Rede de dutos", "Sistema VRF") are 1 cj in the
  budget, which is useless to a contractor. For them the list shows the **run breakdown** in
  this region: duct runs by section (`a×b`, insulation, length, area of sheet metal) from
  `lib/ducts`; VRF runs by role and gas/liquid diameters (length) from `lib/vrf`.
- **Footer:** "página n de N", and the location's other regions ("também em: Cobertura p.2")
  when a location spans several sheets.

**Cover page** (optional): project header, filter in use, a table of the locations included
with one total per item (the sum over all the cutouts), and a page index.

### Large locations (a whole floor plan)

A cutout scaled down to fit the frame becomes unreadable when the region is large. The rule is
to **keep the drawing legible and adapt the crop, never shrink below a legibility floor**:

1. **Tight crop first.** The crop box is the bounding box of the *filtered markings* inside the
   region (plus a margin of ~5 % / 15 pt), not the whole polygon. For "Só dutos" on a full floor,
   the crop shrinks to where the ductwork actually is. The polygon outline is still drawn
   (clipped to the frame) so the context is clear. If the region has no filtered markings it is
   skipped.
2. **Legibility check.** Compute the output zoom = frame size / crop size. If the zoom is at or
   above the **legibility floor** (default **0.5**, meaning text prints at least at half its size
   on the original sheet; editable in the dialog), use one page.
3. **Clusters.** Below the floor, group the filtered markings into clusters (single-link on
   bounding boxes with a gap threshold of ~one frame width at the floor zoom). Each cluster that
   fits becomes its own cutout page ("Pavimento 3 · trecho 1 de 3"). This handles a floor with a
   few separate duct networks.
4. **Tiles.** A cluster that is still too big is tiled into a grid of frames at the floor zoom,
   with ~10 % overlap and tile labels (A1, A2, B1…). A **key map** page comes first: the whole
   region at fit-to-page zoom with the tile grid drawn on it.
5. **Lists per page.** On cluster and tile pages, the item list shows what lies *on that page*
   (by marking anchor, `anchorOf`). The region total is repeated on the key map / first page, so
   nothing is counted twice.

The dialog preview shows how many pages each location will produce ("Pavimento 3: 1 mapa + 6
folhas"), so the user can switch to a bigger paper or lower the floor before exporting.

### Implementation

- **Dependency:** `pdf-lib` (pure JS, MIT). `PDFDocument.embedPage(srcPage, boundingBox,
  transform)` turns the crop rectangle of an original page into a Form XObject. The XObject's
  BBox does the clipping, the content stays vector, and the same embedded page is reused by
  every cutout/tile of that page (so the file size grows with distinct pages, not with cutouts).
  `drawPage` places it in the frame with the computed zoom. Fonts: embed a TTF via
  `@pdf-lib/fontkit` (Portuguese accents; Helvetica's WinAnsi is not enough for every label).
- **New `src/lib/report/plan.ts` (pure, no pdf-lib):** `planReport(project, filter, options) =>
  ReportPage[]`. It applies the filter, picks regions, computes tight crops, does the legibility
  check, clustering and tiling, and gives each page its crop box, frame zoom, markings, item rows
  and duct/VRF breakdown. This is where all the decisions live. Unit-test it in
  `plan.test.ts`: filter by discipline/category, skip empty locations, tight crop, cluster split,
  tile grid and overlap, per-page vs per-region totals, repeat.
- **New `src/lib/report/filter.ts`:** `ReportFilter = { systems?: string[]; groups?: string[];
  itemIds?: string[] }` and `matches(item, filter)`. Duct runs and VRF runs are measurements of
  the derived items, which already carry `DUCT_GROUP` / `VRF_GROUP` (`src/lib/ductItems.ts`,
  `src/lib/vrfItems.ts`), so selecting the *Rede de Dutos* category pulls in the runs with no
  special case. Test that explicitly. The same filter can drive the viewer later.
- **New `src/lib/report/write.ts`:** turns `ReportPage[]` into bytes with pdf-lib (header,
  frame, wash-out mask as an even-odd path of the frame rectangle minus the polygon, markings,
  legend/list table, scale bar, footer). It has no layout decisions of its own.
- **Coordinates (the hard part):** markings are stored in "page-space points, origin top-left of
  the displayed page". That is pdf.js `getViewport({ scale: 1 })` space, which already applies
  `/Rotate` and the CropBox offset. Capture each page's `viewport.transform` while the document is
  open (`session.ts`) and write `toPdfUserSpace(pt, transform)` (the inverse, like
  `viewport.convertToPdfPoint`) in `src/lib/report/coords.ts`. The crop box handed to
  `embedPage` must be in PDF user space too, so a rotated sheet gets its crop rotated
  consistently. Unit-test 0/90/180/270 and a non-zero CropBox origin; these are what would
  otherwise misplace markings or crop the wrong area.
- **Shared drawing geometry:** refactor `src/lib/overlay.ts` so a marking's geometry
  (polyline, polygon, symbol path, label anchor/text) comes from a renderer-agnostic
  `markingShapes(m, item, scale)`. The canvas painter and the PDF writer both use it, so the
  report cannot drift from the screen. Count symbols in `src/lib/symbols.ts` are already SVG path
  strings in a 24×24 box and go straight into `drawSvgPath`.
- **Quantities:** reuse `totalsByRegion` / `zoneOf` / `anchorOf` from `src/lib/quantities.ts`.
  Add `itemTotals` filtering by a page-rect predicate for cluster/tile pages. Duct breakdown:
  reuse the bill code in `src/lib/ducts.ts` restricted to the runs of the page; VRF likewise
  with `src/lib/vrf.ts` / `vrfTree.ts`.
- **Source PDFs:** a report can span several drawings. Load each drawing's original bytes with
  the existing `read_file` command (no pdf.js needed at write time). Missing PDFs use the
  relocate flow from `switchDrawing`, or are skipped with a warning listed on the cover page.
- **UI:** `ReportDialog.tsx` (filters, locations, layout, page-count preview, legibility floor).
  Save with the same dialog/`write_file` path as the xlsx export in `files.ts`. Show progress per
  page in the status bar.
- **Full sheets (secondary mode):** a "Planta inteira" toggle treats each page with markings
  as one cutout (crop = whole page, no polygon). It is the same pipeline, for when someone does
  want the whole sheet.

**Done when**
- "Só dutos" on a project with ducts in some locations gives a PDF with only those locations.
  Each cutout shows the drawing cropped to the ductwork, with duct runs labelled `a×b`, and a
  list whose section/length breakdown matches the Dutos tab for that region.
- A whole-floor location produces a key map plus clustered or tiled pages, all at or above the
  legibility floor, and no marking's quantity counts twice across pages.
- Markings sit exactly on the geometry on rotated and cropped sample sheets.
- The file opens in Acrobat and browsers, and its size stays proportional to the distinct source
  pages used.
- `plan.test.ts`, `filter.test.ts` and `coords.test.ts` are green in CI.

---

## Cross-cutting

- **Undo:** every new action is exactly one `commit` (one `Ctrl+Z`), including multi-marking
  edits (kit siblings, connected VRF endpoints, paste, replace).
- **Autosave / file format:** only optional fields are added (`Drawing.revisions`); older
  `.takeoff.json` files load unchanged, and older app versions ignore the new field.
- **Hotkeys and README:** each step updates the README "Using it" table and the tooltips that
  show shortcuts (`ToolRail.tsx`, and the new buttons in `SelectionBar.tsx` / `ProjectMenu.tsx`).
- **Tests:** each step adds pure-function tests (`geom`, `clone`, `align`, `report/*`) and runs
  green in the CI from step 0.
- **Release:** cut a minor version after steps 1+2 (0.6.0) and after 3+4 (0.7.0).

## Delivery

Built by parallel agents, each on its own branch and PR, and integrated one PR at a time:

- **Wave 1 (parallel, from `main`):** 0 CI · 1 vertex editing · 2 copy/paste · 3 revisions ·
  4a report core. Files they share (`Viewer.tsx`, `hotkeys.ts`, `overlay.ts`, the store slices) get
  small, local changes that are resolved at merge time.
- **Wave 2:** 4b report writer + UI, branched from 4a (its PR targets 4a's branch until 4a
  merges).
- Merge order: 0 → 1 → 2 → 3 → 4a → 4b. Each later PR is updated from `main` after the previous
  merge, and the quality gates run before each push.

## Decisions made during review

- The report's item tables print the **measured quantity** (repeats applied, no waste); prices,
  when shown, use the same quantity.
- In the report, a location's pages show **everything inside it**, nested rooms included (the
  budget keeps smallest-zone ownership). The cover notes the overlap and TOTAL GERAL counts each
  marking once.

## Checklist

- [x] 0. CI on pull requests (+ fix current lint errors) (#12)
- [x] 1. Edit vertices of existing markings (#14)
- [x] 2. Copy and paste markings (#13)
- [x] 3. Replace a drawing with a new revision (+ compare overlay) (#16)
- [x] 4a. Cutout report core: filter, page plan (tight crop, clusters, tiles), coordinates (#15)
- [x] 4b. Cutout report writer (`pdf-lib`), dialog, shared `markingShapes` (#17)
