# rlpapp: guia para agentes e contribuidores

Monorepo do sistema de gestão da RLP Engenharia (engenharia, compras, estoque, RH) e do app
desktop de takeoff. Visão geral, setup e variáveis de ambiente: [`README.md`](README.md).
Glossário do domínio: [`CONTEXT.md`](CONTEXT.md).

## Mapa do repositório

| Caminho | Nome no pnpm (`-F`) | O que é |
| --- | --- | --- |
| `apps/web` | `web` | Dashboard (TanStack Start + Convex + Clerk), porta 3001; também serve o MCP em `/mcp` |
| `apps/takeoff` | `takeoff` | App desktop RLP Takeoff (Tauri 2 + React, Rust em `src-tauri`): takeoff e orçamento a partir de PDF. Ver [`apps/takeoff/AGENTS.md`](apps/takeoff/AGENTS.md) |
| `apps/native` | `native` | App mobile (Expo / React Native) |
| `apps/landing-page` | `rlp` | Site institucional (Next.js) |
| `apps/internal-agent` | `@rlpapp/internal-agent` | Assistente interno (framework eve, canal WhatsApp). Ver [`apps/internal-agent/AGENTS.md`](apps/internal-agent/AGENTS.md) |
| `packages/backend` | `@rlpapp/backend` | Backend Convex (schema, funções, crons, HTTP). Ver [`packages/backend/AGENTS.md`](packages/backend/AGENTS.md) e [`packages/backend/convex/README.md`](packages/backend/convex/README.md) |
| `packages/shared` | `@rlpapp/shared` | Código TS compartilhado entre apps (formatadores, rótulos, cálculos de engenharia como NBR 16401). Os `exports` apontam para `src/*.ts` |
| `packages/ui` | `@rlpapp/ui` | Tokens e componentes de UI (web e native) |
| `packages/env` | `@rlpapp/env` | Validação de variáveis de ambiente (zod) para web, native e MCP |
| `packages/config` | `@rlpapp/config` | `tsconfig.base.json` compartilhado |

Direção em andamento: lógica usada pelo dashboard e pelo app desktop migra para `packages/shared`
(o cálculo de dutos já mora em `packages/shared/src/engenharia/ducts.ts` e é o único; o dashboard
não tem mais calculadora própria), e o app desktop passa a se integrar mais ao backend (login,
publicação de orçamentos). Confira o código atual antes de supor onde algo mora.

## Comandos

pnpm 11 (versão fixada em `packageManager`) + Turborepo. Rode tudo da raiz.

```bash
pnpm install                 # pnpm install --filter takeoff... instala só o app desktop
pnpm dev                     # todos os apps (turbo dev)
pnpm dev:web                 # só o web
pnpm dev:web:server          # web + backend Convex
pnpm dev:server              # só o backend (gera o catálogo MCP e roda convex dev)
pnpm dev:takeoff             # app desktop numa janela nativa (precisa de Rust)
pnpm dev:native              # mobile (Expo)
pnpm dev:agent               # internal-agent (TUI)

pnpm lint                    # turbo lint
pnpm check-types             # turbo check-types
pnpm test                    # turbo test
pnpm exec turbo run lint check-types test -F web     # um pacote só (o mesmo que o CI roda)
pnpm -F @rlpapp/backend test # script direto de um pacote, sem Turbo
```

Os scripts `dev` (exceto o do takeoff) rodam via `doppler run`, então precisam do Doppler
configurado (abaixo).

## CI (`.github/workflows`)

- `ci.yml`: em PRs e pushes para `master`, `pnpm exec turbo run lint check-types test --continue`
  com cache do Turbo. Rode o mesmo localmente antes de abrir PR.
- `takeoff-rust.yml`: `cargo fmt --check` e `cargo clippy --locked -- -D warnings` em
  `apps/takeoff/src-tauri`, só quando esse diretório muda.
- `takeoff-release.yml`: instaladores do app desktop a cada tag `takeoff-v*` (ou
  `workflow_dispatch`). Ver [`apps/takeoff/AGENTS.md`](apps/takeoff/AGENTS.md).
- `convex-preview-cleanup.yml`: apaga o deployment de preview do Convex de um PR quando ele fecha,
  e varre diariamente os previews sem PR aberto (secret `CONVEX_MANAGEMENT_TOKEN`; ver README).

## Secrets: Doppler

Secrets locais vêm do Doppler (projeto `rlpeng`, config `dev`, ver `doppler.yaml`):
`pnpm secrets:setup` uma vez, depois os scripts `dev` injetam tudo. Não crie nem commite `.env`
com secrets. Vercel, Convex Dashboard e EAS têm cópias próprias.

## Convex (`packages/backend`)

- Antes de mexer em código Convex, leia `packages/backend/convex/_generated/ai/guidelines.md`
  (ignorado pelo git; gere com `npx convex ai-files install` em `packages/backend` se faltar).
  Skills Convex em `packages/backend/.claude/skills`.
- Nunca rode `npx convex deploy` durante desenvolvimento; use `pnpm dev:server` (`convex dev`).
  Deploy de produção é manual e consciente.
- `convex/_generated` é commitado: commite as mudanças que o `convex dev` gerar junto com o código.
- Catálogo MCP (`convex/mcp/catalog.generated.ts`): depois de criar, remover ou mudar argumentos
  de funções públicas, rode `pnpm -F @rlpapp/backend generate:catalog`. O `check-types` do
  backend falha se o catálogo estiver desatualizado.
- Testes do backend ficam em `packages/backend/tests` (vitest + convex-test).

## Convenções

- Textos de UI em português do Brasil (pt-BR), em todos os apps.
- Mensagens de commit em português, no formato `Área: descrição` (ex.: `Materiais: tabela com
  filtro de status`). Tudo entra no `master` por PR.
- Testes ao lado do código (`*.test.ts` em `apps/web/src`, `apps/takeoff/src`), exceto backend
  (`packages/backend/tests`) e shared (`packages/shared/tests`). E2E do web: Playwright em
  `apps/web/e2e` (`pnpm -F web test:e2e`).
- Lint: ESLint (`eslint.config.mjs` por pacote) em web, native, landing-page, internal-agent e
  backend; Biome em `apps/takeoff`. `shared`, `ui` e `env` só têm typecheck.
- Configurações de preview para agentes: `.claude/launch.json` (web, porta 3001) e
  `apps/takeoff/.claude/launch.json` (Vite do takeoff, porta 1420).
- Guia de design visual para UI nova: [`docs/skill.md`](docs/skill.md).
- O `.gitignore` ignora `*.md` (exceto `AGENTS.md`, `CLAUDE.md` e o internal-agent): um `.md`
  novo que deva ser versionado precisa de `git add -f`.

## Documentação por pacote

- [`README.md`](README.md): setup, Doppler, Clerk, RHID, API HTTP `/api/v1`, MCP, deploy
- [`apps/takeoff/AGENTS.md`](apps/takeoff/AGENTS.md) e [`apps/takeoff/README.md`](apps/takeoff/README.md)
- [`packages/backend/AGENTS.md`](packages/backend/AGENTS.md) e [`packages/backend/convex/README.md`](packages/backend/convex/README.md)
- [`apps/internal-agent/AGENTS.md`](apps/internal-agent/AGENTS.md)
