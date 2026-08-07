import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { adminMutation } from "./lib/rbac";
import { findOrCreateSystemInProject } from "./systems";
import type { Id } from "./_generated/dataModel";
import {
  allocateNextSku,
  buildMaterialSearchText,
  ensureSkuCounterAtLeast,
  parseSkuSequence,
} from "./lib/compras/catalog";

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

/**
 * Backfill idempotente: cria registros na tabela `systems` a partir dos nomes
 * de sistema (strings distintas) dos equipamentos da hierarquia nova (itens
 * com `environmentId`) e vincula `projectEquipment.systemId`.
 *
 * Escopado por obra: obras diferentes com o mesmo nome de sistema (ex:
 * "VRF 1") recebem registros separados. Seguro de rodar múltiplas vezes:
 * pula itens que já possuem `systemId`.
 *
 * Rodar com: npx convex run migrations:backfillSystemsFromEquipmentStrings
 */
export const backfillSystemsFromEquipmentStrings = internalMutation({
  args: {
    // Se informado, migra apenas esta obra; senão, migra todas.
    projectId: v.optional(v.id("projects")),
  },
  returns: v.object({
    systemsCreated: v.number(),
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

    let systemsCreated = 0;
    let equipmentLinked = 0;

    for (const proj of projects) {
      const items = await ctx.db
        .query("projectEquipment")
        .withIndex("by_project", (q) => q.eq("projectId", proj._id))
        .collect();

      // Cache por nome normalizado para evitar leituras repetidas.
      const systemIdByName = new Map<string, Id<"systems">>();

      for (const item of items) {
        // Apenas itens da hierarquia nova e ainda sem sistema vinculado.
        if (!item.environmentId || item.systemId) continue;

        const key = (item.system.trim() || "Split").toLowerCase();
        let systemId = systemIdByName.get(key);
        if (!systemId) {
          const before = await ctx.db
            .query("systems")
            .withIndex("by_project", (q) => q.eq("projectId", proj._id))
            .collect();
          const result = await findOrCreateSystemInProject(
            ctx,
            proj._id,
            item.system
          );
          systemId = result.systemId;
          systemIdByName.set(key, systemId);
          if (!before.some((s) => s._id === systemId)) systemsCreated++;
        }

        await ctx.db.patch("projectEquipment", item._id, { systemId });
        equipmentLinked++;
      }
    }

    return { systemsCreated, equipmentLinked };
  },
});

/**
 * Backfill idempotente: atribui SKU, searchText e status faltantes aos materiais
 * existentes e inicializa o contador sequencial.
 *
 * Rodar com: npx convex run migrations:backfillMaterialCatalog
 */
export const backfillMaterialCatalog = internalMutation({
  args: {},
  returns: v.object({
    skusAssigned: v.number(),
    searchTextUpdated: v.number(),
    statusUpdated: v.number(),
    maxSkuSequence: v.number(),
  }),
  handler: async (ctx) => {
    let skusAssigned = 0;
    let searchTextUpdated = 0;
    let statusUpdated = 0;
    let maxSkuSequence = 0;

    const materials = await ctx.db.query("materials").collect();

    for (const material of materials) {
      if (material.sku) {
        const sequence = parseSkuSequence(material.sku);
        if (sequence && sequence > maxSkuSequence) {
          maxSkuSequence = sequence;
        }
      }

      const updates: Record<string, unknown> = {};
      const searchText = buildMaterialSearchText({
        name: material.name,
        sku: material.sku,
        barcode: material.barcode,
        category: material.category,
        manufacturer: material.manufacturer,
        manufacturerPartNumber: material.manufacturerPartNumber,
        brandPreference: material.brandPreference,
        spec: material.spec,
      });
      if (material.searchText !== searchText) {
        updates.searchText = searchText;
        searchTextUpdated++;
      }
      if (!material.status) {
        updates.status = material.active ? "active" : "archived";
        statusUpdated++;
      }
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch("materials", material._id, updates);
      }
    }

    for (const material of materials) {
      if (material.sku) continue;
      const sku = await allocateNextSku(ctx);
      await ctx.db.patch("materials", material._id, {
        sku,
        searchText: buildMaterialSearchText({
          name: material.name,
          sku,
          barcode: material.barcode,
          category: material.category,
          manufacturer: material.manufacturer,
          manufacturerPartNumber: material.manufacturerPartNumber,
          brandPreference: material.brandPreference,
          spec: material.spec,
        }),
        updatedAt: Date.now(),
      });
      skusAssigned++;
      const sequence = parseSkuSequence(sku);
      if (sequence && sequence > maxSkuSequence) {
        maxSkuSequence = sequence;
      }
    }

    if (maxSkuSequence > 0) {
      await ensureSkuCounterAtLeast(ctx, maxSkuSequence);
    }

    return {
      skusAssigned,
      searchTextUpdated,
      statusUpdated,
      maxSkuSequence,
    };
  },
});
