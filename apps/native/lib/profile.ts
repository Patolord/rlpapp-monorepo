import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  hasRole,
  isAdmin as hasAdminAccess,
  isStaff,
  resolveHomeArea,
  type AccessSubject,
} from "@rlpapp/shared/auth/permissions";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";

// ---------------------------------------------------------------------------
// Perfil do app: decide uma vez, logo depois do login, qual barra de abas e
// qual Início cada pessoa vê. Sai dos acessos do usuário (`users.roles`) pela
// mesma política do backend (`@rlpapp/shared/auth/permissions`): diretoria e
// administração veem tudo, e os demais ficam na área inicial que a política
// resolve. É navegação, não autorização: quem barra é o backend.
// ---------------------------------------------------------------------------
export type Profile =
  | "cliente"
  | "tecnico"
  | "diretoria"
  | "engenharia"
  | "compras"
  | "estoque"
  | "rh"
  | "sem_area";

export type CurrentUser = NonNullable<FunctionReturnType<typeof api.users.getCurrentUser>>;

export function resolveProfile(user: AccessSubject): Profile {
  const staff = isStaff(user);
  if (!staff && hasRole(user, "client")) return "cliente";
  if (!staff && hasRole(user, "qr_operator")) return "tecnico";
  if (hasAdminAccess(user)) return "diretoria";
  if (!staff) return "sem_area";
  const home = resolveHomeArea(user);
  if (home === null) return "diretoria";
  if (home === "qr-operador") return "tecnico";
  return home;
}

export const PROFILE_LABEL: Record<Profile, string> = {
  cliente: "Cliente",
  tecnico: "Técnico de campo",
  diretoria: "Diretoria",
  engenharia: "Engenharia",
  compras: "Compras",
  estoque: "Estoque",
  rh: "Recursos Humanos",
  sem_area: "Sem área definida",
};

/** Abas da barra principal (escritório e diretoria). O técnico usa app/campo. */
export type MainTab = "index" | "obras" | "engenharia" | "compras" | "estoque" | "rh" | "areas" | "ponto" | "mais";

export const PROFILE_TABS: Record<Exclude<Profile, "tecnico">, MainTab[]> = {
  diretoria: ["index", "obras", "areas", "ponto", "mais"],
  engenharia: ["index", "obras", "engenharia", "ponto", "mais"],
  compras: ["index", "obras", "compras", "ponto", "mais"],
  estoque: ["index", "obras", "estoque", "ponto", "mais"],
  rh: ["index", "rh", "ponto", "mais"],
  sem_area: ["index", "ponto", "mais"],
  cliente: [],
};

/** Usuário atual e perfil. `undefined` enquanto carrega; `null` sem usuário. */
export function useProfile():
  | { user: CurrentUser; profile: Profile }
  | null
  | undefined {
  const user = useQuery(api.users.getCurrentUser);
  if (user === undefined) return undefined;
  if (user === null) return null;
  return { user, profile: resolveProfile(user) };
}

/** Quem é administrador no backend (diretoria ou administração). */
export function isAdmin(user: AccessSubject | null | undefined): boolean {
  return user ? hasAdminAccess(user) : false;
}
