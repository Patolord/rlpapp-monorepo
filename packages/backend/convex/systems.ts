import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { logAudit, logEquipmentHistory } from "./lib/audit";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// Sistemas de climatização escopados a UMA obra (ex: "VRF 1", "Split").
// Um sistema agrupa equipamentos que podem estar em ambientes diferentes da
// mesma obra (condensadora na cobertura + evaporadoras nos apartamentos).

/**
 * Localiza um sistema da obra pelo nome (case-insensitive) ou cria um novo.
 * Usado por fluxos que recebem o sistema como texto (assistente de IA,
 * backfill de dados legados). Retorna o id e o nome canônico do sistema.
 */
export async function findOrCreateSystemInProject(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  name: string
): Promise<{ systemId: Id<"systems">; name: string }> {
  const trimmed = name.trim() || "Split";
  const existing = await ctx.db
    .query("systems")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const match = existing.find(
    (s) => s.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return { systemId: match._id, name: match.name };

  const systemId = await ctx.db.insert("systems", {
    projectId,
    name: trimmed,
    createdAt: Date.now(),
  });
  return { systemId, name: trimmed };
}

/**
 * Apaga os sistemas informados que ficaram sem nenhum equipamento na obra.
 * Chamado após exclusões em cascata (ambiente/andar/torre) para não deixar
 * sistemas órfãos aparecendo nos selects.
 */
export async function deleteSystemsIfOrphaned(
  ctx: MutationCtx,
  user: Doc<"users">,
  systemIds: Iterable<Id<"systems">>
): Promise<void> {
  for (const systemId of new Set(systemIds)) {
    const system = await ctx.db.get("systems", systemId);
    if (!system) continue;
    const remaining = await ctx.db
      .query("projectEquipment")
      .withIndex("by_system", (q) => q.eq("systemId", systemId))
      .first();
    if (remaining) continue;
    await ctx.db.delete("systems", systemId);
    await logAudit(ctx, user, {
      action: "delete",
      tableName: "systems",
      recordId: systemId,
      details: `${system.name} (sem equipamentos após exclusão em cascata)`,
    });
  }
}

const systemValidator = v.object({
  _id: v.id("systems"),
  projectId: v.id("projects"),
  name: v.string(),
  type: v.union(v.string(), v.null()),
  obs: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

// Lista os sistemas de uma obra (ordenados por nome).
export const listSystemsByProject = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(systemValidator),
  handler: async (ctx, args) => {
    const systems = await ctx.db
      .query("systems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return systems
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({
        _id: s._id,
        projectId: s.projectId,
        name: s.name,
        type: s.type ?? null,
        obs: s.obs ?? null,
        createdAt: s.createdAt,
      }));
  },
});

// Cria um sistema dentro de uma obra. Nomes são únicos por obra
// (comparação case-insensitive) para evitar duplicatas como "VRF 1"/"vrf 1".
export const createSystemInProject = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    type: v.optional(v.string()),
    obs: v.optional(v.string()),
  },
  returns: v.id("systems"),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");

    const name = args.name.trim();
    if (!name) throw new Error("O nome do sistema é obrigatório");

    const existing = await ctx.db
      .query("systems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    if (existing.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Já existe um sistema chamado "${name}" nesta obra`);
    }

    const systemId = await ctx.db.insert("systems", {
      projectId: args.projectId,
      name,
      type: args.type?.trim() || undefined,
      obs: args.obs?.trim() || undefined,
      createdAt: Date.now(),
    });
    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "systems",
      recordId: systemId,
      details: name,
    });
    return systemId;
  },
});

// Cria vários sistemas de uma vez (fluxo de cadastro rápido). Nomes que já
// existem na obra (case-insensitive) não são recriados — retornam o sistema
// existente com `created: false`. Nomes duplicados na própria lista são
// deduplicados silenciosamente.
export const bulkCreateSystems = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    names: v.array(v.string()),
  },
  returns: v.array(
    v.object({
      systemId: v.id("systems"),
      name: v.string(),
      created: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");

    const existing = await ctx.db
      .query("systems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const byLowerName = new Map(
      existing.map((s) => [s.name.toLowerCase(), s])
    );

    const results: { systemId: Id<"systems">; name: string; created: boolean }[] =
      [];
    const seen = new Set<string>();

    for (const raw of args.names) {
      const name = raw.trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);

      const match = byLowerName.get(lower);
      if (match) {
        results.push({ systemId: match._id, name: match.name, created: false });
        continue;
      }

      const systemId = await ctx.db.insert("systems", {
        projectId: args.projectId,
        name,
        createdAt: Date.now(),
      });
      await logAudit(ctx, ctx.user, {
        action: "create",
        tableName: "systems",
        recordId: systemId,
        details: name,
      });
      results.push({ systemId, name, created: true });
    }

    return results;
  },
});

// Cadastro "sistema-first": cria sistemas com seus equipamentos planejados em
// uma única transação. Cada bloco tem linhas de equipamento apontando para o
// ambiente onde ficam (evaporadoras na unidade, condensadora podendo ficar em
// outro ambiente, ex: cobertura/área técnica). O bloco pode:
//   - criar um sistema novo (`name`); nomes que colidem com sistemas
//     existentes ganham sufixo numérico automático ("VRF 1 (2)");
//   - adicionar a um sistema existente (`systemId`);
//   - criar itens sem sistema (nem `name` nem `systemId`) — exibem alerta.
// Não gera QR: as etiquetas nascem livres e são vinculadas em campo.
export const createSystemsWithEquipment = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    systems: v.array(
      v.object({
        systemId: v.optional(v.id("systems")),
        name: v.optional(v.string()),
        type: v.optional(v.string()),
        lines: v.array(
          v.object({
            kind: v.union(
              v.literal("condensadora"),
              v.literal("evaporadora")
            ),
            qty: v.number(),
            environmentId: v.id("environments"),
            modelo: v.optional(v.string()),
            capacidade: v.optional(v.string()),
          })
        ),
      })
    ),
  },
  returns: v.object({
    systemsCreated: v.number(),
    itemsCreated: v.number(),
  }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
    if (args.systems.length === 0) {
      throw new Error("Informe pelo menos um sistema");
    }

    const totalItems = args.systems.reduce(
      (sum, s) =>
        sum +
        s.lines.reduce((acc, l) => acc + Math.max(0, Math.floor(l.qty)), 0),
      0
    );
    if (totalItems === 0) {
      throw new Error("Informe a quantidade de equipamentos");
    }
    if (totalItems > 500) {
      throw new Error(
        `Limite de 500 equipamentos por operação excedido (${totalItems})`
      );
    }

    // Carrega e valida os ambientes referenciados (todos da mesma obra).
    const envIds = new Set(
      args.systems.flatMap((s) => s.lines.map((l) => l.environmentId))
    );
    const envById = new Map<Id<"environments">, Doc<"environments">>();
    for (const envId of envIds) {
      const env = await ctx.db.get("environments", envId);
      if (!env) throw new Error("Ambiente não encontrado");
      if (env.projectId !== args.projectId) {
        throw new Error("Todos os ambientes devem pertencer à mesma obra");
      }
      envById.set(envId, env);
    }

    // Nomes existentes na obra (case-insensitive) para evitar colisão.
    const existing = await ctx.db
      .query("systems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const takenNames = new Set(existing.map((s) => s.name.toLowerCase()));

    let systemsCreated = 0;
    let itemsCreated = 0;

    for (const spec of args.systems) {
      let systemId: Id<"systems"> | undefined;
      let name = "";

      if (spec.systemId) {
        // Sistema existente: só adiciona equipamentos.
        const system = await ctx.db.get("systems", spec.systemId);
        if (!system) throw new Error("Sistema não encontrado");
        if (system.projectId !== args.projectId) {
          throw new Error("O sistema não pertence a esta obra");
        }
        systemId = system._id;
        name = system.name;
      } else if (spec.name?.trim()) {
        const baseName = spec.name.trim();
        name = baseName;
        for (let n = 2; takenNames.has(name.toLowerCase()); n++) {
          name = `${baseName} (${n})`;
        }
        takenNames.add(name.toLowerCase());

        systemId = await ctx.db.insert("systems", {
          projectId: args.projectId,
          name,
          type: spec.type?.trim() || undefined,
          createdAt: Date.now(),
        });
        systemsCreated++;
        await logAudit(ctx, ctx.user, {
          action: "create",
          tableName: "systems",
          recordId: systemId,
          details: name,
        });
      }
      // Nem systemId nem name: itens sem sistema (alerta na UI).

      for (const line of spec.lines) {
        const qty = Math.max(0, Math.floor(line.qty));
        const env = envById.get(line.environmentId)!;
        for (let i = 0; i < qty; i++) {
          const itemId = await ctx.db.insert("projectEquipment", {
            projectId: args.projectId,
            environmentId: env._id,
            towerId: env.towerId,
            floorId: env.floorId,
            system: name,
            systemId,
            ambiente: env.name,
            kind: line.kind,
            modelo: line.modelo?.trim() ?? "",
            capacidade: line.capacidade?.trim() ?? "",
            status: "installing",
          });
          itemsCreated++;
          await logEquipmentHistory(ctx, ctx.user, {
            equipmentId: itemId,
            action: "created",
            newValue: name || "(sem sistema)",
          });
        }
      }
    }

    return { systemsCreated, itemsCreated };
  },
});

// Atualiza nome/tipo/obs de um sistema. Renomear também sincroniza o campo
// denormalizado `system` (string) em todos os equipamentos do sistema.
export const updateSystemDetails = engineeringMutation({
  args: {
    systemId: v.id("systems"),
    name: v.optional(v.string()),
    type: v.optional(v.union(v.string(), v.null())),
    obs: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const system = await ctx.db.get("systems", args.systemId);
    if (!system) throw new Error("Sistema não encontrado");

    const updates: Partial<{
      name: string;
      type: string | undefined;
      obs: string | undefined;
    }> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("O nome do sistema é obrigatório");
      if (name.toLowerCase() !== system.name.toLowerCase()) {
        const siblings = await ctx.db
          .query("systems")
          .withIndex("by_project", (q) => q.eq("projectId", system.projectId))
          .collect();
        if (
          siblings.some(
            (s) =>
              s._id !== args.systemId &&
              s.name.toLowerCase() === name.toLowerCase()
          )
        ) {
          throw new Error(`Já existe um sistema chamado "${name}" nesta obra`);
        }
      }
      updates.name = name;
    }
    if (args.type !== undefined) {
      updates.type = args.type === null ? undefined : args.type.trim() || undefined;
    }
    if (args.obs !== undefined) {
      updates.obs = args.obs === null ? undefined : args.obs.trim() || undefined;
    }

    await ctx.db.patch("systems", args.systemId, updates);

    // Mantém o campo denormalizado `system` em sincronia após rename.
    if (updates.name !== undefined && updates.name !== system.name) {
      const items = await ctx.db
        .query("projectEquipment")
        .withIndex("by_system", (q) => q.eq("systemId", args.systemId))
        .collect();
      for (const item of items) {
        await ctx.db.patch("projectEquipment", item._id, {
          system: updates.name,
        });
      }
    }
    return null;
  },
});

// Remove um sistema da obra. Recusa se ainda houver equipamentos vinculados,
// para evitar exclusões em cascata acidentais.
export const removeSystemFromProject = engineeringMutation({
  args: { systemId: v.id("systems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const system = await ctx.db.get("systems", args.systemId);
    if (!system) return null;

    const item = await ctx.db
      .query("projectEquipment")
      .withIndex("by_system", (q) => q.eq("systemId", args.systemId))
      .first();
    if (item) {
      throw new Error(
        `O sistema "${system.name}" ainda possui equipamentos. Remova ou mova os equipamentos antes de excluir o sistema.`
      );
    }

    await ctx.db.delete("systems", args.systemId);
    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "systems",
      recordId: args.systemId,
      details: system.name,
    });
    return null;
  },
});
