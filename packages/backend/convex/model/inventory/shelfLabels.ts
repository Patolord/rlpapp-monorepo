import type { PaginationOptions } from "convex/server";
import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { findInventoryLocation } from "./locations";
import { canViewCentralInventory } from "./stockPolicy";
import { ruleViolation } from "../../lib/domainErrors";

/**
 * Etiquetas de prateleira: os itens do estoque central com SKU e endereço,
 * em páginas grandes. O web baixa tudo e filtra por endereço/busca para
 * imprimir; o QR da etiqueta é o próprio SKU, que o cadastro em campo lê.
 */
export async function listShelfLabelsPage(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: { paginationOpts: PaginationOptions }
) {
  if (!canViewCentralInventory(user)) {
    throw ruleViolation("Etiquetas de prateleira são do estoque central");
  }
  const central = await findInventoryLocation(ctx);
  if (!central) return { page: [], isDone: true, continueCursor: "" };
  const numItems = Math.min(Math.max(input.paginationOpts.numItems, 1), 500);
  const result = await ctx.db
    .query("inventoryBalances")
    .withIndex("by_location", (q) => q.eq("locationId", central._id))
    .paginate({ ...input.paginationOpts, numItems });
  const rows = await Promise.all(
    result.page.map(async (balance) => {
      const material = await ctx.db.get("materials", balance.materialId);
      if (!material || !material.active || material.status === "archived") return null;
      return {
        balanceId: balance._id,
        materialId: material._id,
        sku: material.sku ?? null,
        name: material.name,
        variantLabel: material.variantLabel ?? null,
        unit: material.unit ?? null,
        physicalAddress: balance.physicalAddress ?? null,
        quantity: balance.quantity,
      };
    })
  );
  return {
    ...result,
    page: rows.filter((row): row is NonNullable<typeof row> => row !== null),
  };
}
