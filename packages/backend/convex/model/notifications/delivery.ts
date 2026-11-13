import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { NOTIFICATION_RETENTION_DAYS } from "./notify";

/**
 * Entrega de push (push.ts chama o Expo): quem recebe agora, quem espera o fim
 * do horário silencioso e quem fica só no sino; depois, o registro do
 * resultado, dos recibos e dos aparelhos que saíram do app.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const PURGE_BATCH = 500;

// Horário silencioso 21h–6h em America/Sao_Paulo (UTC-3, sem horário de
// verão desde 2019) = 00:00–09:00 UTC.
const QUIET_END_UTC_HOUR = 9;

export function quietUntil(now: number): number | null {
  const date = new Date(now);
  if (date.getUTCHours() >= QUIET_END_UTC_HOUR) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), QUIET_END_UTC_HOUR);
}

export type PushDelivery = {
  notificationId: Id<"notifications">;
  title: string;
  body: string;
  category: string;
  target: string;
  params: Record<string, string> | null;
  badge: number;
  tokens: { tokenId: Id<"pushTokens">; token: string }[];
};

/** Separa os avisos em: enviar agora, esperar as 6h, só no sino. */
export async function planPushDelivery(
  ctx: QueryCtx,
  ids: Id<"notifications">[],
  now: number
) {
  const quietEnd = quietUntil(now);
  const prefsCache = new Map<Id<"users">, Doc<"notificationPreferences"> | null>();
  const badgeCache = new Map<Id<"users">, number>();
  const deliver: PushDelivery[] = [];
  const deferred: Id<"notifications">[] = [];
  const skipped: { notificationId: Id<"notifications">; reason: string }[] = [];

  for (const id of ids) {
    const n = await ctx.db.get("notifications", id);
    if (!n || n.pushStatus !== "queued") continue;

    if (!prefsCache.has(n.userId)) {
      prefsCache.set(
        n.userId,
        await ctx.db
          .query("notificationPreferences")
          .withIndex("by_user", (q) => q.eq("userId", n.userId))
          .unique()
      );
    }
    const prefs = prefsCache.get(n.userId) ?? null;
    if (prefs?.pushOff.includes(n.category)) {
      skipped.push({ notificationId: id, reason: "Desligado nas preferências" });
      continue;
    }
    if (n.readAt !== undefined) {
      skipped.push({ notificationId: id, reason: "Já lido no app" });
      continue;
    }
    if (quietEnd !== null && (prefs?.quietHours ?? true)) {
      deferred.push(id);
      continue;
    }

    const tokens = (
      await ctx.db
        .query("pushTokens")
        .withIndex("by_user", (q) => q.eq("userId", n.userId))
        .take(20)
    ).filter((t) => t.disabledAt === undefined);
    if (tokens.length === 0) {
      skipped.push({ notificationId: id, reason: "Sem aparelho registrado" });
      continue;
    }

    if (!badgeCache.has(n.userId)) {
      const unread = await ctx.db
        .query("notifications")
        .withIndex("by_user_read", (q) => q.eq("userId", n.userId).eq("readAt", undefined))
        .take(100);
      badgeCache.set(n.userId, unread.length);
    }

    deliver.push({
      notificationId: id,
      title: n.title,
      body: n.body,
      category: n.category,
      target: n.target,
      params: n.params ?? null,
      badge: badgeCache.get(n.userId) ?? 0,
      tokens: tokens.map((t) => ({ tokenId: t._id, token: t.token })),
    });
  }

  return { deliver, deferred, deferUntil: deferred.length > 0 ? quietEnd : null, skipped };}

export type PushResult = {
  notificationId: Id<"notifications">;
  status: "sent" | "skipped" | "failed";
  error?: string;
};

async function disableTokens(ctx: MutationCtx, tokenIds: Id<"pushTokens">[], now: number) {
  for (const tokenId of new Set(tokenIds)) {
    const token = await ctx.db.get("pushTokens", tokenId);
    if (token && token.disabledAt === undefined) {
      await ctx.db.patch("pushTokens", tokenId, { disabledAt: now });
    }
  }
}

/** Grava o resultado do envio, os tickets a conferir e desliga aparelhos recusados. */
export async function recordPushResults(
  ctx: MutationCtx,
  args: {
    results: PushResult[];
    tickets: { ticketId: string; tokenId: Id<"pushTokens">; notificationId: Id<"notifications"> }[];
    disableTokenIds: Id<"pushTokens">[];
  }
): Promise<void> {
  const now = Date.now();
  for (const r of args.results) {
    const n = await ctx.db.get("notifications", r.notificationId);
    if (!n) continue;
    await ctx.db.patch("notifications", n._id, { pushStatus: r.status, pushError: r.error });
  }
  for (const t of args.tickets) {
    await ctx.db.insert("pushTickets", { ...t, createdAt: now });
  }
  await disableTokens(ctx, args.disableTokenIds, now);
}

/** Recibos conferidos saem da fila; aparelhos que desinstalaram o app são desligados. */
export async function finishPushTickets(
  ctx: MutationCtx,
  args: { ticketIds: Id<"pushTickets">[]; disableTokenIds: Id<"pushTokens">[] }
): Promise<void> {
  const now = Date.now();
  for (const id of args.ticketIds) {
    if (await ctx.db.get("pushTickets", id)) await ctx.db.delete("pushTickets", id);
  }
  await disableTokens(ctx, args.disableTokenIds, now);
}

/** Apaga até `limit` avisos com mais de 60 dias e devolve quantos apagou. */
export async function purgeExpiredNotifications(ctx: MutationCtx, limit: number): Promise<number> {
  const cutoff = Date.now() - NOTIFICATION_RETENTION_DAYS * DAY_MS;
  const old = await ctx.db
    .query("notifications")
    .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
    .take(limit);
  for (const n of old) await ctx.db.delete("notifications", n._id);
  return old.length;
}
