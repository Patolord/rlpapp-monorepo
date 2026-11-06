import type { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

/** Usuário como a administração vê em Configurações → Usuários. */
export type User = FunctionReturnType<typeof api.users.list>[number];

/** Convite enviado e ainda não aceito: o cadastro existe, a conta não. */
export function isPendingInvite(user: Pick<User, "clerkId" | "invitedAt">): boolean {
  return user.clerkId === undefined && user.invitedAt !== undefined;
}

/** Página /convite deste app, destino do link que o Clerk envia por email. */
export function inviteRedirectUrl(): string {
  return `${window.location.origin}/convite`;
}
