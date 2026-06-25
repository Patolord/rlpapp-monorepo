import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/functions";
import { equipmentStatusValidator } from "./equipment";
import type { Id } from "./_generated/dataModel";

const unitTypeValidator = v.union(v.literal("vrf"), v.literal("split"));
const equipKindValidator = v.union(
  v.literal("condensadora"),
  v.literal("evaporadora")
);

const floorValidator = v.object({
  number: v.number(),
  label: v.string(),
});
const floorsValidator = v.array(floorValidator);

function defaultFloorLabel(n: number): string {
  return n === 0 ? "Térreo" : `${n}º Andar`;
}

function normalizeFloors(floors: Array<{ number: number; label: string }>) {
  if (floors.length === 0) {
    throw new Error("A obra precisa de pelo menos um andar");
  }
  const seen = new Set<number>();
  for (const f of floors) {
    if (seen.has(f.number)) {
      throw new Error(`Andar ${f.number} duplicado`);
    }
    seen.add(f.number);
  }
  return floors
    .map((floor) => ({
      number: Math.floor(floor.number),
      label: floor.label.trim() || defaultFloorLabel(floor.number),
    }))
    .sort((a, b) => a.number - b.number);
}

/** Gera o rótulo padrão do apartamento: andar + final (ex: 2 + 1 = "201"). */
function autoUnitLabel(floor: number, final: number): string {
  return `${floor}${String(final).padStart(2, "0")}`;
}

// --- Listagem de obras (com progresso por ACs) ---

export const list = engineeringQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      _creationTime: v.number(),
      name: v.string(),
      floors: floorsValidator,
      createdAt: v.number(),
      totalItems: v.number(),
      installedItems: v.number(),
      unitCount: v.number(),
    })
  ),
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").order("desc").collect();

    return await Promise.all(
      projects.map(async (project) => {
        const items = await ctx.db
          .query("projectEquipment")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        const units = await ctx.db
          .query("projectUnits")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();

        const installedItems = items.filter(
          (i) => i.status === "operational"
        ).length;

        return {
          _id: project._id,
          _creationTime: project._creationTime,
          name: project.name,
          floors: project.floors,
          createdAt: project.createdAt,
          totalItems: items.length,
          installedItems,
          unitCount: units.length,
        };
      })
    );
  },
});

// --- Visão completa de uma obra (árvore andares → aptos → itens) ---

export const getOverview = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.union(
    v.object({
      _id: v.id("projects"),
      name: v.string(),
      floors: floorsValidator,
      createdAt: v.number(),
      totalItems: v.number(),
      installedItems: v.number(),
      units: v.array(
        v.object({
          _id: v.id("projectUnits"),
          floor: v.number(),
          final: v.number(),
          label: v.string(),
          type: unitTypeValidator,
          floorSpan: v.number(),
          deadline: v.union(v.number(), v.null()),
          equipment: v.array(
            v.object({
              _id: v.id("projectEquipment"),
              system: v.string(),
              ambiente: v.string(),
              kind: equipKindValidator,
              modelo: v.string(),
              capacidade: v.string(),
              status: equipmentStatusValidator,
              obs: v.union(v.string(), v.null()),
              deadline: v.union(v.number(), v.null()),
              linkedEquipmentId: v.union(v.id("equipment"), v.null()),
              token: v.union(v.string(), v.null()),
              installedAt: v.union(v.number(), v.null()),
            })
          ),
        })
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) return null;

    const units = await ctx.db
      .query("projectUnits")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    const items = await ctx.db
      .query("projectEquipment")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();

    // Resolve o token do QR vinculado para cada item (verde/instalado).
    const tokenByEquipment = new Map<string, string>();
    for (const item of items) {
      const linkedId = item.linkedEquipmentId;
      if (linkedId && !tokenByEquipment.has(linkedId)) {
        const qr = await ctx.db
          .query("qrCodes")
          .withIndex("by_equipment", (q) => q.eq("equipmentId", linkedId))
          .order("desc")
          .first();
        if (qr) tokenByEquipment.set(linkedId, qr.token);
      }
    }

    const itemsByUnit = new Map<string, typeof items>();
    for (const item of items) {
      const list = itemsByUnit.get(item.unitId) ?? [];
      list.push(item);
      itemsByUnit.set(item.unitId, list);
    }

    const unitsOut = units
      .slice()
      .sort((a, b) => a.floor - b.floor || a.final - b.final)
      .map((u) => ({
        _id: u._id,
        floor: u.floor,
        final: u.final,
        label: u.label,
        type: u.type,
        floorSpan: u.floorSpan,
        deadline: u.deadline ?? null,
        equipment: (itemsByUnit.get(u._id) ?? [])
          .slice()
          .sort(
            (a, b) =>
              a.system.localeCompare(b.system) ||
              (a.kind === b.kind ? 0 : a.kind === "condensadora" ? -1 : 1)
          )
          .map((e) => ({
            _id: e._id,
            system: e.system,
            ambiente: e.ambiente,
            kind: e.kind,
            modelo: e.modelo,
            capacidade: e.capacidade,
            status: e.status,
            obs: e.obs ?? null,
            deadline: e.deadline ?? null,
            linkedEquipmentId: e.linkedEquipmentId ?? null,
            token: e.linkedEquipmentId
              ? tokenByEquipment.get(e.linkedEquipmentId) ?? null
              : null,
            installedAt: e.installedAt ?? null,
          })),
      }));

    return {
      _id: project._id,
      name: project.name,
      floors: project.floors,
      createdAt: project.createdAt,
      totalItems: items.length,
      installedItems: items.filter((i) => i.status === "operational").length,
      units: unitsOut,
    };
  },
});

// --- CRUD de obra ---

export const create = engineeringMutation({
  args: { name: v.string(), floors: floorsValidator },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("O nome da obra é obrigatório");

    return await ctx.db.insert("projects", {
      name,
      floors: normalizeFloors(args.floors),
      createdAt: Date.now(),
    });
  },
});

export const update = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    floors: v.optional(floorsValidator),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");

    const updates: Partial<{ name: string; floors: typeof project.floors }> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("O nome da obra é obrigatório");
      updates.name = name;
    }
    if (args.floors !== undefined) {
      updates.floors = normalizeFloors(args.floors);
    }

    await ctx.db.patch("projects", args.projectId, updates);
    return args.projectId;
  },
});

export const remove = engineeringMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Remove em cascata: itens, unidades e entregas da obra.
    const items = await ctx.db
      .query("projectEquipment")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const item of items) {
      if (item.linkedEquipmentId) {
        await ctx.db.patch("equipment", item.linkedEquipmentId, {
          projectEquipmentId: undefined,
        });
      }
      await ctx.db.delete("projectEquipment", item._id);
    }

    const units = await ctx.db
      .query("projectUnits")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const unit of units) {
      await ctx.db.delete("projectUnits", unit._id);
    }

    const deliveries = await ctx.db
      .query("materialDeliveries")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const d of deliveries) {
      await ctx.db.delete("materialDeliveries", d._id);
    }

    await ctx.db.delete("projects", args.projectId);
    return null;
  },
});

// --- Gerador por padrão (estilo aba "Aptos") ---
//
// Cria, para cada andar selecionado, os apartamentos (finais) e a lista padrão
// de equipamentos por sistema. Modelos/ambientes podem ser refinados depois no
// editor ou via assistente de IA.

const systemTemplateValidator = v.object({
  // Nome do sistema, ex: "VRF 1", "VRF 2", "Split".
  name: v.string(),
  // Quantidade de evaporadoras (unidades internas) deste sistema.
  evaporadoras: v.number(),
  // Modelo/capacidade padrão da condensadora (opcional).
  condensadoraModelo: v.optional(v.string()),
  condensadoraCapacidade: v.optional(v.string()),
});

const finalTemplateValidator = v.object({
  type: unitTypeValidator,
  systems: v.array(systemTemplateValidator),
});

export const generateLayout = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    // Andares onde aplicar o padrão (devem existir em project.floors).
    floors: v.array(v.number()),
    // Um template por "final" (posição). finals[0] = Final 1, etc.
    finals: v.array(finalTemplateValidator),
    // Se true, apaga unidades/itens existentes nos andares antes de gerar.
    replace: v.optional(v.boolean()),
  },
  returns: v.object({ units: v.number(), items: v.number() }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
    if (args.finals.length === 0) {
      throw new Error("Defina ao menos um apartamento (final) no padrão");
    }

    const targetFloors = Array.from(new Set(args.floors.map((n) => Math.floor(n))));

    if (args.replace) {
      const existingUnits = await ctx.db
        .query("projectUnits")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
      for (const unit of existingUnits) {
        if (!targetFloors.includes(unit.floor)) continue;
        const unitItems = await ctx.db
          .query("projectEquipment")
          .withIndex("by_unit", (q) => q.eq("unitId", unit._id))
          .collect();
        for (const item of unitItems) {
          if (item.linkedEquipmentId) {
            await ctx.db.patch("equipment", item.linkedEquipmentId, {
              projectEquipmentId: undefined,
            });
          }
          await ctx.db.delete("projectEquipment", item._id);
        }
        await ctx.db.delete("projectUnits", unit._id);
      }
    }

    let unitCount = 0;
    let itemCount = 0;

    for (const floor of targetFloors) {
      for (let i = 0; i < args.finals.length; i++) {
        const template = args.finals[i];
        const final = i + 1;
        const unitId: Id<"projectUnits"> = await ctx.db.insert("projectUnits", {
          projectId: args.projectId,
          floor,
          final,
          label: autoUnitLabel(floor, final),
          type: template.type,
          floorSpan: 1,
        });
        unitCount++;

        for (const system of template.systems) {
          // Uma condensadora por sistema.
          await ctx.db.insert("projectEquipment", {
            projectId: args.projectId,
            unitId,
            system: system.name,
            ambiente: "Área Técnica",
            kind: "condensadora",
            modelo: system.condensadoraModelo?.trim() ?? "",
            capacidade: system.condensadoraCapacidade?.trim() ?? "",
            status: "installing",
          });
          itemCount++;

          const evapCount = Math.max(0, Math.floor(system.evaporadoras));
          for (let e = 0; e < evapCount; e++) {
            await ctx.db.insert("projectEquipment", {
              projectId: args.projectId,
              unitId,
              system: system.name,
              ambiente: `Ambiente ${e + 1}`,
              kind: "evaporadora",
              modelo: "",
              capacidade: "",
              status: "installing",
            });
            itemCount++;
          }
        }
      }
    }

    return { units: unitCount, items: itemCount };
  },
});
