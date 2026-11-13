"use node";

import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { accessRoles } from "./schema/identity";
import { rejectReadOnlyAgentTokenInAction } from "./lib/agentTokens";
import { normalizeEmail } from "./model/identity/users";
import { requireActionPermission } from "./lib/rbac";
import {
  assertRedirectUrl,
  createClerkInvitation,
  createClerkUser,
  revokeClerkInvitation,
} from "./lib/clerkBackendApi";
import { unauthenticated } from "./lib/accessErrors";
import { alreadyExists, notFound, ruleViolation } from "./lib/domainErrors";

async function requireAdmin(ctx: ActionCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw unauthenticated();
  rejectReadOnlyAgentTokenInAction(identity);
  await requireActionPermission(ctx, "admin.manage");
}

/**
 * Cadastro manual, com login e senha definidos pelo administrador. Caminho
 * para quem não tem email; o fluxo padrão é `adminInviteUser`.
 */
export const adminCreateUser = action({
  args: {
    name: v.string(),
    username: v.string(),
    password: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    roles: v.array(accessRoles),
  },
  returns: v.id("users"),
  handler: async (ctx, args): Promise<Id<"users">> => {
    await requireAdmin(ctx);

    const nameParts = args.name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? args.name;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : firstName;

    const clerkId = await createClerkUser({
      username: args.username,
      password: args.password,
      firstName,
      lastName,
    });

    const userId: Id<"users"> = await ctx.runMutation(internal.users.createWithClerkId, {
      clerkId,
      name: args.name,
      email: args.email ? normalizeEmail(args.email) : undefined,
      username: args.username,
      roles: args.roles,
      phone: args.phone,
    });

    return userId;
  },
});

/**
 * Convida alguém pelo email: o administrador só define o email e os acessos;
 * a pessoa escolhe nome, login e senha ao aceitar. O cadastro já aparece na
 * lista como convite pendente e é vinculado à conta do Clerk pelo email.
 */
export const adminInviteUser = action({
  args: {
    email: v.string(),
    /** Como aparece na lista até a pessoa aceitar; ela define o nome final. */
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    roles: v.array(accessRoles),
    /** Página /convite do app web (origem de quem convida). */
    redirectUrl: v.string(),
  },
  returns: v.id("users"),
  handler: async (ctx, args): Promise<Id<"users">> => {
    await requireAdmin(ctx);

    const email = normalizeEmail(args.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw ruleViolation("Email inválido");
    }
    const redirectUrl = assertRedirectUrl(args.redirectUrl);

    // Checa antes de falar com o Clerk, para não criar convite à toa. Só um
    // convite pendente pode ser reenviado; quem já tem conta, ou um cadastro
    // antigo sem convite, não é convidado por aqui (mesma regra de upsertInvited).
    const existing = await ctx.runQuery(internal.users.getByEmailInternal, { email });
    if (existing && (existing.clerkId || existing.invitedAt === undefined)) {
      throw alreadyExists("Já existe um usuário com este email");
    }

    const clerkInvitationId = await createClerkInvitation({ email, redirectUrl });

    const userId: Id<"users"> = await ctx.runMutation(internal.users.upsertInvited, {
      email,
      name: args.name,
      phone: args.phone,
      roles: args.roles,
      clerkInvitationId,
    });
    return userId;
  },
});

/** Envia o email de convite de novo (novo link, nova validade). */
export const adminResendInvite = action({
  args: { id: v.id("users"), redirectUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireAdmin(ctx);
    const redirectUrl = assertRedirectUrl(args.redirectUrl);

    const user = await ctx.runQuery(internal.users.getInternal, { id: args.id });
    if (!user) throw notFound("Usuário não encontrado");
    if (user.clerkId || user.invitedAt === undefined) {
      throw ruleViolation("Este usuário já aceitou o convite");
    }
    if (!user.email) throw ruleViolation("Usuário sem email");

    if (user.clerkInvitationId) {
      await revokeClerkInvitation(user.clerkInvitationId);
    }
    const clerkInvitationId = await createClerkInvitation({
      email: user.email,
      redirectUrl,
    });
    await ctx.runMutation(internal.users.markInviteResent, {
      id: args.id,
      clerkInvitationId,
    });
    return null;
  },
});

/** Cancela um convite pendente: o link deixa de valer e o cadastro some da lista. */
export const adminRevokeInvite = action({
  args: { id: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireAdmin(ctx);

    const user = await ctx.runQuery(internal.users.getInternal, { id: args.id });
    if (!user) throw notFound("Usuário não encontrado");
    if (user.clerkId || user.invitedAt === undefined) {
      throw ruleViolation("Este usuário já aceitou o convite");
    }

    if (user.clerkInvitationId) {
      await revokeClerkInvitation(user.clerkInvitationId);
    }
    await ctx.runMutation(internal.users.deleteInvited, { id: args.id });
    return null;
  },
});
