# @rlpapp/ui design-sync notes

## Repo shape

- `@rlpapp/ui` (`packages/ui`) has **no build step** — `package.json` `exports`
  points `./web`, `./native`, `./tokens` directly at TypeScript source, and
  apps consume it via their own bundler (Vite/Metro). There is no `dist/`,
  no `.d.ts` anywhere. `cfg.srcDir: "src/web"` scopes discovery to the web
  tree only (avoids colliding with `src/native/*.tsx`, which exports the
  same component names for react-native — those are intentionally excluded
  from this design system since claude.ai/design only renders browser React).
- Component discovery runs in **full synth-entry mode** (`[NO_DIST]`, expected
  every build) — do not try to "fix" this by pointing `--entry` at a real
  file inside the package; that flips `synthEntry` to false and breaks
  discovery (see next point). `--entry ./packages/ui/dist/index.js` (a path
  that deliberately doesn't exist) is only there to anchor `PKG_DIR`
  resolution to `packages/ui` — keep it in every `package-build.mjs` /
  `resync.mjs` invocation.
- Because there's no real `.d.ts` tree, automatic prop extraction
  (`propsBodyFor`) can't find anything — it silently emits stub interfaces
  (`[key: string]: unknown`). `cfg.dtsPropsFor` is hand-written for all 14
  components from the actual source `interface <Name>Props` bodies. **If a
  component's props change in `packages/ui/src/web/*.tsx`, update the
  matching `dtsPropsFor` entry by hand** — nothing will flag drift
  automatically.
- `packages/ui/src/web/card.tsx` exports 7 components from one file
  (`Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardAction`,
  `CardDescription`, `CardContent`). Only `Card` itself src-matches by
  filename; the other 6 show `group: general` (not `Card`) since their
  kebab-name doesn't match a `card-header.tsx`-style file. Cosmetic only —
  left as-is; could be fixed with `cfg.docsMap` stub files
  (`---\ncategory: Card\n---`) on a future sync if it's worth the churn for
  6 entries.

## CSS: the theme lives in `apps/web`, not in the package

`packages/ui` ships zero CSS. All Tailwind utility classes used inside
`packages/ui/src/web/*.tsx` only resolve because `apps/web/src/index.css`
declares the theme tokens AND `@source "../../../packages/ui/src/web"` to
scan the package for classes.

- `cfg.buildCmd` (`node apps/web/.design-sync-build-css.mjs`) runs a
  **scoped, plugin-only Vite build** (just `@tailwindcss/vite`, no app
  plugins — `configFile: false`) against a temp entry that imports
  `apps/web/src/index.css` **plus an extra `@source` for
  `.design-sync/previews`** (added by the script, never written into the
  committed `index.css`). Output lands at `packages/ui/.ds-cache/tailwind.css`
  (gitignored), which `cfg.cssEntry` points at.
- **Why the extra `@source` matters**: without it, any Tailwind class used
  ONLY in an authored `.design-sync/previews/*.tsx` file (not already used
  somewhere inside `packages/ui/src/web`) silently compiles to nothing —
  no error, the class just has no effect. This bit us on `w-64`/`w-80`/
  `w-96`/`text-2xl` etc. in the first pass (cards rendered at the wrong
  width, text didn't get its size). **Any time a new preview file uses a
  Tailwind class, re-run `buildCmd` before rebuilding the DS bundle.**
- Running the FULL `apps/web` vite build (with `tanstackStart`/`nitro`/PWA
  plugins) also technically produces a usable CSS asset, but is slow, needs
  Convex/Clerk env vars, and writes a `.vercel/output` tree — don't do this;
  use the scoped script.
- `[TOKENS_MISSING]` warns on `--anchor-width`, `--transform-origin`,
  `--sidebar-width*`, `--skeleton-width`, `--tw`, `--available-height` are
  expected and non-blocking: the Base UI positioning vars are set at
  runtime by JS, `--sidebar-*` belongs to `shadcn/tailwind.css`'s Sidebar
  component (not part of this DS's scope), `--tw` is a Tailwind v4 internal.
  Renders verify clean — do not chase these.
- `[FONT_REMOTE]` "Inter" is a Google Fonts `@import url(...)` in
  `apps/web/src/index.css` — loads at runtime, no action needed.

## Grid overflow

`Card` and all 6 subparts, plus `EmptyState` and `PageHeader`, are set to
`"cardMode": "column"` in `cfg.overrides` — their authored previews use
realistic card widths (`w-80`/`w-96`) that are wider than the default grid
cell. This is a presentation-only override; per the skill, column mode can't
re-flag `wide`, so no re-validate is needed after applying it.

## Known render warns

None outstanding — render check is clean (0 bad/thin/variantsIdentical across
all 14 components).

## Preview scope

All 14 discovered components (the 8 top-level web exports + `Card`'s 6
subparts) have authored previews in `.design-sync/previews/`, all graded
`good`. No floor cards remain. Content uses realistic RLP Engenharia
field-equipment domain examples (Portuguese) matching the app's actual
routes (registro de campo, QR codes, torres, manutenção).

## Re-sync risks

- If `packages/ui` grows an actual build step (`dist/` + real `.d.ts`) in
  the future, drop `cfg.srcDir`/`cfg.dtsPropsFor`/the `./packages/ui/dist/
  index.js` anchor-entry trick and let discovery use the real `.d.ts` tree
  instead — it'll be strictly more accurate than the hand-written props.
- `cfg.dtsPropsFor` is hand-maintained and WILL go stale silently if a
  component's real props change without a matching sync update.
- The CSS build script (`apps/web/.design-sync-build-css.mjs`) depends on
  `apps/web/src/index.css`'s current `@import`/`@source` structure (Tailwind
  v4, `@tailwindcss/vite`). If that file's shape changes significantly
  (e.g. migrating off Tailwind v4, restructuring `@source`), the script may
  need updating too.
- `native/` components (react-native + NativeWind) are permanently out of
  scope for this project — they can't render in a browser design tool.
