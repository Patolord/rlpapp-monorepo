import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { notFound, ruleViolation } from "../../lib/domainErrors";

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
      throw ruleViolation("Informe o cliente do contrato");
    }
    if (args.contractorId) {
      throw ruleViolation(
        "Contrato de venda ao cliente não pode ter empreiteiro"
      );
    }
    return;
  }
  if (!args.contractorId) {
    throw ruleViolation("Informe o empreiteiro do contrato");
  }
  if (args.customerId) {
    throw ruleViolation(
      "Contrato de contratação não pode ter cliente como contraparte"
    );
  }
}

export function isContractEligibleForMeasurement(
  contract: Doc<"contracts">
): boolean {
  return (
    resolveContractDirection(contract) === "client_sale" &&
    contract.projectId !== undefined
  );
}

export function assertContractEligibleForMeasurement(
  contract: Doc<"contracts">
): void {
  const direction = resolveContractDirection(contract);
  if (direction !== "client_sale") {
    throw ruleViolation(
      "Medições só podem ser registradas em contratos de venda ao cliente"
    );
  }
  if (!contract.projectId) {
    throw ruleViolation(
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
      throw ruleViolation("Contrato base não deve ter contrato pai");
    }
    return;
  }
  if (!args.parentContractId) {
    throw ruleViolation("Aditivo deve referenciar o contrato base");
  }
  const parent = await ctx.db.get("contracts", args.parentContractId);
  if (!parent) throw notFound("Contrato base não encontrado");
  if (args.excludeId && parent._id === args.excludeId) {
    throw ruleViolation("Aditivo não pode referenciar a si mesmo");
  }
  if (resolveContractKind(parent) !== "base") {
    throw ruleViolation("O contrato pai deve ser um contrato base");
  }
  if (resolveContractDirection(parent) !== args.direction) {
    throw ruleViolation("Aditivo deve ter a mesma direção do contrato base");
  }
  if ((parent.projectId ?? undefined) !== (args.projectId ?? undefined)) {
    throw ruleViolation("Aditivo deve estar vinculado à mesma obra do contrato base");
  }
}
