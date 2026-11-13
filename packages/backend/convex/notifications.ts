import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/rbac";
import {
  countUnreadNotifications,
  getNotificationPreferences,
  listOwnNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerPushToken as registerDevicePushToken,
  saveNotificationPreferences,
  unregisterPushToken as unregisterDevicePushToken,
} from "./model/notifications/inbox";
import { notificationCategory, pushStatus } from "./schema/notifications";

// ---------------------------------------------------------------------------
// Sino, preferências e tokens de push do app (A2 §3–§6).
// ---------------------------------------------------------------------------

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
  handler: async (ctx, args) => await listOwnNotifications(ctx, ctx.user, args),
});

/** Número do sino (até 100). */
export const unreadCount = authedQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => await countUnreadNotifications(ctx, ctx.user._id),
});

export const markRead = authedMutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markNotificationRead(ctx, ctx.user, args.notificationId);
    return null;
  },
});

export const markAllRead = authedMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => await markAllNotificationsRead(ctx, ctx.user),
});

const preferencesValidator = v.object({
  pushOff: v.array(notificationCategory),
  quietHours: v.boolean(),
});

export const getPreferences = authedQuery({
  args: {},
  returns: preferencesValidator,
  handler: async (ctx) => await getNotificationPreferences(ctx, ctx.user._id),
});

export const updatePreferences = authedMutation({
  args: preferencesValidator,
  returns: v.null(),
  handler: async (ctx, args) => {
    await saveNotificationPreferences(ctx, ctx.user._id, args);
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
    await registerDevicePushToken(ctx, ctx.user._id, args);
    return null;
  },
});

/** Desliga o token deste aparelho (Sair). */
export const unregisterPushToken = authedMutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await unregisterDevicePushToken(ctx, ctx.user._id, args.token);
    return null;
  },
});
