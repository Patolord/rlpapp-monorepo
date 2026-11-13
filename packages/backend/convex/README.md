# Convex backend

Public Convex function files stay at the root of `convex/` so generated paths
such as `api.contracts.list` remain stable. Most business logic belongs in
ordinary TypeScript functions under `model/`, grouped by domain and cohesive
capability.

## Structure

```text
convex/
  contracts.ts          Public functions (one file per resource; the path is the API:
  materials.ts          `api.materials.update`). Thin: args, returns, wrapper, and a
  projects.ts ...       call to a named model function.
  schema.ts             Assembles the schema from schema/<domain>.ts
  http.ts, crons.ts     HTTP routes and scheduled jobs
  migrations.ts         One-off backfills, run by hand (not in the MCP/API catalog)
  notifications.ts      Bell, push preferences and device tokens for the app
  push.ts               Internal Expo push delivery, receipts and purge
  notificationDigest.ts Internal daily summaries (overdue, price review, low stock)
  schema/               Tables and shared validators, one file per domain
  model/                Business logic as plain TypeScript functions, by domain
                        (dependencies between domains: CONTEXT.md, "Context map")
    kernel/             Shared kernel: text normalization, CPF/CNPJ, bulk import
                        results. Imports no domain; every domain may use it
    ai/                 Assistant conversations and intents
    contracts/          Customers, contractors, contracts, medições, and linking a
                        contract to a new project
    engineering/        Projects, building structure, systems, equipment, QR
                        codes, checklists, documents
    hr/                 Employees, payroll, loans, alimonies, time clock
    identity/           Users and agent tokens
    inventory/          Locations, movements, balances, requests, stock policies,
                        the catalog with stock, and imports with opening stock
    notifications/      `notify()`: bell entry + push scheduling, called inside the
                        mutation that caused the event, and who receives each one;
                        the bell and devices (inbox.ts) and push delivery bookkeeping
                        (delivery.ts)
    procurement/        Materials, suppliers, prices, takeoffs
  lib/                  Cross-cutting infrastructure only: auth, rbac, audit,
                        accessErrors, domainErrors, apiCrypto, agentTokens,
                        takeoffAuth, clerkBackendApi
  gateway/              All HTTP handlers (registered in http.ts): `/api/v1`,
                        desktop login, Clerk webhook, service tokens, files
  mcp/                  Function catalog for the MCP server and `/api/v1`
```

## Model conventions

- Use English for backend folders, files, types, and function names.
- Keep public function names and paths stable during architectural refactors.
- Public functions define argument validators, return validators, and the
  appropriate authentication or authorization wrapper.
- Public handlers call explicitly named model functions such as
  `createContract`, `getContractById`, or `listContracts`. A handler that is a
  single-step CRUD (one get/patch/insert/delete plus its audit entry) may stay
  inline; anything with branching, loops, or local helper functions moves to
  `model/`. Actions that only orchestrate runtime calls (`ctx.runQuery`,
  `ctx.runMutation`, `ctx.scheduler`, an external HTTP API) also stay in the
  public file, since model files do not import `_generated/api`.
- Keep related behavior together. Split a file when it contains distinct
  capabilities, not once per function.
- Call ordinary TypeScript model functions directly from queries and mutations
  to keep work in one Convex transaction.
- Root public-function files never import each other: reusable code and
  shared validators live in `model/<domain>` or `schema/<domain>`. Table
  fields and enums shared by several tables go in `schema/<domain>.ts`; a
  return shape lives next to the model function that builds it, and moves to
  a `model/<domain>/*Validators.ts` file once several files share it. ESLint
  (`no-restricted-imports` in `eslint.config.mjs`) enforces this, and also
  stops `lib/`, `model/`, `schema/` and `gateway/` from importing root files.
- A model domain may call only the domains it depends on (`DOMAIN_DEPENDENCIES`
  in `eslint.config.mjs`, mirrored in the context map of `CONTEXT.md`):
  inventory uses procurement materials, contracts use engineering projects,
  never the reverse. Work that spans two domains lives in the downstream one
  (linking a contract to a new project is contracts; the catalog with stock is
  inventory). Reading another domain's table for a lookup is fine; writing it
  goes through that domain's model functions.
- Do not create catch-all `helpers.ts`, `utils.ts`, or shared domain libraries.
  The one shared kernel is `model/kernel/`: pure rules several domains need
  (text normalization, CPF/CNPJ validation, bulk import results). It imports
  no domain, and code enters it only when a second domain needs it.
- Refusals the user can cause throw `notFound`, `alreadyExists` or
  `ruleViolation` (`lib/domainErrors.ts`), or `unauthenticated` / `forbidden`
  (`lib/accessErrors.ts`): `ConvexError({ code, message })` with the pt-BR
  message, because Convex replaces a plain `Error` message with "Server Error"
  in production. Apps read it with `errorMessage` from `@rlpapp/shared/errors`;
  the gateway maps the code to the HTTP status. A plain `Error` is only for a
  broken internal invariant, with an `eslint-disable-next-line` stating why
  (ESLint `no-restricted-syntax`). Code that catches an error and reads its
  text uses `errorMessage(error, fallback)`, not `error.message` (a
  ConvexError's `message` is its JSON).
- Keep authentication, authorization, and auditing focused in `lib/`; keep
  business rules in their owning model domain.
- A file past ~600 lines usually holds more than one capability; split it
  along those seams (see `model/procurement/material*.ts`, `model/hr/payroll*.ts`).
- Moving or adding a model file changes `_generated/api.d.ts`; run
  `pnpm dev:server` (`convex dev`) so it is regenerated, and commit it.
- Files using `"use node"` contain actions and Node-runtime helpers only. A
  model file that needs Node (e.g. `model/ai/attachments.ts`) is also
  `"use node"` and is imported only by Node actions; the Convex lint rule
  `import-wrong-runtime` does not see that the importer is Node too, so that
  import carries a disable comment.

Domain terminology is defined in the repository-level `CONTEXT.md`.

## Domain areas

Each area, its tables and its dependencies are in the context map of
`CONTEXT.md`; in short:

- `kernel`: shared kernel (see Model conventions).
- `engineering`: projects, building structure, systems, equipment planning,
  field work, QR tracking, checklists, and project reporting.
- `contracts`: customers, contractors, agreements, service items, and
  medições.
- `procurement`: material catalog, suppliers, takeoffs, and price events.
- `inventory`: locations, movement documents, balances, requests, stock
  policies, and the catalog seen with stock.
- `identity`: users and authentication integration.
- `notifications`: the bell, push devices and push delivery.
- `hr`: employees, payroll runs, loans, alimonies (pensão alimentícia, paid to a
  beneficiary in its own payroll line), and the time clock.
- `ai`: assistant conversations, interpretation, and application of
  engineering intents.

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
  (same effective permissions); every write of access (`model/identity/users.ts`
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

Before opening a PR that touches `convex/`:

1. Regenerate Convex types with `npx convex dev --once` in an isolated
   development deployment (`CONVEX_AGENT_MODE=anonymous` for agents).
2. Run `pnpm -F @rlpapp/backend generate:catalog` if public functions or
   their args changed.
3. Run `pnpm exec turbo run lint check-types test -F @rlpapp/backend`.

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
