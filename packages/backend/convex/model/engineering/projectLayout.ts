import type { Infer } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { finalTemplateValidator } from "./projectValidators";

// Gerador por padrão (estilo aba "Aptos"): cria, para cada andar selecionado,
// os apartamentos (finais) e a lista padrão de equipamentos por sistema.
// Modelos/ambientes podem ser refinados depois no editor ou via assistente de IA.

export type FinalTemplate = Infer<typeof finalTemplateValidator>;

export type GenerateProjectLayoutInput = {
  projectId: Id<"projects">;
  /** Andares onde aplicar o padrão (devem existir em project.floors). */
  floors: number[];
  /** Um template por "final" (posição). finals[0] = Final 1, etc. */
  finals: FinalTemplate[];
  /** Se true, apaga unidades/itens existentes nos andares antes de gerar. */
  replace?: boolean;
};

/** Gera o rótulo padrão do apartamento: andar + final (ex: 2 + 1 = "201"). */
function autoUnitLabel(floor: number, final: number): string {
  return `${floor}${String(final).padStart(2, "0")}`;
}

async function deleteUnitsOnFloors(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  targetFloors: number[]
): Promise<void> {
  const existingUnits = await ctx.db
    .query("projectUnits")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
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

export async function generateProjectLayout(
  ctx: MutationCtx,
  args: GenerateProjectLayoutInput
): Promise<{ units: number; items: number }> {
  const project = await ctx.db.get("projects", args.projectId);
  if (!project) throw new Error("Obra não encontrada");
  if (args.finals.length === 0) {
    throw new Error("Defina ao menos um apartamento (final) no padrão");
  }

  const targetFloors = Array.from(new Set(args.floors.map((n) => Math.floor(n))));

  if (args.replace) {
    await deleteUnitsOnFloors(ctx, args.projectId, targetFloors);
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
}
