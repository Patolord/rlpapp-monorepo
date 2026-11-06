import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { getBatchDestination } from "./qrBatches";

// Leituras de QR codes em contexto: a árvore completa de uma etiqueta
// escaneada e as etiquetas de uma obra.

// --- Contexto completo de um QR (página mobile ao escanear) ---
//
// Público (sem auth), como getByToken. Resolve toda a árvore: QR → equipamento
// real → item planejado → ambiente → andar → torre → obra, incluindo checklist.
export async function getQrFullContext(ctx: QueryCtx, token: string) {
  const qrCode = await ctx.db
    .query("qrCodes")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!qrCode) return null;

  const equipment = qrCode.equipmentId
    ? await ctx.db.get("equipment", qrCode.equipmentId)
    : null;

  let plannedEquipment = null;
  let location = null;
  let checklist: {
    _id: Id<"checklistItems">;
    label: string;
    required: boolean;
    completed: boolean;
  }[] = [];

  if (equipment?.projectEquipmentId) {
    const planned = await ctx.db.get(
      "projectEquipment",
      equipment.projectEquipmentId
    );
    if (planned) {
      plannedEquipment = {
        _id: planned._id,
        system: planned.system,
        ambiente: planned.ambiente,
        kind: planned.kind,
        modelo: planned.modelo,
        capacidade: planned.capacidade,
        status: planned.status,
        serialNumber: planned.serialNumber ?? null,
        scheduledDate: planned.scheduledDate ?? null,
        installationDate: planned.installationDate ?? null,
        testDate: planned.testDate ?? null,
      };

      const project = await ctx.db.get("projects", planned.projectId);
      let towerName: string | null = null;
      let floorLabel: string | null = null;
      let environmentName: string | null = null;
      if (planned.towerId) {
        towerName = (await ctx.db.get("towers", planned.towerId))?.name ?? null;
      }
      if (planned.floorId) {
        floorLabel =
          (await ctx.db.get("floors", planned.floorId))?.label ?? null;
      }
      if (planned.environmentId) {
        environmentName =
          (await ctx.db.get("environments", planned.environmentId))?.name ??
          null;
      }
      if (project) {
        location = {
          projectId: project._id,
          projectName: project.name,
          towerName,
          floorLabel,
          environmentName,
        };
      }

      const items = await ctx.db
        .query("checklistItems")
        .withIndex("by_equipment", (q) => q.eq("equipmentId", planned._id))
        .collect();
      checklist = items
        .sort((a, b) => a.order - b.order)
        .map((i) => ({
          _id: i._id,
          label: i.label,
          required: i.required,
          completed: i.completed,
        }));
    }
  }

  return {
    token: qrCode.token,
    qrStatus: qrCode.status,
    equipment,
    plannedEquipment,
    location,
    checklist,
    batchProject: await getBatchDestination(ctx, qrCode.batchId),
  };
}

// Fila de atribuição do operador: equipamentos já cadastrados pelo técnico
// (QR com equipment) destinados a esta obra, mas ainda sem item planejado.
// Fontes: QRs com projectId herdado do lote e QRs de lotes destinados à obra.
export async function listRegisteredEquipmentForProject(
  ctx: QueryCtx,
  projectId: Id<"projects">
) {
  const candidates = new Map<Id<"qrCodes">, Doc<"qrCodes">>();

  const byProject = await ctx.db
    .query("qrCodes")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(1000);
  for (const qr of byProject) candidates.set(qr._id, qr);

  // QRs de lotes destinados à obra cujo cadastro aconteceu antes da herança
  // automática de projectId (ou cujo projectId foi limpo).
  const batches = await ctx.db
    .query("qrBatches")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(100);
  for (const batch of batches) {
    const batchCodes = await ctx.db
      .query("qrCodes")
      .withIndex("by_batchId", (q) => q.eq("batchId", batch.batchId))
      .take(1000);
    for (const qr of batchCodes) candidates.set(qr._id, qr);
  }

  const rows: {
    qrId: Id<"qrCodes">;
    token: string;
    equipmentId: Id<"equipment">;
    description: string | null;
    photoUrl: string | null;
    batchName: string | null;
    registeredAt: number;
  }[] = [];

  for (const qr of candidates.values()) {
    if (!qr.equipmentId || qr.status !== "active") continue;
    const equipment = await ctx.db.get("equipment", qr.equipmentId);
    if (!equipment || equipment.projectEquipmentId) continue;

    const photoId = equipment.labelPhotoIds?.[0];
    rows.push({
      qrId: qr._id,
      token: qr.token,
      equipmentId: equipment._id,
      description: equipment.description ?? null,
      photoUrl: photoId ? await ctx.storage.getUrl(photoId) : null,
      batchName: qr.batchName ?? null,
      registeredAt: equipment.createdAt,
    });
  }

  return rows.sort((a, b) => b.registeredAt - a.registeredAt);
}

// Lista todos os QR codes atribuídos a uma obra, com a localização
// (torre/andar/ambiente) e os dados do item planejado vinculado.
// Usa o campo denormalizado qrCodes.projectId (índice by_project).
export async function listQrCodesByProject(
  ctx: QueryCtx,
  projectId: Id<"projects">
) {
  const qrCodes = await ctx.db
    .query("qrCodes")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  // Nomes da hierarquia pré-carregados uma vez (evita N+1 por QR).
  const [towers, floors, environments] = await Promise.all([
    ctx.db
      .query("towers")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect(),
    ctx.db
      .query("floors")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect(),
    ctx.db
      .query("environments")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect(),
  ]);
  const towerName = new Map(towers.map((t) => [t._id, t.name]));
  const floorLabel = new Map(floors.map((f) => [f._id, f.label]));
  const envName = new Map(environments.map((e) => [e._id, e.name]));

  const rows = await Promise.all(
    qrCodes.map(async (qr) => {
      const equipment = qr.equipmentId
        ? await ctx.db.get("equipment", qr.equipmentId)
        : null;
      const planned = equipment?.projectEquipmentId
        ? await ctx.db.get("projectEquipment", equipment.projectEquipmentId)
        : null;

      return {
        _id: qr._id,
        token: qr.token,
        qrStatus: qr.status,
        batchId: qr.batchId ?? null,
        batchName: qr.batchName ?? null,
        createdAt: qr.createdAt,
        equipmentId: qr.equipmentId ?? null,
        plannedItemId: planned?._id ?? null,
        description: equipment?.description ?? null,
        system: planned?.system ?? null,
        ambiente: planned?.ambiente ?? null,
        kind: planned?.kind ?? null,
        modelo: planned?.modelo ?? null,
        capacidade: planned?.capacidade ?? null,
        status: planned?.status ?? equipment?.status ?? null,
        towerName: planned?.towerId
          ? towerName.get(planned.towerId) ?? null
          : null,
        floorLabel: planned?.floorId
          ? floorLabel.get(planned.floorId) ?? null
          : null,
        environmentName: planned?.environmentId
          ? envName.get(planned.environmentId) ?? null
          : null,
        installedAt: planned?.installedAt ?? null,
      };
    })
  );

  // Ordena por localização para leitura natural (torre → andar → ambiente).
  return rows.sort(
    (a, b) =>
      (a.towerName ?? "").localeCompare(b.towerName ?? "") ||
      (a.floorLabel ?? "").localeCompare(b.floorLabel ?? "") ||
      (a.environmentName ?? "").localeCompare(b.environmentName ?? "") ||
      a.token.localeCompare(b.token)
  );
}
