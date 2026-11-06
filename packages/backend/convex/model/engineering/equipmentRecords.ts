import type { PaginationOptions } from "convex/server";
import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { engineeringTables } from "../../schema/engineering";
import { syncQrProjectId } from "./qrProjectLinks";

// Equipamento cadastrado em campo (`convex/equipment.ts`) e seus registros de
// instalação/manutenção (`convex/maintenanceLogs.ts`).

// ---------------------------------------------------------------------------
// Validadores de retorno
// ---------------------------------------------------------------------------

export const equipmentDocValidator = v.object({
  _id: v.id("equipment"),
  _creationTime: v.number(),
  ...engineeringTables.equipment.validator.fields,
});

const maintenanceLogFields = {
  _id: v.id("maintenanceLogs"),
  _creationTime: v.number(),
  ...engineeringTables.maintenanceLogs.validator.fields,
};

export const assignableEquipmentValidator = v.object({
  _id: v.id("equipment"),
  description: v.optional(v.string()),
  status: engineeringTables.equipment.validator.fields.status,
  token: v.union(v.string(), v.null()),
});

export const equipmentLogValidator = v.object({
  ...maintenanceLogFields,
  photoUrls: v.array(v.string()),
});

export const myMaintenanceLogsValidator = paginationResultValidator(
  v.object({
    ...maintenanceLogFields,
    equipment: v.union(v.object({ description: v.optional(v.string()) }), v.null()),
    qrToken: v.union(v.string(), v.null()),
    photoUrls: v.array(v.string()),
  })
);

// ---------------------------------------------------------------------------
// Equipamentos
// ---------------------------------------------------------------------------

export type UpdateEquipmentInput = {
  id: Id<"equipment">;
  description?: string;
  status?: Doc<"equipment">["status"];
  projectEquipmentId?: Id<"projectEquipment">;
};

/** Atualiza só os campos informados e mantém o QR em sincronia com o vínculo. */
export async function updateEquipment(
  ctx: MutationCtx,
  input: UpdateEquipmentInput
): Promise<Id<"equipment">> {
  const { id, ...updates } = input;
  const equipment = await ctx.db.get("equipment", id);
  if (!equipment) throw new Error("Equipment not found");

  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) filtered[key] = value;
  }

  await ctx.db.patch("equipment", id, filtered);

  // Mantém qrCodes.projectId (denormalizado) em sincronia com o vínculo.
  if (input.projectEquipmentId !== undefined) {
    const planned = await ctx.db.get("projectEquipment", input.projectEquipmentId);
    await syncQrProjectId(ctx, id, planned?.projectId);
  }

  return id;
}

/** Equipamentos que ainda não foram alocados a nenhum item de obra. */
export async function listAssignableEquipment(ctx: QueryCtx) {
  const equipment = await ctx.db
    .query("equipment")
    .withIndex("by_projectEquipment", (q) => q.eq("projectEquipmentId", undefined))
    .order("desc")
    .collect();

  return await Promise.all(
    equipment.map(async (e) => {
      const qrCode = await ctx.db
        .query("qrCodes")
        .withIndex("by_equipment", (q) => q.eq("equipmentId", e._id))
        .order("desc")
        .first();
      return {
        _id: e._id,
        description: e.description,
        status: e.status,
        token: qrCode?.token ?? null,
      };
    })
  );
}

// ---------------------------------------------------------------------------
// Registros de instalação/manutenção
// ---------------------------------------------------------------------------

/** Registros de um equipamento, do mais novo ao mais antigo, com as URLs das fotos. */
export async function listEquipmentLogs(ctx: QueryCtx, equipmentId: Id<"equipment">) {
  const logs = await ctx.db
    .query("maintenanceLogs")
    .withIndex("by_equipment", (q) => q.eq("equipmentId", equipmentId))
    .order("desc")
    .collect();

  return await Promise.all(
    logs.map(async (log) => {
      const photoUrls = await Promise.all(log.photoIds.map((id) => ctx.storage.getUrl(id)));
      return {
        ...log,
        photoUrls: photoUrls.filter((url): url is string => url !== null),
      };
    })
  );
}

/** Registros criados pelo usuário, paginados, com o equipamento e o QR de cada um. */
export async function listMyMaintenanceLogs(
  ctx: QueryCtx,
  user: Doc<"users">,
  paginationOpts: PaginationOptions
) {
  const results = await ctx.db
    .query("maintenanceLogs")
    .withIndex("by_createdByUser", (q) => q.eq("createdByUserId", user._id))
    .order("desc")
    .paginate(paginationOpts);

  const page = await Promise.all(
    results.page.map(async (log) => {
      const equipment = await ctx.db.get("equipment", log.equipmentId);
      const qrCode = await ctx.db
        .query("qrCodes")
        .withIndex("by_equipment", (q) => q.eq("equipmentId", log.equipmentId))
        .order("desc")
        .first();
      const photoUrls = await Promise.all(log.photoIds.map((id) => ctx.storage.getUrl(id)));
      return {
        ...log,
        equipment: equipment ? { description: equipment.description } : null,
        qrToken: qrCode?.token ?? null,
        photoUrls: photoUrls.filter((url): url is string => url !== null),
      };
    })
  );

  return { ...results, page };
}

export type CreateMaintenanceLogInput = {
  equipmentId: Id<"equipment">;
  type: "installation" | "maintenance";
  notes?: string;
  tags?: string[];
  status: Doc<"maintenanceLogs">["status"];
  tests?: Doc<"maintenanceLogs">["tests"];
  photoIds: Id<"_storage">[];
};

/** Grava o registro em nome do usuário e leva o status ao equipamento. */
export async function createMaintenanceLog(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CreateMaintenanceLogInput
): Promise<Id<"maintenanceLogs">> {
  if (input.photoIds.length === 0) {
    throw new Error("É obrigatório anexar pelo menos uma foto");
  }

  // Responsável vinculado ao usuário logado (não aceita texto livre).
  const technicianName = user.name;

  await ctx.db.patch("equipment", input.equipmentId, {
    status: input.status,
  });

  return await ctx.db.insert("maintenanceLogs", {
    equipmentId: input.equipmentId,
    type: input.type,
    technicianName,
    createdByUserId: user._id,
    notes: input.notes?.trim() || undefined,
    tags: input.tags,
    status: input.status,
    tests: input.tests,
    photoIds: input.photoIds,
    createdAt: Date.now(),
  });
}
