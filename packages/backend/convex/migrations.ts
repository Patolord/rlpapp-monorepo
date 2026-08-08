import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { adminMutation, adminQuery } from "./lib/rbac";
import { findOrCreateSystemInProject } from "./systems";
import { findOrCreateCustomerByName } from "./customers";
import { getLegacyClientLabel, getPortalUserIds } from "./lib/projects/helpers";
import { normalizeCustomerName } from "./lib/customers/helpers";
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
 * Backfill idempotente: cria registros em `customers` a partir de `projects.client`
 * (texto livre) e copia `clientIds` → `portalUserIds`. Não apaga campos legados.
 *
 * Rodar com: npx convex run migrations:backfillCustomersFromProjects
 */
export const backfillCustomersFromProjects = adminMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    projectsScanned: v.number(),
    customersCreated: v.number(),
    projectsLinked: v.number(),
    portalUsersCopied: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const project = args.projectId
      ? await ctx.db.get("projects", args.projectId)
      : null;
    const projects = args.projectId
      ? project
        ? [project]
        : []
      : await ctx.db.query("projects").collect();

    let projectsScanned = 0;
    let customersCreated = 0;
    let projectsLinked = 0;
    let portalUsersCopied = 0;
    let skipped = 0;

    const customerIdByName = new Map<string, Id<"customers">>();

    for (const proj of projects) {
      projectsScanned++;
      const legacyLabel = getLegacyClientLabel(proj);
      const legacyPortalIds = proj.clientIds ?? [];
      const needsCustomer = !proj.customerId && legacyLabel;
      const needsPortalCopy =
        !proj.portalUserIds && legacyPortalIds.length > 0;

      if (!needsCustomer && !needsPortalCopy) {
        skipped++;
        continue;
      }

      const patch: {
        customerId?: Id<"customers">;
        portalUserIds?: Id<"users">[];
      } = {};

      if (needsCustomer && legacyLabel) {
        const key = normalizeCustomerName(legacyLabel);
        let customerId = customerIdByName.get(key);
        if (!customerId) {
          const existing = await ctx.db
            .query("customers")
            .withIndex("by_name_normalized", (q) =>
              q.eq("nameNormalized", key)
            )
            .first();
          if (existing) {
            customerId = existing._id;
          } else if (dryRun) {
            customersCreated++;
          } else {
            const result = await findOrCreateCustomerByName(ctx, {
              name: legacyLabel,
              createdByUserId: ctx.user._id,
            });
            customerId = result.customerId;
            if (result.created) customersCreated++;
          }
          if (customerId) customerIdByName.set(key, customerId);
        }
        if (customerId) {
          patch.customerId = customerId;
          projectsLinked++;
        }
      }

      if (needsPortalCopy) {
        patch.portalUserIds = legacyPortalIds;
        portalUsersCopied++;
      }

      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch("projects", proj._id, patch);
      }
    }

    return {
      projectsScanned,
      customersCreated,
      projectsLinked,
      portalUsersCopied,
      skipped,
    };
  },
});

/** Relatório de projetos ainda sem customerId apesar de ter rótulo legado. */
export const verifyCustomerMigration = adminQuery({
  args: {},
  returns: v.object({
    unmigratedProjects: v.number(),
    duplicateCustomerNames: v.number(),
    invalidPortalUserRefs: v.number(),
    samples: v.array(
      v.object({
        projectId: v.id("projects"),
        projectName: v.string(),
        legacyClient: v.union(v.string(), v.null()),
      })
    ),
  }),
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    const unmigrated = projects.filter(
      (p) => !p.customerId && getLegacyClientLabel(p)
    );

    const nameCounts = new Map<string, number>();
    for (const customer of await ctx.db.query("customers").collect()) {
      nameCounts.set(
        customer.nameNormalized,
        (nameCounts.get(customer.nameNormalized) ?? 0) + 1
      );
    }
    const duplicateCustomerNames = [...nameCounts.values()].filter(
      (n) => n > 1
    ).length;

    let invalidPortalUserRefs = 0;
    for (const project of projects) {
      for (const userId of getPortalUserIds(project)) {
        const user = await ctx.db.get("users", userId);
        if (!user || !user.isActive) invalidPortalUserRefs++;
      }
    }

    return {
      unmigratedProjects: unmigrated.length,
      duplicateCustomerNames,
      invalidPortalUserRefs,
      samples: unmigrated.slice(0, 10).map((p) => ({
        projectId: p._id,
        projectName: p.name,
        legacyClient: getLegacyClientLabel(p) ?? null,
      })),
    };
  },
});

/**
 * Marca contatos legados como ativos. Idempotente e seguro para executar após
 * publicar o schema ampliado.
 */
export const backfillCustomerContactsActive = adminMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    updated: v.number(),
    continueCursor: v.string(),
    isDone: v.boolean(),
    continuationScheduled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(100, Math.floor(args.batchSize ?? 50)));
    const contactsPage = await ctx.db.query("customerContacts").paginate({
      cursor: args.cursor ?? null,
      numItems: batchSize,
    });
    let updated = 0;
    for (const contact of contactsPage.page) {
      if (contact.active !== undefined) continue;
      updated += 1;
      if (!args.dryRun) {
        await ctx.db.patch("customerContacts", contact._id, { active: true });
      }
    }
    const continuationScheduled = !args.dryRun && !contactsPage.isDone;
    if (continuationScheduled) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.backfillCustomerContactsActiveBatch,
        {
          cursor: contactsPage.continueCursor,
          batchSize,
        }
      );
    }

    return {
      scanned: contactsPage.page.length,
      updated,
      continueCursor: contactsPage.continueCursor,
      isDone: contactsPage.isDone,
      continuationScheduled,
    };
  },
});

export const backfillCustomerContactsActiveBatch = internalMutation({
  args: {
    cursor: v.string(),
    batchSize: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contactsPage = await ctx.db.query("customerContacts").paginate({
      cursor: args.cursor,
      numItems: args.batchSize,
    });
    for (const contact of contactsPage.page) {
      if (contact.active === undefined) {
        await ctx.db.patch("customerContacts", contact._id, { active: true });
      }
    }
    if (!contactsPage.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.backfillCustomerContactsActiveBatch,
        {
          cursor: contactsPage.continueCursor,
          batchSize: args.batchSize,
        }
      );
    }
    return null;
  },
});

/**
 * Audita uma página limitada de vínculos e números manuais. Repita com
 * `continueCursor` até `isDone` para verificar todo o conjunto sem ultrapassar
 * os limites de leitura de uma única transação.
 */
export const verifyProjectCustomerAndNumbersPage = adminQuery({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    projectsScanned: v.number(),
    missingCustomer: v.number(),
    missingLegacyNumber: v.number(),
    continueCursor: v.string(),
    isDone: v.boolean(),
    duplicateLegacyNumbers: v.array(
      v.object({
        legacyNumber: v.number(),
        projectIds: v.array(v.id("projects")),
        truncated: v.boolean(),
      })
    ),
    samples: v.array(
      v.object({
        projectId: v.id("projects"),
        projectName: v.string(),
        missingCustomer: v.boolean(),
        missingLegacyNumber: v.boolean(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(100, Math.floor(args.batchSize ?? 50)));
    const projectsPage = await ctx.db.query("projects").paginate({
      cursor: args.cursor ?? null,
      numItems: batchSize,
    });
    const duplicateIdsByNumber = new Map<number, Id<"projects">[]>();
    const truncatedNumbers = new Set<number>();
    for (const project of projectsPage.page) {
      if (
        project.legacyNumber !== undefined &&
        !duplicateIdsByNumber.has(project.legacyNumber)
      ) {
        const matches = await ctx.db
          .query("projects")
          .withIndex("by_legacy_number", (q) =>
            q.eq("legacyNumber", project.legacyNumber)
          )
          .take(101);
        if (matches.length > 1) {
          duplicateIdsByNumber.set(
            project.legacyNumber,
            matches.slice(0, 100).map((match) => match._id)
          );
          if (matches.length > 100) {
            truncatedNumbers.add(project.legacyNumber);
          }
        }
      }
    }

    const duplicateLegacyNumbers = [...duplicateIdsByNumber.entries()].map(
      ([legacyNumber, projectIds]) => ({
        legacyNumber,
        projectIds,
        truncated: truncatedNumbers.has(legacyNumber),
      })
    );
    const incomplete = projectsPage.page.filter(
      (project) =>
        project.customerId === undefined || project.legacyNumber === undefined
    );

    return {
      projectsScanned: projectsPage.page.length,
      missingCustomer: projectsPage.page.filter(
        (project) => project.customerId === undefined
      ).length,
      missingLegacyNumber: projectsPage.page.filter(
        (project) => project.legacyNumber === undefined
      ).length,
      continueCursor: projectsPage.continueCursor,
      isDone: projectsPage.isDone,
      duplicateLegacyNumbers,
      samples: incomplete.slice(0, 20).map((project) => ({
        projectId: project._id,
        projectName: project.name,
        missingCustomer: project.customerId === undefined,
        missingLegacyNumber: project.legacyNumber === undefined,
      })),
    };
  },
});
