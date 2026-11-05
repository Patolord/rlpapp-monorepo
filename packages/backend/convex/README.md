# Convex backend

Public Convex function files stay at the root of `convex/` so generated paths
such as `api.contracts.list` remain stable. Most business logic belongs in
ordinary TypeScript functions under `model/`, grouped by domain and cohesive
capability.

## Structure

```text
convex/
  contracts.ts          Public queries and mutations
  materials.ts
  materialLookup.ts     Internal natural-language material lookup
  takeoffCatalog.ts     Internal catalog export for the RLP Takeoff desktop app
  takeoffMaterials.ts   Internal material proposals from the RLP Takeoff desktop app
  projects.ts
  model/
    contracts/          Contract rules, operations, and read models
    engineering/
    procurement/
    inventory/
    identity/
    hr/
    ai/
  lib/
    auth.ts             Authentication primitives
    rbac.ts             Authorization policy and function wrappers
    audit.ts            Audit recording
```

Directories under `model/` are added as their domains are migrated. Existing
domain code under `lib/` is moved incrementally rather than through a single
repository-wide rewrite.

## Model conventions

- Use English for backend folders, files, types, and function names.
- Keep public function names and paths stable during architectural refactors.
- Public functions define argument validators, return validators, and the
  appropriate authentication or authorization wrapper.
- Public handlers should primarily call explicitly named model functions such
  as `createContract`, `getContractById`, or `listContracts`.
- Keep related behavior together. Split a file when it contains distinct
  capabilities, not once per function.
- Call ordinary TypeScript model functions directly from queries and mutations
  to keep work in one Convex transaction.
- Do not import reusable implementation from root public-function files.
- Do not create catch-all `helpers.ts`, `utils.ts`, or shared domain libraries.
- Keep authentication, authorization, and auditing focused in `lib/`; keep
  business rules in their owning model domain.
- Files using `"use node"` contain actions and Node-runtime helpers only.

Domain terminology is defined in the repository-level `CONTEXT.md`.

## Domain areas

- `engineering`: projects, hierarchy, systems, equipment planning, field work,
  QR tracking, and project reporting.
- `contracts`: customers, contractors, agreements, service items, and
  measurements.
- `procurement`: material catalog, suppliers, takeoffs, and price events.
- `inventory`: locations, movement documents, balances, requests, and stock
  policies.
- `identity`: users and authentication integration.
- `hr`: employees, payroll runs, loans, and alimonies (pensão alimentícia, paid to a
  beneficiary in its own payroll line).
- `ai`: chat, interpretation, and application of engineering intents.

## Access control

Each user holds a set of combinable **access roles** (`users.roles`: `director`,
`admin`, `engenheiro`, `engenharia`, `compras`, `estoque`, `rh`, `takeoff`,
`qr_operator`, `client`). Every role grants a set of per-feature permissions
(`ROLE_PERMISSIONS`); the user's permissions are the union, adjusted by their
individual overrides (see below). The policy lives
in `@rlpapp/shared/auth/permissions` (`packages/shared/src/auth/permissions.ts`),
with a matrix test in `packages/shared/tests`. It is shared with the apps, which
only use it to hide navigation and actions; enforcement happens here, in
`lib/rbac.ts`:

1. `hasPermission` / `hasRole` / `isStaff` / `isAdmin` are re-exported from the
   shared policy.
2. Gate functions (`requireUser`, `requirePermission`, `assertStaff`, ...)
   perform manual authorization checks when needed. They throw
   `ConvexError({ code: "UNAUTHENTICATED" | "FORBIDDEN", message, permission? })`
   (`lib/accessErrors.ts`), so the message reaches clients in production and the
   gateway maps the code to 401/403.
3. Named wrappers authenticate the caller and add `ctx.user`.
4. Actions have no `ctx.db`: call `requireActionPermission(ctx, permission)`
   (runs `internal.users.assertPermission` under the caller's identity) before
   any external side effect.
5. `users.getCurrentUser` returns `roles`, `permissions`, `isStaff` and
   `homeArea` computed by the policy. Clients check
   `can(currentUser, "materiais.write")` instead of comparing `role`/`department`.
   `permissions` already includes the user's individual overrides.

Migration from the legacy `role` (job title) + `department` pair:

- Nothing reads or writes `role`/`department` any more, except the migration.
  A user document that still lacks `roles` is read through `rolesFromLegacy`
  (same effective permissions); every write of access (`lib/users.ts`
  `accessFields`) stores `roles` and clears the two legacy fields.
- After deploying, run `npx convex run migrations:migrateUserAccess` once
  (idempotent): it fills `roles` where missing and removes `role`/`department`
  from every user.
- Final step, in a later deploy once the migration has run (Convex validates
  existing documents against the schema at deploy time, so this cannot ship
  together): make `roles` required, delete `role`, `department` and the
  `userRoles` validator from `schema.ts`, and drop `rolesFromLegacy`,
  `LEGACY_USER_ROLES` and the `role`/`department` fields of `AccessSubject`
  from the shared policy.
- Legacy users with only `manager`/`operator` and no department had no
  permissions and now have no roles, so they are no longer staff until an admin
  assigns access in Configurações → Usuários.

Public functions that access user data use the appropriate wrapper rather than
raw `query` or `mutation`:

- `authedQuery` / `authedMutation`: any active user.
- `staffQuery` / `staffMutation`: internal roles.
- One named wrapper per feature permission, declared in `lib/rbac.ts` as
  `export const x = permissionQuery("perm");` (or `anyPermission*`):
  `obrasQuery`/`obrasMutation`/`obrasGestaoMutation`, `contratos*`,
  `medicoes*` (+ `medicoesAprovarMutation`), `documentos*`,
  `orcamentosMutation`, `assistente*`, `cadastros*`, `materiaisMutation`,
  `fornecedoresMutation`, `precosMutation`, `takeoffConfigMutation`,
  `inventory*`, `materialRequestsMutation`, `funcionarios*`, `folha*`,
  `ponto*`, `adminQuery`/`adminMutation`. The MCP catalog generator reads
  those declarations, so keep that exact shape.

### Per-feature permissions and individual overrides

Permissions are per feature (`obras.read`, `contratos.write`,
`medicoes.aprovar`, `rh.folha.read`, `campo.todas_obras`...; full list, labels
and prerequisites in `PERMISSIONS` / `PERMISSION_DEPENDENCIES` of the shared
policy). Roles only provide the starting set (`ROLE_PERMISSIONS`). Each user
can also carry `permissionGrants` (extra permissions) and `permissionDenials`
(permissions removed from what their roles give), edited in Configurações →
Usuários. Effective permissions = (roles ∪ grants, plus prerequisites) −
denials, and anything whose prerequisite was removed drops too.

- `requirePermission` no longer requires staff: a field technician
  (`qr_operator`) granted `medicoes.read` really gets that feature.
  `staffQuery`/`isStaff` still mean "member of the RLP team".
- Field-app visibility: `seesAllFieldProjects(user)` (staff or
  `campo.todas_obras`) replaces plain `isStaff` checks for "sees every obra".
- `users.update` stores only what differs from the roles
  (`normalizePermissionOverrides`) and re-evaluates the overrides when roles
  change. Unknown values in stored documents are ignored, so renaming or
  removing a permission from the catalog never breaks existing users.

New access rules belong in the central permission policy rather than ad hoc
wrappers or inline `user.role` / `user.department` comparisons. The only
inline role checks left are per-resource rules (e.g. the responsible engineer
deciding an inventory exception) and routing by principal type (`qr_operator`,
`client`).

## Verification

After migrating a domain:

1. Regenerate Convex types with `npx convex dev --once` in an isolated
   development deployment (`CONVEX_AGENT_MODE=anonymous` for agents).
2. Run `pnpm test`.
3. Run `pnpm lint`.
4. Run `pnpm check-types`.

Production deployment is not part of this development workflow.

## One-off: labour prices from the RLP Takeoff seed

`materials.laborPriceCents` (labour per unit, in cents) is edited in Compras →
Materiais and exported to the desktop app as `laborPrice`. To pre-fill it from
the desktop app's bundled catalog (`apps/takeoff/src/data/catalog.seed.json`),
run the internal mutation `migrations:importSeedLaborPrices` by hand. It matches
active materials whose normalized name (family, or family + variant) equals a
seed entry with labour > 0 priced in the same unit (`un`/`pç`/`peça`, `m`/`metro`,
`m²`/`m2`, `cj`/`conjunto`, ...). Same-name matches in another unit are only
listed in `skippedUnitMismatch`. It skips seed names with conflicting labour
prices and never overwrites a labour price already set (unless `overwrite: true`). It only
simulates unless `dryRun: false`; it writes no audit entries, so review the
dry run first.

```sh
cd packages/backend
ARGS=$(node -e 'const s=require("../../apps/takeoff/src/data/catalog.seed.json");console.log(JSON.stringify({entries:s.filter(e=>e.laborPrice>0).map(({name,unit,laborPrice})=>({name,unit,laborPrice}))}))')
npx convex run migrations:importSeedLaborPrices "$ARGS"   # dry run: lists matches
npx convex run migrations:importSeedLaborPrices "$(node -e 'const a=JSON.parse(process.argv[1]);a.dryRun=false;console.log(JSON.stringify(a))' "$ARGS")"
```

Add `--prod` to target production.
