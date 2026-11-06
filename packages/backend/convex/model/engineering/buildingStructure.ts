import { logAudit } from "../../lib/audit";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { deleteSystemsIfOrphaned } from "./systems";

// Estrutura física da obra: torres e ambientes (andares em `floors.ts`).
// Exclusões em cascata, duplicação de torre e validação da matriz de
// posicionamento dos ambientes.

// ---------------------------------------------------------------------------
// Torres
// ---------------------------------------------------------------------------

/** Lista as torres de uma obra, ordenadas, com a contagem de andares. */
export async function listTowersWithFloorCounts(
  ctx: QueryCtx,
  projectId: Id<"projects">
) {
  const towers = await ctx.db
    .query("towers")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  const withCounts = await Promise.all(
    towers.map(async (tower) => {
      const floors = await ctx.db
        .query("floors")
        .withIndex("by_tower", (q) => q.eq("towerId", tower._id))
        .collect();
      return {
        _id: tower._id,
        _creationTime: tower._creationTime,
        projectId: tower.projectId,
        name: tower.name,
        order: tower.order,
        createdAt: tower.createdAt,
        floorCount: floors.length,
      };
    })
  );

  return withCounts.sort((a, b) => a.order - b.order);
}

// Apaga andares, ambientes e equipamentos de uma torre. Retorna os sistemas
// afetados para checagem de órfãos pelo chamador.
async function cascadeDeleteTower(
  ctx: MutationCtx,
  towerId: Id<"towers">
): Promise<Set<Id<"systems">>> {
  const affectedSystemIds = new Set<Id<"systems">>();
  const floors = await ctx.db
    .query("floors")
    .withIndex("by_tower", (q) => q.eq("towerId", towerId))
    .collect();

  for (const floor of floors) {
    const environments = await ctx.db
      .query("environments")
      .withIndex("by_floor", (q) => q.eq("floorId", floor._id))
      .collect();
    for (const env of environments) {
      const items = await ctx.db
        .query("projectEquipment")
        .withIndex("by_environment", (q) => q.eq("environmentId", env._id))
        .collect();
      for (const item of items) {
        if (item.systemId) affectedSystemIds.add(item.systemId);
        if (item.linkedEquipmentId) {
          await ctx.db.patch("equipment", item.linkedEquipmentId, {
            projectEquipmentId: undefined,
          });
        }
        await ctx.db.delete("projectEquipment", item._id);
      }
      await ctx.db.delete("environments", env._id);
    }
    await ctx.db.delete("floors", floor._id);
  }
  return affectedSystemIds;
}

/** Remove uma torre em cascata: andares, ambientes e equipamentos vinculados. */
export async function removeTower(
  ctx: MutationCtx,
  user: Doc<"users">,
  towerId: Id<"towers">
): Promise<void> {
  const tower = await ctx.db.get("towers", towerId);
  if (!tower) return;

  const affectedSystemIds = await cascadeDeleteTower(ctx, towerId);
  await ctx.db.delete("towers", towerId);
  // Cascata: sistemas que ficaram sem equipamentos são removidos também.
  await deleteSystemsIfOrphaned(ctx, user, affectedSystemIds);
  await logAudit(ctx, user, {
    action: "delete",
    tableName: "towers",
    recordId: towerId,
    details: tower.name,
  });
}

/** Duplica uma torre com todos os andares, ambientes e equipamentos planejados. */
/**
 * Copia uma torre com andares, ambientes e equipamentos planejados (sem vínculo
 * de QR). Usada pela duplicação na tela e pelo assistente de IA.
 */
export async function copyTowerTree(
  ctx: MutationCtx,
  tower: Doc<"towers">,
  name: string
): Promise<{ towerId: Id<"towers">; floorCount: number }> {
  const existing = await ctx.db
    .query("towers")
    .withIndex("by_project", (q) => q.eq("projectId", tower.projectId))
    .collect();

  const newTowerId = await ctx.db.insert("towers", {
    projectId: tower.projectId,
    name,
    order: existing.length,
    createdAt: Date.now(),
  });

  const floors = await ctx.db
    .query("floors")
    .withIndex("by_tower", (q) => q.eq("towerId", tower._id))
    .collect();

  for (const floor of floors) {
    const newFloorId = await ctx.db.insert("floors", {
      towerId: newTowerId,
      projectId: floor.projectId,
      number: floor.number,
      label: floor.label,
      createdAt: Date.now(),
    });

    const environments = await ctx.db
      .query("environments")
      .withIndex("by_floor", (q) => q.eq("floorId", floor._id))
      .collect();

    for (const env of environments) {
      const newEnvId = await ctx.db.insert("environments", {
        floorId: newFloorId,
        towerId: newTowerId,
        projectId: env.projectId,
        name: env.name,
        type: env.type,
        order: env.order,
        col: env.col,
        colSpan: env.colSpan,
        rowSpan: env.rowSpan,
        segments: env.segments,
        createdAt: Date.now(),
      });

      const items = await ctx.db
        .query("projectEquipment")
        .withIndex("by_environment", (q) => q.eq("environmentId", env._id))
        .collect();

      for (const item of items) {
        // Equipamentos duplicados começam como planejados (sem vínculo de QR).
        await ctx.db.insert("projectEquipment", {
          projectId: item.projectId,
          unitId: item.unitId,
          environmentId: newEnvId,
          towerId: newTowerId,
          floorId: newFloorId,
          system: item.system,
          // Mesma obra: a cópia continua pertencendo ao mesmo sistema.
          systemId: item.systemId,
          ambiente: item.ambiente,
          kind: item.kind,
          modelo: item.modelo,
          capacidade: item.capacidade,
          status: "installing",
          obs: item.obs,
          deadline: item.deadline,
          serialNumber: undefined,
          checklistTemplateId: item.checklistTemplateId,
        });
      }
    }
  }

  return { towerId: newTowerId, floorCount: floors.length };
}

export async function duplicateTower(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { towerId: Id<"towers">; name?: string }
): Promise<Id<"towers">> {
  const tower = await ctx.db.get("towers", input.towerId);
  if (!tower) throw new Error("Torre não encontrada");

  const { towerId: newTowerId } = await copyTowerTree(
    ctx,
    tower,
    input.name?.trim() || `${tower.name} (cópia)`
  );

  await logAudit(ctx, user, {
    action: "duplicate",
    tableName: "towers",
    recordId: newTowerId,
    details: `de ${tower.name}`,
  });
  return newTowerId;
}

// ---------------------------------------------------------------------------
// Ambientes
// ---------------------------------------------------------------------------

/** Segmento extra de um ambiente não-retangular (posições relativas). */
export type EnvironmentSegment = {
  colOffset: number;
  colSpan?: number;
  rowOffset?: number;
  rowSpan?: number;
};

/** Valida um campo de posição na matriz: inteiro >= 1 (ou undefined). */
function validateGridField(
  value: number | undefined,
  label: string
): number | undefined {
  if (value === undefined) return undefined;
  const n = Math.floor(value);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`${label} deve ser um número inteiro maior ou igual a 1`);
  }
  return n;
}

/** Valida a lista de segmentos extras; lista vazia vira undefined. */
function validateSegments(
  segments: EnvironmentSegment[] | undefined
): EnvironmentSegment[] | undefined {
  if (segments === undefined || segments.length === 0) return undefined;
  return segments.map((seg, i) => {
    const label = `Segmento ${i + 1}`;
    const colOffset = Math.floor(seg.colOffset);
    if (!Number.isFinite(colOffset)) {
      throw new Error(`${label}: deslocamento de coluna inválido`);
    }
    const rowOffset =
      seg.rowOffset === undefined ? undefined : Math.floor(seg.rowOffset);
    if (rowOffset !== undefined && (!Number.isFinite(rowOffset) || rowOffset < 0)) {
      throw new Error(
        `${label}: o deslocamento de andar deve ser maior ou igual a 0`
      );
    }
    return {
      colOffset,
      colSpan: validateGridField(seg.colSpan, `${label}: a largura`),
      rowOffset,
      rowSpan: validateGridField(
        seg.rowSpan,
        `${label}: a quantidade de andares`
      ),
    };
  });
}

export async function createEnvironment(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    floorId: Id<"floors">;
    name: string;
    type?: string;
    order?: number;
    col?: number;
    colSpan?: number;
    rowSpan?: number;
    segments?: EnvironmentSegment[];
  }
): Promise<Id<"environments">> {
  const floor = await ctx.db.get("floors", input.floorId);
  if (!floor) throw new Error("Andar não encontrado");
  const name = input.name.trim();
  if (!name) throw new Error("O nome do ambiente é obrigatório");

  let order = input.order;
  if (order === undefined) {
    const existing = await ctx.db
      .query("environments")
      .withIndex("by_floor", (q) => q.eq("floorId", input.floorId))
      .collect();
    order = existing.length;
  }

  const envId = await ctx.db.insert("environments", {
    floorId: input.floorId,
    towerId: floor.towerId,
    projectId: floor.projectId,
    name,
    type: input.type?.trim() || undefined,
    order,
    col: validateGridField(input.col, "A coluna"),
    colSpan: validateGridField(input.colSpan, "A largura"),
    rowSpan: validateGridField(input.rowSpan, "A quantidade de andares"),
    segments: validateSegments(input.segments),
    createdAt: Date.now(),
  });
  await logAudit(ctx, user, {
    action: "create",
    tableName: "environments",
    recordId: envId,
    details: name,
  });
  return envId;
}

/** Atualiza um ambiente; `null` limpa o campo (volta ao auto-posicionamento). */
export async function updateEnvironment(
  ctx: MutationCtx,
  input: {
    environmentId: Id<"environments">;
    name?: string;
    type?: string | null;
    order?: number;
    col?: number | null;
    colSpan?: number | null;
    rowSpan?: number | null;
    segments?: EnvironmentSegment[] | null;
  }
): Promise<void> {
  const env = await ctx.db.get("environments", input.environmentId);
  if (!env) throw new Error("Ambiente não encontrado");

  const updates: Partial<{
    name: string;
    type: string | undefined;
    order: number;
    col: number | undefined;
    colSpan: number | undefined;
    rowSpan: number | undefined;
    segments: EnvironmentSegment[] | undefined;
  }> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("O nome do ambiente é obrigatório");
    updates.name = name;
  }
  if (input.type !== undefined) {
    updates.type =
      input.type === null ? undefined : input.type.trim() || undefined;
  }
  if (input.order !== undefined) updates.order = input.order;
  if (input.col !== undefined) {
    updates.col =
      input.col === null ? undefined : validateGridField(input.col, "A coluna");
  }
  if (input.colSpan !== undefined) {
    updates.colSpan =
      input.colSpan === null
        ? undefined
        : validateGridField(input.colSpan, "A largura");
  }
  if (input.rowSpan !== undefined) {
    updates.rowSpan =
      input.rowSpan === null
        ? undefined
        : validateGridField(input.rowSpan, "A quantidade de andares");
  }
  if (input.segments !== undefined) {
    updates.segments =
      input.segments === null ? undefined : validateSegments(input.segments);
  }

  await ctx.db.patch("environments", input.environmentId, updates);
}

/** Remove um ambiente com seus equipamentos e os sistemas que ficarem órfãos. */
export async function removeEnvironment(
  ctx: MutationCtx,
  user: Doc<"users">,
  environmentId: Id<"environments">
): Promise<void> {
  const env = await ctx.db.get("environments", environmentId);
  if (!env) return;

  const items = await ctx.db
    .query("projectEquipment")
    .withIndex("by_environment", (q) => q.eq("environmentId", environmentId))
    .collect();
  const affectedSystemIds = new Set<Id<"systems">>();
  for (const item of items) {
    if (item.systemId) affectedSystemIds.add(item.systemId);
    if (item.linkedEquipmentId) {
      await ctx.db.patch("equipment", item.linkedEquipmentId, {
        projectEquipmentId: undefined,
      });
    }
    await ctx.db.delete("projectEquipment", item._id);
  }
  await ctx.db.delete("environments", environmentId);
  // Cascata: sistemas que ficaram sem equipamentos são removidos também.
  await deleteSystemsIfOrphaned(ctx, user, affectedSystemIds);
  await logAudit(ctx, user, {
    action: "delete",
    tableName: "environments",
    recordId: environmentId,
    details: env.name,
  });
}
