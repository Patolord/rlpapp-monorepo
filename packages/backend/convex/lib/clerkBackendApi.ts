// Cliente mínimo da Backend API do Clerk (usuários e convites), usado pelas
// actions de userAdmin.ts. fetch funciona no runtime padrão do Convex.

import { env } from "../_generated/server";
import { ruleViolation } from "./domainErrors";

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
export class ClerkApiError extends Error {
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

export async function createClerkUser(args: {
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
export async function createClerkInvitation(args: {
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
export async function revokeClerkInvitation(invitationId: string): Promise<void> {
  try {
    await clerkRequest<ClerkInvitationResponse>(`/invitations/${invitationId}/revoke`);
    return;
  } catch (error) {
    if (!(error instanceof ClerkApiError) || (error.status !== 400 && error.status !== 404)) {
      throw error;
    }
    const current = await findClerkInvitation(invitationId);
    if (current?.status === "pending") {
      throw ruleViolation(
        `Não foi possível cancelar o convite no Clerk: ${error.message}`
      );
    }
    console.warn(
      `Clerk: invitation ${invitationId} já não estava pendente (${current?.status ?? "inexistente"})`
    );
  }
}

/** A página de convite tem de ser http(s); o restante da URL vem do app web. */
export function assertRedirectUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw ruleViolation("URL de retorno do convite inválida");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw ruleViolation("URL de retorno do convite inválida");
  }
  return parsed.toString();
}
