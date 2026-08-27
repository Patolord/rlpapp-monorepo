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
- `hr`: employees, payroll runs, and loans.
- `ai`: chat, interpretation, and application of engineering intents.

## Access control

Authorization policy lives in `lib/rbac.ts`:

1. `Permission` defines supported permissions.
2. `hasPermission` is the central role and department policy.
3. Gate functions perform manual authorization checks when needed.
4. Named wrappers authenticate the caller and add `ctx.user`.

Public functions that access user data use the appropriate wrapper rather than
raw `query` or `mutation`:

- `authedQuery` / `authedMutation`: any active user.
- `staffQuery` / `staffMutation`: internal roles.
- `adminQuery` / `adminMutation`: directors and administrators.
- `engineeringQuery` / `engineeringMutation`: engineering access.
- `purchasingQuery` / `purchasingMutation`: procurement access.
- `inventoryQuery` / `inventoryMutation`: inventory access.
- `hrQuery` / `hrMutation`: HR access.

New access rules belong in the central permission policy rather than ad hoc
wrappers.

## Verification

After migrating a domain:

1. Regenerate Convex types with `npx convex dev` in an isolated development
   deployment.
2. Run `pnpm test`.
3. Run `pnpm lint`.
4. Run `pnpm check-types`.

Production deployment is not part of this development workflow.
