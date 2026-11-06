import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

/** Apaga uma sessão do chat do assistente e suas mensagens (só o dono). */
export async function deleteChatSession(
  ctx: MutationCtx,
  user: Doc<"users">,
  sessionId: Id<"aiChatSessions">
): Promise<void> {
  const session = await ctx.db.get("aiChatSessions", sessionId);
  if (!session) throw new Error("Sessão não encontrada");
  if (session.userId !== user._id) {
    throw new Error("Acesso negado");
  }
  const messages = await ctx.db
    .query("aiChatMessages")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
  for (const msg of messages) {
    await ctx.db.delete("aiChatMessages", msg._id);
  }
  await ctx.db.delete("aiChatSessions", sessionId);
}
