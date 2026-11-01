# rlpapp

Sistema de gestão da RLP: engenharia (QR codes de equipamentos, registro de instalações e manutenções em campo) e RH.

Monorepo com [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack): React, TanStack Start, Convex, Expo e Turborepo.

## Stack

- **TypeScript** — type safety em todo o monorepo
- **TanStack Start** — app web com SSR e TanStack Router
- **Expo / React Native** — app mobile
- **Next.js** — landing page institucional
- **Tauri 2 (Rust) + React** — app desktop de takeoff e orçamento a partir de PDF (Windows e macOS)
- **TailwindCSS + shadcn/ui** — UI
- **Convex** — backend reativo (banco de dados + funções serverless + crons)
- **Clerk** — autenticação (sync via webhook para a tabela `users` do Convex)
- **Turborepo + pnpm** — build e gerenciamento do monorepo

## Estrutura

```
rlpapp/
├── apps/
│   ├── web/           # App web (React + TanStack Start) — porta 3001
│   ├── native/        # App mobile (React Native + Expo)
│   ├── takeoff/       # App desktop de takeoff (Tauri + React; ver apps/takeoff/README.md)
│   └── landing-page/  # Site institucional (Next.js)
├── packages/
│   ├── backend/       # Backend Convex (schema, funções, crons, webhook Clerk)
│   ├── env/           # Validação de variáveis de ambiente (zod)
│   └── config/        # Configurações compartilhadas (tsconfig)
```

## Setup

### 1. Instalar dependências

```bash
pnpm install
```

### 2. Configurar o Convex

```bash
pnpm run dev:setup
```

Siga os prompts para criar/conectar um projeto Convex. Isso gera o `packages/backend/.env.local`.

### 3. Configurar secrets com Doppler

O CLI precisa estar instalado e autenticado (`brew install dopplerhq/cli/doppler` + `doppler login`).

```bash
pnpm secrets:setup
```

Isso associa o diretório ao projeto Doppler `rlpeng` / config `dev`. Os scripts `pnpm dev*` injetam os secrets via `doppler run` — não é necessário copiar `.env` localmente.

Para editar secrets: `doppler open` ou o [dashboard](https://dashboard.doppler.com).

### 4. Configurar o Clerk

Guia oficial: [Convex + Clerk](https://docs.convex.dev/auth/clerk)

1. Crie uma aplicação no [Clerk Dashboard](https://dashboard.clerk.com) e copie as chaves para os `.env`.
2. Crie um JWT Template chamado `convex` no Clerk.
3. No **Convex Dashboard** (Settings > Environment Variables), defina:
   - `CLERK_JWT_ISSUER_DOMAIN` — domínio do issuer do Clerk
   - `CLERK_WEBHOOK_SECRET` — secret do webhook (Clerk Dashboard > Webhooks, endpoint `https://<deployment>.convex.site/clerk-users-webhook`, eventos `user.created`, `user.updated`, `user.deleted`)
   - `MATERIAL_LOOKUP_TOKEN` — opcional; habilita `GET https://<deployment>.convex.site/materials/lookup?q=<texto>` (header `Authorization: Bearer <token>`) para agentes externos consultarem a descrição canônica de um material. Sem ele o endpoint responde 503. Gere com `npx convex env set MATERIAL_LOOKUP_TOKEN "$(openssl rand -hex 24)"`
   - `TAKEOFF_CATALOG_TOKEN` — opcional; habilita `GET https://<deployment>.convex.site/takeoff/catalog` (header `Authorization: Bearer <token>`), o catálogo completo de materiais ativos com preço vigente que o app desktop **RLP Takeoff** consome (`materialPrice` e `laborPrice` em reais por unidade; a mão de obra é cadastrada no material em Compras → Materiais e vale 0 quando não há, `laborPriceDate` diz quando foi definida). Sem ele o endpoint responde 503. Gere com `npx convex env set TAKEOFF_CATALOG_TOKEN "$(openssl rand -hex 24)"`. O mesmo token protege `POST /takeoff/materials`, por onde o app propõe um material novo (nasce como rascunho para compras ativar) ou uma estimativa de preço (entra na fila de revisão de preços).

### 4.1 Ponto (RHID) — opcional

O módulo **RH > Ponto (RHID)** espelha o controle de acesso [RHID](https://rhid.com.br) no Convex
(marcações, presença do dia, homem-dia por obra). A coleta roda no backend com uma credencial de
integração, então nenhum usuário precisa logar no RHID pelo app.

No **Convex Dashboard** (ou via `npx convex env set`), defina:

- `RHID_EMAIL` / `RHID_PASSWORD` — credencial de um usuário do RHID com acesso às marcações
- `RHID_COMPANY_ID` — opcional; id da empresa no RHID (padrão `1`)
- `RHID_MEDIA_ALLOWED_HOSTS` — opcional; hosts extras (separados por vírgula) de onde as fotos das
  marcações podem ser buscadas, além de `rhid.com.br` e subdomínios

Sem essas variáveis a tela funciona em modo somente leitura e os crons (`convex/crons.ts`) não fazem
nada. Com elas, o RH pode sincronizar um dia ou um mês pela tela, um cron atualiza o dia de hoje a cada
5 min e outro, às 03:00 (Brasília), refaz os últimos 7 dias para pegar envios atrasados e correções.
Pessoas do RHID são vinculadas aos `employees` por CPF ou nome (ajuste manual em **Ponto > Vínculos**);
cercas (geofences) podem ser vinculadas a obras.

Privacidade: as fotos das marcações nunca são expostas por URL. O app abre cada foto sob demanda pelo
endpoint autenticado `/time-clock/photo/<punchId>` (exige `rh.read`, resposta `no-store`), e o service
worker do PWA trata `/rh/ponto` e as fotos como somente rede (nada fica em cache offline).

### 5. Rodar em desenvolvimento

```bash
pnpm run dev
```

- Web: [http://localhost:3001](http://localhost:3001)
- Mobile: use o app Expo Go
- Backend: `npx convex dev` roda junto (nunca use `npx convex deploy` em desenvolvimento)

## Scripts

- `pnpm run dev` — todos os apps em modo dev
- `pnpm run dev:web` — apenas o web
- `pnpm run dev:native` — apenas o mobile (Expo)
- `pnpm run dev:takeoff` — app desktop de takeoff numa janela nativa (precisa de Rust; ver `apps/takeoff/README.md`)
- `pnpm run dev:server` — apenas o backend Convex
- `pnpm run dev:setup` — configura o projeto Convex
- `pnpm run build` — build de todos os apps
- `pnpm run lint` — ESLint em todos os pacotes
- `pnpm run check-types` — typecheck (`tsc --noEmit`) em todos os pacotes

## API HTTP para agentes (`/api/v1`)

Qualquer função pública do backend pode ser chamada por HTTP, direto no deployment Convex, com um token de agente (`rlp_…`, criado em **Minha conta → Agentes**):

```bash
API=https://<deployment>.convex.site/api/v1
curl "$API/functions?search=supplier" -H "Authorization: Bearer rlp_…"
curl "$API/query" -H "Authorization: Bearer rlp_…" -H "Content-Type: application/json" \
  -d '{"path":"suppliers:list","args":{}}'
curl "$API/mutation" -H "Authorization: Bearer rlp_…" -H "Content-Type: application/json" \
  -d '{"path":"customers:create","args":{"name":"Cliente"}}'
```

O gateway (`packages/backend/convex/gateway/v1.ts`) confere o token, valida caminho, tipo, acesso e argumentos pelo catálogo de funções e executa a chamada em nome do dono com um JWT ES256 curto assinado pelo próprio deployment. Tokens `read_only` só executam queries; `agentTokens:*` nunca é exposto. Não envolve o Vercel: a única configuração é a chave de assinatura no Convex:

```bash
cd packages/backend
node scripts/generate-api-signing-key.mjs
npx convex env set --prod API_JWT_PRIVATE_KEY '<jwk impresso>'
npx convex deploy
```

Contrato completo (endpoints, erros, descoberta de funções, exemplo para agentes) em [`docs/API.md`](docs/API.md).

## MCP (agentes de IA)

O app web expõe um servidor MCP **2026-07-28** em `/mcp` (Streamable HTTP, stateless, com fallback para clientes de 2025). Claude Code, Claude Desktop, Cursor ou qualquer cliente MCP se conectam a ele de duas formas:

1. **Token de agente (recomendado).** Cada usuário interno cria os seus em **Minha conta → Agentes (MCP)** (`/conta/agentes`) e configura o cliente com `Authorization: Bearer rlp_…`. O token age em nome do dono, com a mesma role e o mesmo departamento, e pode ser `read_only` (só consultas) ou `full_access` (também grava). Revogar vale na hora.
2. **OAuth do Clerk** com o scope `rlp:engineering:read` (fluxo original; ver "Clerk: scope e clientes OAuth"). Conexões OAuth são sempre somente-leitura: só existe o escopo de leitura.

Tokens não gerenciam tokens: criar, renomear e revogar exigem uma sessão humana no app (um token vazado não consegue se perpetuar criando outro). A verificação no Convex tem timeout de 5 s; se o backend não responder, o `/mcp` devolve 503 em vez de 401.

Em ambos os casos a credencial **não** vai para o Convex: a rota verifica o bearer, emite um JWT de delegação RS256 curto (`aud: convex`, `sub` = Clerk user ID; com token de agente, também as claims `agent_token.id` / `agent_token.permission`) e as funções existentes continuam sendo a fonte de verdade do RBAC. `lib/agentTokens.ts` (backend) rejeita centralmente tokens revogados e tokens somente-leitura em mutations.

### Ferramentas

- **6 ferramentas de engenharia embutidas** (`list_projects`, `resolve_project`, `get_project_overview`, `get_project_hierarchy`, `get_equipment`, `get_project_report`), que removem tokens de QR e ids de storage da resposta.
- **~185 ferramentas curadas** geradas a partir do catálogo de funções (`apps/web/src/lib/mcp/manifest.ts`): obras, torres/andares/ambientes/sistemas, unidades, equipamentos planejados, checklists, clientes, empreiteiros, contratos, medições, documentos, materiais (incluindo duplicatas e merge), fornecedores, preços, takeoffs, estoque (movimentos, políticas de estoque, regras), requisições, funcionários, folha (linhas, fechamento, empréstimos), ponto e os próprios tokens. O schema de entrada de cada uma vem do validador real da função Convex (`exportArgs()`), servido por `mcpCatalog.list`; só aparecem as funções que o usuário pode chamar, e tokens `read_only` só veem queries.
- `whoami`, `search_functions` (busca em todas as funções públicas) e, com `MCP_ALLOW_RAW_CALLS=1` no app web, `call_function` (qualquer função pública por nome, com validação de argumentos).
- Cada chamada feita com token de agente fica registrada em `agentTokenCalls` e aparece em "Atividade recente" na página Agentes (30 dias de retenção).

O catálogo (`packages/backend/convex/mcp/catalog.generated.ts`) é gerado por `pnpm --filter @rlpapp/backend generate:catalog` — roda automaticamente antes de `convex dev` e o `check-types` do backend falha se estiver desatualizado. Para criar o primeiro token sem passar pelo app:

```bash
cd packages/backend
npx convex run agentTokens:createForUser '{"login":"voce@rlpeng.com.br","name":"CLI","permission":"full_access"}'
```

### Cliente

```bash
claude mcp add --transport http rlp https://app.rlpeng.com.br/mcp \
  --header "Authorization: Bearer rlp_…"
```

```json
{
  "mcpServers": {
    "rlp": {
      "url": "https://app.rlpeng.com.br/mcp",
      "headers": { "Authorization": "Bearer rlp_…" }
    }
  }
}
```

Em desenvolvimento a URL é `http://localhost:3001/mcp`. A página Agentes mostra estes trechos já preenchidos ao criar um token.

### 1. Gerar o par de chaves de delegação

```bash
pnpm --dir apps/web exec node --input-type=module -e "
import { generateKeyPair, exportPKCS8, exportJWK } from 'jose';
const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
const pkcs8 = await exportPKCS8(privateKey);
const jwk = await exportJWK(publicKey);
jwk.kid = 'mcp-delegation';
jwk.use = 'sig';
jwk.alg = 'RS256';
const jwks = { keys: [jwk] };
const dataUri = 'data:application/json;base64,' + Buffer.from(JSON.stringify(jwks)).toString('base64');
console.log('MCP_JWT_PRIVATE_KEY (uma linha, para Vercel):');
console.log(JSON.stringify(pkcs8));
console.log('MCP_JWT_JWKS:');
console.log(dataUri);
"
```

### 2. Variáveis no Vercel (app web)

| Variável | Exemplo |
| --- | --- |
| `MCP_RESOURCE_URL` | `https://app.rlpeng.com.br/mcp` |
| `MCP_JWT_ISSUER` | `https://app.rlpeng.com.br/mcp` (issuer distinto do Clerk) |
| `MCP_JWT_PRIVATE_KEY` | PKCS#8 PEM; no Vercel use `\n` escapado (saída do `JSON.stringify` acima) |
| `MCP_JWT_KEY_ID` | `mcp-delegation` (opcional) |
| `MCP_ALLOWED_HOSTS` | `app.rlpeng.com.br,localhost:3001` |
| `VITE_CONVEX_SITE_URL` | opcional; `https://<deployment>.convex.site`, onde fica `POST /agent-tokens/verify`. Derivada de `VITE_CONVEX_URL` quando ausente |
| `MCP_ALLOW_RAW_CALLS` | opcional; `1` expõe `call_function` |
| `VITE_CONVEX_URL` | URL do deployment Convex |
| `VITE_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | já usadas pelo app |

A rota recusa `Host` fora da allow-list. Clientes MCP costumam omitir `Origin`; a ausência de `Origin` **não** é rejeitada.

### 3. Variáveis no Convex Dashboard

| Variável | Valor |
| --- | --- |
| `MCP_JWT_ISSUER` | o mesmo `iss` da etapa 2 |
| `MCP_JWT_JWKS` | data URI gerada na etapa 1 |

O provider JWT customizado só é registrado quando as duas variáveis existem. `applicationID` / `aud` permanece `convex`. Tokens de agente não precisam de nada além disso: a verificação (`/agent-tokens/verify`) compara apenas o SHA-256 guardado em `agentTokens`.

### 4. Clerk: scope e clientes OAuth (só para o fluxo OAuth)

1. No Clerk Dashboard, crie o scope customizado `rlp:engineering:read` e marque-o como necessário no consentimento do MCP.
2. **Não habilite Dynamic Client Registration irrestrito.**
3. **Cursor:** pré-registre um OAuth app público com redirect URLs:
   - `https://www.cursor.com/agents/mcp/oauth/callback`
   - `http://localhost:8787/callback`
4. **Claude:** use CIMD quando estiver habilitado no Clerk; senão, pré-registre um cliente separado.

Discovery:
- Recurso: `/.well-known/oauth-protected-resource/mcp`
- Authorization server: `/.well-known/oauth-authorization-server` (metadados do Clerk)

## CI

GitHub Actions (`.github/workflows/ci.yml`) roda lint, typecheck e testes em PRs e em pushes para `master`, numa única invocação do Turbo (`turbo run lint check-types test`), com o cache do Turbo (`.turbo/cache`) guardado entre runs via `actions/cache`. Um pacote que não mudou desde a última run (do `master` ou da própria branch) tem suas tarefas reaproveitadas em vez de re-executadas; uma mudança só em páginas do `apps/web` re-executa apenas as tarefas do `web`.

As runs no `master` são as que alimentam os caches das PRs (pnpm store e Turbo), por isso não são canceladas por `concurrency`.

O app desktop (`apps/takeoff`) tem mais dois workflows: `takeoff-rust.yml` (`cargo fmt` e `clippy`, só quando `apps/takeoff/src-tauri` muda) e `takeoff-release.yml` (instaladores Windows/macOS assinados, publicados em `Patolord/takeoff-releases` a cada tag `takeoff-vX.Y.Z`).

## Deploy

- **Backend (produção):** `npx convex deploy` — somente via pipeline/manual consciente, nunca durante desenvolvimento.
- **Web:** build com `pnpm run build` (saída do TanStack Start) — requer as env vars `VITE_*` no ambiente de build.
- **Landing page:** Next.js (`apps/landing-page`).
- **Mobile:** Expo (EAS config pendente — ver roadmap Sprint 4).
- **Desktop (takeoff):** `pnpm release X.Y.Z` em `apps/takeoff` e push da tag `takeoff-vX.Y.Z`; os apps instalados se atualizam sozinhos.
