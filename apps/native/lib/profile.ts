import type { Doc } from "@rlpapp/backend/convex/_generated/dataModel";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";

// ---------------------------------------------------------------------------
// Perfil do app: decide uma vez, logo depois do login, qual barra de abas e
// qual Início cada pessoa vê. A ordem segue o hasPermission do backend
// (packages/backend/convex/lib/rbac.ts): admin vale o mesmo que director e
// engenheiro vale mais que o departamento. Ver claude/rlpapp-native-navegacao.md §1.
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

type UserLike = Pick<Doc<"users">, "role" | "department">;

export function resolveProfile(user: UserLike): Profile {
  if (user.role === "client") return "cliente";
  if (user.role === "qr_operator") return "tecnico";
  if (user.role === "director" || user.role === "admin") return "diretoria";
  if (user.role === "engenheiro" || user.department === "engenharia") return "engenharia";
  if (user.department === "compras") return "compras";
  if (user.department === "estoque") return "estoque";
  if (user.department === "rh") return "rh";
  return "sem_area";
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
  | { user: Doc<"users">; profile: Profile }
  | null
  | undefined {
  const user = useQuery(api.users.getCurrentUser);
  if (user === undefined) return undefined;
  if (user === null) return null;
  return { user, profile: resolveProfile(user) };
}

/** Quem é administrador no backend (director ou admin). */
export function isAdmin(user: UserLike | null | undefined): boolean {
  return user?.role === "director" || user?.role === "admin";
}
