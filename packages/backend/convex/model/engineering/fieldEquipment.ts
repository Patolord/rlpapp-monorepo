import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logEquipmentHistory } from "../../lib/audit";
import { getBatchDestination } from "./qrBatches";
import { syncQrProjectId } from "./qrProjectLinks";
import { equipKindValidator } from "../../schema/engineering";
import { notFound, ruleViolation } from "../../lib/domainErrors";

// Equipamento real (cadastrado em campo via QR) ↔ item planejado da obra:
// ações do técnico, mídia, vagas pendentes e vínculo/desvínculo.

type EquipmentKind = Doc<"projectEquipment">["kind"];

export const pendingSlotValidator = v.object({
  itemId: v.id("projectEquipment"),
  kind: equipKindValidator,
  system: v.string(),
  modelo: v.string(),
  capacidade: v.string(),
  towerName: v.union(v.string(), v.null()),
  floorLabel: v.union(v.string(), v.null()),
  floorNumber: v.union(v.number(), v.null()),
  environmentName: v.union(v.string(), v.null()),
});

export type RecordFieldActionInput = {
  itemId: Id<"projectEquipment">;
  action: "install" | "test" | "finalize";
  notes?: string;
  location?: { latitude: number; longitude: number };
};

export type AddPlannedEquipmentMediaInput = {
  itemId: Id<"projectEquipment">;
  photoIds?: Id<"_storage">[];
  videoIds?: Id<"_storage">[];
};

export type LinkEquipmentToPlannedItemInput = {
  itemId: Id<"projectEquipment">;
  equipmentId: Id<"equipment">;
};

export type CreateFromRegisteredEquipmentInput = {
  environmentId: Id<"environments">;
  systemId?: Id<"systems">;
  kind: EquipmentKind;
  equipmentId?: Id<"equipment">;
  token?: string;
  modelo?: string;
  capacidade?: string;
};

// Ações de campo do técnico (via QR): Instalar, Testar, Finalizar.
// Sempre registra usuário, data/hora, observação e GPS (estrutura pronta).
export async function recordFieldAction(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: RecordFieldActionInput
): Promise<void> {
  const item = await ctx.db.get("projectEquipment", args.itemId);
  if (!item) throw notFound("Equipamento não encontrado");

  const now = Date.now();
  const previousStatus = item.status;
  const patch: Record<string, unknown> = {};
  let newStatus: typeof item.status = item.status;

  if (args.action === "install") {
    newStatus = "installing";
    patch.installationDate = item.installationDate ?? now;
    patch.installedAt = item.installedAt ?? now;
  } else if (args.action === "test") {
    newStatus = "warning";
    patch.testDate = item.testDate ?? now;
  } else {
    newStatus = "operational";
    patch.installationDate = item.installationDate ?? now;
    patch.installedAt = item.installedAt ?? now;
  }
  patch.status = newStatus;

  await ctx.db.patch("projectEquipment", args.itemId, patch);
  if (item.linkedEquipmentId) {
    await ctx.db.patch("equipment", item.linkedEquipmentId, {
      status: newStatus,
    });
  }
  await logEquipmentHistory(ctx, user, {
    equipmentId: args.itemId,
    action:
      args.action === "install"
        ? "installed"
        : args.action === "test"
          ? "tested"
          : "finalized",
    previousValue: previousStatus,
    newValue: newStatus,
    notes: args.notes?.trim() || undefined,
    location: args.location,
  });
}

// Anexa fotos/vídeos a um equipamento planejado (upload feito via Convex storage).
export async function addPlannedEquipmentMedia(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: AddPlannedEquipmentMediaInput
): Promise<void> {
  const item = await ctx.db.get("projectEquipment", args.itemId);
  if (!item) throw notFound("Equipamento não encontrado");

  const patch: Record<string, unknown> = {};
  if (args.photoIds && args.photoIds.length > 0) {
    patch.photoIds = [...(item.photoIds ?? []), ...args.photoIds];
  }
  if (args.videoIds && args.videoIds.length > 0) {
    patch.videoIds = [...(item.videoIds ?? []), ...args.videoIds];
  }
  if (Object.keys(patch).length === 0) return;

  await ctx.db.patch("projectEquipment", args.itemId, patch);
  await logEquipmentHistory(ctx, user, {
    equipmentId: args.itemId,
    action: "media_added",
    newValue: `${args.photoIds?.length ?? 0} foto(s), ${
      args.videoIds?.length ?? 0
    } vídeo(s)`,
  });
}

// Vincula um equipamento real (QR) a um item planejado → verde/instalado.
export async function linkEquipmentToPlannedItem(
  ctx: MutationCtx,
  args: LinkEquipmentToPlannedItemInput
): Promise<void> {
  const item = await ctx.db.get("projectEquipment", args.itemId);
  if (!item) throw notFound("Equipamento planejado não encontrado");

  const equipment = await ctx.db.get("equipment", args.equipmentId);
  if (!equipment) throw notFound("Equipamento não encontrado");
  if (
    equipment.projectEquipmentId &&
    equipment.projectEquipmentId !== args.itemId
  ) {
    throw ruleViolation("Este equipamento já está vinculado a outro item");
  }

  // Desvincula o equipamento anterior, se houver.
  if (item.linkedEquipmentId && item.linkedEquipmentId !== args.equipmentId) {
    await ctx.db.patch("equipment", item.linkedEquipmentId, {
      projectEquipmentId: undefined,
    });
    await syncQrProjectId(ctx, item.linkedEquipmentId, undefined);
  }

  await ctx.db.patch("projectEquipment", args.itemId, {
    linkedEquipmentId: args.equipmentId,
    status: "operational",
    installedAt: item.installedAt ?? Date.now(),
  });
  await ctx.db.patch("equipment", args.equipmentId, {
    projectEquipmentId: args.itemId,
  });
  await syncQrProjectId(ctx, args.equipmentId, item.projectId);
}

export async function unlinkEquipmentFromPlannedItem(
  ctx: MutationCtx,
  itemId: Id<"projectEquipment">
): Promise<void> {
  const item = await ctx.db.get("projectEquipment", itemId);
  if (!item) throw notFound("Equipamento planejado não encontrado");
  if (item.linkedEquipmentId) {
    await ctx.db.patch("equipment", item.linkedEquipmentId, {
      projectEquipmentId: undefined,
    });
    await syncQrProjectId(ctx, item.linkedEquipmentId, undefined);
  }
  await ctx.db.patch("projectEquipment", itemId, {
    linkedEquipmentId: undefined,
    status: "installing",
    installedAt: undefined,
  });
}

// Cria um item planejado diretamente a partir de um equipamento já cadastrado
// pelo técnico (QR + equipment sem item planejado), em um passo único: insere
// o projectEquipment no ambiente/sistema e vincula o equipamento existente,
// preservando descrição/fotos do cadastro de campo. Não força "operational"
// (atribuir à obra não significa instalado).
export async function createPlannedItemFromRegisteredEquipment(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: CreateFromRegisteredEquipmentInput
): Promise<{ itemId: Id<"projectEquipment">; token: string | null }> {
  const env = await ctx.db.get("environments", args.environmentId);
  if (!env) throw notFound("Ambiente não encontrado");

  let systemName = "";
  if (args.systemId) {
    const system = await ctx.db.get("systems", args.systemId);
    if (!system) throw notFound("Sistema não encontrado");
    if (system.projectId !== env.projectId) {
      throw ruleViolation("O sistema não pertence à mesma obra do ambiente");
    }
    systemName = system.name;
  }

  // Resolve o equipamento cadastrado: por id direto ou pelo token bipado.
  let equipment = null;
  let qrCode = null;
  if (args.token) {
    const token = args.token.trim().toUpperCase();
    if (!token) throw ruleViolation("Informe o token do QR");
    qrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!qrCode) throw notFound(`QR "${token}" não encontrado`);
    if (qrCode.status !== "active") {
      throw ruleViolation(`QR "${token}" está inativo`);
    }
    if (!qrCode.equipmentId) {
      throw ruleViolation(
        `QR "${token}" ainda não foi cadastrado pelo técnico`
      );
    }
    equipment = await ctx.db.get("equipment", qrCode.equipmentId);
  } else if (args.equipmentId) {
    equipment = await ctx.db.get("equipment", args.equipmentId);
    if (equipment) {
      qrCode = await ctx.db
        .query("qrCodes")
        .withIndex("by_equipment", (q) => q.eq("equipmentId", equipment!._id))
        .order("desc")
        .first();
    }
  } else {
    throw ruleViolation("Informe o token do QR ou o equipamento");
  }

  if (!equipment) throw notFound("Equipamento não encontrado");
  if (equipment.projectEquipmentId) {
    throw ruleViolation("Este equipamento já está vinculado a um item da obra");
  }

  // Se o lote da etiqueta tem obra de destino, valida contra a obra do ambiente.
  if (qrCode) {
    const destination = await getBatchDestination(ctx, qrCode.batchId);
    if (destination && destination.projectId !== env.projectId) {
      throw ruleViolation(
        `QR "${qrCode.token}" pertence ao lote destinado à obra "${destination.projectName}"`
      );
    }
  }

  const itemId = await ctx.db.insert("projectEquipment", {
    projectId: env.projectId,
    environmentId: args.environmentId,
    towerId: env.towerId,
    floorId: env.floorId,
    system: systemName,
    systemId: args.systemId,
    ambiente: env.name,
    kind: args.kind,
    modelo: args.modelo?.trim() ?? "",
    capacidade: args.capacidade?.trim() ?? "",
    status: equipment.status,
    linkedEquipmentId: equipment._id,
  });
  await ctx.db.patch("equipment", equipment._id, {
    projectEquipmentId: itemId,
  });
  await syncQrProjectId(ctx, equipment._id, env.projectId);

  await logEquipmentHistory(ctx, user, {
    equipmentId: itemId,
    action: "created",
    newValue: systemName || "(sem sistema)",
  });
  if (qrCode) {
    await logEquipmentHistory(ctx, user, {
      equipmentId: itemId,
      action: "qr_linked",
      newValue: qrCode.token,
    });
  }

  return { itemId, token: qrCode?.token ?? null };
}

// Vagas planejadas de uma obra ainda sem equipamento real vinculado, com o
// contexto de localização (torre/andar/ambiente).
export async function listPendingSlots(
  ctx: QueryCtx,
  projectId: Id<"projects">
) {
  const items = await ctx.db
    .query("projectEquipment")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  const pending = items.filter(
    (item) => !item.linkedEquipmentId && item.environmentId && !item.unitId
  );
  if (pending.length === 0) return [];

  // Nomes da hierarquia pré-carregados uma vez (evita N+1 por item).
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
  const floorById = new Map(floors.map((f) => [f._id, f]));
  const envName = new Map(environments.map((e) => [e._id, e.name]));

  return pending
    .map((item) => {
      const floor = item.floorId ? floorById.get(item.floorId) : undefined;
      return {
        itemId: item._id,
        kind: item.kind,
        system: item.system,
        modelo: item.modelo,
        capacidade: item.capacidade,
        towerName: item.towerId
          ? towerName.get(item.towerId) ?? null
          : null,
        floorLabel: floor?.label ?? null,
        floorNumber: floor?.number ?? null,
        environmentName: item.environmentId
          ? envName.get(item.environmentId) ?? null
          : null,
      };
    })
    .sort(
      (a, b) =>
        (a.towerName ?? "").localeCompare(b.towerName ?? "") ||
        (b.floorNumber ?? 0) - (a.floorNumber ?? 0) ||
        (a.environmentName ?? "").localeCompare(b.environmentName ?? "") ||
        a.system.localeCompare(b.system) ||
        a.kind.localeCompare(b.kind)
    );
}

// Técnico atribui o equipamento que acabou de cadastrar a uma vaga planejada.
// Diferente de `linkEquipmentToPlannedItem` (escritório), NÃO força
// "operational": atribuir à vaga não significa instalado — o status vem do
// cadastro de campo e a instalação segue via recordFieldAction.
export async function claimPendingSlot(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: LinkEquipmentToPlannedItemInput
): Promise<void> {
  const item = await ctx.db.get("projectEquipment", args.itemId);
  if (!item) throw notFound("Vaga planejada não encontrada");
  if (item.linkedEquipmentId) {
    throw ruleViolation("Esta vaga já tem um equipamento vinculado");
  }

  const equipment = await ctx.db.get("equipment", args.equipmentId);
  if (!equipment) throw notFound("Equipamento não encontrado");
  if (
    equipment.projectEquipmentId &&
    equipment.projectEquipmentId !== args.itemId
  ) {
    throw ruleViolation("Este equipamento já está vinculado a outra vaga");
  }

  // Se a etiqueta veio de um lote com obra de destino, valida contra a obra.
  const qrCode = await ctx.db
    .query("qrCodes")
    .withIndex("by_equipment", (q) => q.eq("equipmentId", args.equipmentId))
    .order("desc")
    .first();
  if (qrCode) {
    const destination = await getBatchDestination(ctx, qrCode.batchId);
    if (destination && destination.projectId !== item.projectId) {
      throw ruleViolation(
        `A etiqueta pertence ao lote destinado à obra "${destination.projectName}"`
      );
    }
  }

  await ctx.db.patch("projectEquipment", args.itemId, {
    linkedEquipmentId: args.equipmentId,
    status: equipment.status,
  });
  await ctx.db.patch("equipment", args.equipmentId, {
    projectEquipmentId: args.itemId,
  });
  await syncQrProjectId(ctx, args.equipmentId, item.projectId);

  await logEquipmentHistory(ctx, user, {
    equipmentId: args.itemId,
    action: "qr_linked",
    newValue: qrCode?.token,
  });
}
