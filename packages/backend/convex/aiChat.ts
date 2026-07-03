import { v } from "convex/values";
import { engineeringQuery, engineeringMutation } from "./lib/rbac";

export const listSessions = engineeringQuery({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.array(
    v.object({
      _id: v.id("aiChatSessions"),
      _creationTime: v.number(),
      projectId: v.id("projects"),
      userId: v.id("users"),
      title: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiChatSessions")
      .withIndex("by_project_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", ctx.user._id)
      )
      .order("desc")
      .collect();
  },
});

export const getMessages = engineeringQuery({
  args: {
    sessionId: v.id("aiChatSessions"),
  },
  returns: v.array(
    v.object({
      _id: v.id("aiChatMessages"),
      _creationTime: v.number(),
      sessionId: v.id("aiChatSessions"),
      role: v.union(v.literal("user"), v.literal("assistant")),
      text: v.string(),
      intents: v.optional(v.string()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("aiChatSessions", args.sessionId);
    if (!session) throw new Error("Sessão não encontrada");
    if (session.userId !== ctx.user._id) {
      throw new Error("Acesso negado");
    }
    return await ctx.db
      .query("aiChatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

export const createSession = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    title: v.optional(v.string()),
  },
  returns: v.id("aiChatSessions"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("aiChatSessions", {
      projectId: args.projectId,
      userId: ctx.user._id,
      title: args.title ?? "Nova conversa",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const addMessage = engineeringMutation({
  args: {
    sessionId: v.id("aiChatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    intents: v.optional(v.string()),
  },
  returns: v.id("aiChatMessages"),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("aiChatSessions", args.sessionId);
    if (!session) throw new Error("Sessão não encontrada");
    if (session.userId !== ctx.user._id) {
      throw new Error("Acesso negado");
    }
    const now = Date.now();
    await ctx.db.patch("aiChatSessions", args.sessionId, { updatedAt: now });
    return await ctx.db.insert("aiChatMessages", {
      sessionId: args.sessionId,
      role: args.role,
      text: args.text,
      intents: args.intents,
      createdAt: now,
    });
  },
});

export const updateSessionTitle = engineeringMutation({
  args: {
    sessionId: v.id("aiChatSessions"),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("aiChatSessions", args.sessionId);
    if (!session) throw new Error("Sessão não encontrada");
    if (session.userId !== ctx.user._id) {
      throw new Error("Acesso negado");
    }
    await ctx.db.patch("aiChatSessions", args.sessionId, {
      title: args.title,
    });
    return null;
  },
});

export const deleteSession = engineeringMutation({
  args: {
    sessionId: v.id("aiChatSessions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("aiChatSessions", args.sessionId);
    if (!session) throw new Error("Sessão não encontrada");
    if (session.userId !== ctx.user._id) {
      throw new Error("Acesso negado");
    }
    const messages = await ctx.db
      .query("aiChatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete("aiChatMessages", msg._id);
    }
    await ctx.db.delete("aiChatSessions", args.sessionId);
    return null;
  },
});
