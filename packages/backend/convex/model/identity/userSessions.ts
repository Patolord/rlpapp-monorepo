import {
  getPermissions,
  isStaff,
  resolveHomeArea,
} from "@rlpapp/shared/auth/permissions";
import { capitalizeFirst } from "@rlpapp/shared/usernames";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { enforceAgentTokenPolicy } from "../../lib/agentTokens";
import { accessFields, toUserView } from "./users";
import { unauthenticated } from "../../lib/accessErrors";

/** Vínculo entre a identidade do Clerk e o cadastro: login e webhooks. */

/** Usuário da sessão com o acesso resolvido; null sem sessão ou sem cadastro. */
export async function getCurrentUserView(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  await enforceAgentTokenPolicy(ctx, identity);

  const byClerkId = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .first();
  // Fallback para usuários criados antes do vínculo por clerkId
  const user =
    byClerkId ??
    (identity.email
      ? await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", identity.email!))
          .first()
      : null);
  if (!user) return null;
  return {
    ...toUserView(user),
    permissions: getPermissions(user),
    isStaff: isStaff(user),
    homeArea: resolveHomeArea(user),
  };
}

/**
 * Garante o cadastro de quem entrou: atualiza o último login, vincula um
 * cadastro antigo ou convite pelo email, ou cria um novo sem acessos (técnico
 * de campo quando o login partiu de um QR code).
 */
export async function ensureUserForIdentity(
  ctx: MutationCtx,
  input: { origin?: "qr" }
): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw unauthenticated();
  }
  await enforceAgentTokenPolicy(ctx, identity);
  const clerkId = identity.subject;
  // No JWT template "convex" do Clerk, nickname = username
  const username = identity.nickname ?? identity.preferredUsername;

  const byClerkId = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .first();

  if (byClerkId) {
    await ctx.db.patch("users", byClerkId._id, { lastLoginAt: Date.now() });
    return byClerkId._id;
  }

  // Vincula usuários antigos (sem clerkId) pelo email
  if (identity.email) {
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (byEmail) {
      // Convite aceito sem o webhook ter chegado antes: nome e login vêm do
      // que a pessoa preencheu ao criar a conta.
      const invited = byEmail.invitedAt !== undefined;
      await ctx.db.patch("users", byEmail._id, {
        clerkId,
        lastLoginAt: Date.now(),
        ...(invited && identity.name ? { name: identity.name } : {}),
        ...(invited && username ? { username } : {}),
      });
      return byEmail._id;
    }
  }

  const name =
    identity.name ??
    identity.givenName ??
    (username ? capitalizeFirst(username) : undefined) ??
    identity.email?.split("@")[0] ??
    "Usuário";

  // Quem entra pelo QR é técnico de campo; os demais ficam sem acesso até
  // um administrador atribuir os acessos em Configurações → Usuários.
  const userId = await ctx.db.insert("users", {
    name,
    email: identity.email,
    username,
    clerkId,
    ...accessFields(input.origin === "qr" ? ["qr_operator"] : []),
    isActive: true,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  });

  return userId;
}

export type UpsertUserFromClerkInput = {
  clerkId: string;
  email?: string;
  username?: string;
  name: string;
  /** Telefone informado ao aceitar um convite (unsafe_metadata do Clerk). */
  phone?: string;
};

/** Webhook do Clerk (user.created / user.updated). */
export async function upsertUserFromClerk(
  ctx: MutationCtx,
  input: UpsertUserFromClerkInput
): Promise<Id<"users">> {
  const byClerkId = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", input.clerkId))
    .first();

  if (byClerkId) {
    // Telefone do convite: também quando ensureUser vinculou antes do webhook.
    await ctx.db.patch("users", byClerkId._id, {
      name: input.name,
      email: input.email,
      username: input.username,
      ...(input.phone && !byClerkId.phone ? { phone: input.phone } : {}),
    });
    return byClerkId._id;
  }

  // Vincula usuários criados antes do webhook (sem clerkId) e convites
  // pendentes pelo email
  if (input.email) {
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", input.email))
      .first();

    if (byEmail) {
      await ctx.db.patch("users", byEmail._id, {
        clerkId: input.clerkId,
        name: input.name,
        username: input.username,
        ...(input.phone && !byEmail.phone ? { phone: input.phone } : {}),
      });
      return byEmail._id;
    }
  }

  return await ctx.db.insert("users", {
    clerkId: input.clerkId,
    name: input.name,
    email: input.email,
    username: input.username,
    phone: input.phone,
    ...accessFields([]),
    isActive: true,
    createdAt: Date.now(),
  });
}

/** Webhook do Clerk (user.deleted): soft delete para preservar histórico. */
export async function deactivateUserFromClerk(
  ctx: MutationCtx,
  clerkId: string
): Promise<void> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .first();

  if (user) {
    await ctx.db.patch("users", user._id, { isActive: false });
  } else {
    console.warn(
      `Clerk webhook: user.deleted para clerkId ${clerkId} sem usuário correspondente`
    );
  }
}
