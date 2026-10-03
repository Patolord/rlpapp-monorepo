import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import {
  assertValidContractCounterparty,
  assertValidParentContract,
  resolveContractDirection,
  resolveContractKind,
  type ContractDirection,
  type ContractKind,
} from "./rules";
import {
  deleteContractServiceItems,
  replaceContractServiceItems,
  type ContractServiceItemInput,
} from "./serviceItems";

export type CreateContractInput = {
  title: string;
  direction: ContractDirection;
  kind: ContractKind;
  projectId?: Id<"projects"> | null;
  parentContractId?: Id<"contracts"> | null;
  customerId?: Id<"customers"> | null;
  contractorId?: Id<"contractors"> | null;
  notes?: string;
  signedAt?: number;
  serviceItems: ContractServiceItemInput[];
};

export type UpdateContractInput = {
  contractId: Id<"contracts">;
  title?: string;
  direction?: ContractDirection;
  kind?: ContractKind;
  projectId?: Id<"projects"> | null;
  parentContractId?: Id<"contracts"> | null;
  customerId?: Id<"customers"> | null;
  contractorId?: Id<"contractors"> | null;
  notes?: string;
  signedAt?: number | null;
  serviceItems?: ContractServiceItemInput[];
};

async function assertReferencedContractEntities(
  ctx: MutationCtx,
  args: {
    projectId?: Id<"projects">;
    customerId?: Id<"customers">;
    contractorId?: Id<"contractors">;
  }
): Promise<void> {
  if (args.projectId) {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
  }
  if (args.customerId) {
    const customer = await ctx.db.get("customers", args.customerId);
    if (!customer || customer.archivedAt) {
      throw new Error("Cliente não encontrado ou arquivado");
    }
  }
  if (args.contractorId) {
    const contractor = await ctx.db.get("contractors", args.contractorId);
    if (!contractor || contractor.archivedAt) {
      throw new Error("Empreiteiro não encontrado ou arquivado");
    }
  }
}

export async function createContract(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: CreateContractInput
): Promise<Id<"contracts">> {
  const title = args.title.trim();
  if (!title) throw new Error("Informe o título do contrato");

  const projectId = args.projectId ?? undefined;
  const customerId = args.customerId ?? undefined;
  const contractorId = args.contractorId ?? undefined;
  const parentContractId = args.parentContractId ?? undefined;

  assertValidContractCounterparty({
    direction: args.direction,
    customerId,
    contractorId,
  });
  await assertValidParentContract(ctx, {
    kind: args.kind,
    parentContractId,
    projectId,
    direction: args.direction,
  });
  await assertReferencedContractEntities(ctx, {
    projectId,
    customerId,
    contractorId,
  });

  const now = Date.now();
  const contractId = await ctx.db.insert("contracts", {
    projectId,
    direction: args.direction,
    kind: args.kind,
    parentContractId,
    customerId,
    contractorId,
    title,
    valueCents: 0,
    notes: args.notes?.trim() || undefined,
    signedAt: args.signedAt,
    createdAt: now,
    updatedAt: now,
    createdByUserId: user._id,
    updatedByUserId: user._id,
  });

  const valueCents = await replaceContractServiceItems(
    ctx,
    contractId,
    args.serviceItems
  );
  await ctx.db.patch("contracts", contractId, { valueCents });
  await logAudit(ctx, user, {
    action: "create",
    tableName: "contracts",
    recordId: contractId,
    details: `Contrato "${title}" (${args.direction}, ${args.kind}) criado`,
  });

  return contractId;
}

export async function updateContract(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: UpdateContractInput
): Promise<void> {
  const contract = await ctx.db.get("contracts", args.contractId);
  if (!contract) throw new Error("Contrato não encontrado");

  const direction = args.direction ?? resolveContractDirection(contract);
  const kind = args.kind ?? resolveContractKind(contract);
  const projectId =
    args.projectId !== undefined
      ? (args.projectId ?? undefined)
      : contract.projectId;
  const customerId =
    args.customerId !== undefined
      ? (args.customerId ?? undefined)
      : contract.customerId;
  const contractorId =
    args.contractorId !== undefined
      ? (args.contractorId ?? undefined)
      : contract.contractorId;
  const parentContractId =
    args.parentContractId !== undefined
      ? (args.parentContractId ?? undefined)
      : contract.parentContractId;

  assertValidContractCounterparty({
    direction,
    customerId,
    contractorId,
  });
  await assertValidParentContract(ctx, {
    kind,
    parentContractId,
    projectId,
    direction,
    excludeId: args.contractId,
  });
  await assertReferencedContractEntities(ctx, {
    projectId,
    customerId,
    contractorId,
  });

  const remainsMeasurementEligible =
    direction === "client_sale" && projectId !== undefined;
  if (!remainsMeasurementEligible) {
    const measurement = await ctx.db
      .query("medicoes")
      .withIndex("by_contract", (q) => q.eq("contractId", args.contractId))
      .first();
    if (measurement) {
      throw new Error(
        "Contrato possui medições — mantenha-o como venda ao cliente vinculado à obra"
      );
    }
  }

  const patch: Partial<Doc<"contracts">> = {
    direction,
    kind,
    projectId,
    parentContractId,
    customerId,
    contractorId,
    updatedAt: Date.now(),
    updatedByUserId: user._id,
  };
  if (args.title !== undefined) {
    const title = args.title.trim();
    if (!title) throw new Error("Informe o título do contrato");
    patch.title = title;
  }
  if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
  if (args.signedAt !== undefined) patch.signedAt = args.signedAt ?? undefined;
  if (args.serviceItems !== undefined) {
    patch.valueCents = await replaceContractServiceItems(
      ctx,
      args.contractId,
      args.serviceItems
    );
  }

  await ctx.db.patch("contracts", args.contractId, patch);
  await logAudit(ctx, user, {
    action: "update",
    tableName: "contracts",
    recordId: args.contractId,
  });
}

export async function deleteContractById(
  ctx: MutationCtx,
  user: Doc<"users">,
  contractId: Id<"contracts">
): Promise<void> {
  const contract = await ctx.db.get("contracts", contractId);
  if (!contract) throw new Error("Contrato não encontrado");

  const measurement = await ctx.db
    .query("medicoes")
    .withIndex("by_contract", (q) => q.eq("contractId", contractId))
    .first();
  if (measurement) {
    throw new Error(
      "Não é possível excluir: o contrato possui medições. Exclua as medições primeiro."
    );
  }

  const childContract = await ctx.db
    .query("contracts")
    .withIndex("by_parent", (q) => q.eq("parentContractId", contractId))
    .first();
  if (childContract) {
    throw new Error(
      "Não é possível excluir: existem aditivos vinculados a este contrato"
    );
  }

  await deleteContractServiceItems(ctx, contractId);
  await ctx.db.delete("contracts", contractId);
  await logAudit(ctx, user, {
    action: "delete",
    tableName: "contracts",
    recordId: contractId,
    details: `Contrato "${contract.title}" excluído`,
  });
}
