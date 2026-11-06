"use node";

import { v } from "convex/values";
import { action, env, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { accessRoles } from "./schema/identity";
import { rejectReadOnlyAgentTokenInAction } from "./lib/agentTokens";
import { normalizeEmail } from "./model/identity/users";
import { requireActionPermission } from "./lib/rbac";

const CLERK_API = "https://api.clerk.com/v1";

/** Validade do link de convite. O admin pode reenviar quando expira. */
const INVITATION_EXPIRES_IN_DAYS = 30;

type ClerkCreateUserResponse = {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  email_addresses: Array<{ email_address: string }>;
};

type ClerkInvitationResponse = {
  id: string;
  email_address: string;
  status: "pending" | "accepted" | "revoked" | "expired";
};

type ClerkErrorResponse = {
  errors: Array<{ message: string; long_message: string; code: string }>;
};

const CLERK_ERROR_MESSAGES: Record<string, string> = {
  form_identifier_exists: "Já existe uma conta com este email no Clerk.",
  duplicate_record: "Já existe um convite pendente para este email.",
};

/** Falha da Backend API do Clerk, com o status HTTP e o código do primeiro erro. */
class ClerkApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined
  ) {
    super(message);
    this.name = "ClerkApiError";
  }
}

async function clerkRequest<T>(
  path: string,
  body?: Record<string, unknown>,
  method: "GET" | "POST" = "POST"
): Promise<T> {
  const response = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorData: ClerkErrorResponse | null = null;
    try {
      errorData = (await response.json()) as ClerkErrorResponse;
    } catch {
      // corpo não é JSON; cai na mensagem genérica abaixo
    }
    const first = errorData?.errors?.[0];
    const msg =
      (first?.code && CLERK_ERROR_MESSAGES[first.code]) ??
      first?.long_message ??
      first?.message ??
      `Clerk API error (${response.status})`;
    throw new ClerkApiError(msg, response.status, first?.code);
  }

  return (await response.json()) as T;
}

async function createClerkUser(args: {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<string> {
  const user = await clerkRequest<ClerkCreateUserResponse>("/users", {
    username: args.username,
    password: args.password,
    first_name: args.firstName,
    last_name: args.lastName,
    skip_password_checks: false,
  });
  return user.id;
}

/**
 * Cria (ou recria) a invitation no Clerk. O email da pessoa recebe um link que
 * termina em `redirectUrl?__clerk_ticket=…`, a página /convite do app web, onde
 * ela escolhe nome, login e senha. `ignore_existing` permite reenviar mesmo
 * com um convite pendente para o mesmo email.
 */
async function createClerkInvitation(args: {
  email: string;
  redirectUrl: string;
}): Promise<string> {
  const invitation = await clerkRequest<ClerkInvitationResponse>("/invitations", {
    email_address: args.email,
    redirect_url: args.redirectUrl,
    notify: true,
    ignore_existing: true,
    expires_in_days: INVITATION_EXPIRES_IN_DAYS,
  });
  return invitation.id;
}

/**
 * Estado atual da invitation no Clerk, ou null se não existe (ou já foi
 * revogada: a listagem padrão não traz revogadas). `query` filtra por id.
 */
async function findClerkInvitation(invitationId: string): Promise<ClerkInvitationResponse | null> {
  const result = await clerkRequest<
    ClerkInvitationResponse[] | { data: ClerkInvitationResponse[] }
  >(`/invitations?query=${encodeURIComponent(invitationId)}&limit=10`, undefined, "GET");
  const list = Array.isArray(result) ? result : result.data;
  return list.find((invitation) => invitation.id === invitationId) ?? null;
}

/**
 * Revoga a invitation, garantindo que o link deixou de valer antes de o
 * chamador apagar ou recriar o cadastro. Se o Clerk recusar (400/404), confere
 * o estado: só segue quando a invitation não existe mais ou já não está
 * pendente (aceita, expirada, revogada antes). Qualquer outra falha (chave
 * inválida, rede, 5xx) interrompe.
 */
async function revokeClerkInvitation(invitationId: string): Promise<void> {
  try {
    await clerkRequest<ClerkInvitationResponse>(`/invitations/${invitationId}/revoke`);
    return;
  } catch (error) {
    if (!(error instanceof ClerkApiError) || (error.status !== 400 && error.status !== 404)) {
      throw error;
    }
    const current = await findClerkInvitation(invitationId);
    if (current?.status === "pending") {
      throw new Error(
        `Não foi possível cancelar o convite no Clerk: ${error.message}`
      );
    }
    console.warn(
      `Clerk: invitation ${invitationId} já não estava pendente (${current?.status ?? "inexistente"})`
    );
  }
}

/** A página de convite tem de ser http(s); o restante da URL vem do app web. */
function assertRedirectUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL de retorno do convite inválida");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("URL de retorno do convite inválida");
  }
  return parsed.toString();
}

async function requireAdmin(ctx: ActionCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
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
      throw new Error("Email inválido");
    }
    const redirectUrl = assertRedirectUrl(args.redirectUrl);

    // Checa antes de falar com o Clerk, para não criar convite à toa. Só um
    // convite pendente pode ser reenviado; quem já tem conta, ou um cadastro
    // antigo sem convite, não é convidado por aqui (mesma regra de upsertInvited).
    const existing = await ctx.runQuery(internal.users.getByEmailInternal, { email });
    if (existing && (existing.clerkId || existing.invitedAt === undefined)) {
      throw new Error("Já existe um usuário com este email");
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
    if (!user) throw new Error("Usuário não encontrado");
    if (user.clerkId || user.invitedAt === undefined) {
      throw new Error("Este usuário já aceitou o convite");
    }
    if (!user.email) throw new Error("Usuário sem email");

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
    if (!user) throw new Error("Usuário não encontrado");
    if (user.clerkId || user.invitedAt === undefined) {
      throw new Error("Este usuário já aceitou o convite");
    }

    if (user.clerkInvitationId) {
      await revokeClerkInvitation(user.clerkInvitationId);
    }
    await ctx.runMutation(internal.users.deleteInvited, { id: args.id });
    return null;
  },
});
