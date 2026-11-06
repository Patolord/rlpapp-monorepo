import { logAudit } from "../../lib/audit";
import type { MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";

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
