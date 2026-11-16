import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { forbidden } from "../../lib/accessErrors";
import { notFound } from "../../lib/domainErrors";

/** Sessão do chat do assistente que pertence ao usuário; senão, erro. */
export async function requireOwnSession(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  sessionId: Id<"aiChatSessions">
): Promise<Doc<"aiChatSessions">> {
  const session = await ctx.db.get("aiChatSessions", sessionId);
  if (!session) throw notFound("Sessão não encontrada");
  if (session.userId !== user._id) {
    throw forbidden("Acesso negado");
  }
  return session;
}

/** Apaga uma sessão do chat do assistente e suas mensagens (só o dono). */
export async function deleteChatSession(
  ctx: MutationCtx,
  user: Doc<"users">,
  sessionId: Id<"aiChatSessions">
): Promise<void> {
  await requireOwnSession(ctx, user, sessionId);
  const messages = await ctx.db
    .query("aiChatMessages")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
  for (const msg of messages) {
    await ctx.db.delete("aiChatMessages", msg._id);
  }
  await ctx.db.delete("aiChatSessions", sessionId);
}

/** Conversas do usuário numa obra, da mais recente para a mais antiga. */
export async function listOwnChatSessions(
  ctx: QueryCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
) {
  return await ctx.db
    .query("aiChatSessions")
    .withIndex("by_project_user", (q) => q.eq("projectId", projectId).eq("userId", user._id))
    .order("desc")
    .collect();
}

/** Mensagens de uma conversa do próprio usuário, na ordem em que foram trocadas. */
export async function listChatMessages(
  ctx: QueryCtx,
  user: Doc<"users">,
  sessionId: Id<"aiChatSessions">
) {
  await requireOwnSession(ctx, user, sessionId);
  return await ctx.db
    .query("aiChatMessages")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
}

export async function createChatSession(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { projectId: Id<"projects">; title?: string }
): Promise<Id<"aiChatSessions">> {
  const now = Date.now();
  return await ctx.db.insert("aiChatSessions", {
    projectId: input.projectId,
    userId: user._id,
    title: input.title ?? "Nova conversa",
    createdAt: now,
    updatedAt: now,
  });
}

/** Grava uma mensagem e marca a conversa como atualizada agora. */
export async function addChatMessage(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    sessionId: Id<"aiChatSessions">;
    role: Doc<"aiChatMessages">["role"];
    text: string;
    intents?: string;
  }
): Promise<Id<"aiChatMessages">> {
  await requireOwnSession(ctx, user, input.sessionId);
  const now = Date.now();
  await ctx.db.patch("aiChatSessions", input.sessionId, { updatedAt: now });
  return await ctx.db.insert("aiChatMessages", {
    sessionId: input.sessionId,
    role: input.role,
    text: input.text,
    intents: input.intents,
    createdAt: now,
  });
}

export async function renameChatSession(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { sessionId: Id<"aiChatSessions">; title: string }
): Promise<void> {
  await requireOwnSession(ctx, user, input.sessionId);
  await ctx.db.patch("aiChatSessions", input.sessionId, { title: input.title });
}
