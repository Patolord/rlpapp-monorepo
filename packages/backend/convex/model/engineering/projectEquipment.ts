import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logEquipmentHistory } from "../../lib/audit";
import { generateQrForItem, syncQrProjectId } from "./qrProjectLinks";
import { equipKindValidator, equipmentStatusValidator } from "../../schema/engineering";
import { notFound, ruleViolation } from "../../lib/domainErrors";

// Planejamento de equipamentos da obra (projectEquipment) na hierarquia de
// ambientes: criação, edição, pool de não atribuídos, status e remoção.

type EquipmentStatus = Doc<"projectEquipment">["status"];
type EquipmentKind = Doc<"projectEquipment">["kind"];

export const unassignedPlannedEquipmentValidator = v.object({
  _id: v.id("projectEquipment"),
  system: v.string(),
  systemId: v.union(v.id("systems"), v.null()),
  kind: equipKindValidator,
  modelo: v.string(),
  capacidade: v.string(),
  serialNumber: v.union(v.string(), v.null()),
  status: equipmentStatusValidator,
  deadline: v.union(v.number(), v.null()),
});

export const bulkAddToEnvironmentsResultValidator = v.object({
  created: v.number(),
  items: v.array(
    v.object({
      itemId: v.id("projectEquipment"),
      environmentId: v.id("environments"),
      token: v.union(v.string(), v.null()),
    })
  ),
});

export type UpsertPlannedEquipmentInEnvironmentInput = {
  itemId?: Id<"projectEquipment">;
  environmentId: Id<"environments">;
  systemId?: Id<"systems">;
  ambiente?: string;
  kind: EquipmentKind;
  modelo?: string;
  capacidade?: string;
  serialNumber?: string;
  status?: EquipmentStatus;
  obs?: string | null;
  deadline?: number | null;
  scheduledDate?: number | null;
};

export type BulkAddToEnvironmentsInput = {
  environmentIds: Id<"environments">[];
  systemId?: Id<"systems">;
  items: {
    kind: EquipmentKind;
    qty: number;
    modelo?: string;
    capacidade?: string;
  }[];
  generateQr: boolean;
};

export type CreateUnassignedPlannedEquipmentInput = {
  projectId: Id<"projects">;
  systemId?: Id<"systems">;
  kind: EquipmentKind;
  modelo?: string;
  capacidade?: string;
  serialNumber?: string;
  deadline?: number | null;
};

export type AssignPlannedEquipmentToEnvironmentInput = {
  itemId: Id<"projectEquipment">;
  environmentId: Id<"environments">;
  systemId?: Id<"systems">;
};

export type SetPlannedEquipmentStatusInput = {
  itemId: Id<"projectEquipment">;
  status: EquipmentStatus;
};

// Cria/atualiza um equipamento planejado dentro de um AMBIENTE (hierarquia nova).
// O equipamento pertence a um sistema da obra (systems); o nome do sistema é
// denormalizado no campo `system`. O sistema é opcional: itens sem sistema são
// permitidos (exibem alerta na UI até serem atribuídos a um sistema).
export async function upsertPlannedEquipmentInEnvironment(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: UpsertPlannedEquipmentInEnvironmentInput
): Promise<Id<"projectEquipment">> {
  const env = await ctx.db.get("environments", args.environmentId);
  if (!env) throw notFound("Ambiente não encontrado");

  let systemName = "";
  if (args.systemId) {
    const system = await ctx.db.get("systems", args.systemId);
    if (!system) throw notFound("Sistema não encontrado");
    if (system.projectId !== env.projectId) {
      throw ruleViolation("O sistema não pertence à mesma obra do ambiente");
    }
    systemName = system.name;
  }

  const base = {
    system: systemName,
    systemId: args.systemId,
    ambiente: args.ambiente?.trim() || env.name,
    kind: args.kind,
    modelo: args.modelo?.trim() ?? "",
    capacidade: args.capacidade?.trim() ?? "",
    serialNumber: args.serialNumber?.trim() || undefined,
    obs: args.obs === null ? undefined : args.obs?.trim() || undefined,
    deadline: args.deadline === null ? undefined : args.deadline ?? undefined,
    scheduledDate:
      args.scheduledDate === null ? undefined : args.scheduledDate ?? undefined,
  };

  if (args.itemId) {
    const item = await ctx.db.get("projectEquipment", args.itemId);
    if (!item) throw notFound("Equipamento não encontrado");
    await ctx.db.patch("projectEquipment", args.itemId, {
      ...base,
      environmentId: args.environmentId,
      towerId: env.towerId,
      floorId: env.floorId,
      status: args.status ?? item.status,
    });
    return args.itemId;
  }

  const itemId = await ctx.db.insert("projectEquipment", {
    projectId: env.projectId,
    environmentId: args.environmentId,
    towerId: env.towerId,
    floorId: env.floorId,
    ...base,
    status: args.status ?? "installing",
  });
  await logEquipmentHistory(ctx, user, {
    equipmentId: itemId,
    action: "created",
    newValue: base.system,
  });
  return itemId;
}

// Criação em massa de equipamentos planejados em vários ambientes de uma vez
// (painel de cadastro rápido). Para cada ambiente × item × qty insere um
// registro com os mesmos defaults de `upsertInEnvironment`. Opcionalmente gera
// um QR novo para cada item criado.
export async function bulkAddPlannedEquipmentToEnvironments(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: BulkAddToEnvironmentsInput
): Promise<{
  created: number;
  items: {
    itemId: Id<"projectEquipment">;
    environmentId: Id<"environments">;
    token: string | null;
  }[];
}> {
  if (args.environmentIds.length === 0) {
    throw ruleViolation("Selecione pelo menos um ambiente");
  }

  const totalPerEnv = args.items.reduce(
    (sum, item) => sum + Math.max(0, Math.floor(item.qty)),
    0
  );
  if (totalPerEnv === 0) {
    throw ruleViolation("Informe a quantidade de equipamentos");
  }
  const total = totalPerEnv * args.environmentIds.length;
  if (total > 500) {
    throw ruleViolation(
      `Limite de 500 equipamentos por operação excedido (${total})`
    );
  }

  // Carrega e valida os ambientes (todos da mesma obra, sem duplicatas).
  const envIds = Array.from(new Set(args.environmentIds));
  const environments = [];
  for (const envId of envIds) {
    const env = await ctx.db.get("environments", envId);
    if (!env) throw notFound("Ambiente não encontrado");
    environments.push(env);
  }
  const projectId = environments[0].projectId;
  if (environments.some((env) => env.projectId !== projectId)) {
    throw ruleViolation("Todos os ambientes devem pertencer à mesma obra");
  }

  let systemName = "";
  if (args.systemId) {
    const system = await ctx.db.get("systems", args.systemId);
    if (!system) throw notFound("Sistema não encontrado");
    if (system.projectId !== projectId) {
      throw ruleViolation("O sistema não pertence à mesma obra dos ambientes");
    }
    systemName = system.name;
  }

  const results: {
    itemId: Id<"projectEquipment">;
    environmentId: Id<"environments">;
    token: string | null;
  }[] = [];

  for (const env of environments) {
    for (const item of args.items) {
      const qty = Math.max(0, Math.floor(item.qty));
      for (let i = 0; i < qty; i++) {
        const itemId = await ctx.db.insert("projectEquipment", {
          projectId,
          environmentId: env._id,
          towerId: env.towerId,
          floorId: env.floorId,
          system: systemName,
          systemId: args.systemId,
          ambiente: env.name,
          kind: item.kind,
          modelo: item.modelo?.trim() ?? "",
          capacidade: item.capacidade?.trim() ?? "",
          status: "installing",
        });
        await logEquipmentHistory(ctx, user, {
          equipmentId: itemId,
          action: "created",
          newValue: systemName || "(sem sistema)",
        });

        let token: string | null = null;
        if (args.generateQr) {
          const inserted = await ctx.db.get("projectEquipment", itemId);
          if (inserted) {
            const qr = await generateQrForItem(ctx, user, inserted);
            token = qr.token;
          }
        }

        results.push({ itemId, environmentId: env._id, token });
      }
    }
  }

  return { created: results.length, items: results };
}

// Lista itens planejados da obra que ainda não estão em nenhum ambiente
// (pool de "não atribuídos" do painel lateral). Itens legados de apartamentos
// (unitId) ficam fora do pool.
export async function listUnassignedPlannedEquipment(
  ctx: QueryCtx,
  projectId: Id<"projects">
) {
  const items = await ctx.db
    .query("projectEquipment")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  return items
    .filter((item) => !item.environmentId && !item.unitId)
    .sort(
      (a, b) =>
        a.system.localeCompare(b.system) ||
        a.modelo.localeCompare(b.modelo) ||
        a._creationTime - b._creationTime
    )
    .map((item) => ({
      _id: item._id,
      system: item.system,
      systemId: item.systemId ?? null,
      kind: item.kind,
      modelo: item.modelo,
      capacidade: item.capacidade,
      serialNumber: item.serialNumber ?? null,
      status: item.status,
      deadline: item.deadline ?? null,
    }));
}

// Cria um item planejado sem ambiente (vai para o pool de não atribuídos).
// Sistema é opcional: itens sem sistema exibem alerta na UI.
export async function createUnassignedPlannedEquipment(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: CreateUnassignedPlannedEquipmentInput
): Promise<Id<"projectEquipment">> {
  const project = await ctx.db.get("projects", args.projectId);
  if (!project) throw notFound("Obra não encontrada");

  let systemName = "";
  if (args.systemId) {
    const system = await ctx.db.get("systems", args.systemId);
    if (!system) throw notFound("Sistema não encontrado");
    if (system.projectId !== args.projectId) {
      throw ruleViolation("O sistema não pertence a esta obra");
    }
    systemName = system.name;
  }

  const itemId = await ctx.db.insert("projectEquipment", {
    projectId: args.projectId,
    system: systemName,
    systemId: args.systemId,
    ambiente: "",
    kind: args.kind,
    modelo: args.modelo?.trim() ?? "",
    capacidade: args.capacidade?.trim() ?? "",
    serialNumber: args.serialNumber?.trim() || undefined,
    deadline: args.deadline === null ? undefined : args.deadline ?? undefined,
    status: "installing",
  });
  await logEquipmentHistory(ctx, user, {
    equipmentId: itemId,
    action: "created",
    newValue: systemName || "(sem sistema)",
  });
  return itemId;
}

// Atribui um item do pool de não atribuídos a um ambiente. Pode opcionalmente
// definir/alterar o sistema no mesmo passo; itens sem sistema continuam
// permitidos (alerta na UI).
export async function assignPlannedEquipmentToEnvironment(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: AssignPlannedEquipmentToEnvironmentInput
): Promise<void> {
  const item = await ctx.db.get("projectEquipment", args.itemId);
  if (!item) throw notFound("Equipamento não encontrado");

  const env = await ctx.db.get("environments", args.environmentId);
  if (!env) throw notFound("Ambiente não encontrado");
  if (env.projectId !== item.projectId) {
    throw ruleViolation("O ambiente não pertence à mesma obra do equipamento");
  }

  const systemId = args.systemId ?? item.systemId;
  let systemName = item.system;
  if (args.systemId) {
    const system = await ctx.db.get("systems", args.systemId);
    if (!system) throw notFound("Sistema não encontrado");
    if (system.projectId !== item.projectId) {
      throw ruleViolation("O sistema não pertence a esta obra");
    }
    systemName = system.name;
  }

  await ctx.db.patch("projectEquipment", args.itemId, {
    environmentId: args.environmentId,
    towerId: env.towerId,
    floorId: env.floorId,
    ambiente: item.ambiente.trim() || env.name,
    system: systemName,
    systemId,
  });
  await logEquipmentHistory(ctx, user, {
    equipmentId: args.itemId,
    action: "assigned",
    newValue: env.name,
  });
}

export async function setPlannedEquipmentStatus(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: SetPlannedEquipmentStatusInput
): Promise<void> {
  const item = await ctx.db.get("projectEquipment", args.itemId);
  if (!item) throw notFound("Equipamento não encontrado");
  if (item.status === args.status) return;

  const now = Date.now();
  await ctx.db.patch("projectEquipment", args.itemId, {
    status: args.status,
    installedAt:
      args.status === "operational" ? item.installedAt ?? now : item.installedAt,
    installationDate:
      args.status === "operational"
        ? item.installationDate ?? now
        : item.installationDate,
  });
  // Reflete no equipamento real vinculado, se houver.
  if (item.linkedEquipmentId) {
    await ctx.db.patch("equipment", item.linkedEquipmentId, {
      status: args.status,
    });
  }
  await logEquipmentHistory(ctx, user, {
    equipmentId: args.itemId,
    action: "status_changed",
    previousValue: item.status,
    newValue: args.status,
  });
}

export async function deletePlannedEquipment(
  ctx: MutationCtx,
  itemId: Id<"projectEquipment">
): Promise<void> {
  const item = await ctx.db.get("projectEquipment", itemId);
  if (!item) return;
  if (item.linkedEquipmentId) {
    await ctx.db.patch("equipment", item.linkedEquipmentId, {
      projectEquipmentId: undefined,
    });
    await syncQrProjectId(ctx, item.linkedEquipmentId, undefined);
  }
  await ctx.db.delete("projectEquipment", itemId);
}

/** Histórico de um item planejado, do mais novo ao mais antigo, com o nome de quem registrou. */
export async function listPlannedEquipmentHistory(
  ctx: QueryCtx,
  equipmentId: Id<"projectEquipment">
) {
  const entries = await ctx.db
    .query("equipmentHistory")
    .withIndex("by_equipment", (q) => q.eq("equipmentId", equipmentId))
    .order("desc")
    .collect();

  const userCache = new Map<string, string>();
  const result = [];
  for (const e of entries) {
    let userName = userCache.get(e.userId);
    if (userName === undefined) {
      const user = await ctx.db.get("users", e.userId);
      userName = user?.name ?? "Desconhecido";
      userCache.set(e.userId, userName);
    }
    result.push({
      _id: e._id,
      action: e.action,
      userName,
      previousValue: e.previousValue ?? null,
      newValue: e.newValue ?? null,
      notes: e.notes ?? null,
      location: e.location ?? null,
      createdAt: e.createdAt,
    });
  }
  return result;
}
