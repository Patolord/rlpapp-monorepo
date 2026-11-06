import type { Infer } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { accessRoles } from "../../schema/identity";
import { accessFields, normalizeEmail, toUserView } from "./users";

/** Convites por email: gravações chamadas pelas actions de userAdmin.ts. */

/** Pelo email normalizado (minúsculas, sem espaços nas pontas). */
export async function getUserViewByNormalizedEmail(
  ctx: QueryCtx,
  email: string
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
    .first();
  return user ? toUserView(user) : null;
}

/** Usuário com o id da invitation do Clerk, para reenviar ou cancelar. */
export async function getUserWithInvitation(ctx: QueryCtx, id: Id<"users">) {
  const user = await ctx.db.get("users", id);
  return user
    ? { ...toUserView(user), clerkInvitationId: user.clerkInvitationId }
    : null;
}

export type UpsertInvitedUserInput = {
  email: string;
  name?: string;
  phone?: string;
  roles: Infer<typeof accessRoles>[];
  clerkInvitationId: string;
};

/**
 * Cria o cadastro de um convite enviado, ou atualiza o convite pendente que já
 * existe para o email (reenvio). Quem já tem conta (clerkId), ou um cadastro
 * antigo que nunca foi convite (sem invitedAt), não entra por aqui.
 */
export async function upsertInvitedUser(
  ctx: MutationCtx,
  input: UpsertInvitedUserInput
): Promise<Id<"users">> {
  const email = normalizeEmail(input.email);
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  // Reenvio sem nome mantém o nome que já aparecia na lista.
  const name = input.name?.trim() || existing?.name || email.split("@")[0] || email;

  if (existing) {
    if (existing.clerkId || existing.invitedAt === undefined) {
      throw new Error("Já existe um usuário com este email");
    }
    await ctx.db.patch("users", existing._id, {
      name,
      phone: input.phone ?? existing.phone,
      ...accessFields(input.roles),
      isActive: true,
      invitedAt: Date.now(),
      clerkInvitationId: input.clerkInvitationId,
    });
    return existing._id;
  }

  return await ctx.db.insert("users", {
    name,
    email,
    phone: input.phone,
    ...accessFields(input.roles),
    isActive: true,
    createdAt: Date.now(),
    invitedAt: Date.now(),
    clerkInvitationId: input.clerkInvitationId,
  });
}

/** Registra um reenvio: novo id de invitation e nova data. */
export async function markUserInviteResent(
  ctx: MutationCtx,
  input: { id: Id<"users">; clerkInvitationId: string }
): Promise<void> {
  const user = await ctx.db.get("users", input.id);
  if (!user) throw new Error("Usuário não encontrado");
  if (user.clerkId) throw new Error("Este usuário já aceitou o convite");
  await ctx.db.patch("users", input.id, {
    invitedAt: Date.now(),
    clerkInvitationId: input.clerkInvitationId,
  });
}

/**
 * Apaga um convite pendente. Só cadastros sem conta (sem clerkId) e sem
 * histórico: um usuário que já entrou é desativado, nunca apagado.
 */
export async function deleteInvitedUser(
  ctx: MutationCtx,
  id: Id<"users">
): Promise<void> {
  const user = await ctx.db.get("users", id);
  if (!user) return;
  if (user.clerkId || user.invitedAt === undefined) {
    throw new Error("Este usuário já aceitou o convite");
  }
  await ctx.db.delete("users", id);
}
