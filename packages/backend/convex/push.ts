/**
 * Envio de push pelo serviço do Expo (A2 §6). `notify` grava o aviso e agenda
 * `send`; aqui decidimos quem recebe agora, quem espera o fim do horário
 * silencioso e quem fica só no sino, e gravamos o resultado.
 *
 * Usa `fetch` do runtime padrão do Convex (sem "use node").
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { NOTIFICATION_RETENTION_DAYS } from "./lib/notifications";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const BATCH = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
/** O Expo guarda recibos por 24 h; depois disso o ticket é descartado. */
const RECEIPT_TTL_MS = DAY_MS;
const RECEIPT_DELAY_MS = 15 * 60 * 1000;

// Horário silencioso 21h–6h em America/Sao_Paulo (UTC-3, sem horário de
// verão desde 2019) = 00:00–09:00 UTC.
const QUIET_END_UTC_HOUR = 9;

export function quietUntil(now: number): number | null {
  const date = new Date(now);
  if (date.getUTCHours() >= QUIET_END_UTC_HOUR) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), QUIET_END_UTC_HOUR);
}

const deliveryValidator = v.object({
  notificationId: v.id("notifications"),
  title: v.string(),
  body: v.string(),
  category: v.string(),
  target: v.string(),
  params: v.union(v.record(v.string(), v.string()), v.null()),
  badge: v.number(),
  tokens: v.array(v.object({ tokenId: v.id("pushTokens"), token: v.string() })),
});

/** Separa os avisos em: enviar agora, esperar as 6h, só no sino. */
export const planDelivery = internalQuery({
  args: { ids: v.array(v.id("notifications")), now: v.number() },
  returns: v.object({
    deliver: v.array(deliveryValidator),
    deferred: v.array(v.id("notifications")),
    deferUntil: v.union(v.number(), v.null()),
    skipped: v.array(v.object({ notificationId: v.id("notifications"), reason: v.string() })),
  }),
  handler: async (ctx, args) => {
    const quietEnd = quietUntil(args.now);
    const prefsCache = new Map<Id<"users">, Doc<"notificationPreferences"> | null>();
    const badgeCache = new Map<Id<"users">, number>();
    const deliver = [];
    const deferred: Id<"notifications">[] = [];
    const skipped: { notificationId: Id<"notifications">; reason: string }[] = [];

    for (const id of args.ids) {
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

    return { deliver, deferred, deferUntil: deferred.length > 0 ? quietEnd : null, skipped };
  },
});

const resultValidator = v.object({
  notificationId: v.id("notifications"),
  status: v.union(v.literal("sent"), v.literal("skipped"), v.literal("failed")),
  error: v.optional(v.string()),
});

export const recordResults = internalMutation({
  args: {
    results: v.array(resultValidator),
    tickets: v.array(
      v.object({ ticketId: v.string(), tokenId: v.id("pushTokens"), notificationId: v.id("notifications") })
    ),
    disableTokenIds: v.array(v.id("pushTokens")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const r of args.results) {
      const n = await ctx.db.get("notifications", r.notificationId);
      if (!n) continue;
      await ctx.db.patch("notifications", n._id, { pushStatus: r.status, pushError: r.error });
    }
    for (const t of args.tickets) {
      await ctx.db.insert("pushTickets", { ...t, createdAt: now });
    }
    for (const tokenId of new Set(args.disableTokenIds)) {
      const token = await ctx.db.get("pushTokens", tokenId);
      if (token && token.disabledAt === undefined) {
        await ctx.db.patch("pushTokens", tokenId, { disabledAt: now });
      }
    }
    return null;
  },
});

type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message?: string; details?: { error?: string } };

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  priority: "high";
  channelId: string;
  badge: number;
  data: Record<string, unknown>;
};

function expoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  if (env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;
  return headers;
}

export const send = internalAction({
  args: { ids: v.array(v.id("notifications")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await ctx.runQuery(internal.push.planDelivery, { ids: args.ids, now: Date.now() });

    if (plan.deferred.length > 0 && plan.deferUntil !== null) {
      await ctx.scheduler.runAt(plan.deferUntil, internal.push.send, { ids: plan.deferred });
    }

    const results: { notificationId: Id<"notifications">; status: "sent" | "skipped" | "failed"; error?: string }[] =
      plan.skipped.map((s) => ({ notificationId: s.notificationId, status: "skipped", error: s.reason }));
    const tickets: { ticketId: string; tokenId: Id<"pushTokens">; notificationId: Id<"notifications"> }[] = [];
    const disableTokenIds: Id<"pushTokens">[] = [];

    // Uma mensagem por aparelho; guardamos de qual aviso/token cada uma veio.
    const messages: { message: ExpoMessage; notificationId: Id<"notifications">; tokenId: Id<"pushTokens"> }[] = [];
    for (const d of plan.deliver) {
      for (const t of d.tokens) {
        messages.push({
          notificationId: d.notificationId,
          tokenId: t.tokenId,
          message: {
            to: t.token,
            title: d.title,
            body: d.body,
            sound: "default",
            priority: "high",
            channelId: d.category,
            badge: d.badge,
            data: { notificationId: d.notificationId, target: d.target, params: d.params ?? {} },
          },
        });
      }
    }

    const okByNotification = new Map<Id<"notifications">, boolean>();
    const errorByNotification = new Map<Id<"notifications">, string>();
    for (let i = 0; i < messages.length; i += BATCH) {
      const chunk = messages.slice(i, i + BATCH);
      let data: ExpoTicket[] = [];
      try {
        const res = await fetch(EXPO_SEND_URL, {
          method: "POST",
          headers: expoHeaders(),
          body: JSON.stringify(chunk.map((c) => c.message)),
        });
        const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[]; errors?: { message?: string }[] } | null;
        if (!res.ok || !json?.data) {
          const reason = json?.errors?.[0]?.message ?? `HTTP ${res.status}`;
          for (const c of chunk) errorByNotification.set(c.notificationId, `Expo: ${reason}`);
          continue;
        }
        data = json.data;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        for (const c of chunk) errorByNotification.set(c.notificationId, `Expo: ${reason}`);
        continue;
      }
      chunk.forEach((c, index) => {
        const ticket = data[index];
        if (ticket?.status === "ok") {
          okByNotification.set(c.notificationId, true);
          tickets.push({ ticketId: ticket.id, tokenId: c.tokenId, notificationId: c.notificationId });
        } else {
          if (ticket?.details?.error === "DeviceNotRegistered") disableTokenIds.push(c.tokenId);
          errorByNotification.set(c.notificationId, ticket?.message ?? "Expo recusou o envio");
        }
      });
    }

    for (const d of plan.deliver) {
      if (okByNotification.get(d.notificationId)) {
        results.push({ notificationId: d.notificationId, status: "sent" });
      } else {
        results.push({
          notificationId: d.notificationId,
          status: "failed",
          error: errorByNotification.get(d.notificationId) ?? "Falha no envio",
        });
      }
    }

    if (results.length > 0 || tickets.length > 0 || disableTokenIds.length > 0) {
      await ctx.runMutation(internal.push.recordResults, { results, tickets, disableTokenIds });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Recibos (cron de 15 min): desliga o token de aparelho que desinstalou o app.
// ---------------------------------------------------------------------------

export const dueTickets = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.object({ _id: v.id("pushTickets"), ticketId: v.string(), tokenId: v.id("pushTokens"), createdAt: v.number() })),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pushTickets")
      .withIndex("by_created", (q) => q.lt("createdAt", args.now - RECEIPT_DELAY_MS))
      .take(300);
    return rows.map((r) => ({ _id: r._id, ticketId: r.ticketId, tokenId: r.tokenId, createdAt: r.createdAt }));
  },
});

export const finishTickets = internalMutation({
  args: { ticketIds: v.array(v.id("pushTickets")), disableTokenIds: v.array(v.id("pushTokens")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.ticketIds) {
      if (await ctx.db.get("pushTickets", id)) await ctx.db.delete("pushTickets", id);
    }
    for (const tokenId of new Set(args.disableTokenIds)) {
      const token = await ctx.db.get("pushTokens", tokenId);
      if (token && token.disabledAt === undefined) {
        await ctx.db.patch("pushTokens", tokenId, { disabledAt: now });
      }
    }
    return null;
  },
});

export const checkReceipts = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.runQuery(internal.push.dueTickets, { now });
    if (due.length === 0) return null;

    const done: Id<"pushTickets">[] = [];
    const disable: Id<"pushTokens">[] = [];
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: expoHeaders(),
        body: JSON.stringify({ ids: due.map((d) => d.ticketId) }),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: Record<string, { status: "ok" | "error"; details?: { error?: string } }>;
      } | null;
      const receipts = res.ok ? (json?.data ?? {}) : {};
      for (const d of due) {
        const receipt = receipts[d.ticketId];
        if (receipt) {
          if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
            disable.push(d.tokenId);
          }
          done.push(d._id);
        } else if (now - d.createdAt > RECEIPT_TTL_MS) {
          done.push(d._id);
        }
      }
    } catch {
      // Sem rede com o Expo: tenta de novo no próximo ciclo; descarta só o vencido.
      for (const d of due) if (now - d.createdAt > RECEIPT_TTL_MS) done.push(d._id);
    }

    if (done.length > 0 || disable.length > 0) {
      await ctx.runMutation(internal.push.finishTickets, { ticketIds: done, disableTokenIds: disable });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Limpeza (cron diário): avisos com mais de 60 dias saem do sino.
// ---------------------------------------------------------------------------

export const purgeOld = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - NOTIFICATION_RETENTION_DAYS * DAY_MS;
    const old = await ctx.db
      .query("notifications")
      .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
      .take(500);
    for (const n of old) await ctx.db.delete("notifications", n._id);
    if (old.length === 500) {
      await ctx.scheduler.runAfter(0, internal.push.purgeOld, {});
    }
    return old.length;
  },
});
