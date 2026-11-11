import type { PaginationOptions } from "convex/server";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { isProjectArchived } from "./projects";

// Lotes de etiquetas QR (qrBatches + qrCodes.batchId): criação, obra de
// destino e listagens por lote.

export type QrBatchDestination = {
  projectId: Id<"projects">;
  projectName: string;
  projectSlug: string | null;
  archived: boolean;
};

export type CreateQrBatchInput = {
  tokens: string[];
  batchName?: string;
  projectId: Id<"projects">;
};

export type SetQrBatchProjectInput = {
  batchId: string;
  projectId: Id<"projects">;
};

// Resolve a obra de destino de um lote (batchId → qrBatches → projects).
// Lotes legados (sem registro em qrBatches) e lotes sem obra retornam null.
export async function getBatchDestination(
  ctx: QueryCtx | MutationCtx,
  batchId: string | undefined
): Promise<QrBatchDestination | null> {
  if (!batchId) return null;
  const batch = await ctx.db
    .query("qrBatches")
    .withIndex("by_batchId", (q) => q.eq("batchId", batchId))
    .unique();
  if (!batch?.projectId) return null;
  const project = await ctx.db.get("projects", batch.projectId);
  if (!project) return null;
  return {
    projectId: project._id,
    projectName: project.name,
    projectSlug: project.slug ?? null,
    archived: isProjectArchived(project),
  };
}

export async function createQrBatch(
  ctx: MutationCtx,
  args: CreateQrBatchInput
): Promise<{
  ids: Id<"qrCodes">[];
  batchId: string;
  batchName?: string;
  created: { id: Id<"qrCodes">; token: string }[];
}> {
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
}

// Lotes recentes de toda a base (todas as obras).
export async function listRecentQrBatches(
  ctx: QueryCtx,
  args: { limit?: number }
) {
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
}

// Lotes que ainda têm etiquetas disponíveis (ativas e sem equipamento
// vinculado), com os tokens livres de cada lote.
export async function listAvailableQrBatches(ctx: QueryCtx) {
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
}

// Lotes cujas etiquetas não pertencem a nenhuma obra (lotes antigos, criados
// antes da obra de destino ser obrigatória).
export async function listQrBatchesWithoutProject(ctx: QueryCtx) {
  const orphans = await ctx.db
    .query("qrCodes")
    .withIndex("by_project", (q) => q.eq("projectId", undefined))
    .collect();

  const hasDestination = new Map<string, boolean>();
  const batches = new Map<
    string,
    {
      batchId: string;
      batchName: string | null;
      createdAt: number;
      total: number;
      registered: number;
      sampleTokens: string[];
    }
  >();
  for (const qr of orphans) {
    if (!qr.batchId || qr.status !== "active") continue;
    let destination = hasDestination.get(qr.batchId);
    if (destination === undefined) {
      destination = (await getBatchDestination(ctx, qr.batchId)) !== null;
      hasDestination.set(qr.batchId, destination);
    }
    if (destination) continue;

    let batch = batches.get(qr.batchId);
    if (!batch) {
      batch = {
        batchId: qr.batchId,
        batchName: qr.batchName ?? null,
        createdAt: qr.createdAt,
        total: 0,
        registered: 0,
        sampleTokens: [],
      };
      batches.set(qr.batchId, batch);
    }
    batch.total++;
    if (qr.equipmentId) batch.registered++;
    if (batch.sampleTokens.length < 3) batch.sampleTokens.push(qr.token);
  }

  return [...batches.values()].sort(
    (a, b) => b.registered - a.registered || b.createdAt - a.createdAt
  );
}

// Define (ou troca) a obra de destino de um lote e grava a obra nas etiquetas
// do lote. Etiquetas cujo equipamento já está num item planejado mantêm a obra
// do item planejado, que é a fonte de verdade.
export async function setQrBatchProject(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: SetQrBatchProjectInput
): Promise<{ updated: number; kept: number }> {
  const project = await ctx.db.get("projects", args.projectId);
  if (!project) throw new Error("Obra não encontrada");

  const codes = await ctx.db
    .query("qrCodes")
    .withIndex("by_batchId", (q) => q.eq("batchId", args.batchId))
    .collect();
  if (codes.length === 0) throw new Error("Lote não encontrado");

  const batch = await ctx.db
    .query("qrBatches")
    .withIndex("by_batchId", (q) => q.eq("batchId", args.batchId))
    .first();
  const previousProjectId = batch?.projectId;
  if (batch) {
    await ctx.db.patch("qrBatches", batch._id, { projectId: args.projectId });
  } else {
    await ctx.db.insert("qrBatches", {
      batchId: args.batchId,
      name: codes[0]?.batchName,
      projectId: args.projectId,
      createdAt: Math.min(...codes.map((qr) => qr.createdAt)),
    });
  }

  let updated = 0;
  let kept = 0;
  for (const qr of codes) {
    if (qr.equipmentId) {
      const equipment = await ctx.db.get("equipment", qr.equipmentId);
      if (equipment?.projectEquipmentId) {
        kept++;
        continue;
      }
    }
    if (qr.projectId !== args.projectId) {
      await ctx.db.patch("qrCodes", qr._id, { projectId: args.projectId });
      updated++;
    }
  }

  await logAudit(ctx, user, {
    action: "update",
    tableName: "qrBatches",
    recordId: args.batchId,
    entityLabel: codes[0]?.batchName ?? args.batchId,
    details: `Obra do lote definida como ${project.name} (${updated} etiqueta(s) atualizada(s))`,
    changes: [
      {
        field: "projectId",
        previousValue: previousProjectId,
        newValue: args.projectId,
      },
    ],
  });

  return { updated, kept };
}

/** Etiquetas de um lote, mais novas primeiro, com o equipamento de cada uma. */
export async function listQrCodesByBatch(
  ctx: QueryCtx,
  input: { batchId: string; paginationOpts: PaginationOptions }
) {
  const results = await ctx.db
    .query("qrCodes")
    .withIndex("by_batchId", (q) => q.eq("batchId", input.batchId))
    .order("desc")
    .paginate(input.paginationOpts);
  return {
    ...results,
    page: await Promise.all(
      results.page.map(async (qr) => ({
        ...qr,
        equipment: qr.equipmentId
          ? await ctx.db.get("equipment", qr.equipmentId)
          : null,
      }))
    ),
  };
}
