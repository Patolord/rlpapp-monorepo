import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { forbidden } from "../../lib/accessErrors";
import { logAudit } from "../../lib/audit";
import { hasPermission, hasRole } from "../../lib/rbac";
import { notify, plural } from "../notifications/notify";
import { evaluateCompatibility } from "./compatibility";
import {
  getOrCreateCentralLocation,
  getOrCreateProjectLocation,
} from "./locations";
import { notFound, ruleViolation } from "../../lib/domainErrors";

/**
 * Documentos de movimentação de estoque: quem pode registrar e concluir cada
 * tipo, validação das linhas, criação (rascunho ou pendente de aprovação) e a
 * decisão do engenheiro sobre exceções de compatibilidade. A conclusão, que
 * mexe em saldos e eventos, fica em `posting.ts`.
 */

export const MAX_INVENTORY_DOCUMENT_LINES = 100;

export type InventoryMovementType =
  | "entry"
  | "transfer"
  | "consumption"
  | "return"
  | "adjustment";

export type InventoryLineInput = {
  materialId: Id<"materials">;
  quantity: number;
  unitCostCents?: number;
};

export type CreateInventoryDocumentInput = {
  type: InventoryMovementType;
  projectId?: Id<"projects">;
  reference?: string;
  notes?: string;
  lines: InventoryLineInput[];
};

export type ReviewInventoryDocumentInput = {
  documentId: Id<"inventoryDocuments">;
  decision: "approve" | "reject";
  reason: string;
};

/**
 * Exceções de compatibilidade (movimentação pendente de aprovação) são
 * decididas pelo engenheiro responsável pela obra: regra por recurso, não por
 * área. Admin/diretor não entram, de propósito.
 */
export function canDecideInventoryException(
  user: Doc<"users">,
  project: Doc<"projects">
): boolean {
  return hasRole(user, "engenheiro") && project.responsibleId === user._id;
}

function isAssignedTechnician(
  user: Doc<"users">,
  project: Doc<"projects"> | null
): boolean {
  if (!project) return false;
  if (hasPermission(user, "campo.todas_obras")) return true;
  return (project.technicianIds ?? []).includes(user._id);
}

async function assertCanCreate(
  ctx: MutationCtx,
  user: Doc<"users">,
  type: InventoryMovementType,
  projectId?: Id<"projects">
): Promise<void> {
  if (type === "entry") {
    if (hasPermission(user, "estoque.entrada")) return;
  } else if (type === "consumption" || type === "return") {
    if (hasPermission(user, "estoque.obras.write")) return;
  } else if (hasPermission(user, "estoque.write")) {
    return;
  }
  if (type === "consumption" && projectId) {
    const project = await ctx.db.get("projects", projectId);
    if (isAssignedTechnician(user, project)) return;
  }
  throw ruleViolation("Você não pode registrar este tipo de movimentação");
}

export async function assertCanPostInventoryDocument(
  ctx: MutationCtx,
  user: Doc<"users">,
  type: InventoryMovementType | "reversal",
  projectId?: Id<"projects">
): Promise<void> {
  if (type === "entry") {
    if (hasPermission(user, "estoque.entrada")) return;
  } else if (type === "consumption") {
    if (hasPermission(user, "estoque.obras.write")) return;
  } else if (hasPermission(user, "estoque.write")) {
    return;
  }
  if (type === "consumption" && projectId) {
    const project = await ctx.db.get("projects", projectId);
    if (isAssignedTechnician(user, project)) return;
  }
  throw ruleViolation("Você não pode concluir este tipo de movimentação");
}

function validateLines(
  type: InventoryMovementType,
  lines: InventoryLineInput[]
): void {
  if (lines.length === 0) {
    throw ruleViolation("Adicione pelo menos um material");
  }
  if (lines.length > MAX_INVENTORY_DOCUMENT_LINES) {
    throw ruleViolation(
      `Cada movimentação aceita no máximo ${MAX_INVENTORY_DOCUMENT_LINES} materiais`
    );
  }

  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity === 0) {
      throw ruleViolation("As quantidades devem ser números diferentes de zero");
    }
    if (type !== "adjustment" && line.quantity < 0) {
      throw ruleViolation("A quantidade deve ser maior que zero");
    }
    if (
      line.unitCostCents !== undefined &&
      (!Number.isInteger(line.unitCostCents) || line.unitCostCents < 0)
    ) {
      throw ruleViolation("O custo unitário deve ser informado em centavos");
    }
  }
}

async function validateMaterials(
  ctx: MutationCtx,
  lines: InventoryLineInput[]
): Promise<void> {
  const uniqueMaterialIds = [...new Set(lines.map((line) => line.materialId))];
  const materials = await Promise.all(
    uniqueMaterialIds.map(async (materialId) => {
      return await ctx.db.get("materials", materialId);
    })
  );
  if (materials.some((material) => !material)) {
    throw ruleViolation("Um ou mais materiais não foram encontrados");
  }
  if (materials.some((material) => material && !material.active)) {
    throw ruleViolation("Materiais inativos não podem ser movimentados");
  }
}

async function resolveDocumentLocations(
  ctx: MutationCtx,
  type: InventoryMovementType,
  projectId?: Id<"projects">
): Promise<{
  sourceLocationId?: Id<"inventoryLocations">;
  destinationLocationId?: Id<"inventoryLocations">;
}> {
  if (type !== "entry" && !projectId && type !== "adjustment") {
    throw ruleViolation("Selecione a obra");
  }

  if (type === "entry") {
    const central = await getOrCreateCentralLocation(ctx);
    return { destinationLocationId: central._id };
  }

  if (type === "adjustment") {
    const location = projectId
      ? await getOrCreateProjectLocation(ctx, projectId)
      : await getOrCreateCentralLocation(ctx);
    return { destinationLocationId: location._id };
  }

  if (!projectId) throw ruleViolation("Selecione a obra");
  const project = await getOrCreateProjectLocation(ctx, projectId);
  if (type === "consumption") {
    return { sourceLocationId: project._id };
  }

  const central = await getOrCreateCentralLocation(ctx);
  if (type === "transfer") {
    return {
      sourceLocationId: central._id,
      destinationLocationId: project._id,
    };
  }
  return {
    sourceLocationId: project._id,
    destinationLocationId: central._id,
  };
}

export async function createInventoryDocument(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CreateInventoryDocumentInput
): Promise<{
  documentId: Id<"inventoryDocuments">;
  status: "draft" | "pending_approval";
  issueCount: number;
}> {
  await assertCanCreate(ctx, user, input.type, input.projectId);
  validateLines(input.type, input.lines);
  await validateMaterials(ctx, input.lines);

  const projectId =
    input.type === "entry" ? undefined : input.projectId;
  const locations = await resolveDocumentLocations(
    ctx,
    input.type,
    projectId
  );
  const issues =
    input.type === "transfer"
      ? await evaluateCompatibility(
          ctx,
          input.lines.map((line) => line.materialId)
        )
      : [];
  const status = issues.length > 0 ? "pending_approval" : "draft";
  const now = Date.now();
  const reference = input.reference?.trim();
  const notes = input.notes?.trim();

  const documentId = await ctx.db.insert("inventoryDocuments", {
    type: input.type,
    status,
    ...locations,
    projectId,
    reference: reference || undefined,
    notes: notes || undefined,
    compatibilityIssues: issues.length > 0 ? issues : undefined,
    createdByUserId: user._id,
    createdAt: now,
    updatedAt: now,
  });

  for (let index = 0; index < input.lines.length; index += 1) {
    const line = input.lines[index];
    if (!line) continue;
    await ctx.db.insert("inventoryDocumentItems", {
      documentId,
      lineNumber: index + 1,
      materialId: line.materialId,
      quantity: line.quantity,
      unitCostCents: line.unitCostCents,
      createdAt: now,
    });
  }

  await logAudit(ctx, user, {
    action: "create",
    tableName: "inventoryDocuments",
    recordId: documentId,
    details: `Movimentação ${input.type} criada com ${input.lines.length} item(ns)`,
  });

  // N5: exceção de compatibilidade espera o engenheiro responsável da obra
  // (só ele decide, `reviewInventoryDocument`).
  if (status === "pending_approval" && projectId) {
    const project = await ctx.db.get("projects", projectId);
    if (project?.responsibleId) {
      await notify(
        ctx,
        [project.responsibleId],
        {
          kind: "N5",
          category: "aprovacoes",
          title: `Aprovação de estoque · ${project.name}`,
          body: `Envio de ${plural(input.lines.length, "item", "itens")} quebra ${issues.length === 1 ? "uma regra" : `${issues.length} regras`} de compatibilidade. Decida para liberar.`,
          target: "aprovacao",
          params: { documentId, projectId },
          projectId,
        },
        { actorId: user._id }
      );
    }
  }

  return { documentId, status, issueCount: issues.length };
}

export async function reviewInventoryDocument(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: ReviewInventoryDocumentInput
): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw ruleViolation("Informe a justificativa");

  const document = await ctx.db.get(
    "inventoryDocuments",
    input.documentId
  );
  if (!document) throw notFound("Movimentação não encontrada");
  if (document.status !== "pending_approval") {
    throw ruleViolation("Esta movimentação não está pendente de aprovação");
  }
  if (!document.projectId) throw ruleViolation("Movimentação sem obra vinculada");

  const project = await ctx.db.get("projects", document.projectId);
  if (!project) throw notFound("Obra não encontrada");
  if (!canDecideInventoryException(user, project)) {
    throw forbidden(
      "Somente o engenheiro responsável pela obra pode decidir esta exceção"
    );
  }

  const now = Date.now();
  if (input.decision === "approve") {
    await ctx.db.patch("inventoryDocuments", input.documentId, {
      status: "approved",
      approvalReason: reason,
      approvedByUserId: user._id,
      approvedAt: now,
      updatedAt: now,
    });
  } else {
    await ctx.db.patch("inventoryDocuments", input.documentId, {
      status: "rejected",
      approvalReason: reason,
      rejectedByUserId: user._id,
      rejectedAt: now,
      updatedAt: now,
    });
  }

  await logAudit(ctx, user, {
    action: input.decision,
    tableName: "inventoryDocuments",
    recordId: input.documentId,
    details: reason,
  });

  // N6: quem montou o envio fica sabendo da decisão.
  await notify(
    ctx,
    [document.createdByUserId],
    {
      kind: "N6",
      category: "aprovacoes",
      title: `${input.decision === "approve" ? "Envio aprovado" : "Envio recusado"} · ${project.name}`,
      body: `${user.name}: "${reason}"`,
      target: "movimentacao",
      params: { documentId: input.documentId, projectId: project._id },
      projectId: project._id,
    },
    { actorId: user._id }
  );
}
