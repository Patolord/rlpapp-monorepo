import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

// Fontes do histórico de serviços do técnico (qr_operator ou staff):
// cadastro de equipamento, registros de instalação/manutenção
// (maintenanceLogs) + ações de campo instalar/testar/finalizar
// (equipmentHistory via fieldAction), normalizados em `ActivityItem`.

// Ações de equipmentHistory que contam como serviço realizado pelo técnico.
// Outras ações (created, qr_linked, checklist...) são administrativas.
const SERVICE_ACTIONS = new Set(["installed", "tested", "finalized"]);

// Teto por fonte: o histórico de campo de um único técnico é naturalmente
// limitado; o teto evita leitura ilimitada. Documentado nos testes.
const MAX_PER_SOURCE = 400;

export type ActivityItem = {
  kind: "maintenanceLog" | "fieldAction" | "registration";
  id: string;
  createdAt: number;
  title: string;
  label: string;
  status: "installing" | "operational" | "warning" | "error" | null;
  qrToken: string | null;
  notes: string | null;
  projectId: Id<"projects"> | null;
  authorId: Id<"users"> | null;
  // Nome gravado no próprio registro (logs antigos não têm createdByUserId).
  authorFallback: string | null;
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
    authorId: log.createdByUserId ?? null,
    authorFallback: log.technicianName || null,
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
    authorId: equipment.createdByUserId ?? null,
    authorFallback: null,
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
    authorId: entry.userId,
    authorFallback: null,
  };
}

// Coleta toda a atividade do usuário (limitada por MAX_PER_SOURCE por fonte),
// já normalizada e ordenada por data desc.
export async function collectMyActivity(
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

// Toda a atividade de campo de uma obra, de todos os técnicos. Parte dos itens
// planejados e das etiquetas da obra; só mantém itens cuja obra resolvida é a
// mesma (mesmo critério do histórico por técnico).
export async function collectProjectActivity(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<ActivityItem[]> {
  const caches = newCaches();

  const plannedItems = await ctx.db
    .query("projectEquipment")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const equipmentIds = new Set<Id<"equipment">>();
  for (const planned of plannedItems) {
    caches.planned.set(planned._id, planned);
    if (planned.linkedEquipmentId) equipmentIds.add(planned.linkedEquipmentId);
  }

  const qrCodes = await ctx.db
    .query("qrCodes")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  for (const qr of qrCodes) {
    if (qr.equipmentId) equipmentIds.add(qr.equipmentId);
  }

  const items: ActivityItem[] = [];
  for (const equipmentId of equipmentIds) {
    const equipment = await getEquipmentCached(ctx, caches, equipmentId);
    if (!equipment) continue;
    if (equipment.createdByUserId) {
      items.push(await registrationToItem(ctx, caches, equipment));
    }
    const logs = await ctx.db
      .query("maintenanceLogs")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", equipmentId))
      .collect();
    for (const log of logs) {
      items.push(await logToItem(ctx, caches, log));
    }
  }

  for (const planned of plannedItems) {
    const history = await ctx.db
      .query("equipmentHistory")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", planned._id))
      .collect();
    for (const entry of history) {
      if (!SERVICE_ACTIONS.has(entry.action)) continue;
      const item = await historyToItem(ctx, caches, entry);
      if (item) items.push(item);
    }
  }

  const inProject = items.filter((item) => item.projectId === projectId);
  inProject.sort((a, b) => b.createdAt - a.createdAt);
  return inProject;
}
