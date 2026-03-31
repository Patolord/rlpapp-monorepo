# RFC 0001: Aplicativo de movimentação de materiais (warehouse-first)

| Campo | Valor |
|--------|--------|
| **Status** | Proposta / documentação do estado atual |
| **Data** | 2026-03-30 |
| **Escopo** | Repositório `my-state-machine` (Next.js + Convex + XState) |

## 1. Resumo

Este RFC descreve o **aplicativo de controle de movimentação de materiais** entre armazém, fornecedores e destinos (sites), modelado de forma **state-machine-first**: recibos e remessas têm estados explícitos e transições validadas no backend (Convex). O armazém é a fonte de verdade para estoque; eventos de inventário são **append-only**; um snapshot derivado acelera consultas e suporta **custo médio ponderado (WAC)** simplificado.

A UI atual (Next.js) é um **painel operacional mínimo** que chama mutações Convex; simuladores XState existem como **espelho de design** e ainda não orquestram a UI.

## 2. Motivação e objetivos

### 2.1 Problema

Operações reais de armazém envolvem documentos com várias linhas, estados intermediários (pendente, aceito, enviado, entregue, cancelado) e regras que, se ficarem implícitas, geram inconsistência de estoque e auditoria fraca.

### 2.2 Objetivos do produto

- Tornar **estados e transições** parte explícita do domínio.
- Garantir que **mudanças de estoque do armazém** ocorram apenas por eventos nomeados (entrada, saída, reversão, ajuste).
- Permitir **aceitar operações sem custo completo**, preenchendo custo de forma best-effort e marcando estimativa/fonte.
- Manter **rastreabilidade** (referência a documento, utilizador; evolução futura para auditoria rica).

A visão alinhada ao projeto está em `AGENTS.md` (invariantes e roadmap de módulos). Este RFC consolida **o que já está implementado** versus **o que o guia ainda exige**.

## 3. Stack e topologia

| Camada | Tecnologia | Papel |
|--------|------------|--------|
| Frontend | Next.js 16, React 19, Tailwind 4 | Páginas, formulários, `useQuery` / `useMutation` Convex |
| Backend | Convex | Schema, queries, mutations, funções internas |
| Estado (design / futuro UI) | XState 5 | `receiptMachine`, `shipmentMachine` em `lib/machines/` |
| Linguagem | TypeScript 5.9 | Tipagem compartilhada via `_generated` |

**Fluxo de dados:** o cliente React subscreve queries Convex e invoca mutations. Não há duplicação da verdade de domínio na UI além do estado de formulário local.

## 4. Domínio: documentos e invariantes implementados

### 4.1 Recibo (receipt)

- **Estados:** `PendingReceipt` → `Accepted` \| `Returned` \| `Discarded`.
- **Criação:** `createReceipt` insere cabeçalho + linhas; custo nas linhas é opcional.
- **Aceitação:** `acceptReceipt` só a partir de `PendingReceipt`; aplica `RegisteredIn` por linha (quantidade efetiva = contagem opcional ou `qty`); auto-preenche custo com `material_avg` do snapshot ou `unknown` + `isEstimated`.
- **Retorno / descarte:** não alteram inventário (coerente com “só aceite aplica entrada”).

### 4.2 Remessa (shipment)

- **Estados:** `RegisteredOut` → `PendingShipment` → `DeliveredConfirmed`; ou cancelamento: `CanceledBeforeLeave` → `ReversalApplied`.
- **Criação:** `createShipment` verifica stock por linha, insere documento em `RegisteredOut` e aplica `RegisteredOut` (saída) por linha.
- **Stage:** `RegisteredOut` → `PendingShipment` (sem evento de inventário adicional).
- **Entrega:** `confirmDelivery` aceita contagens opcionais nas linhas; **não** cria eventos de inventário (alinhado à invariante: confirmação de entrega não altera armazém após `RegisteredOut`).
- **Cancelamento antes de sair:** `cancelBeforeLeave` aplica `Reversal` por linha e termina em `ReversalApplied`.

### 4.3 Inventário (armazém)

- **Tabelas:** `inventoryEvents` (tipos `RegisteredIn`, `RegisteredOut`, `Reversal`, `InventoryAdjust`), `costEvents`, `inventorySnapshot`.
- **Atualização:** mutações internas em `convex/inventory.ts` recalculam snapshot por material a partir da soma de `qtyDelta` e de uma aproximação de WAC via `costEvents` ligados a eventos de entrada positivos.
- **Reconciliação:** existe `reconcile` (internal) para `InventoryAdjust`; não está exposta na UI nem documentada como API pública de produto neste RFC.

## 5. Modelo de dados (schema Convex)

Resumo das tabelas em `convex/schema.ts`:

- **`receipts` / `receiptLines`:** ciclo de vida do recibo e linhas com custo, `costSource`, `isEstimated`, `countedQty`.
- **`shipments` / `shipmentLines`:** destino (`toSiteId`), estado, linhas com `countedQty` opcional na entrega.
- **`inventoryEvents`:** ledger append-only com `refType` / `refId` / `userId`.
- **`costEvents`:** proveniência de custo por material, opcionalmente ligada a um `inventoryEvent`.
- **`inventorySnapshot`:** `qtyOnHand`, `avgCost`, `totalValue`, `updatedAt` por `materialId`.

**Nota:** `materialId`, `toSiteId` e `sourceType` são strings livres no protótipo; entidades `materials`, `sites`, `suppliers` podem ser introduzidas num RFC futuro.

## 6. API pública Convex (contrato atual)

| Módulo | Tipo | Função | Descrição breve |
|--------|------|--------|------------------|
| `receipts` | query | `list` | Recibos com linhas |
| `receipts` | mutation | `createReceipt` | Novo `PendingReceipt` + linhas |
| `receipts` | mutation | `acceptReceipt` | → `Accepted` + `RegisteredIn` |
| `receipts` | mutation | `returnReceipt` | → `Returned` |
| `receipts` | mutation | `discardReceipt` | → `Discarded` |
| `shipments` | query | `list` | Remessas com linhas |
| `shipments` | mutation | `createShipment` | `RegisteredOut` + saídas |
| `shipments` | mutation | `stageShipment` | → `PendingShipment` |
| `shipments` | mutation | `confirmDelivery` | → `DeliveredConfirmed` |
| `shipments` | mutation | `cancelBeforeLeave` | reversão + `ReversalApplied` |
| `inventory` | query | `getStock` | Snapshots |

Funções **internas** (`applyRegisteredIn`, `applyRegisteredOut`, `applyReversal`, `reconcile`) não fazem parte da API pública gerada para o cliente.

## 7. XState (simulador / design)

- **`lib/machines/receiptMachine.ts`:** estados finais para `Accepted`, `Returned`, `Discarded`; eventos `ACCEPT`, `RETURN`, `DISCARD`.
- **`lib/machines/shipmentMachine.ts`:** permite `CONFIRM_DELIVERY` e `CANCEL` a partir de `RegisteredOut` ou `PendingShipment`; inclui `CanceledBeforeLeave` → `APPLY_REVERSAL` → `ReversalApplied`.

**Divergência intencional a documentar:** no backend, reversão e transição para `ReversalApplied` ocorrem **numa única** mutation `cancelBeforeLeave`; a máquina XState separa cancelamento e aplicação de reversão para **clareza de design e testes de cenário**.

**Gap:** a página `app/page.tsx` **não** importa nem usa estas máquinas; o alinhamento UI–máquina–Convex é trabalho futuro.

## 8. Interface do utilizador

- **`app/page.tsx`:** dashboard com snapshot de stock, painel de recibos (criar, aceitar, devolver, descartar) e remessas (criar, stage, deliver, cancel).
- **`components/ConvexClientProvider.tsx`:** cliente Convex com `NEXT_PUBLIC_CONVEX_URL`.

Não há autenticação nem substituição de `userId: "system"` nas mutações internas de inventário.

## 9. Lacunas em relação a `AGENTS.md` (backlog de domínio)

As seguintes capacidades estão **especificadas no guia do projeto** mas **ausentes ou parciais** no código atual:

1. **Sites:** ledger de stock local (`SiteReceiptConfirmed`, consumo, devolução, ajuste); `confirmDelivery` não materializa receção no site.
2. **Fornecedor / preços:** `supplierPrices`, auto-fill `supplier_last` antes de `material_avg`.
3. **API de reconciliação:** exposição controlada de `reconcile` com motivo e permissões.
4. **Auditoria rica:** metadados `who/when/why` consistentes (hoje `userId` fixo em vários caminhos).
5. **Autorização:** permissões centrais em todas as mutações.
6. **Falhas de negócio:** padrão `{ ok: false, reason }` vs `throw` para erros esperados (ex.: stock insuficiente).
7. **Invariantes rígidos:** validação de stock negativo após eventos; testes automatizados (simulador + Convex) mencionados no guia.
8. **Correções de custo:** tabelas `costEdits` / política de edição auditável pós-aceitação.
9. **Uso das máquinas XState** na UI e testes de cenários obrigatórios.

Este RFC **não** altera prioridades; serve para rastreio entre especificação e implementação.

## 10. Decisões e trade-offs

| Decisão | Justificação |
|---------|--------------|
| Snapshot recalculado a partir do ledger | Simplicidade e correção eventual por reprocessamento; custo O(n) por material em cada evento. |
| WAC simplificado via `costEvents` | Adequado a protótipo; pode precisar refinamento para saídas e ajustes de custo. |
| `createShipment` falha com `throw` se stock insuficiente | Comportamento atual; produto pode preferir resultado estruturado. |
| Strings para IDs de material e site | Velocidade de protótipo; normalização futura em tabelas de referência. |

## 11. Segurança e operações

- Variável de ambiente **`NEXT_PUBLIC_CONVEX_URL`** necessária para o cliente.
- Todas as funções públicas Convex estão expostas à internet conforme modelo Convex; **não há** camada de auth neste repositório.
- Recomendação: antes de produção, restringir chamadas (auth Convex), validar `userId` a partir do contexto autenticado e rever exposição de `list` sem paginação.

## 12. Como evoluir este RFC

- **RFC filhos sugeridos:** (a) módulo `sites/` e eventos de receção no local; (b) valuation e `supplierPrices`; (c) autorização e auditoria; (d) testes e CI para invariantes.
- Manter **uma única fonte de verdade** no Convex; atualizar este documento quando transições ou schema mudarem de forma compatível ou com versão de API.

## 13. Referências no repositório

- `AGENTS.md` — invariantes e visão do produto.
- `convex/schema.ts`, `convex/receipts.ts`, `convex/shipments.ts`, `convex/inventory.ts`.
- `lib/machines/receiptMachine.ts`, `lib/machines/shipmentMachine.ts`.
- `app/page.tsx` — UI principal.

---

*Fim do RFC 0001.*
