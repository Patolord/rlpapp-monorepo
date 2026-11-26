import { v } from "convex/values";
import {
  assistenteMutation,
  assistenteQuery,
} from "./lib/rbac";
import {
  addChatMessage,
  createChatSession,
  deleteChatSession,
  listChatMessages,
  listOwnChatSessions,
  renameChatSession,
} from "./model/ai/chatSessions";

export const listSessions = assistenteQuery({
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
  handler: async (ctx, args) => await listOwnChatSessions(ctx, ctx.user, args.projectId),
});

export const getMessages = assistenteQuery({
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
  handler: async (ctx, args) => await listChatMessages(ctx, ctx.user, args.sessionId),
});

export const createSession = assistenteMutation({
  args: {
    projectId: v.id("projects"),
    title: v.optional(v.string()),
  },
  returns: v.id("aiChatSessions"),
  handler: async (ctx, args) => await createChatSession(ctx, ctx.user, args),
});

export const addMessage = assistenteMutation({
  args: {
    sessionId: v.id("aiChatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    intents: v.optional(v.string()),
  },
  returns: v.id("aiChatMessages"),
  handler: async (ctx, args) => await addChatMessage(ctx, ctx.user, args),
});

export const updateSessionTitle = assistenteMutation({
  args: {
    sessionId: v.id("aiChatSessions"),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await renameChatSession(ctx, ctx.user, args);
    return null;
  },
});

export const deleteSession = assistenteMutation({
  args: {
    sessionId: v.id("aiChatSessions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteChatSession(ctx, ctx.user, args.sessionId);
    return null;
  },
});
