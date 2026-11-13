import { withoutCreator } from "./qrValidators";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { hasRole } from "../../lib/rbac";
import { getBatchDestination, type QrBatchDestination } from "./qrBatches";
import { isProjectArchived } from "./projects";
import { forbidden } from "../../lib/accessErrors";
import { alreadyExists, notFound, ruleViolation } from "../../lib/domainErrors";

// Etiquetas QR individuais: consulta por token, busca, criação/remoção e
// vínculo com o equipamento real cadastrado em campo.

type EquipmentStatus = Doc<"equipment">["status"];

export type LinkEquipmentToQrInput = {
  token: string;
  equipmentId: Id<"equipment">;
  projectId?: Id<"projects">;
};

export type RegisterEquipmentForQrInput = {
  token: string;
  description: string;
  labelPhotoIds: Id<"_storage">[];
  status?: EquipmentStatus;
  projectId?: Id<"projects">;
};

export async function getQrCodeLookup(
  ctx: QueryCtx,
  token: string
): Promise<{
  qrCode: Doc<"qrCodes">;
  equipment: Doc<"equipment"> | null;
  batchProject: QrBatchDestination | null;
  project: QrBatchDestination | null;
} | null> {
  const qrCode = await ctx.db
    .query("qrCodes")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  if (!qrCode) return null;

  const equipment = qrCode.equipmentId
    ? withoutCreator(await ctx.db.get("equipment", qrCode.equipmentId))
    : null;

  const batchProject = await getBatchDestination(ctx, qrCode.batchId);

  let project: QrBatchDestination | null = null;
  if (qrCode.projectId) {
    const doc = await ctx.db.get("projects", qrCode.projectId);
    if (doc) {
      project = {
        projectId: doc._id,
        projectName: doc.name,
        projectSlug: doc.slug ?? null,
        archived: isProjectArchived(doc),
      };
    }
  }

  return { qrCode, equipment, batchProject, project };
}

export async function getQrCodeStats(ctx: QueryCtx): Promise<{
  total: number;
  linked: number;
  free: number;
  capped: boolean;
}> {
  const maxRows = 5000;
  const qrCodes = await ctx.db.query("qrCodes").order("desc").take(maxRows);
  const linked = qrCodes.filter((qr) => qr.equipmentId).length;

  return {
    total: qrCodes.length,
    linked,
    free: qrCodes.length - linked,
    capped: qrCodes.length === maxRows,
  };
}

export async function searchQrCodes(ctx: QueryCtx, rawTerm: string) {
  const term = rawTerm.trim();
  if (!term) {
    return { batches: [], qrCodes: [] };
  }

  const normalizedTerm = term.toLowerCase();
  const batches = new Map<
    string,
    { batchId: string; batchName?: string; createdAt: number; count: number }
  >();
  const qrCodeMatches = new Map<string, Doc<"qrCodes">>();
  const exactQrCode = await ctx.db
    .query("qrCodes")
    .withIndex("by_token", (q) => q.eq("token", term.toUpperCase()))
    .unique();

  if (exactQrCode) {
    qrCodeMatches.set(exactQrCode.token, exactQrCode);
    if (exactQrCode.batchId) {
      const batchCodes = await ctx.db
        .query("qrCodes")
        .withIndex("by_batchId", (q) => q.eq("batchId", exactQrCode.batchId))
        .order("desc")
        .take(1000);
      batches.set(exactQrCode.batchId, {
        batchId: exactQrCode.batchId,
        batchName: batchCodes[0]?.batchName ?? exactQrCode.batchName,
        createdAt: batchCodes[0]?.createdAt ?? exactQrCode.createdAt,
        count: batchCodes.length,
      });
    }
  }

  const exactBatchCodes = await ctx.db
    .query("qrCodes")
    .withIndex("by_batchId", (q) => q.eq("batchId", term))
    .order("desc")
    .take(1000);

  if (exactBatchCodes.length > 0) {
    batches.set(term, {
      batchId: term,
      batchName: exactBatchCodes[0].batchName,
      createdAt: exactBatchCodes[0].createdAt,
      count: exactBatchCodes.length,
    });
  }

  const exactBatchNameCodes = await ctx.db
    .query("qrCodes")
    .withIndex("by_batchName", (q) => q.eq("batchName", term))
    .order("desc")
    .take(1000);

  const namedBatchIds = new Set<string>();
  for (const qrCode of exactBatchNameCodes) {
    if (qrCode.batchId) namedBatchIds.add(qrCode.batchId);
  }
  for (const batchId of namedBatchIds) {
    if (batches.has(batchId)) continue;

    const batchCodes = await ctx.db
      .query("qrCodes")
      .withIndex("by_batchId", (q) => q.eq("batchId", batchId))
      .order("desc")
      .take(1000);
    batches.set(batchId, {
      batchId,
      batchName: batchCodes[0]?.batchName ?? term,
      createdAt: batchCodes[0]?.createdAt ?? exactBatchNameCodes[0]?.createdAt ?? 0,
      count: batchCodes.length,
    });
  }

  const recentCandidates = await ctx.db
    .query("qrCodes")
    .order("desc")
    .take(200);

  for (const qrCode of recentCandidates) {
    const batchId = qrCode.batchId;
    if (
      batchId &&
      (batchId.toLowerCase().includes(normalizedTerm) ||
        (qrCode.batchName?.toLowerCase().includes(normalizedTerm) ?? false)) &&
      !batches.has(batchId)
    ) {
      const batchCodes = await ctx.db
        .query("qrCodes")
        .withIndex("by_batchId", (q) => q.eq("batchId", batchId))
        .order("desc")
        .take(1000);
      batches.set(batchId, {
        batchId,
        batchName: batchCodes[0]?.batchName ?? qrCode.batchName,
        createdAt: batchCodes[0]?.createdAt ?? qrCode.createdAt,
        count: batchCodes.length,
      });
    }

    if (
      qrCodeMatches.size < 20 &&
      qrCode.token.toLowerCase().includes(normalizedTerm)
    ) {
      qrCodeMatches.set(qrCode.token, qrCode);
    }
  }

  const qrCodes = await Promise.all(
    Array.from(qrCodeMatches.values()).map(async (qr) => ({
      ...qr,
      equipment: qr.equipmentId ? await ctx.db.get("equipment", qr.equipmentId) : null,
    }))
  );

  return {
    batches: Array.from(batches.values()).slice(0, 10),
    qrCodes,
  };
}

export async function getQrCodeByEquipmentId(
  ctx: QueryCtx,
  equipmentId: Id<"equipment">
): Promise<Doc<"qrCodes"> | null> {
  return await ctx.db
    .query("qrCodes")
    .withIndex("by_equipment", (q) => q.eq("equipmentId", equipmentId))
    .order("desc")
    .first();
}

// QR codes ativos ainda não vinculados a nenhum equipamento, para o assistente
// de IA propor vínculos (intent assign_qr). Limitado para caber no contexto.
export async function listUnassignedQrCodesForAi(
  ctx: QueryCtx
): Promise<{ token: string; batchName: string | null; createdAt: number }[]> {
  const unassigned = await ctx.db
    .query("qrCodes")
    .withIndex("by_equipment", (q) => q.eq("equipmentId", undefined))
    .order("desc")
    .take(200);
  return unassigned
    .filter((qr) => qr.status === "active")
    .map((qr) => ({
      token: qr.token,
      batchName: qr.batchName ?? null,
      createdAt: qr.createdAt,
    }));
}

export async function createQrCode(
  ctx: MutationCtx,
  token: string
): Promise<Id<"qrCodes">> {
  const existing = await ctx.db
    .query("qrCodes")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  if (existing) {
    throw alreadyExists(`QR code with token "${token}" already exists`);
  }

  return await ctx.db.insert("qrCodes", {
    token,
    status: "active",
    createdAt: Date.now(),
  });
}

export async function removeQrCodeByToken(
  ctx: MutationCtx,
  token: string
): Promise<Id<"qrCodes">> {
  const qrCode = await ctx.db
    .query("qrCodes")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  if (!qrCode) {
    throw notFound("QR code not found");
  }

  if (qrCode.equipmentId) {
    throw ruleViolation("Cannot delete a QR code linked to equipment");
  }

  await ctx.db.delete("qrCodes", qrCode._id);
  return qrCode._id;
}

export async function removeQrCodesByTokens(
  ctx: MutationCtx,
  rawTokens: string[]
): Promise<{ deleted: string[]; blocked: string[]; missing: string[] }> {
  const deleted: string[] = [];
  const blocked: string[] = [];
  const missing: string[] = [];
  const tokens = Array.from(
    new Set(rawTokens.map((token) => token.trim()).filter(Boolean))
  );

  for (const token of tokens) {
    const qrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (!qrCode) {
      missing.push(token);
      continue;
    }

    if (qrCode.equipmentId) {
      blocked.push(token);
      continue;
    }

    await ctx.db.delete("qrCodes", qrCode._id);
    deleted.push(token);
  }

  return { deleted, blocked, missing };
}

// Cliente do portal é somente leitura: não pode mover uma etiqueta de obra.
function assertCanSetFieldProject(user: Doc<"users">) {
  if (hasRole(user, "client")) {
    throw forbidden("Sem permissão para vincular a etiqueta a uma obra");
  }
}

// Vincula um equipamento já criado à etiqueta. Roda dentro da mesma mutação
// de quem chama, para criação + vínculo desfazerem juntos se a obra for inválida.
export async function linkEquipmentToQr(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: LinkEquipmentToQrInput
): Promise<void> {
  const qrCode = await ctx.db
    .query("qrCodes")
    .withIndex("by_token", (q) => q.eq("token", args.token))
    .unique();

  if (!qrCode) {
    throw notFound("QR code not found");
  }

  if (qrCode.equipmentId) {
    throw ruleViolation("QR code already linked to equipment");
  }

  const equipment = await ctx.db.get("equipment", args.equipmentId);
  if (!equipment) {
    throw notFound("Equipment not found");
  }

  // Se o equipamento já está vinculado a um item planejado, propaga a obra.
  let projectId: Id<"projects"> | undefined;
  if (equipment.projectEquipmentId) {
    const planned = await ctx.db.get(
      "projectEquipment",
      equipment.projectEquipmentId
    );
    projectId = planned?.projectId;
  }

  // Sem item planejado: a obra aberta no app de campo vence o destino do
  // lote — o técnico está fisicamente nela.
  if (!projectId && args.projectId) {
    assertCanSetFieldProject(user);
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || isProjectArchived(project)) {
      throw ruleViolation("Obra não disponível");
    }
    projectId = project._id;
  }

  // Por fim, herda a obra de destino do lote (qrBatches), se definida — o
  // QR já nasce marcado como pertencente à obra.
  if (!projectId) {
    const destination = await getBatchDestination(ctx, qrCode.batchId);
    projectId = destination?.projectId;
  }

  await ctx.db.patch("qrCodes", qrCode._id, {
    equipmentId: args.equipmentId,
    projectId: projectId ?? qrCode.projectId,
  });
}

// Cadastro + vínculo na mesma transação. Se a obra estiver arquivada ou o QR
// já tiver equipamento, nada é gravado — uma nova tentativa não cria órfão.
export async function registerEquipmentForQr(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: RegisterEquipmentForQrInput
): Promise<Id<"equipment">> {
  if (!args.description.trim()) {
    throw ruleViolation("Descrição é obrigatória");
  }
  if (args.labelPhotoIds.length === 0) {
    throw ruleViolation("É obrigatório anexar pelo menos uma foto da etiqueta");
  }

  const equipmentId = await ctx.db.insert("equipment", {
    description: args.description.trim(),
    labelPhotoIds: args.labelPhotoIds,
    status: args.status ?? "installing",
    createdAt: Date.now(),
    createdByUserId: user._id,
  });
  await linkEquipmentToQr(ctx, user, {
    token: args.token,
    equipmentId,
    projectId: args.projectId,
  });
  return equipmentId;
}
