import { paginationOptsValidator } from "convex/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireStaff } from "./lib/auth";
import { engineeringMutation } from "./lib/functions";
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
});
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

    return { qrCode, equipment };
  },
});

export const list = query({
  args: {},
  returns: v.array(qrCodeValidator),
  handler: async (ctx) => {
    await requireStaff(ctx);

    return await ctx.db.query("qrCodes").order("desc").collect();
  },
});

export const listWithEquipment = query({
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
    await requireStaff(ctx);

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

export const stats = query({
  args: {},
  returns: v.object({
    total: v.number(),
    linked: v.number(),
    free: v.number(),
    capped: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireStaff(ctx);

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

export const listByBatch = query({
  args: {
    batchId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginatedQrCodesWithEquipmentValidator,
  handler: async (ctx, args) => {
    await requireStaff(ctx);

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

export const getBatchTokens = query({
  args: { batchId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    const qrCodes = await ctx.db
      .query("qrCodes")
      .withIndex("by_batchId", (q) => q.eq("batchId", args.batchId))
      .order("desc")
      .take(1000);

    return qrCodes.map((qr) => qr.token);
  },
});

export const search = query({
  args: { term: v.string() },
  returns: v.object({
    batches: v.array(batchSummaryValidator),
    qrCodes: v.array(qrCodeWithEquipmentValidator),
  }),
  handler: async (ctx, args) => {
    await requireStaff(ctx);

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

export const getByEquipmentId = query({
  args: { equipmentId: v.id("equipment") },
  returns: v.union(qrCodeValidator, v.null()),
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    return await ctx.db
      .query("qrCodes")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", args.equipmentId))
      .order("desc")
      .first();
  },
});

export const create = mutation({
  args: {
    token: v.string(),
  },
  returns: v.id("qrCodes"),
  handler: async (ctx, args) => {
    await requireStaff(ctx);

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

export const batchCreate = mutation({
  args: {
    tokens: v.array(v.string()),
    batchName: v.optional(v.string()),
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
    await requireStaff(ctx);

    if (args.tokens.length > 999) {
      throw new Error("Cannot create more than 999 QR codes at once");
    }

    const batchId = `batch-${Date.now()}`;
    const batchName = args.batchName?.trim() || undefined;
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
        createdAt: Date.now(),
      });
      ids.push(id);
      created.push({ id, token });
    }
    return { ids, batchId, batchName, created };
  },
});

export const listBatches = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    batchSummaryValidator
  ),
  handler: async (ctx, args) => {
    await requireStaff(ctx);

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

    return Array.from(batches.values());
  },
});

export const remove = mutation({
  args: {
    token: v.string(),
  },
  returns: v.id("qrCodes"),
  handler: async (ctx, args) => {
    await requireStaff(ctx);

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

export const removeMany = mutation({
  args: {
    tokens: v.array(v.string()),
  },
  returns: v.object({
    deleted: v.array(v.string()),
    blocked: v.array(v.string()),
    missing: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    await requireStaff(ctx);

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

export const assignEquipment = mutation({
  args: {
    token: v.string(),
    equipmentId: v.id("equipment"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // qr_operator também pode vincular equipamento ao QR que escaneou
    await requireAuth(ctx);

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

    await ctx.db.patch("qrCodes", qrCode._id, {
      equipmentId: args.equipmentId,
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
    };
  },
});

// Gera um QR único para um item planejado da obra, criando o equipamento real
// e vinculando-o (sem alterar o status do planejamento). Idempotente: se o item
// já tem equipamento vinculado com QR, retorna o token existente.
export const generateForProjectEquipment = engineeringMutation({
  args: { itemId: v.id("projectEquipment") },
  returns: v.object({ token: v.string(), created: v.boolean() }),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("projectEquipment", args.itemId);
    if (!item) throw new Error("Equipamento planejado não encontrado");

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
      await ctx.db.patch("projectEquipment", args.itemId, {
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
      createdAt: Date.now(),
    });

    await logEquipmentHistory(ctx, ctx.user, {
      equipmentId: args.itemId,
      action: "qr_generated",
      newValue: token,
    });

    return { token, created: true };
  },
});
