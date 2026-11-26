import type { Infer } from "convex/values";
import { DAY_MS, weekStartOf } from "@rlpapp/shared/compras/priceReference";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { quoteFreight } from "../../schema/procurement";
import { normalizeUnit } from "./catalog";
import { isComparableUnit, supplierKeyOf } from "./priceHistory";
import { isSupplierQuote } from "./priceSelection";
import { normalizeText } from "../kernel/text";
import { MAX_PROPOSAL_LINES, proposalSupplierKey } from "./quoteProposalRules";

/**
 * Leitura das propostas e da rodada semanal: uma proposta com as linhas, a
 * lista de semanas com preços e o mapa de uma semana (fornecedor × material).
 * Preços lançados sem proposta (priceEvents.add, importações) também entram
 * na semana em que ocorreram, para que um histórico retroativo funcione sem
 * propostas. Estimativas digitadas no takeoff ficam de fora: não são cotação.
 */

/**
 * Preços lidos de uma semana. Uma rodada real tem dezenas; acima disso a
 * resposta marca `truncated` e mostra os mais recentes.
 */
const WEEK_EVENT_LIMIT = 2000;
/** Semanas por página da lista (cada uma lida inteira, até WEEK_COUNT_LIMIT). */
const MAX_WEEKS_PER_PAGE = 20;
const WEEK_COUNT_LIMIT = 1000;

type Freight = Infer<typeof quoteFreight>;

async function supplierNames(
  ctx: QueryCtx,
  ids: Iterable<Id<"suppliers">>
): Promise<Map<Id<"suppliers">, string>> {
  const names = new Map<Id<"suppliers">, string>();
  for (const id of new Set(ids)) {
    const supplier = await ctx.db.get("suppliers", id);
    if (supplier) names.set(id, supplier.name);
  }
  return names;
}

function supplierLabel(
  names: Map<Id<"suppliers">, string>,
  supplierId: Id<"suppliers"> | undefined,
  supplierNameRaw: string | undefined
): string {
  return (
    (supplierId ? names.get(supplierId) : undefined) ??
    supplierNameRaw ??
    "Fornecedor desconhecido"
  );
}

export type QuoteProposalSummary = {
  _id: Id<"quoteProposals">;
  supplierId: Id<"suppliers"> | null;
  supplierName: string;
  receivedAt: number;
  weekStart: number;
  validUntil: number | null;
  paymentTerms: string | null;
  freight: Freight | null;
  reference: string | null;
  projectId: Id<"projects"> | null;
  takeoffId: Id<"takeoffs"> | null;
  notes: string | null;
};

function toSummary(
  proposal: Doc<"quoteProposals">,
  names: Map<Id<"suppliers">, string>
): QuoteProposalSummary {
  return {
    _id: proposal._id,
    supplierId: proposal.supplierId ?? null,
    supplierName: supplierLabel(names, proposal.supplierId, proposal.supplierNameRaw),
    receivedAt: proposal.receivedAt,
    weekStart: proposal.weekStart,
    validUntil: proposal.validUntil ?? null,
    paymentTerms: proposal.paymentTerms ?? null,
    freight: proposal.freight ?? null,
    reference: proposal.reference ?? null,
    projectId: proposal.projectId ?? null,
    takeoffId: proposal.takeoffId ?? null,
    notes: proposal.notes ?? null,
  };
}

/** Proposta com as linhas (preços) que ela trouxe. */
export async function getQuoteProposal(
  ctx: QueryCtx,
  proposalId: Id<"quoteProposals">
) {
  const proposal = await ctx.db.get("quoteProposals", proposalId);
  if (!proposal) return null;
  const names = await supplierNames(ctx, proposal.supplierId ? [proposal.supplierId] : []);
  // Todo caminho de ligação respeita MAX_PROPOSAL_LINES (quoteProposalRules).
  const events = await ctx.db
    .query("priceEvents")
    .withIndex("by_quote_proposal", (q) => q.eq("quoteProposalId", proposalId))
    .take(MAX_PROPOSAL_LINES);
  const lines = [];
  for (const event of events) {
    const material = event.materialId
      ? await ctx.db.get("materials", event.materialId)
      : null;
    lines.push({
      priceEventId: event._id,
      materialId: event.materialId ?? null,
      materialName: material?.name ?? null,
      variantLabel: material?.variantLabel ?? null,
      rawDescription: event.rawDescription ?? null,
      unitPriceCents: event.unitPriceCents,
      unit: event.unit ?? null,
      quantity: event.quantity ?? null,
      needsReview: event.needsReview,
      reviewStatus: event.reviewStatus ?? null,
    });
  }
  return { ...toSummary(proposal, names), lines };
}

/** Propostas recentes, mais novas primeiro. */
export async function listQuoteProposals(
  ctx: QueryCtx,
  input: { supplierId?: Id<"suppliers">; limit?: number }
): Promise<QuoteProposalSummary[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const proposals = input.supplierId
    ? await ctx.db
        .query("quoteProposals")
        .withIndex("by_supplier", (q) => q.eq("supplierId", input.supplierId))
        .order("desc")
        .take(limit)
    : await ctx.db
        .query("quoteProposals")
        .withIndex("by_week_start")
        .order("desc")
        .take(limit);
  const names = await supplierNames(
    ctx,
    proposals.flatMap((p) => (p.supplierId ? [p.supplierId] : []))
  );
  return proposals
    .map((proposal) => toSummary(proposal, names))
    .sort((a, b) => b.receivedAt - a.receivedAt);
}

/**
 * Semanas com preços, mais recentes primeiro, cada uma lida inteira. Página
 * por cursor: `before` (início exclusivo da próxima página) e, na resposta,
 * `continueBefore` para pedir as semanas anteriores (null quando acabou).
 */
export async function listQuoteWeeks(
  ctx: QueryCtx,
  input: { now: number; limit?: number; before?: number }
) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), MAX_WEEKS_PER_PAGE);
  let cursor = Math.min(input.before ?? Number.MAX_SAFE_INTEGER, input.now + 1);
  const weeks = [];
  // Semanas só com estimativas ou preços descartados não contam, mas também
  // custam leituras: no máximo 2 × limit semanas por página.
  for (let visited = 0; weeks.length < limit && visited < limit * 2; visited++) {
    const latest = await ctx.db
      .query("priceEvents")
      .withIndex("by_occurred_at", (q) => q.lt("occurredAt", cursor))
      .order("desc")
      .first();
    if (!latest) {
      return { weeks, continueBefore: null };
    }
    const weekStart = weekStartOf(latest.occurredAt);
    const read = await ctx.db
      .query("priceEvents")
      .withIndex("by_occurred_at", (q) =>
        q.gte("occurredAt", weekStart).lt("occurredAt", Math.min(weekStart + 7 * DAY_MS, cursor))
      )
      .take(WEEK_COUNT_LIMIT);
    cursor = weekStart;
    const truncated = read.length === WEEK_COUNT_LIMIT;
    const quotes = read.filter(isSupplierQuote);
    // Só estimativas ou descartados: a semana não é uma rodada. Mas uma semana
    // cortada pode ter cotações além da leitura, então entra marcada.
    if (quotes.length === 0 && !truncated) continue;
    weeks.push({
      weekStart,
      priceCount: quotes.length,
      supplierCount: new Set(quotes.map(supplierKeyOf)).size,
      materialCount: new Set(
        quotes.map((e) => e.materialId ?? `raw:${normalizeText(e.rawDescription ?? "")}`)
      ).size,
      proposalCount: new Set(quotes.flatMap((e) => (e.quoteProposalId ? [e.quoteProposalId] : [])))
        .size,
      truncated,
    });
  }
  return { weeks, continueBefore: cursor };
}

/**
 * Mapa da rodada: os preços da semana que contém `weekStart`, uma coluna por
 * fornecedor e uma linha por material, com o preço mais recente de cada
 * fornecedor na semana. Preços em unidade diferente da do material (caixa,
 * rolo) ficam numa linha própria, para não comparar preço por peça com preço
 * por caixa. A referência de cada material vem de priceEvents.materialReference.
 */
export async function getQuoteWeek(
  ctx: QueryCtx,
  input: { weekStart: number; now: number }
) {
  const weekStart = weekStartOf(input.weekStart);
  const weekEnd = weekStart + 7 * DAY_MS;

  const proposals = await ctx.db
    .query("quoteProposals")
    .withIndex("by_week_start", (q) => q.eq("weekStart", weekStart))
    .take(200);
  const read = await ctx.db
    .query("priceEvents")
    .withIndex("by_occurred_at", (q) =>
      q.gte("occurredAt", weekStart).lt("occurredAt", weekEnd)
    )
    .order("desc")
    .take(WEEK_EVENT_LIMIT);
  const events = read.filter(isSupplierQuote);

  const names = await supplierNames(ctx, [
    ...proposals.flatMap((p) => (p.supplierId ? [p.supplierId] : [])),
    ...events.flatMap((e) => (e.supplierId ? [e.supplierId] : [])),
  ]);

  // Colunas: um fornecedor cada, com as propostas dele na semana.
  type Column = {
    supplierKey: string;
    supplierId: Id<"suppliers"> | null;
    supplierName: string;
    proposals: QuoteProposalSummary[];
    priceCount: number;
    firstAt: number;
    lastAt: number;
  };
  const columns = new Map<string, Column>();
  const columnFor = (
    key: string,
    supplierId: Id<"suppliers"> | undefined,
    supplierNameRaw: string | undefined,
    at: number
  ) => {
    let column = columns.get(key);
    if (!column) {
      column = {
        supplierKey: key,
        supplierId: supplierId ?? null,
        supplierName: supplierLabel(names, supplierId, supplierNameRaw),
        proposals: [],
        priceCount: 0,
        firstAt: at,
        lastAt: at,
      };
      columns.set(key, column);
    }
    column.firstAt = Math.min(column.firstAt, at);
    column.lastAt = Math.max(column.lastAt, at);
    return column;
  };
  for (const proposal of proposals) {
    columnFor(
      proposalSupplierKey(proposal),
      proposal.supplierId,
      proposal.supplierNameRaw,
      proposal.receivedAt
    ).proposals.push(toSummary(proposal, names));
  }

  const materials = new Map<Id<"materials">, Doc<"materials"> | null>();
  const materialOf = async (id: Id<"materials">) => {
    if (!materials.has(id)) materials.set(id, await ctx.db.get("materials", id));
    return materials.get(id) ?? null;
  };

  // Linhas: um material (na unidade dele, ou numa outra unidade) ou uma
  // descrição sem material.
  type Cell = {
    supplierKey: string;
    priceEventId: Id<"priceEvents">;
    quoteProposalId: Id<"quoteProposals"> | null;
    unitPriceCents: number;
    unit: string | null;
    quantity: number | null;
    occurredAt: number;
    needsReview: boolean;
  };
  type Row = {
    rowKey: string;
    material: Doc<"materials"> | null;
    rawDescription: string | null;
    unit: string | null;
    /** Mesma unidade do material: a linha que compara com a referência. */
    materialUnit: boolean;
    cells: Map<string, Cell>;
  };
  const rows = new Map<string, Row>();
  for (const event of events) {
    const supplierKey = supplierKeyOf(event);
    columnFor(supplierKey, event.supplierId, event.supplierNameRaw, event.occurredAt)
      .priceCount += 1;
    const material = event.materialId ? await materialOf(event.materialId) : null;
    const unit = normalizeUnit(event.unit) ?? null;
    // Sem unidade cadastrada no material, cada unidade dos preços vira uma
    // linha (un e cx não disputam o menor); só a linha sem unidade fica como
    // a do material.
    const materialUnit = !material
      ? false
      : normalizeUnit(material.unit)
        ? isComparableUnit(event.unit, material.unit)
        : unit === null;
    const rowKey = material
      ? materialUnit
        ? `id:${material._id}`
        : `id:${material._id}|${(unit ?? "").toLowerCase()}`
      : `raw:${normalizeText(event.rawDescription ?? "")}|${(unit ?? "").toLowerCase()}`;
    let row = rows.get(rowKey);
    if (!row) {
      row = {
        rowKey,
        material,
        rawDescription: event.rawDescription ?? null,
        unit: materialUnit ? (normalizeUnit(material?.unit) ?? unit) : unit,
        materialUnit,
        cells: new Map(),
      };
      rows.set(rowKey, row);
    }
    // `events` vem do mais recente para o mais antigo: fica o primeiro visto.
    if (!row.cells.has(supplierKey)) {
      row.cells.set(supplierKey, {
        supplierKey,
        priceEventId: event._id,
        quoteProposalId: event.quoteProposalId ?? null,
        unitPriceCents: event.unitPriceCents,
        unit: event.unit ?? null,
        quantity: event.quantity ?? null,
        occurredAt: event.occurredAt,
        needsReview: event.needsReview,
      });
    }
  }

  const familyNames = new Map<Id<"materialFamilies">, string>();
  const rowViews = [];
  for (const row of rows.values()) {
    const material = row.material;
    let familyName: string | null = null;
    if (material?.familyId) {
      if (!familyNames.has(material.familyId)) {
        const family = await ctx.db.get("materialFamilies", material.familyId);
        familyNames.set(material.familyId, family?.name ?? "");
      }
      familyName = familyNames.get(material.familyId) || null;
    }
    const cells = [...row.cells.values()].sort(
      (a, b) => a.unitPriceCents - b.unitPriceCents
    );
    rowViews.push({
      rowKey: row.rowKey,
      materialId: material?._id ?? null,
      materialName: material?.name ?? null,
      variantLabel: material?.variantLabel ?? null,
      familyId: material?.familyId ?? null,
      familyName,
      rawDescription: row.rawDescription,
      unit: row.unit,
      materialUnit: row.materialUnit,
      quantity: Math.max(0, ...cells.map((cell) => cell.quantity ?? 0)) || null,
      cheapestSupplierKey: cells.length > 1 ? cells[0]!.supplierKey : null,
      cells,
    });
  }
  const label = (r: {
    familyName: string | null;
    materialName: string | null;
    rawDescription: string | null;
  }) => r.familyName ?? r.materialName ?? r.rawDescription ?? "";
  rowViews.sort(
    (a, b) =>
      label(a).localeCompare(label(b), "pt-BR") ||
      (a.materialName ?? a.rawDescription ?? "").localeCompare(
        b.materialName ?? b.rawDescription ?? "",
        "pt-BR"
      ) ||
      Number(b.materialUnit) - Number(a.materialUnit)
  );

  return {
    weekStart,
    weekEnd,
    /** Mais preços na semana do que uma leitura traz: o mapa mostra os mais recentes. */
    truncated: read.length === WEEK_EVENT_LIMIT,
    columns: [...columns.values()].sort((a, b) => a.firstAt - b.firstAt),
    rows: rowViews,
  };
}
