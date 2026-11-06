import type { ObjectType } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import {
  publishDesktopBudget,
  type publishDesktopBudgetArgs,
  type PublishDesktopBudgetResult,
} from "./desktopBudget";
import {
  removeDesktopBudget,
  removeDesktopTakeoff,
  type RemoveDesktopBudgetResult,
} from "./desktopBudgetRemoval";
import { toTakeoffItemView, type PriceLookupCache } from "./takeoffItems";

/** Takeoffs: lista, detalhe com linhas, criação manual e envios do desktop. */

async function takeoffSummary(
  ctx: { db: QueryCtx["db"] },
  t: Doc<"takeoffs">,
  itemCount: number
) {
  let projectName: string | null = null;
  let projectSlug: string | null = null;
  if (t.projectId) {
    const project = await ctx.db.get("projects", t.projectId);
    projectName = project?.name ?? null;
    projectSlug = project ? (project.slug ?? project._id) : null;
  }
  let publishedByName: string | null = null;
  if (t.publishedByUserId) {
    const user = await ctx.db.get("users", t.publishedByUserId);
    publishedByName = user?.name ?? null;
  }
  return {
    _id: t._id,
    _creationTime: t._creationTime,
    projectId: t.projectId ?? null,
    projectName,
    projectSlug,
    name: t.name,
    status: t.status ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt ?? null,
    itemCount,
    source: t.source ?? null,
    externalId: t.externalId ?? null,
    budget: t.budget ?? null,
    publishedAt: t.publishedAt ?? null,
    publishedByName,
  };
}

export async function listTakeoffs(
  ctx: QueryCtx,
  input: { projectId?: Id<"projects"> }
) {
  const takeoffs = input.projectId
    ? await ctx.db
        .query("takeoffs")
        .withIndex("by_project", (q) => q.eq("projectId", input.projectId))
        .order("desc")
        .collect()
    : await ctx.db.query("takeoffs").order("desc").collect();

  const out = [];
  for (const t of takeoffs) {
    const items = await ctx.db
      .query("takeoffItems")
      .withIndex("by_takeoff", (q) => q.eq("takeoffId", t._id))
      .collect();
    out.push(await takeoffSummary(ctx, t, items.length));
  }
  return out;
}

export async function getTakeoffWithItems(
  ctx: QueryCtx,
  input: { takeoffId: Id<"takeoffs">; now: number }
) {
  const takeoff = await ctx.db.get("takeoffs", input.takeoffId);
  if (!takeoff) return null;

  const items = await ctx.db
    .query("takeoffItems")
    .withIndex("by_takeoff", (q) => q.eq("takeoffId", input.takeoffId))
    .collect();
  // Linhas do desktop na ordem da planilha; as manuais seguem pela criação.
  items.sort(
    (a, b) =>
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
      (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
  );

  // Orçamentos do desktop têm centenas de linhas: a busca por descrição
  // (sem material) lê os eventos recentes uma vez só.
  const priceCache: PriceLookupCache = {};
  const itemsOut = [];
  for (const item of items) {
    itemsOut.push(await toTakeoffItemView(ctx, item, input.now, priceCache));
  }

  return {
    takeoff: await takeoffSummary(ctx, takeoff, itemsOut.length),
    items: itemsOut,
  };
}

export async function createTakeoff(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { projectId?: Id<"projects">; name: string }
): Promise<Id<"takeoffs">> {
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome do takeoff");

  if (input.projectId) {
    const project = await ctx.db.get("projects", input.projectId);
    if (!project) throw new Error("Obra não encontrada");
  }

  const now = Date.now();
  const takeoffId = await ctx.db.insert("takeoffs", {
    projectId: input.projectId,
    name,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    createdByUserId: user._id,
  });

  await logAudit(ctx, user, {
    action: "create",
    tableName: "takeoffs",
    recordId: takeoffId,
    details: name,
  });

  return takeoffId;
}

export type PublishTakeoffFromDesktopInput = ObjectType<
  typeof publishDesktopBudgetArgs
>;

/** Publica o orçamento enviado pelo desktop (`publishDesktopBudget`) e audita. */
export async function publishTakeoffFromDesktop(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: PublishTakeoffFromDesktopInput
): Promise<PublishDesktopBudgetResult> {
  const result = await publishDesktopBudget(ctx, user, input);
  await logAudit(ctx, user, {
    action: result.created ? "create" : "update",
    tableName: "takeoffs",
    recordId: result.takeoffId,
    entityLabel: input.name.trim(),
    source: "desktop",
    details:
      `Orçamento desktop publicado: ${result.inserted} novas, ` +
      `${result.updated} atualizadas, ${result.removed} removidas, ` +
      `${result.kept.length} mantidas pela Compras`,
  });
  return result;
}

/** O desktop desfaz um envio, pelo `externalId` (`removeDesktopBudget`). */
export async function removeTakeoffFromDesktop(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { externalId: string }
): Promise<RemoveDesktopBudgetResult> {
  const result = await removeDesktopBudget(ctx, input);
  await logAudit(ctx, user, {
    action: "delete",
    tableName: "takeoffs",
    recordId: result.takeoffId,
    entityLabel: result.name,
    source: "desktop",
    details:
      `Orçamento desktop removido pelo app desktop: ` +
      `${result.removedLines} linhas apagadas` +
      (result.projectName ? ` (obra ${result.projectName})` : ""),
  });
  return result;
}

/** O app remove um orçamento do desktop pelo id (`removeDesktopTakeoff`). */
export async function removeDesktopTakeoffInApp(
  ctx: MutationCtx,
  user: Doc<"users">,
  takeoffId: Id<"takeoffs">
): Promise<RemoveDesktopBudgetResult> {
  const result = await removeDesktopTakeoff(ctx, takeoffId);
  await logAudit(ctx, user, {
    action: "delete",
    tableName: "takeoffs",
    recordId: result.takeoffId,
    entityLabel: result.name,
    details:
      `Orçamento desktop removido no app: ` +
      `${result.removedLines} linhas apagadas` +
      (result.projectName ? ` (obra ${result.projectName})` : ""),
  });
  return result;
}
