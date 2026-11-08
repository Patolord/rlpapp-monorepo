import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/rbac";
import { NOTIFICATION_RETENTION_DAYS } from "./lib/notifications";
import { notificationCategory, pushStatus } from "./schema";

// ---------------------------------------------------------------------------
// Sino, preferências e tokens de push do app (A2 §3–§6).
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 100;

const notificationRow = v.object({
  _id: v.id("notifications"),
  kind: v.string(),
  category: notificationCategory,
  title: v.string(),
  body: v.string(),
  projectId: v.union(v.id("projects"), v.null()),
  target: v.string(),
  params: v.union(v.record(v.string(), v.string()), v.null()),
  createdAt: v.number(),
  readAt: v.union(v.number(), v.null()),
  pushStatus,
});

/** Avisos da pessoa nos últimos 60 dias, mais novos primeiro. */
export const listMine = authedQuery({
  args: { onlyUnread: v.optional(v.boolean()) },
  returns: v.array(notificationRow),
  handler: async (ctx, args) => {
    const since = Date.now() - NOTIFICATION_RETENTION_DAYS * DAY_MS;
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_created", (q) => q.eq("userId", ctx.user._id).gte("createdAt", since))
      .order("desc")
      .take(LIST_LIMIT);
    return rows
      .filter((n) => !args.onlyUnread || n.readAt === undefined)
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
  },
});

/** Número do sino (até 100). */
export const unreadCount = authedQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", ctx.user._id).eq("readAt", undefined))
      .take(LIST_LIMIT);
    return unread.length;
  },
});

export const markRead = authedMutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const n = await ctx.db.get("notifications", args.notificationId);
    if (!n || n.userId !== ctx.user._id) throw new Error("Aviso não encontrado");
    if (n.readAt === undefined) {
      await ctx.db.patch("notifications", n._id, { readAt: Date.now() });
    }
    return null;
  },
});

export const markAllRead = authedMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", ctx.user._id).eq("readAt", undefined))
      .take(500);
    const now = Date.now();
    for (const n of unread) {
      await ctx.db.patch("notifications", n._id, { readAt: now });
    }
    return unread.length;
  },
});

const preferencesValidator = v.object({
  pushOff: v.array(notificationCategory),
  quietHours: v.boolean(),
});

export const getPreferences = authedQuery({
  args: {},
  returns: preferencesValidator,
  handler: async (ctx) => {
    const prefs = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    return { pushOff: prefs?.pushOff ?? [], quietHours: prefs?.quietHours ?? true };
  },
});

export const updatePreferences = authedMutation({
  args: preferencesValidator,
  returns: v.null(),
  handler: async (ctx, args) => {
    const pushOff = [...new Set(args.pushOff)];
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("notificationPreferences", existing._id, { pushOff, quietHours: args.quietHours, updatedAt: now });
    } else {
      await ctx.db.insert("notificationPreferences", { userId: ctx.user._id, pushOff, quietHours: args.quietHours, updatedAt: now });
    }
    return null;
  },
});

/** Registra (ou reativa) o token de push deste aparelho para a pessoa. */
export const registerPushToken = authedMutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    deviceName: v.optional(v.string()),
    appVersion: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) {
      throw new Error("Token de push inválido");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (existing) {
      // O mesmo aparelho pode trocar de usuário: o token passa para quem entrou.
      await ctx.db.patch("pushTokens", existing._id, {
        userId: ctx.user._id,
        platform: args.platform,
        deviceName: args.deviceName,
        appVersion: args.appVersion,
        lastSeenAt: now,
        disabledAt: undefined,
      });
    } else {
      await ctx.db.insert("pushTokens", {
        userId: ctx.user._id,
        token,
        platform: args.platform,
        deviceName: args.deviceName,
        appVersion: args.appVersion,
        createdAt: now,
        lastSeenAt: now,
      });
    }
    return null;
  },
});

/** Desliga o token deste aparelho (Sair). */
export const unregisterPushToken = authedMutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token.trim()))
      .unique();
    if (existing && existing.userId === ctx.user._id && existing.disabledAt === undefined) {
      await ctx.db.patch("pushTokens", existing._id, { disabledAt: Date.now() });
    }
    return null;
  },
});
