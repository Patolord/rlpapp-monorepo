import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { logEquipmentHistory } from "../../lib/audit";
import { getBatchDestination } from "./qrBatches";

// Vínculo entre etiquetas QR e itens planejados da obra (projectEquipment),
// incluindo a obra denormalizada em qrCodes.projectId.

export type LinkQrTokenToProjectEquipmentInput = {
  token: string;
  itemId: Id<"projectEquipment">;
};

function generateToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "";
  for (let i = 0; i < 8; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// Mantém qrCodes.projectId (denormalizado) em sincronia com o vínculo
// equipamento ↔ item planejado. `projectId: undefined` limpa o campo.
export async function syncQrProjectId(
  ctx: MutationCtx,
  equipmentId: Id<"equipment">,
  projectId: Id<"projects"> | undefined
): Promise<void> {
  const qrCodes = await ctx.db
    .query("qrCodes")
    .withIndex("by_equipment", (q) => q.eq("equipmentId", equipmentId))
    .collect();
  for (const qr of qrCodes) {
    if (qr.projectId !== projectId) {
      await ctx.db.patch("qrCodes", qr._id, { projectId });
    }
  }
}

/**
 * Gera um QR único para um item planejado, criando o equipamento real
 * placeholder e vinculando-o (sem alterar o status do planejamento).
 * Idempotente: se o item já tem equipamento vinculado com QR, retorna o token
 * existente. Reutilizado pelo cadastro rápido em massa (bulkAddToEnvironments).
 */
export async function generateQrForItem(
  ctx: MutationCtx,
  user: Doc<"users">,
  item: Doc<"projectEquipment">
): Promise<{ token: string; created: boolean }> {
  // Já vinculado? Retorna o token existente, se houver.
  if (item.linkedEquipmentId) {
    const existingQr = await ctx.db
      .query("qrCodes")
      .withIndex("by_equipment", (q) =>
        q.eq("equipmentId", item.linkedEquipmentId)
      )
      .order("desc")
      .first();
    if (existingQr) {
      if (existingQr.projectId !== item.projectId) {
        await ctx.db.patch("qrCodes", existingQr._id, {
          projectId: item.projectId,
        });
      }
      return { token: existingQr.token, created: false };
    }
  }

  // Cria o equipamento real (placeholder vinculado ao planejamento).
  const equipmentId = item.linkedEquipmentId
    ? item.linkedEquipmentId
    : await ctx.db.insert("equipment", {
        description: `${item.system} · ${item.ambiente}`.trim(),
        status: item.status,
        createdAt: Date.now(),
        projectEquipmentId: item._id,
      });

  if (!item.linkedEquipmentId) {
    await ctx.db.patch("projectEquipment", item._id, {
      linkedEquipmentId: equipmentId,
    });
  }

  // Gera um token único.
  let token = generateToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!clash) break;
    token = generateToken();
  }

  await ctx.db.insert("qrCodes", {
    token,
    equipmentId,
    status: "active",
    projectId: item.projectId,
    createdAt: Date.now(),
  });

  await logEquipmentHistory(ctx, user, {
    equipmentId: item._id,
    action: "qr_generated",
    newValue: token,
  });

  return { token, created: true };
}

export async function generateQrForProjectEquipment(
  ctx: MutationCtx,
  user: Doc<"users">,
  itemId: Id<"projectEquipment">
): Promise<{ token: string; created: boolean }> {
  const item = await ctx.db.get("projectEquipment", itemId);
  if (!item) throw new Error("Equipamento planejado não encontrado");
  return await generateQrForItem(ctx, user, item);
}

// Vincula uma etiqueta QR já impressa a um item planejado — fluxo de bipagem
// do cadastro rápido. Aceita dois estados de etiqueta:
//   - QR livre: cria o equipamento real placeholder;
//   - QR já cadastrado pelo técnico (equipment sem item planejado): reaproveita
//     o cadastro existente (descrição/fotos preservadas) e apenas vincula.
// Não altera o status do planejamento (etiqueta colada não significa instalado).
export async function linkQrTokenToProjectEquipment(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: LinkQrTokenToProjectEquipmentInput
): Promise<{ token: string }> {
  const token = args.token.trim().toUpperCase();
  if (!token) throw new Error("Informe o token do QR");

  const item = await ctx.db.get("projectEquipment", args.itemId);
  if (!item) throw new Error("Equipamento planejado não encontrado");
  if (item.linkedEquipmentId) {
    throw new Error("Este equipamento já possui um QR vinculado");
  }

  const qrCode = await ctx.db
    .query("qrCodes")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!qrCode) throw new Error(`QR "${token}" não encontrado`);
  if (qrCode.status !== "active") {
    throw new Error(`QR "${token}" está inativo`);
  }

  // Se o lote da etiqueta tem obra de destino, ela precisa bater com a obra
  // do item planejado.
  const destination = await getBatchDestination(ctx, qrCode.batchId);
  if (destination && destination.projectId !== item.projectId) {
    throw new Error(
      `QR "${token}" pertence ao lote destinado à obra "${destination.projectName}"`
    );
  }

  let equipmentId: Id<"equipment">;
  if (qrCode.equipmentId) {
    // Etiqueta já cadastrada pelo técnico: reaproveita o equipamento real.
    const equipment = await ctx.db.get("equipment", qrCode.equipmentId);
    if (!equipment) {
      throw new Error(`QR "${token}" aponta para um equipamento inexistente`);
    }
    if (
      equipment.projectEquipmentId &&
      equipment.projectEquipmentId !== item._id
    ) {
      throw new Error(
        `QR "${token}" já está vinculado a outro item da obra`
      );
    }
    equipmentId = equipment._id;
    await ctx.db.patch("equipment", equipmentId, {
      projectEquipmentId: item._id,
    });
  } else {
    // Etiqueta livre: cria o equipamento real placeholder.
    equipmentId = await ctx.db.insert("equipment", {
      description: `${item.system} · ${item.ambiente}`.trim(),
      status: item.status,
      createdAt: Date.now(),
      projectEquipmentId: item._id,
    });
  }

  await ctx.db.patch("projectEquipment", item._id, {
    linkedEquipmentId: equipmentId,
  });
  await ctx.db.patch("qrCodes", qrCode._id, {
    equipmentId,
    projectId: item.projectId,
  });

  await logEquipmentHistory(ctx, user, {
    equipmentId: item._id,
    action: "qr_linked",
    newValue: token,
  });

  return { token };
}

// Backfill único: preenche qrCodes.projectId para QRs já vinculados a uma
// obra antes da denormalização.
export async function backfillQrProjectIds(
  ctx: MutationCtx
): Promise<{ scanned: number; patched: number }> {
  const qrCodes = await ctx.db.query("qrCodes").collect();
  let patched = 0;

  for (const qr of qrCodes) {
    if (!qr.equipmentId) continue;
    const equipment = await ctx.db.get("equipment", qr.equipmentId);
    const planned = equipment?.projectEquipmentId
      ? await ctx.db.get("projectEquipment", equipment.projectEquipmentId)
      : null;
    // Sem item planejado, mantém a obra herdada do lote em vez de apagá-la.
    const projectId = planned?.projectId ?? qr.projectId;
    if (qr.projectId !== projectId) {
      await ctx.db.patch("qrCodes", qr._id, { projectId });
      patched++;
    }
  }

  return { scanned: qrCodes.length, patched };
}
