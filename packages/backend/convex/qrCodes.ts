import { paginationOptsValidator } from "convex/server";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import {
  authedMutation,
  engineeringMutation,
  engineeringQuery,
  staffMutation,
  staffQuery,
} from "./lib/rbac";
import { logEquipmentHistory } from "./lib/audit";
import type { Doc, Id } from "./_generated/dataModel";

const qrCodeStatus = v.union(v.literal("active"), v.literal("inactive"));
const equipmentStatus = v.union(
  v.literal("installing"),
  v.literal("operational"),
  v.literal("warning"),
  v.literal("error")
);

const qrCodeFields = {
  _id: v.id("qrCodes"),
  _creationTime: v.number(),
  token: v.string(),
  equipmentId: v.optional(v.id("equipment")),
  status: qrCodeStatus,
  batchId: v.optional(v.string()),
  batchName: v.optional(v.string()),
  projectId: v.optional(v.id("projects")),
  createdAt: v.number(),
};

const equipmentFields = {
  _id: v.id("equipment"),
  _creationTime: v.number(),
  description: v.optional(v.string()),
  labelPhotoIds: v.optional(v.array(v.id("_storage"))),
  status: equipmentStatus,
  createdAt: v.number(),
  // Vínculo reverso com o item planejado da obra (relatórios).
  projectEquipmentId: v.optional(v.id("projectEquipment")),
  // Campos legados (dados antigos em produção antes da simplificação do schema).
  projectId: v.optional(v.id("projects")),
  floor: v.optional(v.number()),
  position: v.optional(v.number()),
  location: v.optional(v.string()),
  tag: v.optional(v.string()),
  type: v.optional(v.string()),
  notes: v.optional(v.string()),
};

const qrCodeValidator = v.object(qrCodeFields);
const equipmentValidator = v.object(equipmentFields);
const qrCodeWithEquipmentValidator = v.object({
  ...qrCodeFields,
  equipment: v.union(equipmentValidator, v.null()),
});
const batchSummaryValidator = v.object({
  batchId: v.string(),
  batchName: v.optional(v.string()),
  createdAt: v.number(),
  count: v.number(),
  // Obra de destino do lote (qrBatches), quando definida na criação.
  projectId: v.optional(v.id("projects")),
  projectName: v.optional(v.string()),
});

const batchProjectValidator = v.union(
  v.object({
    projectId: v.id("projects"),
    projectName: v.string(),
  }),
  v.null()
);

// Resolve a obra de destino de um lote (batchId → qrBatches → projects).
// Lotes legados (sem registro em qrBatches) e lotes sem obra retornam null.
export async function getBatchDestination(
  ctx: QueryCtx,
  batchId: string | undefined
): Promise<{ projectId: Id<"projects">; projectName: string } | null> {
  if (!batchId) return null;
  const batch = await ctx.db
    .query("qrBatches")
    .withIndex("by_batchId", (q) => q.eq("batchId", batchId))
    .unique();
  if (!batch?.projectId) return null;
  const project = await ctx.db.get("projects", batch.projectId);
  if (!project) return null;
  return { projectId: project._id, projectName: project.name };
}
const paginatedQrCodesWithEquipmentValidator = v.object({
  page: v.array(qrCodeWithEquipmentValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
  pageStatus: v.optional(v.union(v.string(), v.null())),
  splitCursor: v.optional(v.union(v.string(), v.null())),
});

export const getByToken = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      qrCode: qrCodeValidator,
      equipment: v.union(equipmentValidator, v.null()),
      // Obra de destino herdada do lote (qrBatches), se definida.
      batchProject: batchProjectValidator,
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const qrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!qrCode) return null;

    let equipment = null;
    if (qrCode.equipmentId) {
      equipment = await ctx.db.get("equipment", qrCode.equipmentId);
    }

    const batchProject = await getBatchDestination(ctx, qrCode.batchId);

    return { qrCode, equipment, batchProject };
  },
});

export const list = staffQuery({
  args: {},
  returns: v.array(qrCodeValidator),
  handler: async (ctx) => {
    return await ctx.db.query("qrCodes").order("desc").collect();
  },
});

export const listWithEquipment = staffQuery({
  args: {
    filter: v.optional(
      v.union(
        v.literal("linked"),
        v.literal("free"),
        v.literal("all"),
        v.literal("latest_batch")
      )
    ),
  },
  returns: v.array(qrCodeWithEquipmentValidator),
  handler: async (ctx, args) => {
    let qrCodes = await ctx.db.query("qrCodes").order("desc").collect();

    const filterMode = args.filter ?? "all";
    if (filterMode === "linked") {
      qrCodes = qrCodes.filter((q) => q.equipmentId);
    } else if (filterMode === "free") {
      qrCodes = qrCodes.filter((q) => !q.equipmentId);
    } else if (filterMode === "latest_batch") {
      const latestBatch = qrCodes.find((q) => q.batchId)?.batchId;
      if (latestBatch) {
        qrCodes = qrCodes.filter((q) => q.batchId === latestBatch);
      } else {
        qrCodes = [];
      }
    }

    return Promise.all(
      qrCodes.map(async (qr) => ({
        ...qr,
        equipment: qr.equipmentId ? await ctx.db.get("equipment", qr.equipmentId) : null,
      }))
    );
  },
});

export const stats = staffQuery({
  args: {},
  returns: v.object({
    total: v.number(),
    linked: v.number(),
    free: v.number(),
    capped: v.boolean(),
  }),
  handler: async (ctx) => {
    const maxRows = 5000;
    const qrCodes = await ctx.db.query("qrCodes").order("desc").take(maxRows);
    const linked = qrCodes.filter((qr) => qr.equipmentId).length;

    return {
      total: qrCodes.length,
      linked,
      free: qrCodes.length - linked,
      capped: qrCodes.length === maxRows,
    };
  },
});

export const listByBatch = staffQuery({
  args: {
    batchId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginatedQrCodesWithEquipmentValidator,
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("qrCodes")
      .withIndex("by_batchId", (q) => q.eq("batchId", args.batchId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...results,
      page: await Promise.all(
        results.page.map(async (qr) => ({
          ...qr,
          equipment: qr.equipmentId ? await ctx.db.get("equipment", qr.equipmentId) : null,
        }))
      ),
    };
  },
});

export const getBatchTokens = staffQuery({
  args: { batchId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const qrCodes = await ctx.db
      .query("qrCodes")
      .withIndex("by_batchId", (q) => q.eq("batchId", args.batchId))
      .order("desc")
      .take(1000);

    return qrCodes.map((qr) => qr.token);
  },
});

export const search = staffQuery({
  args: { term: v.string() },
  returns: v.object({
    batches: v.array(batchSummaryValidator),
    qrCodes: v.array(qrCodeWithEquipmentValidator),
  }),
  handler: async (ctx, args) => {
    const term = args.term.trim();
    if (!term) {
      return { batches: [], qrCodes: [] };
    }

    const normalizedTerm = term.toLowerCase();
    const batches = new Map<
      string,
      { batchId: string; batchName?: string; createdAt: number; count: number }
    >();
    const qrCodeMatches = new Map<string, Doc<"qrCodes">>();
    const exactQrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", term.toUpperCase()))
      .unique();

    if (exactQrCode) {
      qrCodeMatches.set(exactQrCode.token, exactQrCode);
      if (exactQrCode.batchId) {
        const batchCodes = await ctx.db
          .query("qrCodes")
          .withIndex("by_batchId", (q) => q.eq("batchId", exactQrCode.batchId))
          .order("desc")
          .take(1000);
        batches.set(exactQrCode.batchId, {
          batchId: exactQrCode.batchId,
          batchName: batchCodes[0]?.batchName ?? exactQrCode.batchName,
          createdAt: batchCodes[0]?.createdAt ?? exactQrCode.createdAt,
          count: batchCodes.length,
        });
      }
    }

    const exactBatchCodes = await ctx.db
      .query("qrCodes")
      .withIndex("by_batchId", (q) => q.eq("batchId", term))
      .order("desc")
      .take(1000);

    if (exactBatchCodes.length > 0) {
      batches.set(term, {
        batchId: term,
        batchName: exactBatchCodes[0].batchName,
        createdAt: exactBatchCodes[0].createdAt,
        count: exactBatchCodes.length,
      });
    }

    const exactBatchNameCodes = await ctx.db
      .query("qrCodes")
      .withIndex("by_batchName", (q) => q.eq("batchName", term))
      .order("desc")
      .take(1000);

    const namedBatchIds = new Set<string>();
    for (const qrCode of exactBatchNameCodes) {
      if (qrCode.batchId) namedBatchIds.add(qrCode.batchId);
    }
    for (const batchId of namedBatchIds) {
      if (batches.has(batchId)) continue;

      const batchCodes = await ctx.db
        .query("qrCodes")
        .withIndex("by_batchId", (q) => q.eq("batchId", batchId))
        .order("desc")
        .take(1000);
      batches.set(batchId, {
        batchId,
        batchName: batchCodes[0]?.batchName ?? term,
        createdAt: batchCodes[0]?.createdAt ?? exactBatchNameCodes[0]?.createdAt ?? 0,
        count: batchCodes.length,
      });
    }

    const recentCandidates = await ctx.db
      .query("qrCodes")
      .order("desc")
      .take(200);

    for (const qrCode of recentCandidates) {
      const batchId = qrCode.batchId;
      if (
        batchId &&
        (batchId.toLowerCase().includes(normalizedTerm) ||
          (qrCode.batchName?.toLowerCase().includes(normalizedTerm) ?? false)) &&
        !batches.has(batchId)
      ) {
        const batchCodes = await ctx.db
          .query("qrCodes")
          .withIndex("by_batchId", (q) => q.eq("batchId", batchId))
          .order("desc")
          .take(1000);
        batches.set(batchId, {
          batchId,
          batchName: batchCodes[0]?.batchName ?? qrCode.batchName,
          createdAt: batchCodes[0]?.createdAt ?? qrCode.createdAt,
          count: batchCodes.length,
        });
      }

      if (
        qrCodeMatches.size < 20 &&
        qrCode.token.toLowerCase().includes(normalizedTerm)
      ) {
        qrCodeMatches.set(qrCode.token, qrCode);
      }
    }

    const qrCodes = await Promise.all(
      Array.from(qrCodeMatches.values()).map(async (qr) => ({
        ...qr,
        equipment: qr.equipmentId ? await ctx.db.get("equipment", qr.equipmentId) : null,
      }))
    );

    return {
      batches: Array.from(batches.values()).slice(0, 10),
      qrCodes,
    };
  },
});

export const getByEquipmentId = staffQuery({
  args: { equipmentId: v.id("equipment") },
  returns: v.union(qrCodeValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("qrCodes")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", args.equipmentId))
      .order("desc")
      .first();
  },
});

// QR codes ativos ainda não vinculados a nenhum equipamento, para o assistente
// de IA propor vínculos (intent assign_qr). Limitado para caber no contexto.
export const listUnassignedForAi = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      token: v.string(),
      batchName: v.union(v.string(), v.null()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const unassigned = await ctx.db
      .query("qrCodes")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", undefined))
      .order("desc")
      .take(200);
    return unassigned
      .filter((qr) => qr.status === "active")
      .map((qr) => ({
        token: qr.token,
        batchName: qr.batchName ?? null,
        createdAt: qr.createdAt,
      }));
  },
});

export const create = staffMutation({
  args: {
    token: v.string(),
  },
  returns: v.id("qrCodes"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (existing) {
      throw new Error(`QR code with token "${args.token}" already exists`);
    }

    return await ctx.db.insert("qrCodes", {
      token: args.token,
      status: "active",
      createdAt: Date.now(),
    });
  },
});

export const batchCreate = staffMutation({
  args: {
    tokens: v.array(v.string()),
    batchName: v.optional(v.string()),
    // Todo novo lote de etiquetas de equipamento pertence a uma obra.
    projectId: v.id("projects"),
  },
  returns: v.object({
    ids: v.array(v.id("qrCodes")),
    batchId: v.string(),
    batchName: v.optional(v.string()),
    created: v.array(
      v.object({
        id: v.id("qrCodes"),
        token: v.string(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    if (args.tokens.length > 999) {
      throw new Error("Cannot create more than 999 QR codes at once");
    }

    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra de destino não encontrada");

    const batchId = `batch-${Date.now()}`;
    const batchName = args.batchName?.trim() || undefined;

    await ctx.db.insert("qrBatches", {
      batchId,
      name: batchName,
      projectId: args.projectId,
      createdAt: Date.now(),
    });
    const ids: Id<"qrCodes">[] = [];
    const created: { id: Id<"qrCodes">; token: string }[] = [];
    const uniqueTokens = Array.from(new Set(args.tokens));

    for (const token of uniqueTokens) {
      const existing = await ctx.db
        .query("qrCodes")
        .withIndex("by_token", (q) => q.eq("token", token))
        .unique();

      if (existing) continue;

      const id = await ctx.db.insert("qrCodes", {
        token,
        status: "active",
        batchId,
        batchName,
        projectId: args.projectId,
        createdAt: Date.now(),
      });
      ids.push(id);
      created.push({ id, token });
    }
    return { ids, batchId, batchName, created };
  },
});

export const listBatches = staffQuery({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    batchSummaryValidator
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
    const qrCodes = await ctx.db
      .query("qrCodes")
      .order("desc")
      .take(Math.min(limit * 1000, 5000));
    const batches = new Map<
      string,
      { batchId: string; batchName?: string; createdAt: number; count: number }
    >();

    for (const qrCode of qrCodes) {
      if (!qrCode.batchId) continue;
      if (batches.has(qrCode.batchId)) continue;

      batches.set(qrCode.batchId, {
        batchId: qrCode.batchId,
        batchName: qrCode.batchName,
        createdAt: qrCode.createdAt,
        count: 0,
      });

      if (batches.size >= limit) break;
    }

    for (const batch of batches.values()) {
      const batchCodes = await ctx.db
        .query("qrCodes")
        .withIndex("by_batchId", (q) => q.eq("batchId", batch.batchId))
        .take(1000);
      batch.count = batchCodes.length;
      batch.batchName = batchCodes[0]?.batchName ?? batch.batchName;
    }

    return await Promise.all(
      Array.from(batches.values()).map(async (batch) => {
        const destination = await getBatchDestination(ctx, batch.batchId);
        return {
          ...batch,
          projectId: destination?.projectId,
          projectName: destination?.projectName,
        };
      })
    );
  },
});

// Lotes de QR codes que ainda têm etiquetas disponíveis (ativas e sem
// equipamento vinculado), com os tokens livres de cada lote. Usado pelo painel
// de cadastro rápido para vincular etiquetas impressas escolhendo pelo lote.
export const listAvailableBatches = engineeringQuery({
  args: {},
  returns: v.array(
    v.object({
      batchId: v.string(),
      batchName: v.union(v.string(), v.null()),
      createdAt: v.number(),
      total: v.number(),
      availableTokens: v.array(v.string()),
      // Obra de destino do lote, quando definida na criação.
      projectId: v.union(v.id("projects"), v.null()),
      projectName: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx) => {
    // Varre os QRs mais recentes e agrupa por lote (mesma abordagem do
    // listBatches — lotes antigos além da janela ficam de fora).
    const qrCodes = await ctx.db.query("qrCodes").order("desc").take(5000);

    const batches = new Map<
      string,
      {
        batchId: string;
        batchName: string | null;
        createdAt: number;
        total: number;
        availableTokens: string[];
      }
    >();

    for (const qr of qrCodes) {
      if (!qr.batchId) continue;
      let batch = batches.get(qr.batchId);
      if (!batch) {
        // Limita a quantidade de lotes retornados (os mais recentes primeiro).
        if (batches.size >= 20) continue;
        batch = {
          batchId: qr.batchId,
          batchName: qr.batchName ?? null,
          createdAt: qr.createdAt,
          total: 0,
          availableTokens: [],
        };
        batches.set(qr.batchId, batch);
      }
      batch.total++;
      if (qr.batchName && !batch.batchName) batch.batchName = qr.batchName;
      if (qr.status === "active" && !qr.equipmentId) {
        batch.availableTokens.push(qr.token);
      }
    }

    return await Promise.all(
      Array.from(batches.values())
        .filter((b) => b.availableTokens.length > 0)
        .map(async (b) => {
          const destination = await getBatchDestination(ctx, b.batchId);
          return {
            ...b,
            availableTokens: b.availableTokens.sort((a, z) =>
              a.localeCompare(z)
            ),
            projectId: destination?.projectId ?? null,
            projectName: destination?.projectName ?? null,
          };
        })
    );
  },
});

export const remove = staffMutation({
  args: {
    token: v.string(),
  },
  returns: v.id("qrCodes"),
  handler: async (ctx, args) => {
    const qrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!qrCode) {
      throw new Error("QR code not found");
    }

    if (qrCode.equipmentId) {
      throw new Error("Cannot delete a QR code linked to equipment");
    }

    await ctx.db.delete("qrCodes", qrCode._id);
    return qrCode._id;
  },
});

export const removeMany = staffMutation({
  args: {
    tokens: v.array(v.string()),
  },
  returns: v.object({
    deleted: v.array(v.string()),
    blocked: v.array(v.string()),
    missing: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const deleted: string[] = [];
    const blocked: string[] = [];
    const missing: string[] = [];
    const tokens = Array.from(
      new Set(args.tokens.map((token) => token.trim()).filter(Boolean))
    );

    for (const token of tokens) {
      const qrCode = await ctx.db
        .query("qrCodes")
        .withIndex("by_token", (q) => q.eq("token", token))
        .unique();

      if (!qrCode) {
        missing.push(token);
        continue;
      }

      if (qrCode.equipmentId) {
        blocked.push(token);
        continue;
      }

      await ctx.db.delete("qrCodes", qrCode._id);
      deleted.push(token);
    }

    return { deleted, blocked, missing };
  },
});

// qr_operator também pode vincular equipamento ao QR que escaneou
export const assignEquipment = authedMutation({
  args: {
    token: v.string(),
    equipmentId: v.id("equipment"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const qrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!qrCode) {
      throw new Error("QR code not found");
    }

    if (qrCode.equipmentId) {
      throw new Error("QR code already linked to equipment");
    }

    const equipment = await ctx.db.get("equipment", args.equipmentId);
    if (!equipment) {
      throw new Error("Equipment not found");
    }

    // Se o equipamento já está vinculado a um item planejado, propaga a obra.
    let projectId: Id<"projects"> | undefined;
    if (equipment.projectEquipmentId) {
      const planned = await ctx.db.get(
        "projectEquipment",
        equipment.projectEquipmentId
      );
      projectId = planned?.projectId;
    }

    // Sem item planejado: herda a obra de destino do lote (qrBatches), se
    // definida — o QR já nasce marcado como pertencente à obra.
    if (!projectId) {
      const destination = await getBatchDestination(ctx, qrCode.batchId);
      projectId = destination?.projectId;
    }

    await ctx.db.patch("qrCodes", qrCode._id, {
      equipmentId: args.equipmentId,
      projectId,
    });

    return null;
  },
});

// --- Contexto completo de um QR (página mobile ao escanear) ---
//
// Público (sem auth), como getByToken. Resolve toda a árvore: QR → equipamento
// real → item planejado → ambiente → andar → torre → obra, incluindo checklist.

function generateToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "";
  for (let i = 0; i < 8; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export const getFullContext = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      token: v.string(),
      qrStatus: qrCodeStatus,
      equipment: v.union(equipmentValidator, v.null()),
      plannedEquipment: v.union(
        v.object({
          _id: v.id("projectEquipment"),
          system: v.string(),
          ambiente: v.string(),
          kind: v.union(
            v.literal("condensadora"),
            v.literal("evaporadora")
          ),
          modelo: v.string(),
          capacidade: v.string(),
          status: equipmentStatus,
          serialNumber: v.union(v.string(), v.null()),
          scheduledDate: v.union(v.number(), v.null()),
          installationDate: v.union(v.number(), v.null()),
          testDate: v.union(v.number(), v.null()),
        }),
        v.null()
      ),
      location: v.union(
        v.object({
          projectId: v.id("projects"),
          projectName: v.string(),
          towerName: v.union(v.string(), v.null()),
          floorLabel: v.union(v.string(), v.null()),
          environmentName: v.union(v.string(), v.null()),
        }),
        v.null()
      ),
      checklist: v.array(
        v.object({
          _id: v.id("checklistItems"),
          label: v.string(),
          required: v.boolean(),
          completed: v.boolean(),
        })
      ),
      // Obra de destino herdada do lote (qrBatches), se definida.
      batchProject: batchProjectValidator,
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const qrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!qrCode) return null;

    const equipment = qrCode.equipmentId
      ? await ctx.db.get("equipment", qrCode.equipmentId)
      : null;

    let plannedEquipment = null;
    let location = null;
    let checklist: {
      _id: Id<"checklistItems">;
      label: string;
      required: boolean;
      completed: boolean;
    }[] = [];

    if (equipment?.projectEquipmentId) {
      const planned = await ctx.db.get(
        "projectEquipment",
        equipment.projectEquipmentId
      );
      if (planned) {
        plannedEquipment = {
          _id: planned._id,
          system: planned.system,
          ambiente: planned.ambiente,
          kind: planned.kind,
          modelo: planned.modelo,
          capacidade: planned.capacidade,
          status: planned.status,
          serialNumber: planned.serialNumber ?? null,
          scheduledDate: planned.scheduledDate ?? null,
          installationDate: planned.installationDate ?? null,
          testDate: planned.testDate ?? null,
        };

        const project = await ctx.db.get("projects", planned.projectId);
        let towerName: string | null = null;
        let floorLabel: string | null = null;
        let environmentName: string | null = null;
        if (planned.towerId) {
          towerName = (await ctx.db.get("towers", planned.towerId))?.name ?? null;
        }
        if (planned.floorId) {
          floorLabel =
            (await ctx.db.get("floors", planned.floorId))?.label ?? null;
        }
        if (planned.environmentId) {
          environmentName =
            (await ctx.db.get("environments", planned.environmentId))?.name ??
            null;
        }
        if (project) {
          location = {
            projectId: project._id,
            projectName: project.name,
            towerName,
            floorLabel,
            environmentName,
          };
        }

        const items = await ctx.db
          .query("checklistItems")
          .withIndex("by_equipment", (q) => q.eq("equipmentId", planned._id))
          .collect();
        checklist = items
          .sort((a, b) => a.order - b.order)
          .map((i) => ({
            _id: i._id,
            label: i.label,
            required: i.required,
            completed: i.completed,
          }));
      }
    }

    return {
      token: qrCode.token,
      qrStatus: qrCode.status,
      equipment,
      plannedEquipment,
      location,
      checklist,
      batchProject: await getBatchDestination(ctx, qrCode.batchId),
    };
  },
});

/**
 * Gera um QR único para um item planejado, criando o equipamento real
 * placeholder e vinculando-o (sem alterar o status do planejamento).
 * Idempotente: se o item já tem equipamento vinculado com QR, retorna o token
 * existente. Reutilizado pelo cadastro rápido em massa (bulkAddToEnvironments).
 */
export async function generateQrForItem(
  ctx: MutationCtx,
  user: Doc<"users">,
  item: Doc<"projectEquipment">
): Promise<{ token: string; created: boolean }> {
  // Já vinculado? Retorna o token existente, se houver.
  if (item.linkedEquipmentId) {
    const existingQr = await ctx.db
      .query("qrCodes")
      .withIndex("by_equipment", (q) =>
        q.eq("equipmentId", item.linkedEquipmentId)
      )
      .order("desc")
      .first();
    if (existingQr) {
      if (existingQr.projectId !== item.projectId) {
        await ctx.db.patch("qrCodes", existingQr._id, {
          projectId: item.projectId,
        });
      }
      return { token: existingQr.token, created: false };
    }
  }

  // Cria o equipamento real (placeholder vinculado ao planejamento).
  const equipmentId = item.linkedEquipmentId
    ? item.linkedEquipmentId
    : await ctx.db.insert("equipment", {
        description: `${item.system} · ${item.ambiente}`.trim(),
        status: item.status,
        createdAt: Date.now(),
        projectEquipmentId: item._id,
      });

  if (!item.linkedEquipmentId) {
    await ctx.db.patch("projectEquipment", item._id, {
      linkedEquipmentId: equipmentId,
    });
  }

  // Gera um token único.
  let token = generateToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!clash) break;
    token = generateToken();
  }

  await ctx.db.insert("qrCodes", {
    token,
    equipmentId,
    status: "active",
    projectId: item.projectId,
    createdAt: Date.now(),
  });

  await logEquipmentHistory(ctx, user, {
    equipmentId: item._id,
    action: "qr_generated",
    newValue: token,
  });

  return { token, created: true };
}

// Gera um QR único para um item planejado da obra, criando o equipamento real
// e vinculando-o (sem alterar o status do planejamento). Idempotente: se o item
// já tem equipamento vinculado com QR, retorna o token existente.
export const generateForProjectEquipment = engineeringMutation({
  args: { itemId: v.id("projectEquipment") },
  returns: v.object({ token: v.string(), created: v.boolean() }),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("projectEquipment", args.itemId);
    if (!item) throw new Error("Equipamento planejado não encontrado");
    return await generateQrForItem(ctx, ctx.user, item);
  },
});

// Vincula uma etiqueta QR já impressa a um item planejado — fluxo de bipagem
// do cadastro rápido. Aceita dois estados de etiqueta:
//   - QR livre: cria o equipamento real placeholder;
//   - QR já cadastrado pelo técnico (equipment sem item planejado): reaproveita
//     o cadastro existente (descrição/fotos preservadas) e apenas vincula.
// Não altera o status do planejamento (etiqueta colada não significa instalado).
export const linkTokenToProjectEquipment = engineeringMutation({
  args: {
    token: v.string(),
    itemId: v.id("projectEquipment"),
  },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const token = args.token.trim().toUpperCase();
    if (!token) throw new Error("Informe o token do QR");

    const item = await ctx.db.get("projectEquipment", args.itemId);
    if (!item) throw new Error("Equipamento planejado não encontrado");
    if (item.linkedEquipmentId) {
      throw new Error("Este equipamento já possui um QR vinculado");
    }

    const qrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!qrCode) throw new Error(`QR "${token}" não encontrado`);
    if (qrCode.status !== "active") {
      throw new Error(`QR "${token}" está inativo`);
    }

    // Se o lote da etiqueta tem obra de destino, ela precisa bater com a obra
    // do item planejado.
    const destination = await getBatchDestination(ctx, qrCode.batchId);
    if (destination && destination.projectId !== item.projectId) {
      throw new Error(
        `QR "${token}" pertence ao lote destinado à obra "${destination.projectName}"`
      );
    }

    let equipmentId: Id<"equipment">;
    if (qrCode.equipmentId) {
      // Etiqueta já cadastrada pelo técnico: reaproveita o equipamento real.
      const equipment = await ctx.db.get("equipment", qrCode.equipmentId);
      if (!equipment) {
        throw new Error(`QR "${token}" aponta para um equipamento inexistente`);
      }
      if (
        equipment.projectEquipmentId &&
        equipment.projectEquipmentId !== item._id
      ) {
        throw new Error(
          `QR "${token}" já está vinculado a outro item da obra`
        );
      }
      equipmentId = equipment._id;
      await ctx.db.patch("equipment", equipmentId, {
        projectEquipmentId: item._id,
      });
    } else {
      // Etiqueta livre: cria o equipamento real placeholder.
      equipmentId = await ctx.db.insert("equipment", {
        description: `${item.system} · ${item.ambiente}`.trim(),
        status: item.status,
        createdAt: Date.now(),
        projectEquipmentId: item._id,
      });
    }

    await ctx.db.patch("projectEquipment", item._id, {
      linkedEquipmentId: equipmentId,
    });
    await ctx.db.patch("qrCodes", qrCode._id, {
      equipmentId,
      projectId: item.projectId,
    });

    await logEquipmentHistory(ctx, ctx.user, {
      equipmentId: item._id,
      action: "qr_linked",
      newValue: token,
    });

    return { token };
  },
});

// Fila de atribuição do operador: equipamentos já cadastrados pelo técnico
// (QR com equipment) destinados a esta obra, mas ainda sem item planejado.
// Fontes: QRs com projectId herdado do lote e QRs de lotes destinados à obra.
export const listRegisteredForProject = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      qrId: v.id("qrCodes"),
      token: v.string(),
      equipmentId: v.id("equipment"),
      description: v.union(v.string(), v.null()),
      photoUrl: v.union(v.string(), v.null()),
      batchName: v.union(v.string(), v.null()),
      registeredAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const candidates = new Map<Id<"qrCodes">, Doc<"qrCodes">>();

    const byProject = await ctx.db
      .query("qrCodes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(1000);
    for (const qr of byProject) candidates.set(qr._id, qr);

    // QRs de lotes destinados à obra cujo cadastro aconteceu antes da herança
    // automática de projectId (ou cujo projectId foi limpo).
    const batches = await ctx.db
      .query("qrBatches")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(100);
    for (const batch of batches) {
      const batchCodes = await ctx.db
        .query("qrCodes")
        .withIndex("by_batchId", (q) => q.eq("batchId", batch.batchId))
        .take(1000);
      for (const qr of batchCodes) candidates.set(qr._id, qr);
    }

    const rows: {
      qrId: Id<"qrCodes">;
      token: string;
      equipmentId: Id<"equipment">;
      description: string | null;
      photoUrl: string | null;
      batchName: string | null;
      registeredAt: number;
    }[] = [];

    for (const qr of candidates.values()) {
      if (!qr.equipmentId || qr.status !== "active") continue;
      const equipment = await ctx.db.get("equipment", qr.equipmentId);
      if (!equipment || equipment.projectEquipmentId) continue;

      const photoId = equipment.labelPhotoIds?.[0];
      rows.push({
        qrId: qr._id,
        token: qr.token,
        equipmentId: equipment._id,
        description: equipment.description ?? null,
        photoUrl: photoId ? await ctx.storage.getUrl(photoId) : null,
        batchName: qr.batchName ?? null,
        registeredAt: equipment.createdAt,
      });
    }

    return rows.sort((a, b) => b.registeredAt - a.registeredAt);
  },
});

// --- QR codes no contexto de uma obra ---

const projectQrRowValidator = v.object({
  _id: v.id("qrCodes"),
  token: v.string(),
  qrStatus: qrCodeStatus,
  batchName: v.union(v.string(), v.null()),
  equipmentId: v.union(v.id("equipment"), v.null()),
  plannedItemId: v.union(v.id("projectEquipment"), v.null()),
  system: v.union(v.string(), v.null()),
  ambiente: v.union(v.string(), v.null()),
  kind: v.union(
    v.literal("condensadora"),
    v.literal("evaporadora"),
    v.null()
  ),
  modelo: v.union(v.string(), v.null()),
  capacidade: v.union(v.string(), v.null()),
  status: v.union(equipmentStatus, v.null()),
  towerName: v.union(v.string(), v.null()),
  floorLabel: v.union(v.string(), v.null()),
  environmentName: v.union(v.string(), v.null()),
  installedAt: v.union(v.number(), v.null()),
});

// Lista todos os QR codes atribuídos a uma obra, com a localização
// (torre/andar/ambiente) e os dados do item planejado vinculado.
// Usa o campo denormalizado qrCodes.projectId (índice by_project).
export const listByProject = staffQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(projectQrRowValidator),
  handler: async (ctx, args) => {
    const qrCodes = await ctx.db
      .query("qrCodes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Nomes da hierarquia pré-carregados uma vez (evita N+1 por QR).
    const [towers, floors, environments] = await Promise.all([
      ctx.db
        .query("towers")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect(),
      ctx.db
        .query("floors")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect(),
      ctx.db
        .query("environments")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect(),
    ]);
    const towerName = new Map(towers.map((t) => [t._id, t.name]));
    const floorLabel = new Map(floors.map((f) => [f._id, f.label]));
    const envName = new Map(environments.map((e) => [e._id, e.name]));

    const rows = await Promise.all(
      qrCodes.map(async (qr) => {
        const equipment = qr.equipmentId
          ? await ctx.db.get("equipment", qr.equipmentId)
          : null;
        const planned = equipment?.projectEquipmentId
          ? await ctx.db.get("projectEquipment", equipment.projectEquipmentId)
          : null;

        return {
          _id: qr._id,
          token: qr.token,
          qrStatus: qr.status,
          batchName: qr.batchName ?? null,
          equipmentId: qr.equipmentId ?? null,
          plannedItemId: planned?._id ?? null,
          system: planned?.system ?? null,
          ambiente: planned?.ambiente ?? null,
          kind: planned?.kind ?? null,
          modelo: planned?.modelo ?? null,
          capacidade: planned?.capacidade ?? null,
          status: planned?.status ?? equipment?.status ?? null,
          towerName: planned?.towerId
            ? towerName.get(planned.towerId) ?? null
            : null,
          floorLabel: planned?.floorId
            ? floorLabel.get(planned.floorId) ?? null
            : null,
          environmentName: planned?.environmentId
            ? envName.get(planned.environmentId) ?? null
            : null,
          installedAt: planned?.installedAt ?? null,
        };
      })
    );

    // Ordena por localização para leitura natural (torre → andar → ambiente).
    return rows.sort(
      (a, b) =>
        (a.towerName ?? "").localeCompare(b.towerName ?? "") ||
        (a.floorLabel ?? "").localeCompare(b.floorLabel ?? "") ||
        (a.environmentName ?? "").localeCompare(b.environmentName ?? "") ||
        a.token.localeCompare(b.token)
    );
  },
});

// Backfill único: preenche qrCodes.projectId para QRs já vinculados a uma
// obra antes da denormalização. Rodar via `npx convex run qrCodes:backfillQrProjectIds`.
export const backfillQrProjectIds = internalMutation({
  args: {},
  returns: v.object({ scanned: v.number(), patched: v.number() }),
  handler: async (ctx) => {
    const qrCodes = await ctx.db.query("qrCodes").collect();
    let patched = 0;

    for (const qr of qrCodes) {
      if (!qr.equipmentId) continue;
      const equipment = await ctx.db.get("equipment", qr.equipmentId);
      const planned = equipment?.projectEquipmentId
        ? await ctx.db.get("projectEquipment", equipment.projectEquipmentId)
        : null;
      const projectId = planned?.projectId;
      if (qr.projectId !== projectId) {
        await ctx.db.patch("qrCodes", qr._id, { projectId });
        patched++;
      }
    }

    return { scanned: qrCodes.length, patched };
  },
});
