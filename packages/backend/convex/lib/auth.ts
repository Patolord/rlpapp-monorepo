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
  const email = identity.email;
  if (!email) {
    throw new Error("No email in identity");
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  return user;
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
