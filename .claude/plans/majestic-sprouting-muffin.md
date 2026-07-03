# Design system overhaul: `@rlpapp/ui`

## Context

The design-sync setup (`.design-sync/`) manages `packages/ui` (`@rlpapp/ui`), an
8-component shared library (Button, Badge, Card + 6 subparts, EmptyState,
LoadingState, MetricCard, PageHeader, StatusBadge). The user considers the
current output "not good" across the board — visuals, code quality, and
architecture — and wants a full overhaul, keeping the current stack
(Tailwind v4 + Base UI primitives + CVA variants).

Investigation surfaced a bigger issue than messy class strings: **`@rlpapp/ui`
is barely used.** Only 2 files (`routes/engenharia/index.tsx`,
`components/engenharia/status-badge.tsx`) import from it. The other 41 files
in `apps/web` import Button/Badge/Card from a *separate, parallel* local
copy at `apps/web/src/components/ui/`. The two copies have already **drifted**:

- `button.tsx` — byte-identical between the two copies (safe to swap).
- `card.tsx` — local version has no `variant` prop (packages/ui added
  `default`/`elevated`/`interactive`, defaulting to `default`, so this is
  backward compatible).
- `badge.tsx` — **diverged**: local has `default/secondary/destructive/outline/success/warning`
  using raw `green-500/10`, `yellow-500/10` opacity classes. `packages/ui`
  has `default/secondary/destructive/outline/neutral/info/success/warning/danger/muted`
  using a different color treatment (`blue-100`/`blue-800` etc.), and
  ignores the `statusColors` tokens in `tokens/status.ts` entirely even
  though that file exists specifically to drive this.

Token drift also exists between `packages/ui/src/tokens/colors.ts` (hex,
documented as "canonical") and `apps/web/src/index.css` (independently
authored oklch values), e.g. dark-mode `ring` is `#6b4ee6` in `colors.ts`
but `oklch(0.55 0.22 264)` (same as `--primary`) in `index.css` — two
different colors for what's supposed to be one token. `typography.ts`
(`fontSize`/`fontWeight`) isn't wired into Tailwind or CSS anywhere — dead
tokens.

Per user decisions:
- Keep the Tailwind v4 + Base UI + CVA stack.
- I'm proposing the visual direction (see below) rather than following a
  supplied brand guide.
- **Consolidate**: after the rebuild, migrate `apps/web` onto `@rlpapp/ui`
  and delete the duplicate local copies, so the overhaul is actually visible
  app-wide instead of in 2 files.
- **Stay scoped to the existing 8 components** — no new components added to
  `packages/ui` in this pass.
- **Local-first**: rebuild and verify in code; do not push to the Claude
  Design project (`.design-sync`) as part of this work — that's a separate,
  later step the user triggers via `/design-sync`.

## Proposed design direction

- **Keep the brand primary** (`#3a16d9`, indigo/violet) — `colors.ts` calls
  it "the canonical RLP identity"; that's a brand decision, not a code
  quality problem, and out of scope to change unilaterally.
- **One source of truth for color**: `apps/web/src/index.css` theme
  variables will be derived directly from the hex values in
  `packages/ui/src/tokens/colors.ts` (same hex, not independently-guessed
  oklch), eliminating the drift class of bug described above. Since
  `packages/ui` has no build step, this is enforced by convention +
  a comment pointing each block at its source token, not codegen.
- **Make `statusColors` real**: `Badge`/`StatusBadge` will render their
  semantic variants (`neutral/info/success/warning/danger/muted`) from
  `tokens/status.ts` `statusColors` (bg/fg/border) instead of hardcoded
  Tailwind palette utilities. This makes the token file the actual source
  of status styling instead of dead code.
- **Wire up typography tokens**: fold `tokens/typography.ts` `fontSize`/
  `fontWeight` into the `@theme` block in `index.css` so they back real
  Tailwind classes, instead of sitting unused.
- **Reduce class-string bloat**: extract repeated fragments (focus-ring
  treatment, icon-sizing selectors, invalid-state styling) into small
  shared class constants in `packages/ui/src/web/lib/` and compose them,
  instead of one 400+ character CVA base string per component.
- **Visual polish**: consistent ring/border/shadow treatment across
  Button/Card/Badge (currently ad hoc per component), consistent
  focus-visible treatment, and a dark-mode pass that actually matches the
  token file instead of diverging from it.

## Implementation

### 1. Tokens (`packages/ui/src/tokens/`)
- Reconcile `colors.ts` dark-mode `ring` vs `index.css` `.dark --ring`
  drift (pick one value, likely the `colors.ts` one since it's documented
  canonical).
- Extend `status.ts`/`colors.ts` as needed so `statusColors` covers what
  `Badge` needs to render each variant (bg/fg/border already present —
  verify sufficiency).
- Wire `typography.ts` into `index.css`'s `@theme` block.

### 2. `apps/web/src/index.css`
- Replace the independently-authored oklch palette with values sourced
  from `packages/ui/src/tokens/colors.ts` (light + dark), fixing the ring
  drift and any other mismatches found along the way.
- Add the typography `@theme` entries from step 1.
- Leave the Google Fonts / `@source` / print-media plumbing as is (not
  part of the "not good" complaint).

### 3. Rebuild the 8 components (`packages/ui/src/web/`)
For each of `button.tsx`, `badge.tsx`, `card.tsx`, `empty-state.tsx`,
`loading-state.tsx`, `metric-card.tsx`, `page-header.tsx`,
`status-badge.tsx`:
- Keep the existing public prop API (variant/size names) unchanged where
  it's currently used at call sites, so the later `apps/web` migration is
  low-risk — **except** `Badge`, where the variant set will be
  standardized on the superset (`neutral/info/success/warning/danger/muted`
  + `default/secondary/destructive/outline`) since that's the one with
  real semantic backing.
- Refactor CVA definitions to use the extracted class-fragment constants
  from `packages/ui/src/web/lib/` instead of monolithic strings.
- `empty-state.tsx`, `loading-state.tsx`, `metric-card.tsx`,
  `page-header.tsx` are already reasonably clean (thin wrappers) — light
  touch only, mainly to pick up the token/class-constant changes from
  Button/Card/Badge they compose.

### 4. Consolidate `apps/web` onto `@rlpapp/ui`
- Update the 41 files currently importing `Button`/`Badge`/`Card` from
  `@/components/ui/*` to import from `@rlpapp/ui/web` instead.
- For `Badge` call sites: check any `variant="success"`/`variant="warning"`
  usages against the new semantic set (values still exist, but the
  underlying color treatment changes — expected, since this is a visual
  overhaul).
- Delete the now-unused local `apps/web/src/components/ui/button.tsx`,
  `badge.tsx`, `card.tsx`. Leave the other 16 local `components/ui/*` files
  untouched (out of scope per the "stay scoped to 8" decision) — they'll
  keep importing local `cn` from `@/lib/utils`, unaffected by this change.
- `.design-sync/config.json`'s `dtsPropsFor` only needs updating if a
  component's prop *shape* changes (not just internal class strings) —
  update by hand for any component where that happens (mainly `Badge` if
  its variant union changes).

### 5. Native package (`packages/ui/src/native/`)
- Out of scope for direct edits (native components untouched per user's
  "stay scoped to 8 web components" decision), but since
  `apps/native/lib/colors.ts` and native components consume the same
  `tokens/colors.ts`, confirm after step 1 that no native-specific
  breakage results from the token value changes (read-check only, not a
  redesign of native components).

## Verification
- `pnpm check-types` (or repo equivalent) across `packages/ui` and
  `apps/web` to catch prop-shape breaks from the `Badge` variant change.
- Start `apps/web` dev server and visually check: a page using the
  migrated components (e.g. `routes/engenharia/index.tsx`), plus a couple
  of the 41 newly-migrated pages (e.g. `routes/compras/index.tsx`,
  `routes/index.tsx`), in both light and dark mode.
- Spot-check `StatusBadge` renders correctly for each equipment status
  (`installing/operational/warning/error`) and `linkStatusVariants`
  (`linked/free`) via `routes/engenharia/qr-codes.tsx` or similar.
- Do **not** run `/design-sync` push/finalize — that stays a manual,
  separate step for the user once they're happy with the local result.
