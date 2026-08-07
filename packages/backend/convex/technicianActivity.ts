import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authedQuery } from "./lib/rbac";

// Histórico unificado de serviços do técnico (qr_operator ou staff), agrupado
// por obra: cadastro de equipamento, registros de instalação/manutenção
// (maintenanceLogs) + ações de campo instalar/testar/finalizar
// (equipmentHistory via fieldAction).

// Ações de equipmentHistory que contam como serviço realizado pelo técnico.
// Outras ações (created, qr_linked, checklist...) são administrativas.
const SERVICE_ACTIONS = new Set(["installed", "tested", "finalized"]);

// Teto por fonte: o histórico de campo de um único técnico é naturalmente
// limitado; o teto evita leitura ilimitada. Documentado nos testes.
const MAX_PER_SOURCE = 400;

const logStatusValidator = v.union(
  v.literal("installing"),
  v.literal("operational"),
  v.literal("warning"),
  v.literal("error")
);

const activityItemValidator = v.object({
  kind: v.union(
    v.literal("maintenanceLog"),
    v.literal("fieldAction"),
    v.literal("registration")
  ),
  id: v.string(),
  createdAt: v.number(),
  // Descrição do equipamento real ou modelo/ambiente do item planejado.
  title: v.string(),
  // "Cadastro" | "Instalação" | "Manutenção" | "Instalado" | "Testado" | "Finalizado"
  label: v.string(),
  // Presente apenas em maintenanceLogs / registration.
  status: v.union(logStatusValidator, v.null()),
  qrToken: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
});

type ActivityItem = {
  kind: "maintenanceLog" | "fieldAction" | "registration";
  id: string;
  createdAt: number;
  title: string;
  label: string;
  status: "installing" | "operational" | "warning" | "error" | null;
  qrToken: string | null;
  notes: string | null;
  projectId: Id<"projects"> | null;
};

const LOG_LABELS: Record<string, string> = {
  installation: "Instalação",
  maintenance: "Manutenção",
};

const ACTION_LABELS: Record<string, string> = {
  installed: "Instalado",
  tested: "Testado",
  finalized: "Finalizado",
};

// Caches por request para evitar leituras repetidas dos mesmos documentos.
type ResolveCaches = {
  equipment: Map<string, Doc<"equipment"> | null>;
  planned: Map<string, Doc<"projectEquipment"> | null>;
  qrTokenByEquipment: Map<string, { token: string; projectId: Id<"projects"> | null } | null>;
};

function newCaches(): ResolveCaches {
  return {
    equipment: new Map(),
    planned: new Map(),
    qrTokenByEquipment: new Map(),
  };
}

async function getEquipmentCached(
  ctx: QueryCtx,
  caches: ResolveCaches,
  id: Id<"equipment">
): Promise<Doc<"equipment"> | null> {
  const cached = caches.equipment.get(id);
  if (cached !== undefined) return cached;
  const doc = await ctx.db.get("equipment", id);
  caches.equipment.set(id, doc);
  return doc;
}

async function getPlannedCached(
  ctx: QueryCtx,
  caches: ResolveCaches,
  id: Id<"projectEquipment">
): Promise<Doc<"projectEquipment"> | null> {
  const cached = caches.planned.get(id);
  if (cached !== undefined) return cached;
  const doc = await ctx.db.get("projectEquipment", id);
  caches.planned.set(id, doc);
  return doc;
}

async function getQrForEquipmentCached(
  ctx: QueryCtx,
  caches: ResolveCaches,
  equipmentId: Id<"equipment">
): Promise<{ token: string; projectId: Id<"projects"> | null } | null> {
  const cached = caches.qrTokenByEquipment.get(equipmentId);
  if (cached !== undefined) return cached;
  const qr = await ctx.db
    .query("qrCodes")
    .withIndex("by_equipment", (q) => q.eq("equipmentId", equipmentId))
    .order("desc")
    .first();
  const value = qr ? { token: qr.token, projectId: qr.projectId ?? null } : null;
  caches.qrTokenByEquipment.set(equipmentId, value);
  return value;
}

// Resolve obra para um equipamento: planned → qrCodes.projectId → legado.
async function resolveEquipmentProjectId(
  ctx: QueryCtx,
  caches: ResolveCaches,
  equipment: Doc<"equipment"> | null,
  qr: { token: string; projectId: Id<"projects"> | null } | null
): Promise<Id<"projects"> | null> {
  let projectId: Id<"projects"> | null = null;
  if (equipment?.projectEquipmentId) {
    const planned = await getPlannedCached(
      ctx,
      caches,
      equipment.projectEquipmentId
    );
    projectId = planned?.projectId ?? null;
  }
  if (!projectId) projectId = qr?.projectId ?? null;
  if (!projectId) projectId = equipment?.projectId ?? null;
  return projectId;
}

// Converte um maintenanceLog em item de atividade, resolvendo a obra:
// equipment → projectEquipment.projectId; senão qrCodes.projectId (lote com
// obra de destino); senão equipment.projectId (legado).
async function logToItem(
  ctx: QueryCtx,
  caches: ResolveCaches,
  log: Doc<"maintenanceLogs">
): Promise<ActivityItem> {
  const equipment = await getEquipmentCached(ctx, caches, log.equipmentId);
  const qr = await getQrForEquipmentCached(ctx, caches, log.equipmentId);
  const projectId = await resolveEquipmentProjectId(ctx, caches, equipment, qr);

  return {
    kind: "maintenanceLog",
    id: log._id,
    createdAt: log.createdAt,
    title: equipment?.description || qr?.token || "Equipamento",
    label: LOG_LABELS[log.type ?? "maintenance"] ?? "Manutenção",
    status: log.status,
    qrToken: qr?.token ?? null,
    notes: log.notes ?? null,
    projectId,
  };
}

// Cadastro de equipamento em campo (equipment.create).
async function registrationToItem(
  ctx: QueryCtx,
  caches: ResolveCaches,
  equipment: Doc<"equipment">
): Promise<ActivityItem> {
  const qr = await getQrForEquipmentCached(ctx, caches, equipment._id);
  const projectId = await resolveEquipmentProjectId(ctx, caches, equipment, qr);

  return {
    kind: "registration",
    id: equipment._id,
    createdAt: equipment.createdAt,
    title: equipment.description || qr?.token || "Equipamento",
    label: "Cadastro",
    status: equipment.status,
    qrToken: qr?.token ?? null,
    notes: null,
    projectId,
  };
}

// Converte uma entrada de equipmentHistory (instalar/testar/finalizar) em
// item de atividade. equipmentId aqui é o item PLANEJADO → obra direta.
async function historyToItem(
  ctx: QueryCtx,
  caches: ResolveCaches,
  entry: Doc<"equipmentHistory">
): Promise<ActivityItem | null> {
  const planned = await getPlannedCached(ctx, caches, entry.equipmentId);
  if (!planned) return null;

  let qrToken: string | null = null;
  if (planned.linkedEquipmentId) {
    const qr = await getQrForEquipmentCached(
      ctx,
      caches,
      planned.linkedEquipmentId
    );
    qrToken = qr?.token ?? null;
  }

  const title = planned.ambiente
    ? `${planned.modelo} · ${planned.ambiente}`
    : planned.modelo;

  return {
    kind: "fieldAction",
    id: entry._id,
    createdAt: entry.createdAt,
    title,
    label: ACTION_LABELS[entry.action] ?? entry.action,
    status: null,
    qrToken,
    notes: entry.notes ?? null,
    projectId: planned.projectId,
  };
}

// Coleta toda a atividade do usuário (limitada por MAX_PER_SOURCE por fonte),
// já normalizada e ordenada por data desc.
async function collectMyActivity(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<ActivityItem[]> {
  const caches = newCaches();

  const logs = await ctx.db
    .query("maintenanceLogs")
    .withIndex("by_createdByUser", (q) => q.eq("createdByUserId", userId))
    .order("desc")
    .take(MAX_PER_SOURCE);

  const history = await ctx.db
    .query("equipmentHistory")
    .withIndex("by_user_and_created", (q) => q.eq("userId", userId))
    .order("desc")
    .take(MAX_PER_SOURCE);

  const registrations = await ctx.db
    .query("equipment")
    .withIndex("by_createdByUser", (q) => q.eq("createdByUserId", userId))
    .order("desc")
    .take(MAX_PER_SOURCE);

  const items: ActivityItem[] = [];
  for (const log of logs) {
    items.push(await logToItem(ctx, caches, log));
  }
  for (const entry of history) {
    if (!SERVICE_ACTIONS.has(entry.action)) continue;
    const item = await historyToItem(ctx, caches, entry);
    if (item) items.push(item);
  }
  for (const equipment of registrations) {
    items.push(await registrationToItem(ctx, caches, equipment));
  }

  items.sort((a, b) => b.createdAt - a.createdAt);
  return items;
}

// Normaliza projectId (obras apagadas viram "Sem obra") e devolve o mapa de
// nomes das obras existentes.
async function resolveProjects(
  ctx: QueryCtx,
  items: ActivityItem[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const missing = new Set<string>();
  for (const item of items) {
    if (!item.projectId) continue;
    if (names.has(item.projectId) || missing.has(item.projectId)) continue;
    const project = await ctx.db.get("projects", item.projectId);
    if (project) {
      names.set(item.projectId, project.name);
    } else {
      missing.add(item.projectId);
    }
  }
  for (const item of items) {
    if (item.projectId && missing.has(item.projectId)) {
      item.projectId = null;
    }
  }
  return names;
}

// Obras nas quais o usuário logado realizou serviços, com contagem e data da
// última atividade. projectId/projectName nulos = grupo "Sem obra".
export const listMineProjects = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      projectId: v.union(v.id("projects"), v.null()),
      projectName: v.union(v.string(), v.null()),
      count: v.number(),
      lastActivityAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const items = await collectMyActivity(ctx, ctx.user._id);
    const projectNames = await resolveProjects(ctx, items);

    const groups = new Map<
      string,
      {
        projectId: Id<"projects"> | null;
        count: number;
        lastActivityAt: number;
      }
    >();
    for (const item of items) {
      const key = item.projectId ?? "none";
      const group = groups.get(key);
      if (group) {
        group.count += 1;
        if (item.createdAt > group.lastActivityAt) {
          group.lastActivityAt = item.createdAt;
        }
      } else {
        groups.set(key, {
          projectId: item.projectId,
          count: 1,
          lastActivityAt: item.createdAt,
        });
      }
    }

    const result = [...groups.values()].map((group) => ({
      projectId: group.projectId,
      projectName: group.projectId
        ? (projectNames.get(group.projectId) ?? null)
        : null,
      count: group.count,
      lastActivityAt: group.lastActivityAt,
    }));

    result.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    return result;
  },
});

// Página de serviços do usuário logado em uma obra (ou sem obra, se null).
// Paginação por offset sobre a lista mesclada (teto MAX_PER_SOURCE por fonte),
// compatível com usePaginatedQuery.
export const listMineForProject = authedQuery({
  args: {
    projectId: v.union(v.id("projects"), v.null()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(activityItemValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const items = await collectMyActivity(ctx, ctx.user._id);
    // Normaliza obras apagadas para "Sem obra" (mesmo critério do
    // listMineProjects).
    await resolveProjects(ctx, items);

    const filtered = items.filter(
      (item) => item.projectId === (args.projectId ?? null)
    );

    const offset = args.paginationOpts.cursor
      ? parseInt(args.paginationOpts.cursor, 10)
      : 0;
    const end = offset + args.paginationOpts.numItems;
    const page = filtered.slice(offset, end).map((item) => {
      const { projectId: _projectId, ...rest } = item;
      return rest;
    });

    return {
      page,
      isDone: end >= filtered.length,
      continueCursor: String(end),
    };
  },
});
