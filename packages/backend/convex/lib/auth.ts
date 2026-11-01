import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { enforceAgentTokenPolicy } from "./agentTokens";

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  // No-op para sessões do Clerk; rejeita tokens de agente revogados e tokens
  // somente-leitura em mutations (lib/agentTokens.ts).
  await enforceAgentTokenPolicy(ctx, identity);
  return identity;
}

export async function getUserByIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await requireAuth(ctx);

  const byClerkId = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .first();
  if (byClerkId) {
    return byClerkId;
  }

  // Fallback para usuários criados antes do vínculo por clerkId
  const email = identity.email;
  if (!email) {
    return null;
  }
  return await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
}

// Referência estável de usuário em registros (campos *UserId baseados em string).
// Usuários antigos são referenciados por email; novos (só username) pelo _id.
export function getUserRef(user: Doc<"users">): string {
  return user.email ?? user._id;
}
