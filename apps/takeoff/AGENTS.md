# apps/takeoff: guide for agents and contributors

RLP Takeoff, the desktop app (Windows and macOS) for PDF takeoff and budgeting: Tauri 2 (Rust in
`src-tauri`) + React 19 + TypeScript + Tailwind 4 + pdf.js, state in zustand. What it does, the
keyboard map, distribution and layout: [`README.md`](README.md). Monorepo rules (Doppler, Convex,
CI, commit language): root [`AGENTS.md`](../../AGENTS.md). Domain terms: root
[`CONTEXT.md`](../../CONTEXT.md).

## Run

From the repository root (or the same scripts from `apps/takeoff`):

```bash
pnpm install --filter takeoff...   # only this app and its workspace deps
pnpm dev:takeoff                   # native window (needs Rust; Windows also MSVC + WebView2)
pnpm -F takeoff dev                # browser only, http://localhost:1420 (file dialogs disabled)
```

Browser mode accepts `?pdf=<absolute path>` to load a drawing. `.claude/launch.json` here
starts that Vite server on 1420 (or 1425). The app needs no Doppler secrets.

## Checks

Run all of these before a PR that touches the app:

```bash
pnpm -F takeoff lint               # biome check src scripts (pnpm -F takeoff format to fix)
pnpm -F takeoff check-types        # tsc --noEmit
pnpm -F takeoff test               # vitest, tests next to the code (src/**/*.test.ts)
```

When `src-tauri` changes (CI `takeoff-rust.yml` runs the same):

```bash
cd apps/takeoff/src-tauri
mkdir -p ../dist                   # generate_context! needs frontendDist to exist
cargo fmt --check
cargo clippy --locked -- -D warnings
```

This app uses Biome, not ESLint, unlike the rest of the monorepo. `pnpm -F takeoff inspect <pdf>`
and `pnpm -F takeoff bench <pdf>` help with PDF performance work.

## Release

From `apps/takeoff`, on a clean tree:

```bash
pnpm release X.Y.Z                 # bumps package.json, tauri.conf.json, Cargo.toml/.lock; commits; tags takeoff-vX.Y.Z
git push && git push origin takeoff-vX.Y.Z
```

The `takeoff-v*` tag runs `.github/workflows/takeoff-release.yml`, which builds the Windows
installer and the universal macOS `.dmg`, signs the updater artifacts and publishes release
`vX.Y.Z` in the public repository `Patolord/takeoff-releases`; installed apps update themselves
from its `latest.json`. If the tag cannot be pushed (for example from a cloud session that may
only push its own branch), run the workflow by hand (`workflow_dispatch`, input `version`) on a
commit that already carries the bumped version: it checks `tauri.conf.json`, creates the tag and
continues as usual. Repository secrets: `TAURI_SIGNING_PRIVATE_KEY`,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `RELEASE_TOKEN`. The updater key lives outside the
repository (`~/.tauri/takeoff.key`); never commit it. Do not release unless asked.

## Architecture pointers

Full tree in the README's "Layout" section. Where to start:

- `src/store/`: zustand store in slices (`project`, `items`, `ducts`, `vrf`, `catalog`,
  `similar`, `revisions`, `report`, `view`), assembled in `store/index.ts`.
- `src/lib/types.ts`: the project model and file-version migrations.
- `src/lib/`: geometry, units, quote math (`quantities.ts`), canvas overlay, files and session;
  `catalog*` (company catalog and proposals), `ducts*` (NBR 16401 duct take-off), `vrf*`
  (VRF take-off), `kits.ts`, `weights.ts`, `markingShapes.ts` (shared by canvas and report).
- `src/lib/report/`: cutout report PDF (pure planning in `plan.ts`/`pages.ts`, writing in
  `write.ts` with pdf-lib); preview in `src/lib/reportPreview.ts`.
- `src/lib/pdf/`: page rendering, vector snap index (Web Worker), magic area, text, symbol search.
- `src-tauri/src/lib.rs`: Rust commands for file IO, autosave and catalog paths, HTTP to the
  company app (no CORS) and the Excel export (rust_xlsxwriter).
- The company catalog comes from the backend (`/takeoff/catalog`, see `src/lib/catalogRemote.ts`).
  Signed in (`src/lib/account/`), the app also sends the client-approved budget to the dashboard
  (`account/publish.ts`, `appLink.ts`, `components/SendBudgetDialog.tsx`; README "Orçamento
  aprovado → app da empresa"). Check the current code before relying on details.

## Project file format

Projects are saved as JSON `*.takeoff.json` (PDFs referenced by path plus `relPath` relative to
the file; see `src/lib/projectFile.ts`). The shape is `Project` in `src/lib/types.ts`, with a
`version` field, and `migrateProject` loads every older version into the current one. Adding an
optional field with a safe default needs no bump (as `id` and `sentToApp`, the link to the budget
in the company app, were added). For any change that old files cannot read as
is (renamed, moved or restructured data), bump `version`, add a migration step from the previous
version in `migrateProject`, and cover it in `src/lib/types.test.ts`. Never break opening files
saved by released versions.

## Language

- UI strings: Portuguese (pt-BR).
- Code comments, this file and the README: English, as in the app's own history (its commits
  before the move into the monorepo are in English).
- New commits follow the monorepo rule: Portuguese messages.
