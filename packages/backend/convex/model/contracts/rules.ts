import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

export type ContractDirection = "client_sale" | "contractor_hire";
export type ContractKind = "base" | "addendum";

export function resolveContractDirection(
  contract: Doc<"contracts">
): ContractDirection {
  return contract.direction ?? "client_sale";
}

export function resolveContractKind(contract: Doc<"contracts">): ContractKind {
  return contract.kind ?? "base";
}

export function assertValidContractCounterparty(args: {
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

export function assertContractEligibleForMeasurement(
  contract: Doc<"contracts">
): void {
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

export async function assertValidParentContract(
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
