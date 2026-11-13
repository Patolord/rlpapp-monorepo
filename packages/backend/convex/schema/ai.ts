import { defineTable } from "convex/server";
import { v } from "convex/values";

// Assistente de IA da obra: conversas e mensagens (model/ai).

export const aiTables = {
  aiChatSessions: defineTable({
    projectId: v.id("projects"),
    userId: v.id("users"),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_user", ["userId"])
    .index("by_project_user", ["projectId", "userId"]),
  aiChatMessages: defineTable({
    sessionId: v.id("aiChatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    intents: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),
};
