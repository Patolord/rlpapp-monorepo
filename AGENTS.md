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
| `apps/internal-agent` | `@rlpapp/internal-agent` | Assistente interno (framework eve, canal WhatsApp). Ver [`apps/internal-agent/AGENTS.md`](apps/internal-agent/AGENTS.md) |
| `packages/backend` | `@rlpapp/backend` | Backend Convex (schema, funções, crons, HTTP). Ver [`packages/backend/AGENTS.md`](packages/backend/AGENTS.md) e [`packages/backend/convex/README.md`](packages/backend/convex/README.md) |
| `packages/shared` | `@rlpapp/shared` | Código TS compartilhado entre apps (formatadores, rótulos, cálculos de engenharia como NBR 16401). Os `exports` apontam para `src/*.ts` |
| `packages/ui` | `@rlpapp/ui` | Tokens e componentes de UI (web e native) |
| `packages/env` | `@rlpapp/env` | Validação de variáveis de ambiente (zod) para web, native e MCP |
| `packages/config` | `@rlpapp/config` | `tsconfig.base.json` compartilhado |

O site institucional (rlpeng.com.br) não fica aqui: está no repositório
[`Patolord/rlp-site`](https://github.com/Patolord/rlp-site) (Astro + EmDash no Cloudflare Workers).

Direção em andamento: lógica usada pelo dashboard e pelo app desktop migra para `packages/shared`
(o cálculo de dutos já mora em `packages/shared/src/engenharia/ducts.ts` e é o único; o dashboard
não tem mais calculadora própria; os tipos e as tabelas de fábrica do takeoff, kits, pesos e
marcas VRF, estão em `packages/shared/src/takeoff/`), e o app desktop passa a se integrar mais ao
backend (login, publicação de orçamentos, configurações padrão da empresa editadas em App Takeoff
no dashboard).
Confira o código atual antes de supor onde algo mora.

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

## Deploys da Vercel (cota)

A Vercel do time está no plano grátis (100 deployments por dia, somando todos os projetos). Cada
push num branch que mexe em `apps/web` ou nos pacotes dele (`packages/backend`, `shared`, `ui`,
`env`, `config`) gera um build de preview do web e um deployment de preview no Convex (limite de
40). Por isso: faça commits locais à vontade, mas **push só quando o trabalho estiver pronto para
o PR ou para responder a revisão**, num push só; não faça push de commit a commit nem de
correções de docs separadas. O internal-agent só faz deployment no `master`. Detalhes no
README (Deploy → "Vercel: quando cada app builda").

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
- Organização (detalhes em `packages/backend/convex/README.md`): os arquivos da raiz de `convex/`
  são a API pública e ficam finos (args, returns, wrapper de permissão e uma chamada); a lógica
  mora em `model/<domínio>`, as tabelas e validadores em `schema/<domínio>`, e `lib/` guarda só
  infraestrutura (auth, rbac, auditoria, erros, cripto). Arquivos públicos não importam uns aos
  outros, e cada domínio de `model/` só importa os domínios de que depende (mapa de contextos em
  `CONTEXT.md`, `DOMAIN_DEPENDENCIES` no ESLint do backend; os dois barram).
- Recusa que o usuário pode causar sai como `notFound` / `alreadyExists` / `ruleViolation`
  (`lib/domainErrors.ts`) ou `unauthenticated` / `forbidden` (`lib/accessErrors.ts`), com a
  mensagem em pt-BR: `Error` comum vira "Server Error" em produção (o ESLint barra). Nos apps,
  leia erros com `errorMessage` de `@rlpapp/shared/errors`.

## Web (`apps/web`)

- `src/routes/` só tem rotas: o arquivo da rota guarda `Route` e o componente da página. Dialogs,
  tabelas e formulários ficam em `src/components/<área>/` (um arquivo por componente coeso).
- Hooks em `src/hooks/`; código puro (formatação, cálculo, cache offline) em `src/lib/`. O que o
  native ou o desktop também usam vai para `packages/shared`.
- Dados do Convex pelos hooks de `convex/react` (`useQuery`, `useMutation`), que já são reativos;
  não há loaders de rota buscando dados. O `ConvexQueryClient` do `router.tsx` existe para criar o
  cliente Convex e autenticar o SSR no `__root.tsx`.

## Convenções

- Textos de UI em português do Brasil (pt-BR), em todos os apps; código em inglês.
  [`CONTEXT.md`](CONTEXT.md) é a linguagem do domínio: para cada conceito, a palavra da UI e o
  nome no código. Use esses nomes, não sinônimos; tabela ou domínio novo ganha verbete (o teste
  `packages/backend/tests/glossary.test.ts` falha sem ele). Rótulo de enum que web e app mostram
  mora uma vez em `packages/shared` (ex.: `EQUIPMENT_STATUS_LABELS`).
- Controle de acesso: cada usuário tem acessos combináveis (`users.roles`: engenharia, compras,
  estoque, rh, takeoff, admin...), e cada acesso concede permissões por funcionalidade
  (`obras.read`, `contratos.write`, `medicoes.aprovar`, `rh.folha.read`, `campo.todas_obras`...).
  Por cima dos acessos, cada usuário pode ter ajustes individuais (`users.permissionGrants` e
  `users.permissionDenials`, editados em Configurações → Usuários): é assim que um técnico líder
  ou um engenheiro com acesso limitado se diferencia dos demais. A política (catálogo, rótulos,
  pré-requisitos) mora em `packages/shared/src/auth/permissions.ts` e é aplicada pelos wrappers
  por funcionalidade de `packages/backend/convex/lib/rbac.ts`. Funcionalidade nova ganha uma
  permissão no catálogo (com grupo, rótulo, descrição e pré-requisitos) e um wrapper nomeado. Nos
  apps, use `can(currentUser, "funcionalidade.verbo")` (ou o hook `useCan` no web) a partir do que
  `users.getCurrentUser` devolve; não compare os campos legados `role`/`department` à mão.
- Mensagens de commit em português, no formato `Área: descrição` (ex.: `Materiais: tabela com
  filtro de status`). Tudo entra no `master` por PR.
- Sem arquivos-deus: um arquivo que passa de ~600 linhas costuma juntar mais de uma
  responsabilidade; divida pelas costuras reais (componente, capacidade), não uma função por
  arquivo, e sem `helpers.ts`/`utils.ts` genéricos.
- Testes ao lado do código (`*.test.ts` em `apps/web/src`, `apps/takeoff/src`), exceto backend
  (`packages/backend/tests`) e shared (`packages/shared/tests`). E2E do web: Playwright em
  `apps/web/e2e` (`pnpm -F web test:e2e`).
- Lint: ESLint (`eslint.config.mjs` por pacote) em web, native, internal-agent e
  backend; Biome em `apps/takeoff`. `shared`, `ui` e `env` só têm typecheck.
- Configurações de preview para agentes: `.claude/launch.json` (web, porta 3001) e
  `apps/takeoff/.claude/launch.json` (Vite do takeoff, porta 1420).
  `.cursor/` tem os scripts de ambiente dos agentes do Cursor e `.design-sync/` a configuração
  que publica os componentes de `packages/ui` como design system.
- Guia de design visual para UI nova: [`docs/skill.md`](docs/skill.md).
- O `.gitignore` ignora `*.md` (exceto `AGENTS.md`, `CLAUDE.md` e o internal-agent): um `.md`
  novo que deva ser versionado precisa de `git add -f`.

## Documentação por pacote

- [`README.md`](README.md): setup, Doppler, Clerk, ponto, API HTTP `/api/v1`, MCP, deploy
- [`apps/native/AGENTS.md`](apps/native/AGENTS.md): app mobile (abas por perfil, design system, avisos)
- [`apps/takeoff/AGENTS.md`](apps/takeoff/AGENTS.md) e [`apps/takeoff/README.md`](apps/takeoff/README.md)
- [`packages/backend/AGENTS.md`](packages/backend/AGENTS.md) e [`packages/backend/convex/README.md`](packages/backend/convex/README.md)
- [`apps/internal-agent/AGENTS.md`](apps/internal-agent/AGENTS.md)
