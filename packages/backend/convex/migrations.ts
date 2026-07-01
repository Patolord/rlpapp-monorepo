import { v } from "convex/values";
import { adminMutation } from "./lib/functions";
import type { Id } from "./_generated/dataModel";

/**
 * Backfill idempotente: cria, para cada obra que ainda não tem torres, uma
 * "Torre Única" e popula a tabela `floors` a partir do array legado
 * `projects.floors[]`. Também converte os apartamentos (projectUnits) existentes
 * em `environments` dentro do andar correspondente e atualiza os
 * projectEquipment com os IDs da nova hierarquia.
 *
 * Seguro de rodar múltiplas vezes: pula obras que já possuem torres.
 */
export const backfillTowersAndFloors = adminMutation({
  args: {
    // Se informado, migra apenas esta obra; senão, migra todas pendentes.
    projectId: v.optional(v.id("projects")),
  },
  returns: v.object({
    projectsMigrated: v.number(),
    towersCreated: v.number(),
    floorsCreated: v.number(),
    environmentsCreated: v.number(),
    equipmentLinked: v.number(),
  }),
  handler: async (ctx, args) => {
    const project = args.projectId
      ? await ctx.db.get("projects", args.projectId)
      : null;
    const projects = args.projectId
      ? project
        ? [project]
        : []
      : await ctx.db.query("projects").collect();

    let projectsMigrated = 0;
    let towersCreated = 0;
    let floorsCreated = 0;
    let environmentsCreated = 0;
    let equipmentLinked = 0;

    for (const proj of projects) {
      // Idempotência: pula obras que já têm torres.
      const existingTower = await ctx.db
        .query("towers")
        .withIndex("by_project", (q) => q.eq("projectId", proj._id))
        .first();
      if (existingTower) continue;

      const towerId = await ctx.db.insert("towers", {
        projectId: proj._id,
        name: "Torre Única",
        order: 0,
        createdAt: Date.now(),
      });
      towersCreated++;

      // Cria os andares a partir do array legado.
      const floorIdByNumber = new Map<number, Id<"floors">>();
      for (const floor of proj.floors) {
        const floorId = await ctx.db.insert("floors", {
          towerId,
          projectId: proj._id,
          number: floor.number,
          label: floor.label,
          createdAt: Date.now(),
        });
        floorIdByNumber.set(floor.number, floorId);
        floorsCreated++;
      }

      // Converte apartamentos (projectUnits) em ambientes (environments).
      const units = await ctx.db
        .query("projectUnits")
        .withIndex("by_project", (q) => q.eq("projectId", proj._id))
        .collect();

      for (const unit of units) {
        let floorId = floorIdByNumber.get(unit.floor);
        // Se o apartamento referencia um andar inexistente, cria-o.
        if (!floorId) {
          floorId = await ctx.db.insert("floors", {
            towerId,
            projectId: proj._id,
            number: unit.floor,
            label: unit.floor === 0 ? "Térreo" : `${unit.floor}º Andar`,
            createdAt: Date.now(),
          });
          floorIdByNumber.set(unit.floor, floorId);
          floorsCreated++;
        }

        const envId = await ctx.db.insert("environments", {
          floorId,
          towerId,
          projectId: proj._id,
          name: unit.label,
          type: unit.type,
          order: unit.final,
          createdAt: Date.now(),
        });
        environmentsCreated++;

        // Vincula os equipamentos do apartamento ao novo ambiente/andar/torre.
        const items = await ctx.db
          .query("projectEquipment")
          .withIndex("by_unit", (q) => q.eq("unitId", unit._id))
          .collect();
        for (const item of items) {
          await ctx.db.patch("projectEquipment", item._id, {
            environmentId: envId,
            towerId,
            floorId,
          });
          equipmentLinked++;
        }
      }

      projectsMigrated++;
    }

    return {
      projectsMigrated,
      towersCreated,
      floorsCreated,
      environmentsCreated,
      equipmentLinked,
    };
  },
});
