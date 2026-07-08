import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { logAudit } from "./lib/audit";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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
