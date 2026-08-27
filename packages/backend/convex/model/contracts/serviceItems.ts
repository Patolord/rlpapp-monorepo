import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

export type ContractServiceItemInput = {
  description: string;
  valueCents: number;
};

export function normalizeContractServiceItems(
  items: ContractServiceItemInput[]
): ContractServiceItemInput[] {
  if (items.length === 0) {
    throw new Error("Informe ao menos um serviço no contrato");
  }
  return items.map((item, index) => {
    const description = item.description.trim();
    if (!description) {
      throw new Error(`Informe a descrição do serviço #${index + 1}`);
    }
    if (!Number.isFinite(item.valueCents) || item.valueCents <= 0) {
      throw new Error(
        `O valor do serviço "${description}" deve ser maior que zero`
      );
    }
    return {
      description,
      valueCents: Math.round(item.valueCents),
    };
  });
}

export function sumContractServiceItemCents(
  items: Array<{ valueCents: number }>
): number {
  return items.reduce((sum, item) => sum + item.valueCents, 0);
}

export async function replaceContractServiceItems(
  ctx: MutationCtx,
  contractId: Id<"contracts">,
  items: ContractServiceItemInput[]
): Promise<number> {
  const normalized = normalizeContractServiceItems(items);
  await deleteContractServiceItems(ctx, contractId);

  const now = Date.now();
  for (const [order, item] of normalized.entries()) {
    await ctx.db.insert("contractServiceItems", {
      contractId,
      description: item.description,
      valueCents: item.valueCents,
      order,
      createdAt: now,
    });
  }
  return sumContractServiceItemCents(normalized);
}

export async function listContractServiceItems(
  ctx: QueryCtx | MutationCtx,
  contractId: Id<"contracts">
) {
  const items = await ctx.db
    .query("contractServiceItems")
    .withIndex("by_contract", (q) => q.eq("contractId", contractId))
    .collect();
  items.sort((a, b) => a.order - b.order);
  return items.map((item) => ({
    _id: item._id,
    description: item.description,
    valueCents: item.valueCents,
    order: item.order,
  }));
}

export async function deleteContractServiceItems(
  ctx: MutationCtx,
  contractId: Id<"contracts">
): Promise<void> {
  const items = await ctx.db
    .query("contractServiceItems")
    .withIndex("by_contract", (q) => q.eq("contractId", contractId))
    .collect();
  for (const item of items) {
    await ctx.db.delete("contractServiceItems", item._id);
  }
}
