# Convex backend

Os módulos de funções ficam na raiz de `convex/` (arquivos planos, para manter os caminhos gerados `api.<módulo>.*` estáveis), organizados logicamente por domínio. O código compartilhado fica em `lib/`, agrupado por feature.

## Módulos por domínio

### Engenharia (obras e hierarquia)

| Módulo | Responsabilidade |
| --- | --- |
| `projects.ts` | CRUD de obras, clientes vinculados, geração de layout, hierarquia |
| `towers.ts` / `floors.ts` / `environments.ts` | Hierarquia Torre → Andar → Ambiente |
| `projectUnits.ts` | Unidades legadas (apartamentos) |
| `projectEquipment.ts` | Equipamentos planejados (BOM) e ações de campo via QR |
| `checklists.ts` | Templates de checklist e conclusão de itens |
| `equipmentHistory.ts` | Histórico de ações em equipamentos planejados |
| `dashboard.ts` | KPIs consolidados (visão diretor) |
| `reports.ts` | Relatórios por obra (progresso, produtividade) |
| `portal.ts` | Portal read-only do cliente |

### Compras (procurement)

| Módulo | Responsabilidade |
| --- | --- |
| `materials.ts` | Catálogo de materiais, aliases e busca normalizada |
| `suppliers.ts` | Fornecedores e contatos |
| `takeoffs.ts` | Takeoffs (levantamentos) e itens com preço sugerido |
| `priceEvents.ts` | Eventos de preço, fila de revisão e frescor |

### Equipamentos e QR

| Módulo | Responsabilidade |
| --- | --- |
| `equipment.ts` | Registro de equipamentos físicos |
| `qrCodes.ts` | Ciclo de vida de tokens QR (lotes, vínculo, lookup público) |
| `maintenanceLogs.ts` | Logs de instalação/manutenção com fotos |

### Usuários e autenticação

| Módulo | Responsabilidade |
| --- | --- |
| `users.ts` | Usuário atual, sync com Clerk (webhook), CRUD de usuários |
| `userAdmin.ts` | Action Node: criação de usuário via API do Clerk |
| `http.ts` | Rotas HTTP (`POST /clerk-users-webhook`) |
| `auth.config.ts` | Providers JWT (Clerk) |

### Assistente de IA

| Módulo | Responsabilidade |
| --- | --- |
| `ai.ts` | Actions OpenAI (propor layout, interpretar arquivos/chat) |
| `aiChat.ts` | Sessões e mensagens de chat por obra |
| `aiIntents.ts` | Validators de intents e aplicação na hierarquia da obra |

### Infra

| Módulo | Responsabilidade |
| --- | --- |
| `schema.ts` | Schema do banco (tabelas, índices, enums compartilhados) |
| `migrations.ts` | Backfills idempotentes (admin) |
| `healthCheck.ts` | Liveness |
| `convex.config.ts` | Configuração do app |

## Código compartilhado (`lib/`)

```
lib/
  auth.ts              Identidade: requireAuth, getUserByIdentity, getUserRef
  rbac.ts              Autorização centralizada: permissões, política, gates e wrappers
  audit.ts             logAudit e logEquipmentHistory
  engenharia/
    hierarchy.ts       buildProjectHierarchy (árvore Torre → Andar → Ambiente → Equipamento)
  compras/
    procurement.ts     Normalização de texto, frescor de preço, markup, revisão
```

### Controle de acesso (RBAC — `lib/rbac.ts`)

Toda autorização vive em `lib/rbac.ts`, em quatro camadas:

1. **Permissões** (`Permission`): `engenharia.read|write`, `compras.read|write`, `suprimentos.read` (leitura compartilhada de materiais/fornecedores/preços/takeoffs) e `admin.manage`.
2. **Política** (`hasPermission(user, permission)`): director/admin têm tudo; engenheiro e staff de engenharia têm `engenharia.*` + `suprimentos.read`; staff de compras tem `compras.*` + `suprimentos.read`; `qr_operator` não tem permissões.
3. **Gates**: `requireUser`, `requirePermission`, `assertStaff`, `assertAdmin`, `requireStaff`/`requireRole` (uso manual em handlers, ex.: `qrCodes.ts`).
4. **Wrappers**: `permissionQuery(perm)` / `permissionMutation(perm)` geram os wrappers nomeados.

Nunca use `query`/`mutation` puros em funções públicas que acessam dados de usuário. Use os wrappers:

- `authedQuery` / `authedMutation` — qualquer usuário ativo, inclui `qr_operator`
- `staffQuery` / `staffMutation` — roles internas (exclui `qr_operator`)
- `adminMutation` — apenas director/admin (`admin.manage`)
- `engineeringQuery` / `engineeringMutation` — `engenharia.read` / `engenharia.write`
- `purchasingQuery` / `purchasingMutation` — `compras.read` / `compras.write`
- `engineeringOrPurchasingQuery` — `suprimentos.read`

Todos injetam `ctx.user` (documento `users` autenticado e ativo) no handler.

**Regra:** novas regras de acesso entram na política (`Permission` + `hasPermission`), não em novos wrappers ad hoc. Precisa de um novo escopo? Adicione a permissão ao mapa e crie o wrapper com `permissionQuery`/`permissionMutation`.

## Convenções

- Arquivos de função ficam planos na raiz: mover um arquivo muda o caminho `api.*` e quebra os frontends (`apps/web`, `apps/native`).
- Helpers em `lib/` não aparecem no `api` gerado — podem ser reorganizados livremente.
- Novos helpers de domínio: coloque no subdiretório do domínio (`lib/engenharia/`, `lib/compras/`). Autorização vai sempre em `lib/rbac.ts`; auditoria em `lib/audit.ts`.

Docs: https://docs.convex.dev/functions
