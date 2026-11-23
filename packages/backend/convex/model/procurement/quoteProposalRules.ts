import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { supplierKeyOf } from "./priceHistory";
import { ruleViolation } from "../../lib/domainErrors";

/**
 * Regras de uma proposta de fornecedor que valem em todo caminho que liga um
 * preço a ela (criar a proposta, `priceEvents.add` com `quoteProposalId`,
 * `quoteProposals.linkPriceEvents`).
 */

/** Linhas (preços) por proposta: o limite vale para a proposta inteira. */
export const MAX_PROPOSAL_LINES = 200;

/** Chave de fornecedor da proposta, comparável à de um priceEvent. */
export function proposalSupplierKey(
  proposal: Pick<Doc<"quoteProposals">, "supplierId" | "supplierNameRaw">
): string {
  return supplierKeyOf({
    _id: "" as Id<"priceEvents">,
    supplierId: proposal.supplierId,
    supplierNameRaw: proposal.supplierNameRaw,
  });
}

/** Quantos preços a proposta já tem (até MAX_PROPOSAL_LINES + 1). */
export async function proposalLineCount(
  ctx: QueryCtx,
  proposalId: Id<"quoteProposals">
): Promise<number> {
  const lines = await ctx.db
    .query("priceEvents")
    .withIndex("by_quote_proposal", (q) => q.eq("quoteProposalId", proposalId))
    .take(MAX_PROPOSAL_LINES + 1);
  return lines.length;
}

/** Recusa ligar mais `adding` preços quando a proposta passaria do limite. */
export async function assertProposalRoom(
  ctx: QueryCtx,
  proposalId: Id<"quoteProposals">,
  adding: number
): Promise<void> {
  const current = await proposalLineCount(ctx, proposalId);
  if (current + adding > MAX_PROPOSAL_LINES) {
    throw ruleViolation(
      `A proposta já tem ${current} preços; o limite é ${MAX_PROPOSAL_LINES} por proposta`
    );
  }
}
