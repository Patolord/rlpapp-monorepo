import { can, type HomeArea, type Permission, type Role } from "@rlpapp/shared/auth/permissions";

// "backoffice", "configuracoes" e "takeoff" não são departamentos de usuário:
// backoffice é a área de cadastros compartilhados (clientes, empreiteiros),
// liberada para quem tem engenharia; configuracoes é a administração
// (usuários, política de privacidade) e takeoff é a configuração do app
// desktop RLP Takeoff (kits), ambas liberadas para engenharia e compras.
export type DepartmentArea =
  | "rh"
  | "engenharia"
  | "compras"
  | "estoque"
  | "backoffice"
  | "configuracoes"
  | "takeoff";

/**
 * Permissões (qualquer uma) que abrem cada área do dashboard. Espelha o que
 * as funções do backend de cada módulo exigem; quem nega continua sendo o
 * backend. Também usada pela sidebar para montar a navegação. Dentro de cada
 * área, as páginas de uma funcionalidade específica usam `PermissionGate`.
 */
export const AREA_PERMISSIONS: Record<DepartmentArea, Permission[]> = {
  // Folha e ponto dependem de rh.funcionarios.read (PERMISSION_DEPENDENCIES).
  rh: ["rh.funcionarios.read"],
  // Toda funcionalidade de engenharia depende de obras.read.
  engenharia: ["obras.read"],
  compras: ["compras.read"],
  // Estoque permite leitura compartilhada com Compras e Engenharia; as ações
  // continuam protegidas por permissões específicas no backend.
  estoque: ["estoque.read"],
  // Backoffice: clientes e empreiteiros.
  backoffice: ["cadastros.read"],
  // Configurações: engenharia ou compras (política de privacidade, lista de
  // usuários) e quem administra usuários, mesmo que por ajuste individual; a
  // página de usuários ainda exige admin.manage para editar.
  configuracoes: ["obras.read", "compras.read", "admin.manage"],
  // App Takeoff: kits, pesos, marcas VRF e parâmetros.
  takeoff: ["takeoff.config"],
};

/** Caminho de entrada de cada área (a primeira página dela). */
export const AREA_PATHS: Record<DepartmentArea, string> = {
  engenharia: "/engenharia",
  compras: "/compras",
  estoque: "/estoque",
  rh: "/rh",
  backoffice: "/backoffice",
  configuracoes: "/configuracoes",
  takeoff: "/takeoff/kits",
};

const OFFICE_AREAS = ["engenharia", "estoque", "compras", "rh", "backoffice"] as const;

/**
 * Primeira área do escritório que o usuário abre, para quem entra pelo app de
 * campo mas recebeu alguma funcionalidade do escritório (ex.: técnico com
 * medições). `null` se não abre nenhuma.
 */
export function firstOfficeArea(
  user: { permissions: readonly Permission[] } | null | undefined
): (typeof OFFICE_AREAS)[number] | null {
  return OFFICE_AREAS.find((area) => can(user, ...AREA_PERMISSIONS[area])) ?? null;
}

/**
 * Página que todo usuário logado abre, qualquer que seja o acesso: início
 * pessoal com as áreas liberadas para ele. É o destino quando nenhuma área
 * do dashboard abre (ex.: quem só tem o acesso ao app desktop RLP Takeoff).
 */
export const UNIVERSAL_HOME_PATH = "/conta";

export type HomeUser = {
  permissions: readonly Permission[];
  roles: readonly Role[];
  isStaff: boolean;
  homeArea: HomeArea;
};

/**
 * Para onde o usuário vai ao entrar (e quando abre uma área sem acesso).
 * Parte da área inicial calculada pelo backend (`homeArea`), mas só a usa se
 * o usuário de fato abre essa área; senão, a primeira área que as
 * permissões abrem e, por fim, o início pessoal, que sempre abre.
 */
export function resolveHomePath(user: HomeUser): string {
  if (user.homeArea === "qr-operador") return "/qr-operador";
  if (user.homeArea === null) return "/app";
  if (can(user, ...AREA_PERMISSIONS[user.homeArea])) {
    return AREA_PATHS[user.homeArea];
  }
  const office = firstOfficeArea(user);
  if (office) return AREA_PATHS[office];
  if (can(user, ...AREA_PERMISSIONS.takeoff)) return AREA_PATHS.takeoff;
  if (!user.isStaff && user.roles.includes("client")) return "/portal";
  return UNIVERSAL_HOME_PATH;
}
