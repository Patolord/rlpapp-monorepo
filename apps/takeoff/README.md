# Takeoff

Fast, precise PDF takeoff and budgeting for RLP Engenharia's HVAC, stair-pressurisation and
exhaust projects. Open a drawing, calibrate the scale, count / measure / detect areas with the
keyboard, price the items and export the budget as an Excel sheet in the RLP
"Planilha Orçamentária" layout.

Windows and macOS desktop app built with Tauri 2 (Rust) + React 19 + TypeScript + Tailwind 4, pdf.js for
rendering, Bun for tooling.

## Run

```bash
bun install
bun run tauri:dev      # native window (needs Rust + MSVC build tools + WebView2)
bun run dev            # frontend only, in a browser (file dialogs disabled)
```

Frontend-only mode accepts `?pdf=<absolute path>` to load a drawing through Vite, e.g.
`http://localhost:1420/?pdf=C:/code/tauri-takeoff/samples/.../plan.pdf`.

Build an installer with `bun run tauri:build`.

## Distribution and updates

**Installers.** `bun run tauri:build` produces, on Windows,
`src-tauri/target/release/bundle/nsis/RLP Takeoff_<v>_x64-setup.exe` (per-user install,
Portuguese); on a Mac, `bun run tauri build --target universal-apple-darwin` produces a universal
`.dmg` (Apple Silicon + Intel). Nothing is code-signed with a vendor certificate: Windows
SmartScreen shows "unknown publisher" on first run, and macOS (ad-hoc signature) needs
right-click > Open the first time a downloaded copy is launched. Both are fine for internal use;
an Authenticode certificate / Apple Developer ID plug into the same builds later.

**Auto-update.** The app checks `plugins.updater.endpoints` from `src-tauri/tauri.conf.json`
a few seconds after start and shows an "Atualizar para x.y.z" button; one click downloads the
signed installer, installs it and restarts. Updates are signed with a minisign key kept outside
the repository (`~/.tauri/takeoff.key` + `.password`); its public key is in the config. Losing
that key means existing installs cannot accept new updates, so back it up.

**Releasing a version.**

```bash
bun run release 0.2.0        # bumps package.json, tauri.conf.json, Cargo.toml; commits; tags v0.2.0
git push && git push origin v0.2.0
```

The tag triggers `.github/workflows/release.yml`, which builds on Windows and macOS, signs the
updater artifacts and publishes one GitHub Release in the public repository
[Patolord/takeoff-releases](https://github.com/Patolord/takeoff-releases) with the `.exe`, the
`.dmg`, their `.sig` files and a shared `latest.json` (one entry per platform). Installed copies read that repository's
`releases/latest/download/latest.json` (checked once at launch) and offer the
update. Secrets in this private repository: `TAURI_SIGNING_PRIVATE_KEY`,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` and `RELEASE_TOKEN` (a GitHub token that may create
releases in takeoff-releases). To build and sign locally instead, set the two signing variables
and run `bun run tauri:build`.

If the tag cannot be pushed from where you are (a cloud session may only push its own branch),
run the `release` workflow by hand from the Actions tab on a commit that already carries the
bumped version: it checks the version against `tauri.conf.json`, creates the `vX.Y.Z` tag itself
and then builds and publishes as usual.

## Quality gates

`.github/workflows/ci.yml` runs these on every pull request and push to `main`: types, lint and
tests for the frontend, `cargo fmt --check` and `cargo clippy -- -D warnings` for `src-tauri`.

```bash
bun run check-types    # tsc
bun run lint           # biome
bun run test           # vitest: geometry, quantities, migrations, catalog, ducts, VRF, weights, pdf
bun run inspect <pdf>  # page sizes, op counts, vector density of a PDF
bun scripts/bench-vectors.ts <pdf>   # extraction + indexing timings
```

## Using it

| Key | Action |
| --- | --- |
| `Ctrl+O` / drop a file | Open a PDF (or a `.takeoff.json` project) |
| `V` `H` | Select / pan (space + drag or middle/right drag also pans) |
| `C` | Count: click to place a mark |
| `L` | Linear: click points, `Enter`, double-click or right-click to finish |
| `A` `R` | Area polygon (click first point to close) / area rectangle (drag) |
| `M` | Magic area: click inside an enclosed room to detect its outline |
| `Z` | Location: outline a region (floor, apartment, room) and name it; everything measured inside is grouped by it |
| `Ctrl+K` | Material catalog: search and create a named, grouped, priced item |
| `Alt`+click / `Alt`+drag | Name the active item from text in the drawing / turn a legend box into items |
| Drag a handle of the selected marking | Reshape one run, area or location: drag a vertex (snapping and `Shift` apply, `Esc` cancels) or a segment's middle diamond to add one. Kit members follow; duct and VRF runs joined at a dragged end follow it (`Ctrl` pulls the end away) |
| `Alt`+click a vertex / `Delete` over it | Remove the vertex (a run keeps 2 points, an area or location 3) |
| `K` | Calibrate: click two points of a known distance |
| `S` `O` / `Shift` | Toggle snapping to drawing geometry / ortho (45°) lock |
| `1`–`9` | Activate item n (the tool follows the item's kind) |
| `N` | New item of the current kind |
| `Backspace` | Undo last point / remove the vertex under the pointer / delete selection |
| `Ctrl+C` `Ctrl+V` | Copy the selected markings / paste them on the current page, centred on the cursor (any page or drawing) |
| `Ctrl+Shift+V` | Paste in place: same page coordinates (identical floors on another sheet) |
| `Ctrl+D` | Duplicate the selection beside itself on the same page |
| `Ctrl+Z` `Ctrl+Y` | Undo / redo |
| `F` `+` `-` wheel | Fit page / zoom |
| `PgUp` `PgDn` | Previous / next page |
| `Ctrl+S` `Ctrl+E` | Save project / export Planilha .xlsx |

Items can be saved to the catalog (star). The catalog is seeded from past budget sheets
(`src/data/catalog.seed.json`) and follows the company app at a fixed address
(`CATALOG_URL` in `src/lib/catalogRemote.ts`; `VITE_CATALOG_URL` at build time points a dev
build elsewhere): with the access token set in "Catálogo e preços" it is fetched on start and
by "Atualizar preços" in the Ctrl+K footer (through Rust, so no CORS), cached locally, and
preferred over the seed. Each line's material price shows where it came from (cloud, saved
catalog, bundled sheets, typed, by weight) next to the price box.

The status bar shows the page scale; click it for the 1:N presets or calibrate by measuring.
Items carry a budget section (Equipamentos, Rede de Dutos, Bocas de Ar, ...), a material and
a labour unit price and an optional waste percentage. The Quote tab shows the grouped sheet with
Diversos / Transportes / Supervisão extras, TOTAL GERAL and the BDI multiplier.

Two tools quantify whole networks instead of single materials. **Duto (D)** asks the section of
each run and the Dutos tab computes sheet metal, insulation, flanges, supports and labour per
"Rede de dutos" item (NBR 16401 workbook). **VRF (Y)** asks what each refrigerant run is (saída
da condensadora, trecho intermediário, ramal da evaporadora) and the capacity that sizes it;
the VRF tab derives the gas/liquid diameters from the brand's tables (`lib/vrf.ts`, editable in
"Regras das marcas", saved with the catalog), counts evaporators and Y-kits, and bills copper
(priced by weight), elbows, 13 mm insulation, cables, boxes, supports and labour per evaporator,
following the "Levantamento VRF Completo" workbook. Each system is one "Sistema VRF" item in
the budget (quantity = identical systems); the detail goes to the exported VRF workbook.

The Excel export mirrors the RLP workbook: a `Resumo` sheet, one sheet per system (an item's
"sistema" tag, defaulting to the project system), sections per location (ambiente) or per group
(toggle in the Quote tab), a `Por Local` matrix, and the original styling (Arial, navy item rows,
hair/medium borders, accounting formats, A4 landscape at 75 %).

## How it stays fast

- **Rendering**: one low-resolution base render per page (shown instantly, CSS-scaled while
  zooming and panning) plus a crisp render of just the visible region, debounced and cancelled
  when the view moves on. Nothing re-renders during interaction.
- **Snapping**: every path on the page is copied out of the pdf.js operator list once (before
  the first render, since pdf.js mutates it) and a Web Worker flattens curves and builds a
  uniform-grid index in CSR layout. Snap queries are a few binary searches. A 900k-segment A0
  sheet indexes in ~250 ms.
- **Magic area**: rasterises a window around the click, flood-fills the non-ink region, traces
  the boundary and simplifies it (Douglas-Peucker). Widens the window automatically when the
  region touches the border.
- **Overlay**: all measurements are drawn on a single 2D canvas with viewport culling; React
  never re-renders on pointer moves.

## Layout

```
src/
  components/   Viewer (canvas layers + tools), side panels, dialogs, ui.tsx (Button, Backdrop…)
  store/        zustand store in slices: project (model, drawings, undo), items (items,
                measurements, locations), ducts, vrf, catalog, similar, view (tool, filters, dialogs)
  lib/types.ts  project model and file-version migrations
  lib/          geom, units, quantities (quote math), budgetOrder, overlay (canvas painting),
                files (open/save/export), session (open PDFs), platform, text
  lib/catalog*  material catalog: local store, company API, proposals
  lib/ducts*    duct take-off: NBR 16401 bill, network items, reference workbook export
  lib/vrf*      VRF take-off: brand tables, system items, workbook export
  lib/kits.ts   kit presets · lib/weights.ts  weight-based prices · lib/symbols.ts  count marks
  lib/pdf/      render.ts (page renderer), vectors*.ts (snap index + worker), magic.ts,
                text.ts (positioned text), visual*.ts (image symbol search), similar.ts
  viewport.ts   zoom/pan state
src-tauri/      Rust: file IO, autosave path, HTTP to the company app, Excel export (rust_xlsxwriter)
scripts/        inspect-pdf, bench-vectors, release
samples/        client drawings and budget sheets (confidential, git-ignored)
```

A project holds several drawings (PDFs): markings, locations and scales belong to the drawing
they were made on, items and quantities are shared by the whole project. The top-bar switcher
changes the drawing in view or adds another PDF.

Project files are JSON (`*.takeoff.json`) referencing each PDF by path; an autosave is written
to the app data folder every 15 s while there are unsaved changes.
