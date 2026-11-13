import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { notFound } from "../../lib/domainErrors";

// Caminho legado de planejamento por apartamentos (projectUnits): itens
// planejados presos a uma unidade em vez de a um ambiente da hierarquia.

type EquipmentStatus = Doc<"projectEquipment">["status"];
type EquipmentKind = Doc<"projectEquipment">["kind"];

export type UpsertUnitEquipmentInput = {
  itemId?: Id<"projectEquipment">;
  projectId: Id<"projects">;
  unitId: Id<"projectUnits">;
  system: string;
  ambiente: string;
  kind: EquipmentKind;
  modelo?: string;
  capacidade?: string;
  status?: EquipmentStatus;
  obs?: string | null;
  deadline?: number | null;
};

export type BulkCreateUnitsWithEquipmentInput = {
  projectId: Id<"projects">;
  units: {
    floor: number;
    final: number;
    label?: string;
    type: Doc<"projectUnits">["type"];
    floorSpan?: number;
    deadline?: number;
    equipment: {
      system: string;
      ambiente: string;
      kind: EquipmentKind;
      modelo?: string;
      capacidade?: string;
      obs?: string;
    }[];
  }[];
};

export async function upsertUnitEquipment(
  ctx: MutationCtx,
  args: UpsertUnitEquipmentInput
): Promise<Id<"projectEquipment">> {
  const unit = await ctx.db.get("projectUnits", args.unitId);
  if (!unit) throw notFound("Apartamento não encontrado");

  const base = {
    system: args.system.trim() || "Split",
    ambiente: args.ambiente.trim() || "Ambiente",
    kind: args.kind,
    modelo: args.modelo?.trim() ?? "",
    capacidade: args.capacidade?.trim() ?? "",
    obs: args.obs === null ? undefined : args.obs?.trim() || undefined,
    deadline: args.deadline === null ? undefined : args.deadline ?? undefined,
  };

  if (args.itemId) {
    const item = await ctx.db.get("projectEquipment", args.itemId);
    if (!item) throw notFound("Equipamento não encontrado");
    await ctx.db.patch("projectEquipment", args.itemId, {
      ...base,
      status: args.status ?? item.status,
    });
    return args.itemId;
  }

  return await ctx.db.insert("projectEquipment", {
    projectId: args.projectId,
    unitId: args.unitId,
    ...base,
    status: args.status ?? "installing",
  });
}

// Criação em lote (usada pelo assistente de IA após aprovação do usuário).
// Cria apartamentos e seus itens em uma única transação.
export async function bulkCreateUnitsWithEquipment(
  ctx: MutationCtx,
  args: BulkCreateUnitsWithEquipmentInput
): Promise<{ units: number; items: number }> {
  const project = await ctx.db.get("projects", args.projectId);
  if (!project) throw notFound("Obra não encontrada");

  let unitCount = 0;
  let itemCount = 0;

  for (const u of args.units) {
    const floor = Math.floor(u.floor);
    const final = Math.max(1, Math.floor(u.final));
    const unitId = await ctx.db.insert("projectUnits", {
      projectId: args.projectId,
      floor,
      final,
      label: u.label?.trim() || `${floor}${String(final).padStart(2, "0")}`,
      type: u.type,
      floorSpan: Math.max(1, Math.floor(u.floorSpan ?? 1)),
      deadline: u.deadline ?? undefined,
    });
    unitCount++;

    for (const e of u.equipment) {
      await ctx.db.insert("projectEquipment", {
        projectId: args.projectId,
        unitId,
        system: e.system.trim() || "Split",
        ambiente: e.ambiente.trim() || "Ambiente",
        kind: e.kind,
        modelo: e.modelo?.trim() ?? "",
        capacidade: e.capacidade?.trim() ?? "",
        obs: e.obs?.trim() || undefined,
        status: "installing",
      });
      itemCount++;
    }
  }

  return { units: unitCount, items: itemCount };
}

function autoUnitLabel(floor: number, final: number): string {
  return `${floor}${String(final).padStart(2, "0")}`;
}

export type UpsertProjectUnitInput = {
  unitId?: Id<"projectUnits">;
  projectId: Id<"projects">;
  floor: number;
  final: number;
  label?: string;
  type: Doc<"projectUnits">["type"];
  floorSpan?: number;
  deadline?: number | null;
};

/** Cria (sem `unitId`) ou atualiza um apartamento da obra. */
export async function upsertProjectUnit(
  ctx: MutationCtx,
  input: UpsertProjectUnitInput
): Promise<Id<"projectUnits">> {
  const project = await ctx.db.get("projects", input.projectId);
  if (!project) throw notFound("Obra não encontrada");

  const floor = Math.floor(input.floor);
  const final = Math.max(1, Math.floor(input.final));
  const floorSpan = Math.max(1, Math.floor(input.floorSpan ?? 1));
  const label = input.label?.trim() || autoUnitLabel(floor, final);

  if (input.unitId) {
    const unit = await ctx.db.get("projectUnits", input.unitId);
    if (!unit) throw notFound("Apartamento não encontrado");
    await ctx.db.patch("projectUnits", input.unitId, {
      floor,
      final,
      label,
      type: input.type,
      floorSpan,
      deadline:
        input.deadline === null ? undefined : input.deadline ?? unit.deadline,
    });
    return input.unitId;
  }

  return await ctx.db.insert("projectUnits", {
    projectId: input.projectId,
    floor,
    final,
    label,
    type: input.type,
    floorSpan,
    deadline: input.deadline ?? undefined,
  });
}

/** Remove um apartamento e seus itens planejados, soltando os equipamentos. */
export async function removeProjectUnit(
  ctx: MutationCtx,
  unitId: Id<"projectUnits">
): Promise<void> {
  const items = await ctx.db
    .query("projectEquipment")
    .withIndex("by_unit", (q) => q.eq("unitId", unitId))
    .collect();
  for (const item of items) {
    if (item.linkedEquipmentId) {
      await ctx.db.patch("equipment", item.linkedEquipmentId, {
        projectEquipmentId: undefined,
      });
    }
    await ctx.db.delete("projectEquipment", item._id);
  }
  await ctx.db.delete("projectUnits", unitId);
}
