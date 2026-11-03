/**
 * Política de acesso do sistema: fonte única de verdade, compartilhada entre o
 * backend (que a aplica) e os apps (que só a usam para esconder navegação e
 * ações). O backend continua sendo quem decide: toda função Convex passa por
 * `requirePermission` (packages/backend/convex/lib/rbac.ts), e o que o cliente
 * recebe em `users.getCurrentUser` são as permissões já calculadas aqui.
 *
 * Hoje a permissão é derivada do par cargo (`role`) + departamento
 * (`department`) do usuário. A ideia é que apps nunca comparem `role` ou
 * `department` diretamente para decidir acesso: perguntam por uma permissão.
 */

export const USER_ROLES = [
  "director",
  "admin",
  "manager",
  "operator",
  // Acesso restrito à área de engenharia (equipamentos, QR codes, manutenções)
  "engenheiro",
  // Acesso restrito: só interage com equipamentos via página pública /q/$token
  "qr_operator",
  // Acesso somente-leitura ao portal do cliente (obras atribuídas).
  "client",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEPARTMENTS = ["rh", "engenharia", "compras", "estoque"] as const;

export type Department = (typeof DEPARTMENTS)[number];

/** Roles internas (equipe da RLP). qr_operator e client são usuários externos. */
export const STAFF_ROLES: readonly UserRole[] = [
  "director",
  "admin",
  "manager",
  "operator",
  "engenheiro",
];

/** Roles com todas as permissões, inclusive gestão de usuários. */
export const ADMIN_ROLES: readonly UserRole[] = ["director", "admin"];

export const PERMISSIONS = [
  "engenharia.read",
  "engenharia.write",
  "compras.read",
  "compras.write",
  // Leitura compartilhada entre engenharia e compras (materiais,
  // fornecedores, preços, takeoffs).
  "suprimentos.read",
  // Saldos e movimentações (inclui o estoque das obras).
  "estoque.read",
  "estoque.write",
  // Estoque central e políticas de reposição: Estoque e Compras.
  "estoque.central.read",
  // Regras de compatibilidade de materiais.
  "estoque.rules",
  "rh.read",
  "rh.write",
  // Gestão de usuários e operações sensíveis.
  "admin.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** O que a política precisa saber de um usuário (subconjunto de `users`). */
export type AccessSubject = {
  role: UserRole;
  department?: Department | null;
};

export function isStaff(subject: AccessSubject): boolean {
  return STAFF_ROLES.includes(subject.role);
}

export function isAdmin(subject: AccessSubject): boolean {
  return ADMIN_ROLES.includes(subject.role);
}

/**
 * Decide se o usuário possui a permissão. Regras:
 * - director/admin: tudo
 * - engenheiro: engenharia.* + suprimentos.read + estoque.read, somado ao que
 *   o departamento dele conceder (um engenheiro lotado em compras também
 *   tem compras.*)
 * - staff do departamento engenharia: o mesmo que engenheiro
 * - staff do departamento compras: compras.* + suprimentos.read +
 *   estoque.read + estoque.central.read
 * - staff do departamento estoque: estoque.read/write + estoque.central.read
 * - staff do departamento rh: rh.*
 * - qr_operator e client: nenhuma permissão (acessam só os fluxos
 *   explicitamente liberados para qualquer usuário autenticado)
 */
export function hasPermission(
  subject: AccessSubject,
  permission: Permission
): boolean {
  if (!isStaff(subject)) return false;
  if (isAdmin(subject)) return true;

  const engineering =
    subject.role === "engenheiro" || subject.department === "engenharia";
  const purchasing = subject.department === "compras";
  const warehouse = subject.department === "estoque";
  const hr = subject.department === "rh";

  switch (permission) {
    case "engenharia.read":
    case "engenharia.write":
      return engineering;
    case "compras.read":
    case "compras.write":
      return purchasing;
    case "suprimentos.read":
      return engineering || purchasing;
    case "estoque.read":
      return engineering || purchasing || warehouse;
    case "estoque.write":
      return warehouse;
    case "estoque.central.read":
      return purchasing || warehouse;
    case "estoque.rules":
      return false;
    case "rh.read":
    case "rh.write":
      return hr;
    case "admin.manage":
      return false;
  }
}

/** Todas as permissões do usuário, na ordem de `PERMISSIONS`. */
export function getPermissions(subject: AccessSubject): Permission[] {
  return PERMISSIONS.filter((permission) => hasPermission(subject, permission));
}

/**
 * Checagem do lado do cliente sobre as permissões já calculadas pelo backend
 * (`users.getCurrentUser().permissions`). Verdadeiro se tiver qualquer uma.
 * `null`/`undefined` (usuário ainda carregando ou inexistente) nega.
 */
export function can(
  user: { permissions: readonly Permission[] } | null | undefined,
  ...permissions: Permission[]
): boolean {
  if (!user) return false;
  return permissions.some((permission) => user.permissions.includes(permission));
}

export const PERMISSION_DENIED_MESSAGES: Record<Permission, string> = {
  "engenharia.read": "Acesso restrito à área de engenharia",
  "engenharia.write": "Acesso restrito à área de engenharia",
  "compras.read": "Acesso restrito à área de compras",
  "compras.write": "Acesso restrito à área de compras",
  "suprimentos.read": "Acesso restrito à engenharia ou compras",
  "estoque.read": "Acesso restrito às áreas de estoque, compras ou engenharia",
  "estoque.write": "Acesso restrito à equipe de estoque",
  "estoque.central.read": "Acesso restrito às equipes de estoque ou compras",
  "estoque.rules": "Apenas administradores podem configurar regras de estoque",
  "rh.read": "Acesso restrito à área de recursos humanos",
  "rh.write": "Acesso restrito à área de recursos humanos",
  "admin.manage": "Insufficient permissions",
};

/**
 * Área inicial do usuário no dashboard (`/<área>`), ou `null` para quem fica
 * na página inicial do app (diretor). Navegação, não autorização: a área só
 * abre se o backend conceder as permissões correspondentes.
 */
export type HomeArea = Department | "qr-operador" | null;

export function resolveHomeArea(subject: AccessSubject): HomeArea {
  if (subject.role === "qr_operator") return "qr-operador";
  if (subject.role === "director") return null;
  if (subject.role === "engenheiro") return "engenharia";
  return subject.department ?? "engenharia";
}
