import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { notFound, ruleViolation } from "../../lib/domainErrors";
import { NOTIFICATION_RETENTION_DAYS } from "./notify";

/** Sino (avisos de cada pessoa), preferências de push e aparelhos registrados. */

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 100;

/** Avisos da pessoa nos últimos 60 dias, mais novos primeiro. */
export async function listOwnNotifications(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: { onlyUnread?: boolean }
) {
  const since = Date.now() - NOTIFICATION_RETENTION_DAYS * DAY_MS;
  const rows = await ctx.db
    .query("notifications")
    .withIndex("by_user_created", (q) => q.eq("userId", user._id).gte("createdAt", since))
    .order("desc")
    .take(LIST_LIMIT);
  return rows
    .filter((n) => !input.onlyUnread || n.readAt === undefined)
    .map((n) => ({
      _id: n._id,
      kind: n.kind,
      category: n.category,
      title: n.title,
      body: n.body,
      projectId: n.projectId ?? null,
      target: n.target,
      params: n.params ?? null,
      createdAt: n.createdAt,
      readAt: n.readAt ?? null,
      pushStatus: n.pushStatus,
    }));
}

/** Número do sino (até 100). */
export async function countUnreadNotifications(ctx: QueryCtx, userId: Id<"users">): Promise<number> {
  const unread = await ctx.db
    .query("notifications")
    .withIndex("by_user_read", (q) => q.eq("userId", userId).eq("readAt", undefined))
    .take(LIST_LIMIT);
  return unread.length;
}

export async function markNotificationRead(
  ctx: MutationCtx,
  user: Doc<"users">,
  notificationId: Id<"notifications">
): Promise<void> {
  const n = await ctx.db.get("notifications", notificationId);
  if (!n || n.userId !== user._id) throw notFound("Aviso não encontrado");
  if (n.readAt === undefined) {
    await ctx.db.patch("notifications", n._id, { readAt: Date.now() });
  }
}

/** Marca até 500 avisos não lidos e devolve quantos marcou. */
export async function markAllNotificationsRead(ctx: MutationCtx, user: Doc<"users">): Promise<number> {
  const unread = await ctx.db
    .query("notifications")
    .withIndex("by_user_read", (q) => q.eq("userId", user._id).eq("readAt", undefined))
    .take(500);
  const now = Date.now();
  for (const n of unread) {
    await ctx.db.patch("notifications", n._id, { readAt: now });
  }
  return unread.length;
}

type NotificationPreferences = Pick<Doc<"notificationPreferences">, "pushOff" | "quietHours">;

/** Sem registro: push de todas as categorias, com horário silencioso. */
export async function getNotificationPreferences(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<NotificationPreferences> {
  const prefs = await ctx.db
    .query("notificationPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  return { pushOff: prefs?.pushOff ?? [], quietHours: prefs?.quietHours ?? true };
}

export async function saveNotificationPreferences(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: NotificationPreferences
): Promise<void> {
  const pushOff = [...new Set(input.pushOff)];
  const existing = await ctx.db
    .query("notificationPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch("notificationPreferences", existing._id, {
      pushOff,
      quietHours: input.quietHours,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("notificationPreferences", {
      userId,
      pushOff,
      quietHours: input.quietHours,
      updatedAt: now,
    });
  }
}

/** Registra (ou reativa) o token de push deste aparelho para a pessoa. */
export async function registerPushToken(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: {
    token: string;
    platform: Doc<"pushTokens">["platform"];
    deviceName?: string;
    appVersion?: string;
  }
): Promise<void> {
  const token = input.token.trim();
  if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) {
    throw ruleViolation("Token de push inválido");
  }
  const now = Date.now();
  const existing = await ctx.db
    .query("pushTokens")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (existing) {
    // O mesmo aparelho pode trocar de usuário: o token passa para quem entrou.
    await ctx.db.patch("pushTokens", existing._id, {
      userId,
      platform: input.platform,
      deviceName: input.deviceName,
      appVersion: input.appVersion,
      lastSeenAt: now,
      disabledAt: undefined,
    });
  } else {
    await ctx.db.insert("pushTokens", {
      userId,
      token,
      platform: input.platform,
      deviceName: input.deviceName,
      appVersion: input.appVersion,
      createdAt: now,
      lastSeenAt: now,
    });
  }
}

/** Desliga o token deste aparelho (Sair); token de outra pessoa é ignorado. */
export async function unregisterPushToken(
  ctx: MutationCtx,
  userId: Id<"users">,
  rawToken: string
): Promise<void> {
  const existing = await ctx.db
    .query("pushTokens")
    .withIndex("by_token", (q) => q.eq("token", rawToken.trim()))
    .unique();
  if (existing && existing.userId === userId && existing.disabledAt === undefined) {
    await ctx.db.patch("pushTokens", existing._id, { disabledAt: Date.now() });
  }
}
