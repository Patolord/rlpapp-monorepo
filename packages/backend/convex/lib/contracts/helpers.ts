import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

export type ContractDirection = "client_sale" | "contractor_hire";
export type ContractKind = "base" | "addendum";

export const serviceItemInputValidator = v.object({
  description: v.string(),
  valueCents: v.number(),
});

export const serviceItemValidator = v.object({
  _id: v.id("contractServiceItems"),
  description: v.string(),
  valueCents: v.number(),
  order: v.number(),
});

export function resolveContractDirection(
  contract: Doc<"contracts">
): ContractDirection {
  return contract.direction ?? "client_sale";
}

export function resolveContractKind(contract: Doc<"contracts">): ContractKind {
  return contract.kind ?? "base";
}

export function assertValidCounterparty(args: {
  direction: ContractDirection;
  customerId?: Id<"customers">;
  contractorId?: Id<"contractors">;
}): void {
  if (args.direction === "client_sale") {
    if (!args.customerId) {
      throw new Error("Informe o cliente do contrato");
    }
    if (args.contractorId) {
      throw new Error(
        "Contrato de venda ao cliente não pode ter empreiteiro"
      );
    }
    return;
  }
  if (!args.contractorId) {
    throw new Error("Informe o empreiteiro do contrato");
  }
  if (args.customerId) {
    throw new Error(
      "Contrato de contratação não pode ter cliente como contraparte"
    );
  }
}

export function assertEligibleForMedicao(contract: Doc<"contracts">): void {
  const direction = resolveContractDirection(contract);
  if (direction !== "client_sale") {
    throw new Error(
      "Medições só podem ser registradas em contratos de venda ao cliente"
    );
  }
  if (!contract.projectId) {
    throw new Error(
      "Medições só podem ser registradas em contratos vinculados a uma obra"
    );
  }
}

export function normalizeServiceItems(
  items: Array<{ description: string; valueCents: number }>
): Array<{ description: string; valueCents: number }> {
  if (items.length === 0) {
    throw new Error("Informe ao menos um serviço no contrato");
  }
  const normalized = items.map((item, index) => {
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
  return normalized;
}

export function sumServiceItemCents(
  items: Array<{ valueCents: number }>
): number {
  return items.reduce((sum, item) => sum + item.valueCents, 0);
}

export async function replaceContractServiceItems(
  ctx: MutationCtx,
  contractId: Id<"contracts">,
  items: Array<{ description: string; valueCents: number }>
): Promise<number> {
  const normalized = normalizeServiceItems(items);
  const existing = await ctx.db
    .query("contractServiceItems")
    .withIndex("by_contract", (q) => q.eq("contractId", contractId))
    .collect();
  for (const item of existing) {
    await ctx.db.delete("contractServiceItems", item._id);
  }
  const now = Date.now();
  for (let i = 0; i < normalized.length; i++) {
    const item = normalized[i]!;
    await ctx.db.insert("contractServiceItems", {
      contractId,
      description: item.description,
      valueCents: item.valueCents,
      order: i,
      createdAt: now,
    });
  }
  return sumServiceItemCents(normalized);
}

export async function listServiceItems(
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

export async function assertParentContract(
  ctx: MutationCtx | QueryCtx,
  args: {
    kind: ContractKind;
    parentContractId?: Id<"contracts">;
    projectId?: Id<"projects">;
    direction: ContractDirection;
    excludeId?: Id<"contracts">;
  }
): Promise<void> {
  if (args.kind === "base") {
    if (args.parentContractId) {
      throw new Error("Contrato base não deve ter contrato pai");
    }
    return;
  }
  if (!args.parentContractId) {
    throw new Error("Aditivo deve referenciar o contrato base");
  }
  const parent = await ctx.db.get("contracts", args.parentContractId);
  if (!parent) throw new Error("Contrato base não encontrado");
  if (args.excludeId && parent._id === args.excludeId) {
    throw new Error("Aditivo não pode referenciar a si mesmo");
  }
  if (resolveContractKind(parent) !== "base") {
    throw new Error("O contrato pai deve ser um contrato base");
  }
  if (resolveContractDirection(parent) !== args.direction) {
    throw new Error("Aditivo deve ter a mesma direção do contrato base");
  }
  if ((parent.projectId ?? undefined) !== (args.projectId ?? undefined)) {
    throw new Error("Aditivo deve estar vinculado à mesma obra do contrato base");
  }
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
