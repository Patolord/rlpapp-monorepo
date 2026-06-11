import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
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

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  allowedRoles: string[]
) {
  const user = await getUserByIdentity(ctx);
  if (!user) {
    throw new Error("User not found in database");
  }
  if (!allowedRoles.includes(user.role)) {
    throw new Error("Insufficient permissions");
  }
  return user;
}
