import { api } from "@rlpapp/backend/convex/_generated/api";
import { can, type Permission } from "@rlpapp/shared/auth/permissions";
import { useQuery } from "convex/react";

/**
 * Se o usuário atual tem alguma das permissões (acessos + ajustes
 * individuais, já calculados pelo backend em `users.getCurrentUser`).
 * Enquanto carrega, devolve `false`: use para esconder ações e para pular
 * (`"skip"`) queries que o backend negaria. Quem decide continua sendo o
 * backend.
 */
export function useCan(...permissions: Permission[]): boolean {
  const currentUser = useQuery(api.users.getCurrentUser);
  return can(currentUser, ...permissions);
}
