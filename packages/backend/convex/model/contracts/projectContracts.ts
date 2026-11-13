import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { notFound, ruleViolation } from "../../lib/domainErrors";
import { createProject } from "../engineering/projectMutations";
import {
  assertValidParentContract,
  resolveContractDirection,
  resolveContractKind,
} from "./rules";

export type CreateProjectWithOptionalContractInput = {
  name: string;
  customerId: Id<"customers">;
  legacyNumber: number;
  contractId?: Id<"contracts">;
};

async function attachUnassignedContract(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: {
    contractId: Id<"contracts">;
    projectId: Id<"projects">;
  }
): Promise<Id<"contracts">> {
  const contract = await ctx.db.get("contracts", args.contractId);
  if (!contract) throw notFound("Contrato não encontrado");
  if (contract.projectId) {
    throw ruleViolation("Contrato já está vinculado a outra obra");
  }

  const direction = resolveContractDirection(contract);
  const kind = resolveContractKind(contract);
  await assertValidParentContract(ctx, {
    kind,
    parentContractId: contract.parentContractId,
    projectId: args.projectId,
    direction,
    excludeId: args.contractId,
  });

  await ctx.db.patch("contracts", args.contractId, {
    projectId: args.projectId,
    updatedAt: Date.now(),
    updatedByUserId: user._id,
  });
  await logAudit(ctx, user, {
    action: "update",
    tableName: "contracts",
    recordId: args.contractId,
    details: `Contrato vinculado à obra ${args.projectId}`,
  });
  return args.contractId;
}

/**
 * Cria a obra e, se informado, vincula um contrato ainda sem obra, na mesma
 * transação. Mora em contratos porque vincular é edição do contrato (e
 * contratos dependem de engenharia, nunca o contrário). Quem chama confere
 * `contratos.write` quando há `contractId`.
 */
export async function createProjectWithOptionalContract(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: CreateProjectWithOptionalContractInput
): Promise<{ projectId: Id<"projects">; linkedContractId: Id<"contracts"> | null }> {
  const projectId = await createProject(ctx, user, {
    name: args.name,
    customerId: args.customerId,
    legacyNumber: args.legacyNumber,
  });

  if (!args.contractId) {
    return { projectId, linkedContractId: null };
  }
  const linkedContractId = await attachUnassignedContract(ctx, user, {
    contractId: args.contractId,
    projectId,
  });
  return { projectId, linkedContractId };
}
