import type { Infer } from "convex/values";
import { weekStartOf } from "@rlpapp/shared/compras/priceReference";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import type { priceEventSource, quoteFreight } from "../../schema/procurement";
import { addPriceEvent } from "./priceEventReview";
import { supplierKeyOf } from "./priceHistory";
import { normalizeText } from "./pricing";
import {
  MAX_PROPOSAL_LINES,
  proposalLineCount,
  proposalSupplierKey,
} from "./quoteProposalRules";

/**
 * Propostas de fornecedor: o que um fornecedor mandou de uma vez (data,
 * validade, condição, frete). Cada linha vira um priceEvent ligado a ela.
 * Propostas da mesma semana (segunda a domingo) formam a rodada que o mapa da
 * semana compara (leitura em quoteWeeks.ts).
 */

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
  if (input.lines.length > MAX_PROPOSAL_LINES) {
    throw new Error(`No máximo ${MAX_PROPOSAL_LINES} linhas por proposta`);
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
      await addPriceEvent(
        ctx,
        user,
        {
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
        },
        { proposalChecked: true }
      )
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
 * as linhas: os priceEvents ligados acompanham (no máximo MAX_PROPOSAL_LINES,
 * o limite que todo caminho de ligação respeita).
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
    for await (const event of ctx.db
      .query("priceEvents")
      .withIndex("by_quote_proposal", (q) =>
        q.eq("quoteProposalId", proposal._id)
      )) {
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
 * ser as da proposta. A proposta inteira fica em até MAX_PROPOSAL_LINES.
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
  if (input.priceEventIds.length > MAX_PROPOSAL_LINES) {
    throw new Error(`No máximo ${MAX_PROPOSAL_LINES} preços por chamada`);
  }
  const supplierKey = proposalSupplierKey(proposal);

  const toLink: Id<"priceEvents">[] = [];
  for (const eventId of new Set(input.priceEventIds)) {
    const event = await ctx.db.get("priceEvents", eventId);
    if (!event) throw new Error(`Preço ${eventId} não encontrado`);
    if (event.quoteProposalId === proposal._id) continue;
    if (supplierKeyOf(event) !== supplierKey) {
      throw new Error(
        `O preço ${eventId} é de outro fornecedor que o da proposta`
      );
    }
    toLink.push(eventId);
  }
  const current = await proposalLineCount(ctx, proposal._id);
  if (current + toLink.length > MAX_PROPOSAL_LINES) {
    throw new Error(
      `A proposta já tem ${current} preços; com estes passaria de ${MAX_PROPOSAL_LINES}`
    );
  }

  for (const eventId of toLink) {
    await ctx.db.patch("priceEvents", eventId, {
      quoteProposalId: proposal._id,
      supplierId: proposal.supplierId,
      supplierNameRaw: proposal.supplierNameRaw,
      occurredAt: proposal.receivedAt,
      validUntil: proposal.validUntil,
    });
  }

  if (toLink.length > 0) {
    await logAudit(ctx, user, {
      action: "update",
      tableName: "quoteProposals",
      recordId: proposal._id,
    });
  }
  return toLink.length;
}
