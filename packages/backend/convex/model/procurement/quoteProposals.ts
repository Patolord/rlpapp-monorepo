import type { Infer } from "convex/values";
import {
  DAY_MS,
  REFERENCE_WINDOW_DAYS,
  referenceStats,
  weekStartOf,
} from "@rlpapp/shared/compras/priceReference";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import type { priceEventSource, quoteFreight } from "../../schema/procurement";
import { addPriceEvent } from "./priceEventReview";
import {
  isComparableUnit,
  materialEventsBetween,
  supplierKeyOf,
} from "./priceHistory";
import { isUsablePriceEvent } from "./priceSelection";
import { normalizeText } from "./pricing";

/**
 * Propostas de fornecedor e a rodada semanal que as compara.
 *
 * Uma proposta é o que um fornecedor mandou de uma vez (data, validade,
 * condição, frete); cada linha vira um priceEvent ligado a ela. Propostas da
 * mesma semana (segunda a domingo) formam a rodada: o mapa da semana põe lado a
 * lado o preço de cada fornecedor para o mesmo material. Preços lançados sem
 * proposta (priceEvents.add, importações) também entram no mapa da semana em
 * que ocorreram, para que um histórico retroativo funcione sem propostas.
 */

const MAX_LINES = 200;
const WEEK_EVENT_WINDOW = 1000;
const RECENT_WEEKS_EVENT_WINDOW = 2000;
// Cotações de um material dentro dos 6 meses da referência.
const MATERIAL_REFERENCE_WINDOW = 500;

type Freight = Infer<typeof quoteFreight>;
type PriceEventSource = Infer<typeof priceEventSource>;

export type QuoteProposalLineInput = {
  materialId?: Id<"materials">;
  rawDescription?: string;
  unitPriceCents: number;
  unit?: string;
  quantity?: number;
  notes?: string;
};

export type CreateQuoteProposalInput = {
  supplierId?: Id<"suppliers">;
  supplierNameRaw?: string;
  receivedAt: number;
  validUntil?: number;
  paymentTerms?: string;
  freight?: Freight;
  reference?: string;
  projectId?: Id<"projects">;
  takeoffId?: Id<"takeoffs">;
  notes?: string;
  source?: PriceEventSource;
  lines: QuoteProposalLineInput[];
};

const trimmed = (value: string | undefined) => value?.trim() || undefined;

async function assertSupplier(
  ctx: QueryCtx,
  supplierId: Id<"suppliers"> | undefined,
  supplierNameRaw: string | undefined
) {
  if (supplierId) {
    const supplier = await ctx.db.get("suppliers", supplierId);
    if (!supplier) throw new Error("Fornecedor não encontrado");
    return;
  }
  if (!supplierNameRaw?.trim()) {
    throw new Error("Informe o fornecedor (supplierId ou supplierNameRaw)");
  }
}

function assertValidity(receivedAt: number, validUntil: number | undefined) {
  if (validUntil !== undefined && validUntil < receivedAt) {
    throw new Error("A validade não pode ser anterior à data da proposta");
  }
}

/**
 * Uma proposta com número (`reference`) só entra uma vez por fornecedor: quem
 * lança histórico retroativo pode repetir a carga sem duplicar preços.
 */
async function assertNotDuplicate(
  ctx: QueryCtx,
  supplierId: Id<"suppliers"> | undefined,
  reference: string | undefined
) {
  if (!supplierId || !reference) return;
  const wanted = normalizeText(reference);
  for await (const proposal of ctx.db
    .query("quoteProposals")
    .withIndex("by_supplier", (q) => q.eq("supplierId", supplierId))) {
    if (proposal.reference && normalizeText(proposal.reference) === wanted) {
      throw new Error(
        `Proposta ${reference} deste fornecedor já registrada (${proposal._id})`
      );
    }
  }
}

/** Grava a proposta e um priceEvent por linha, tudo na mesma transação. */
export async function createQuoteProposal(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CreateQuoteProposalInput
): Promise<{
  proposalId: Id<"quoteProposals">;
  priceEventIds: Id<"priceEvents">[];
}> {
  await assertSupplier(ctx, input.supplierId, input.supplierNameRaw);
  assertValidity(input.receivedAt, input.validUntil);
  if (input.lines.length === 0) {
    throw new Error("A proposta precisa de ao menos um preço");
  }
  if (input.lines.length > MAX_LINES) {
    throw new Error(`No máximo ${MAX_LINES} linhas por proposta`);
  }
  for (const line of input.lines) {
    if (!line.materialId && !line.rawDescription?.trim()) {
      throw new Error("Cada linha precisa de material ou descrição");
    }
  }

  const now = Date.now();
  const supplierNameRaw = input.supplierId
    ? undefined
    : trimmed(input.supplierNameRaw);
  await assertNotDuplicate(ctx, input.supplierId, trimmed(input.reference));
  const proposalId = await ctx.db.insert("quoteProposals", {
    supplierId: input.supplierId,
    supplierNameRaw,
    receivedAt: input.receivedAt,
    weekStart: weekStartOf(input.receivedAt),
    validUntil: input.validUntil,
    paymentTerms: trimmed(input.paymentTerms),
    freight: input.freight,
    reference: trimmed(input.reference),
    projectId: input.projectId,
    takeoffId: input.takeoffId,
    notes: trimmed(input.notes),
    createdAt: now,
    createdByUserId: user._id,
  });

  const priceEventIds: Id<"priceEvents">[] = [];
  for (const line of input.lines) {
    priceEventIds.push(
      await addPriceEvent(ctx, user, {
        materialId: line.materialId,
        rawDescription: line.rawDescription,
        supplierId: input.supplierId,
        supplierNameRaw,
        unitPriceCents: line.unitPriceCents,
        unit: line.unit,
        quantity: line.quantity,
        source: input.source ?? "quote",
        occurredAt: input.receivedAt,
        validUntil: input.validUntil,
        projectId: input.projectId,
        takeoffId: input.takeoffId,
        notes: line.notes,
        quoteProposalId: proposalId,
      })
    );
  }

  await logAudit(ctx, user, {
    action: "create",
    tableName: "quoteProposals",
    recordId: proposalId,
  });
  return { proposalId, priceEventIds };
}

export type UpdateQuoteProposalInput = {
  proposalId: Id<"quoteProposals">;
  supplierId?: Id<"suppliers">;
  supplierNameRaw?: string;
  receivedAt?: number;
  /** null apaga a validade. */
  validUntil?: number | null;
  paymentTerms?: string;
  freight?: Freight | null;
  reference?: string;
  projectId?: Id<"projects"> | null;
  notes?: string;
};

/**
 * Corrige os dados da proposta. Fornecedor, data e validade valem para todas
 * as linhas: os priceEvents ligados acompanham.
 */
export async function updateQuoteProposal(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: UpdateQuoteProposalInput
): Promise<void> {
  const proposal = await ctx.db.get("quoteProposals", input.proposalId);
  if (!proposal) throw new Error("Proposta não encontrada");

  const supplierChanged =
    input.supplierId !== undefined || input.supplierNameRaw !== undefined;
  const supplierId = supplierChanged ? input.supplierId : proposal.supplierId;
  const supplierNameRaw = supplierChanged
    ? supplierId
      ? undefined
      : trimmed(input.supplierNameRaw)
    : proposal.supplierNameRaw;
  if (supplierChanged) await assertSupplier(ctx, supplierId, supplierNameRaw);

  const receivedAt = input.receivedAt ?? proposal.receivedAt;
  const validUntil =
    input.validUntil === undefined
      ? proposal.validUntil
      : (input.validUntil ?? undefined);
  assertValidity(receivedAt, validUntil);

  await ctx.db.patch("quoteProposals", proposal._id, {
    supplierId,
    supplierNameRaw,
    receivedAt,
    weekStart: weekStartOf(receivedAt),
    validUntil,
    paymentTerms:
      input.paymentTerms === undefined
        ? proposal.paymentTerms
        : trimmed(input.paymentTerms),
    freight:
      input.freight === undefined
        ? proposal.freight
        : (input.freight ?? undefined),
    reference:
      input.reference === undefined
        ? proposal.reference
        : trimmed(input.reference),
    projectId:
      input.projectId === undefined
        ? proposal.projectId
        : (input.projectId ?? undefined),
    notes: input.notes === undefined ? proposal.notes : trimmed(input.notes),
    updatedAt: Date.now(),
  });

  if (
    supplierChanged ||
    input.receivedAt !== undefined ||
    input.validUntil !== undefined
  ) {
    const events = await ctx.db
      .query("priceEvents")
      .withIndex("by_quote_proposal", (q) =>
        q.eq("quoteProposalId", proposal._id)
      )
      .take(MAX_LINES * 2);
    for (const event of events) {
      await ctx.db.patch("priceEvents", event._id, {
        supplierId,
        supplierNameRaw,
        occurredAt: receivedAt,
        validUntil,
      });
    }
  }

  await logAudit(ctx, user, {
    action: "update",
    tableName: "quoteProposals",
    recordId: proposal._id,
  });
}

/**
 * Liga preços já lançados a uma proposta (histórico retroativo: os preços
 * entraram um a um e depois se descobre que vieram da mesma proposta). O
 * fornecedor do preço precisa ser o da proposta; a data e a validade passam a
 * ser as da proposta.
 */
export async function linkPriceEventsToProposal(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    proposalId: Id<"quoteProposals">;
    priceEventIds: Id<"priceEvents">[];
  }
): Promise<number> {
  const proposal = await ctx.db.get("quoteProposals", input.proposalId);
  if (!proposal) throw new Error("Proposta não encontrada");
  if (input.priceEventIds.length > MAX_LINES) {
    throw new Error(`No máximo ${MAX_LINES} preços por chamada`);
  }
  const proposalSupplier = supplierKeyOf({
    _id: "" as Id<"priceEvents">,
    supplierId: proposal.supplierId,
    supplierNameRaw: proposal.supplierNameRaw,
  });

  let linked = 0;
  for (const eventId of input.priceEventIds) {
    const event = await ctx.db.get("priceEvents", eventId);
    if (!event) throw new Error(`Preço ${eventId} não encontrado`);
    if (event.quoteProposalId === proposal._id) continue;
    const eventSupplier = supplierKeyOf(event);
    if (eventSupplier !== proposalSupplier) {
      throw new Error(
        `O preço ${eventId} é de outro fornecedor que o da proposta`
      );
    }
    await ctx.db.patch("priceEvents", eventId, {
      quoteProposalId: proposal._id,
      supplierId: proposal.supplierId,
      supplierNameRaw: proposal.supplierNameRaw,
      occurredAt: proposal.receivedAt,
      validUntil: proposal.validUntil,
    });
    linked += 1;
  }

  if (linked > 0) {
    await logAudit(ctx, user, {
      action: "update",
      tableName: "quoteProposals",
      recordId: proposal._id,
    });
  }
  return linked;
}

// --- Leitura ---

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
    supplierName: supplierLabel(
      names,
      proposal.supplierId,
      proposal.supplierNameRaw
    ),
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
  const names = await supplierNames(
    ctx,
    proposal.supplierId ? [proposal.supplierId] : []
  );
  const events = await ctx.db
    .query("priceEvents")
    .withIndex("by_quote_proposal", (q) => q.eq("quoteProposalId", proposalId))
    .take(MAX_LINES * 2);
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

/** Semanas com preços lançados, mais recentes primeiro (para a lista de rodadas). */
export async function listQuoteWeeks(
  ctx: QueryCtx,
  input: { now: number; limit?: number }
) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const events = await ctx.db
    .query("priceEvents")
    .withIndex("by_occurred_at", (q) => q.lte("occurredAt", input.now))
    .order("desc")
    .take(RECENT_WEEKS_EVENT_WINDOW);

  type Week = {
    weekStart: number;
    priceCount: number;
    suppliers: Set<string>;
    materials: Set<string>;
    proposals: Set<string>;
  };
  const weeks = new Map<number, Week>();
  for (const event of events) {
    if (!isUsablePriceEvent(event)) continue;
    const weekStart = weekStartOf(event.occurredAt);
    let week = weeks.get(weekStart);
    if (!week) {
      if (weeks.size >= limit) continue;
      week = {
        weekStart,
        priceCount: 0,
        suppliers: new Set(),
        materials: new Set(),
        proposals: new Set(),
      };
      weeks.set(weekStart, week);
    }
    week.priceCount += 1;
    week.suppliers.add(supplierKeyOf(event));
    week.materials.add(event.materialId ?? `raw:${event.rawDescription ?? ""}`);
    if (event.quoteProposalId) week.proposals.add(event.quoteProposalId);
  }
  return [...weeks.values()]
    .sort((a, b) => b.weekStart - a.weekStart)
    .map((week) => ({
      weekStart: week.weekStart,
      priceCount: week.priceCount,
      supplierCount: week.suppliers.size,
      materialCount: week.materials.size,
      proposalCount: week.proposals.size,
    }));
}

/** Mediana dos últimos 6 meses do material, na unidade dele (null sem preço). */
async function materialReferenceCents(
  ctx: QueryCtx,
  material: Doc<"materials">,
  now: number
): Promise<number | null> {
  const events = await materialEventsBetween(
    ctx,
    material._id,
    now - REFERENCE_WINDOW_DAYS * DAY_MS,
    now,
    MATERIAL_REFERENCE_WINDOW
  );
  const samples = events
    .filter(
      (event) =>
        isUsablePriceEvent(event) && isComparableUnit(event.unit, material.unit)
    )
    .map((event) => ({
      unitPriceCents: event.unitPriceCents,
      occurredAt: event.occurredAt,
      supplierKey: supplierKeyOf(event),
      supplierName: "",
    }));
  return referenceStats(samples, now)?.medianCents ?? null;
}

/**
 * Mapa da rodada: todos os preços da semana de `weekStart`, uma coluna por
 * fornecedor e uma linha por material, com a referência (mediana de 6 meses)
 * ao lado. Na mesma semana vale o preço mais recente de cada fornecedor.
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
  const events = (
    await ctx.db
      .query("priceEvents")
      .withIndex("by_occurred_at", (q) =>
        q.gte("occurredAt", weekStart).lt("occurredAt", weekEnd)
      )
      .take(WEEK_EVENT_WINDOW)
  ).filter(isUsablePriceEvent);

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
    const key = supplierKeyOf({
      _id: "" as Id<"priceEvents">,
      supplierId: proposal.supplierId,
      supplierNameRaw: proposal.supplierNameRaw,
    });
    columnFor(
      key,
      proposal.supplierId,
      proposal.supplierNameRaw,
      proposal.receivedAt
    ).proposals.push(toSummary(proposal, names));
  }

  // Linhas: um material (ou descrição sem material) cada.
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
    materialId: Id<"materials"> | null;
    rawDescription: string | null;
    cells: Map<string, Cell>;
  };
  const rows = new Map<string, Row>();
  for (const event of events) {
    const supplierKey = supplierKeyOf(event);
    columnFor(
      supplierKey,
      event.supplierId,
      event.supplierNameRaw,
      event.occurredAt
    ).priceCount += 1;
    const rowKey = event.materialId
      ? `id:${event.materialId}`
      : `raw:${normalizeText(event.rawDescription ?? "")}`;
    let row = rows.get(rowKey);
    if (!row) {
      row = {
        rowKey,
        materialId: event.materialId ?? null,
        rawDescription: event.rawDescription ?? null,
        cells: new Map(),
      };
      rows.set(rowKey, row);
    }
    const kept = row.cells.get(supplierKey);
    if (!kept || event.occurredAt > kept.occurredAt) {
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
    const material = row.materialId
      ? await ctx.db.get("materials", row.materialId)
      : null;
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
      materialId: row.materialId,
      materialName: material?.name ?? null,
      variantLabel: material?.variantLabel ?? null,
      familyId: material?.familyId ?? null,
      familyName,
      rawDescription: row.rawDescription,
      unit: material?.unit ?? cells[0]?.unit ?? null,
      quantity: Math.max(0, ...cells.map((cell) => cell.quantity ?? 0)) || null,
      referenceCents: material
        ? await materialReferenceCents(ctx, material, input.now)
        : null,
      cheapestSupplierKey: cells.length > 1 ? cells[0]!.supplierKey : null,
      cells,
    });
  }
  rowViews.sort((a, b) =>
    (a.familyName ?? a.materialName ?? a.rawDescription ?? "").localeCompare(
      b.familyName ?? b.materialName ?? b.rawDescription ?? "",
      "pt-BR"
    ) ||
    (a.materialName ?? a.rawDescription ?? "").localeCompare(
      b.materialName ?? b.rawDescription ?? "",
      "pt-BR"
    )
  );

  return {
    weekStart,
    weekEnd,
    columns: [...columns.values()].sort((a, b) => a.firstAt - b.firstAt),
    rows: rowViews,
  };
}
