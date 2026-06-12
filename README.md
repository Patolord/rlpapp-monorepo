# rlpapp

Sistema de gestão da RLP: estoque (recebimento, expedição, ajustes, QR codes de equipamentos), financeiro (contas a pagar/receber, conciliação bancária, relatórios), engenharia e RH.

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

## CI

GitHub Actions (`.github/workflows/ci.yml`) roda lint + typecheck em todos os pushes para `main` e em PRs.

## Deploy

- **Backend (produção):** `npx convex deploy` — somente via pipeline/manual consciente, nunca durante desenvolvimento.
- **Web:** build com `pnpm run build` (saída do TanStack Start) — requer as env vars `VITE_*` no ambiente de build.
- **Landing page:** Next.js (`apps/landing-page`).
- **Mobile:** Expo (EAS config pendente — ver roadmap Sprint 4).
