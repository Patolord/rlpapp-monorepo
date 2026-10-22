# Takeoff

Fast, precise PDF takeoff and budgeting for RLP Engenharia's HVAC, stair-pressurisation and
exhaust projects. Open a drawing, calibrate the scale, count / measure / detect areas with the
keyboard, price the items and export the budget as an Excel sheet in the RLP
"Planilha Orçamentária" layout.

Windows desktop app built with Tauri 2 (Rust) + React 19 + TypeScript + Tailwind 4, pdf.js for
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

## Quality gates

```bash
bun run check-types    # tsc
bun run lint           # biome
bun run test           # vitest (geometry, quantities, vector snapping)
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
| `X` | Find similar: drag a box around one symbol; every identical symbol on the page gets a count mark (vector match, exact for CAD blocks) |
| `Ctrl+K` | Material catalog: search and create a named, grouped, priced item |
| `Alt`+click / `Alt`+drag | Name the active item from text in the drawing / turn a legend box into items |
| `K` | Calibrate: click two points of a known distance |
| `S` `O` / `Shift` | Toggle snapping to drawing geometry / ortho (45°) lock |
| `1`–`9` | Activate item n (the tool follows the item's kind) |
| `N` | New item of the current kind |
| `Backspace` | Undo last point / delete selection |
| `Ctrl+Z` `Ctrl+Y` | Undo / redo |
| `F` `+` `-` wheel | Fit page / zoom |
| `PgUp` `PgDn` | Previous / next page |
| `Ctrl+S` `Ctrl+E` | Save project / export Planilha .xlsx |

Items can be saved to the catalog (star). The catalog is seeded from past budget sheets
(`src/data/catalog.seed.json`) and can follow the company app: set the JSON URL in the Ctrl+K
footer and it is fetched on start and on demand (through Rust, so no CORS), cached locally,
and preferred over the seed.

The status bar shows the page scale; click it for the 1:N presets or calibrate by measuring.
Items carry a budget section (Equipamentos, Rede de Dutos, Bocas de Ar, ...), a material and
a labour unit price and an optional waste percentage. The Quote tab shows the grouped sheet with
Diversos / Transportes / Supervisão extras, TOTAL GERAL and the BDI multiplier.

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
  components/   Viewer (canvas layers + tools), panels, dialogs
  lib/pdf/      render.ts (page renderer), vectors*.ts (snap index + worker), magic.ts
  lib/          geom, units, quantities (quote math), types (project model), files, session
  store.ts      project state + undo history (zustand)
  viewport.ts   zoom/pan state
src-tauri/      Rust: file IO, autosave path, Excel export (rust_xlsxwriter)
samples/        client drawings and budget sheets (confidential, git-ignored)
```

Project files are JSON (`*.takeoff.json`) referencing the PDF by path; an autosave is written
to the app data folder every 15 s while there are unsaved changes.
