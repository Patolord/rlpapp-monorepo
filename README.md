# rlpapp

Sistema de gestão da RLP: engenharia (QR codes de equipamentos, registro de instalações e manutenções em campo) e RH.

Monorepo com [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack): React, TanStack Start, Convex, Expo e Turborepo.

## Stack

- **TypeScript** — type safety em todo o monorepo
- **TanStack Start** — app web com SSR e TanStack Router
- **Expo / React Native** — app mobile
- **Next.js** — landing page institucional
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

### 3. Configurar variáveis de ambiente

Cada app tem um `.env.example` com as variáveis necessárias:

```bash
cp packages/backend/.env.example packages/backend/.env.local  # já gerado pelo dev:setup
cp apps/web/.env.example apps/web/.env
cp apps/native/.env.example apps/native/.env
```

Preencha com os valores do seu deployment Convex e do Clerk Dashboard.

### 4. Configurar o Clerk

Guia oficial: [Convex + Clerk](https://docs.convex.dev/auth/clerk)

1. Crie uma aplicação no [Clerk Dashboard](https://dashboard.clerk.com) e copie as chaves para os `.env`.
2. Crie um JWT Template chamado `convex` no Clerk.
3. No **Convex Dashboard** (Settings > Environment Variables), defina:
   - `CLERK_JWT_ISSUER_DOMAIN` — domínio do issuer do Clerk
   - `CLERK_WEBHOOK_SECRET` — secret do webhook (Clerk Dashboard > Webhooks, endpoint `https://<deployment>.convex.site/clerk-users-webhook`, eventos `user.created`, `user.updated`, `user.deleted`)

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
- `pnpm run dev:server` — apenas o backend Convex
- `pnpm run dev:setup` — configura o projeto Convex
- `pnpm run build` — build de todos os apps
- `pnpm run lint` — ESLint em todos os pacotes
- `pnpm run check-types` — typecheck (`tsc --noEmit`) em todos os pacotes

## MCP (engenharia, somente leitura)

O app web expõe um servidor MCP **2026-07-28** em `/mcp` (stateless, com fallback para clientes Streamable HTTP de 2025). O endpoint exige OAuth do Clerk com o scope `rlp:engineering:read`. O token OAuth **não** é enviado ao Convex: a rota verifica o token, emite um JWT de delegação RS256 de curta duração (`aud: convex`, `sub` = Clerk user ID) e as queries de engenharia existentes continuam sendo a fonte de verdade do RBAC.

Ferramentas: `list_projects`, `resolve_project`, `get_project_overview`, `get_project_hierarchy`, `get_equipment`, `get_project_report`.

### 1. Gerar o par de chaves de delegação

```bash
node --input-type=module -e "
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
| `VITE_CONVEX_URL` | URL do deployment Convex |
| `VITE_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | já usadas pelo app |

A rota recusa `Host` fora da allow-list. Clientes MCP costumam omitir `Origin`; a ausência de `Origin` **não** é rejeitada.

### 3. Variáveis no Convex Dashboard

| Variável | Valor |
| --- | --- |
| `MCP_JWT_ISSUER` | o mesmo `iss` da etapa 2 |
| `MCP_JWT_JWKS` | data URI gerada na etapa 1 |

O provider JWT customizado só é registrado quando as duas variáveis existem. `applicationID` / `aud` permanece `convex`.

### 4. Clerk: scope e clientes OAuth

1. No Clerk Dashboard, crie o scope customizado `rlp:engineering:read` e marque-o como necessário no consentimento do MCP.
2. **Não habilite Dynamic Client Registration irrestrito.**
3. **Cursor:** pré-registre um OAuth app público com redirect URLs:
   - `https://www.cursor.com/agents/mcp/oauth/callback`
   - `http://localhost:8787/callback`
4. **Claude:** use CIMD quando estiver habilitado no Clerk; senão, pré-registre um cliente separado.

Discovery:
- Recurso: `/.well-known/oauth-protected-resource/mcp`
- Authorization server: `/.well-known/oauth-authorization-server` (metadados do Clerk)

### 5. Cliente (Cursor)

URL do servidor: `https://<host>/mcp` (em dev, `http://localhost:3001/mcp`). O cliente deve pedir o scope `rlp:engineering:read` além de `openid` / `profile` / `email`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) roda lint + typecheck em todos os pushes para `main` e em PRs.

## Deploy

- **Backend (produção):** `npx convex deploy` — somente via pipeline/manual consciente, nunca durante desenvolvimento.
- **Web:** build com `pnpm run build` (saída do TanStack Start) — requer as env vars `VITE_*` no ambiente de build.
- **Landing page:** Next.js (`apps/landing-page`).
- **Mobile:** Expo (EAS config pendente — ver roadmap Sprint 4).
