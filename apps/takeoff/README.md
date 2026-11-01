# Takeoff

Fast, precise PDF takeoff and budgeting for RLP Engenharia's HVAC, stair-pressurisation and
exhaust projects. Open a drawing, calibrate the scale, count / measure / detect areas with the
keyboard, price the items and export the budget as an Excel sheet in the RLP
"Planilha Orçamentária" layout.

Windows and macOS desktop app built with Tauri 2 (Rust) + React 19 + TypeScript + Tailwind 4, pdf.js for
rendering. Part of the rlpapp monorepo (`apps/takeoff`, pnpm + Turborepo); its history before the
move lives on in this folder's `git log`.

## Run

From the repository root:

```bash
pnpm install
pnpm dev:takeoff                # native window (needs Rust; on Windows also MSVC build tools + WebView2)
pnpm -F takeoff dev             # frontend only, in a browser (file dialogs disabled)
```

or the same scripts from `apps/takeoff` (`pnpm tauri:dev`, `pnpm dev`). On a machine that only
works on the desktop app, `pnpm install --filter takeoff...` skips the web and mobile apps.

Frontend-only mode accepts `?pdf=<absolute path>` to load a drawing through Vite, e.g.
`http://localhost:1420/?pdf=C:/code/rlpapp/apps/takeoff/samples/.../plan.pdf`.

Build an installer with `pnpm tauri:build` (in `apps/takeoff`).

## Distribution and updates

**Installers.** `pnpm tauri:build` produces, on Windows,
`src-tauri/target/release/bundle/nsis/RLP Takeoff_<v>_x64-setup.exe` (per-user install,
Portuguese); on a Mac, `pnpm tauri build --target universal-apple-darwin` produces a universal
`.dmg` (Apple Silicon + Intel). Nothing is code-signed with a vendor certificate: Windows
SmartScreen shows "unknown publisher" on first run, and macOS (ad-hoc signature) needs
right-click > Open the first time a downloaded copy is launched. Both are fine for internal use;
an Authenticode certificate / Apple Developer ID plug into the same builds later.

**Auto-update.** The app checks `plugins.updater.endpoints` from `src-tauri/tauri.conf.json`
a few seconds after start and shows an "Atualizar para x.y.z" button; one click downloads the
signed installer, installs it and restarts. Updates are signed with a minisign key kept outside
the repository (`~/.tauri/takeoff.key` + `.password`); its public key is in the config. Losing
that key means existing installs cannot accept new updates, so back it up.

**Releasing a version.** In `apps/takeoff`:

```bash
pnpm release 0.7.0           # bumps package.json, tauri.conf.json, Cargo.toml; commits; tags takeoff-v0.7.0
git push && git push origin takeoff-v0.7.0
```

The `takeoff-v` prefix keeps these tags apart from anything else in the monorepo. The tag
triggers `.github/workflows/takeoff-release.yml` (at the repository root), which builds on
Windows and macOS, signs the updater artifacts and publishes one GitHub Release, named `v0.7.0`
as before the move, in the public repository
[Patolord/takeoff-releases](https://github.com/Patolord/takeoff-releases) with the `.exe`, the
`.dmg`, their `.sig` files and a shared `latest.json` (one entry per platform). Installed copies
read that repository's `releases/latest/download/latest.json` (checked once at launch) and offer
the update. Secrets in this private repository: `TAURI_SIGNING_PRIVATE_KEY`,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` and `RELEASE_TOKEN` (a GitHub token that may create
releases in takeoff-releases). To build and sign locally instead, set the two signing variables
and run `pnpm tauri:build`.

If the tag cannot be pushed from where you are (a cloud session may only push its own branch),
run the `takeoff-release` workflow by hand from the Actions tab on a commit that already carries
the bumped version: it checks the version against `tauri.conf.json`, creates the
`takeoff-vX.Y.Z` tag itself and then builds and publishes as usual.

## Quality gates

`.github/workflows/ci.yml` runs types, lint and tests for every workspace package, this one
included, through Turbo on every pull request and push to `master`.
`.github/workflows/takeoff-rust.yml` runs `cargo fmt --check` and `cargo clippy -- -D warnings`
for `src-tauri` when it changes.

```bash
pnpm check-types       # tsc
pnpm lint              # biome (this app keeps Biome; the rest of the monorepo uses ESLint)
pnpm test              # vitest: geometry, quantities, migrations, catalog, ducts, VRF, weights, pdf
pnpm inspect <pdf>     # page sizes, op counts, vector density of a PDF
pnpm bench <pdf>       # vector extraction + indexing timings
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
| `T` | Kit: one drawn run (or one click, for a count kit) measures every material of a preset at once |
| Select a marking or a kit group, type in **Rótulo** | Its own label on the drawing and in the report, on every member of the group (one undo step); empty brings the kit's label back |
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
| `Ctrl+Shift+E` | Relatório de recortes: marked-up PDF cutouts per location, with a live preview (reopens as it was left) |

**Kits** (`T`, presets edited in "Presets de kit", saved with the catalog) create one linked
measurement per material: a split's line set draws copper, insulation and cable in one run; a
count kit places equipment, brackets and boxes with one click. Each kit has a **Rótulo no
desenho** shown before the run's quantity (`1/4" · 3/8" · 3.00 m`; beside the symbol for a count
kit, `VE-01 · 1.200 m³/h`); the line-set presets come labelled with their liquid and gas
diameters. Only one member of a kit run is labelled, on screen and in the report. Runs remember
their kit, so editing a kit's label relabels every run already drawn (and the copy saved in the
open project, for a machine whose catalog lacks the kit); a run's own **Rótulo** (selection bar)
takes over from the kit's. The label order is duct/VRF tag · label · quantity
(`30×20 · VE-01 · 3.00 m`).

Items can be saved to the catalog (star). The catalog is seeded from past budget sheets
(`src/data/catalog.seed.json`) and follows the company app: signed in with the company account
(see below) or, as before, with the shared access token set in "Catálogo e preços"
(`CATALOG_URL` in `src/lib/catalogRemote.ts`; `VITE_CATALOG_URL` at build time points a dev
build elsewhere), it is fetched on start and by "Atualizar preços" in the Ctrl+K footer, cached
locally, and preferred over the seed. Each line's material price shows where it came from (cloud, saved
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

The **Relatório de recortes** (Takeoff menu or `Ctrl+Shift+E`) is a PDF for contractors that shows
what was measured, location by location. Choose what to include (presets "Só dutos", "Só VRF",
"Tudo da disciplina atual", or any discipline, category and items), which locations, and the
paper. Each page is one region of a location: the original drawing cropped tight around the
filtered markings (kept vector, the area outside the location washed out), the markings in their
item colours with quantities and duct sections `a×b`, a scale bar for the printed zoom, and the
items measured there (measured quantities, without waste) with the duct runs by section and the
VRF runs by role and tube pair. Prices are off by default. A region too big to print legibly (below the "zoom mínimo", 0.5 by
default) is split into clusters or tiles after a key map; each marking is listed on exactly one
of those pages. An optional cover sums every location and indexes the pages.

The dialog previews the PDF itself on the right: the export's own writer runs half a second
after each change ("atualizando…") and pdf.js shows the pages as thumbnails and one large page
(wheel or `+`/`−` to zoom, drag to pan, `0` fits, `←`/`→` step through the pages). Untick
**incluir** under a thumbnail to leave that page out: page numbers, the cover's index, the key
maps' "pág. n" and "também em" are renumbered, the cover keeps its totals and notes the omitted
pages, and the summary reads "X de Y páginas". **Ver na planta** (or a double click on the large
page) closes the dialog and shows that cutout on its drawing, zoomed to it with its region
selected; "Voltar ao relatório" over the viewer, `Ctrl+Shift+E` or the menu bring the dialog
back with its settings, omitted pages and page in view. Code: `src/lib/report/` (`plan.ts`
decides, `pages.ts` keys and omits pages, `write.ts` draws with pdf-lib; Liberation Sans, OFL,
in `public/fonts/`), `src/lib/reportPreview.ts` and `components/ReportPreview.tsx`.

## Conta da empresa (login)

**Entrar** in the top bar connects this computer to the user's own account on the company app
(app.rlpeng.com.br, Clerk), so the catalog and the material proposals go out *as that person*,
with their permissions, instead of with one token shared by everybody:

1. the app opens a one-shot listener on `127.0.0.1:<random port>` (Rust, `src-tauri/src/auth.rs`),
   generates a `state` and a PKCE pair (S256, `src/lib/account/pkce.ts`) and opens the system
   browser at `<web>/takeoff/conectar?port&state&challenge&device`;
2. the page (signed in to the dashboard; it asks to sign in first otherwise) shows "Conectar o
   RLP Takeoff (<computer>) à sua conta?"; on **Conectar** the backend stores a one-time code
   (hash only, 2 min, bound to the user and the challenge) and the browser goes back to
   `http://127.0.0.1:<port>/callback?code=…&state=…`;
3. the app exchanges `{code, verifier}` at `POST <deployment>.convex.site/takeoff/auth/exchange`
   for a **device token** (an agent token, `rlp_…`, named "Takeoff · <computer>" and marked "App
   desktop" in Minha conta › Agentes, where it can be revoked) and a first JWT;
4. the device token goes to the OS credential store (Windows Credential Manager / macOS
   Keychain, `src-tauri/src/keychain.rs`), never to the catalog file or localStorage. The JWT
   (about 1 h) lives in memory and is renewed a few minutes before it expires at
   `POST /api/v1/auth/token` (`src/lib/account/tokens.ts`, `session.ts`).

Signed in, the catalog comes from `takeoffCatalog.current` and proposals go to
`takeoffMaterials.proposeAsUser` through a typed Convex client (`src/lib/account/convex.ts`,
`api.*` and types from `@rlpapp/backend`); the server records the user as the requester.
Proposals still wait in the local outbox when offline. **Sair** revokes the device token on the
server (when reachable) and deletes it from the keychain; if the keychain refuses, the app says
so instead of claiming a clean sign-out. Closing the sign-in (×) at any step keeps nothing (a
token already issued to that attempt is revoked). Each installation has a random id
(`installation-id` in the app data folder, `src-tauri/src/installation.rs`): signing in again
replaces only that installation's previous token, so two computers with the same name never
revoke each other. A token revoked in the dashboard signs the app out on its next call.
Signed out, the shared token path keeps working exactly as before.

Proposals of unlinked lines now carry the family, variant and dimensions parsed from the line's
name (`src/lib/proposalMaterial.ts`: `Tubo de cobre 1/2"` → family "Tubo de cobre", variant
`1/2"`, Ø 12.7 mm; `Grelha 400x200` → 400 × 200 mm), so purchasing matches them to the existing
material instead of creating one family per size.

Addresses default to production (`https://rosy-crow-250.convex.cloud`, web
`https://app.rlpeng.com.br`). A dev build sets `VITE_TAKEOFF_CONVEX_URL` (deployment
`.convex.cloud` URL; without it the deployment follows `VITE_CATALOG_URL`) and
`VITE_TAKEOFF_WEB_URL` (e.g. `http://localhost:3001` for `pnpm dev:web`). The deployment needs
`API_JWT_PRIVATE_KEY` (the same key as the `/api/v1` gateway); without it the exchange answers 503.
Signing in only works in the native window (`pnpm dev:takeoff`), not in the browser-only dev mode.

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
- **Cutout report**: each source sheet is embedded once, its content stream copied still
  encoded, so writing does not grow with the drawing's complexity (40 pages over two A0 sheets
  of 300k segments: ~0.5 s). The preview parses the PDFs once per dialog session and renders
  thumbnails only as they scroll into view.

## Layout

```
src/
  components/   Viewer (canvas layers + tools), side panels, dialogs, ui.tsx (Button, Backdrop…)
  store/        zustand store in slices: project (model, drawings, undo), items (items,
                measurements, locations), ducts, vrf, catalog, similar, revisions (replace dialog,
                compare overlay), report (report dialog settings, omitted pages), view (tool,
                filters, dialogs)
  lib/types.ts  project model and file-version migrations
  lib/align.ts  drawing revisions: two-point similarity, page map, moving markings to a new PDF
  lib/          geom, units, quantities (quote math), budgetOrder, overlay (canvas painting),
                files (open/save/export), session (open PDFs), platform, text
  lib/catalog*  material catalog: local store, company API, proposals
  lib/ducts*    duct take-off: NBR 16401 bill, network items, reference workbook export
  lib/vrf*      VRF take-off: brand tables, system items, workbook export
  lib/kits.ts   kit presets · lib/weights.ts  weight-based prices · lib/symbols.ts  count marks
  lib/markingShapes.ts  a marking's geometry and label, shared by the canvas and the report
  lib/report/   cutout report: filter, coords, plan, pages (pure), write (pdf-lib);
                reportExport.ts (shared with the preview), reportPreview.ts (pdf.js preview)
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

When the client sends a new revision, the upload icon on the drawing's tab (**Substituir por nova
revisão…**) points the drawing at the new PDF and keeps its markings: a dialog maps old pages to
new ones (1:1 by default; "—" drops a page's markings after a confirmation) and, for a sheet
re-plotted at another size or position, aligns it by clicking the same two reference points on
the old and new page (shift, uniform scale and rotation; the page scale follows, so quantities
stay the same). It is one undo step. The drawing remembers its earlier PDFs, and **comparar** in
the status bar lays the previous revision under the current one: red only in the old, blue only
in the new, black where they match.

Project files are JSON (`*.takeoff.json`) referencing each PDF by path; an autosave is written
to the app data folder every 15 s while there are unsaved changes.

**Takeoffs in OneDrive or SharePoint.** Keep the takeoff file in the obra's synced folder, next to
its PDFs, and it opens on any machine that syncs that folder, Windows or Mac. Each PDF is also
saved relative to the takeoff file (`relPath`, e.g. `../Projetos/ARQ-101.pdf`), and a PDF missing
at its saved path is looked up there (`src/lib/projectFile.ts`). Saving warns about a PDF kept
outside such a folder (Downloads, another drive). If another machine saved the same file after it
was opened here, `Ctrl+S` does not overwrite it: it offers to save a copy beside it or to reload
the newer version, and the status bar mentions the change when the window gets focus. For work
without internet, mark the obra folder "Sempre manter neste dispositivo", and let OneDrive finish
syncing before switching machines.
