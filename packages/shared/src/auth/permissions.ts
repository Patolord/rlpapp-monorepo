/**
 * Política de acesso do sistema: fonte única de verdade, compartilhada entre o
 * backend (que a aplica) e os apps (que só a usam para esconder navegação e
 * ações). O backend continua sendo quem decide: toda função Convex passa por
 * `requirePermission` (packages/backend/convex/lib/rbac.ts), e o que o cliente
 * recebe em `users.getCurrentUser` são as permissões já calculadas aqui.
 *
 * Modelo: cada usuário tem um conjunto de **acessos** (`users.roles`),
 * combináveis à vontade: uma pessoa de compras que também cuida do estoque tem
 * `["compras", "estoque"]`; um engenheiro que usa o app desktop tem
 * `["engenheiro", "takeoff"]`. Cada acesso concede um conjunto fixo de
 * permissões (`ROLE_PERMISSIONS`); as permissões do usuário são a união.
 *
 * Legado: cadastros anteriores guardam `role` (cargo) + `department`
 * (departamento). `rolesFromLegacy` traduz esse par para acessos equivalentes,
 * e é o que vale enquanto `roles` não for preenchido (migração
 * `migrations:backfillUserRoles`). Os apps nunca comparam `role`/`department`
 * para decidir acesso: perguntam por uma permissão (`can`) ou por um acesso
 * (`hasRole`).
 */

// ---------------------------------------------------------------------------
// Acessos (roles)
// ---------------------------------------------------------------------------

export const ROLES = [
  // Diretoria: tudo, fica na página inicial do app e enxerga o portal.
  "director",
  // Administração: tudo, inclusive gestão de usuários.
  "admin",
  // Engenheiro: área de engenharia e, nas obras em que é o responsável,
  // decide exceções (regra por recurso, ver lib/inventory/operations.ts).
  "engenheiro",
  // Áreas do escritório.
  "engenharia",
  "compras",
  "estoque",
  "rh",
  // App desktop RLP Takeoff (login no app e leitura do catálogo).
  "takeoff",
  // Técnico de campo: só o fluxo de etiquetas (/q/$token) e as obras em que
  // está atribuído (projects.technicianIds). Nome legado mantido nos dados.
  "qr_operator",
  // Portal do cliente, somente leitura das obras atribuídas.
  "client",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  director: "Diretoria",
  admin: "Administração",
  engenheiro: "Engenheiro",
  engenharia: "Engenharia",
  compras: "Compras",
  estoque: "Estoque",
  rh: "Recursos Humanos",
  takeoff: "App Takeoff",
  qr_operator: "Técnico de campo",
  client: "Portal do cliente",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  director: "Acesso total, painel inicial e portal do cliente.",
  admin: "Acesso total, inclusive gestão de usuários e regras de estoque.",
  engenheiro:
    "Engenharia completa; como responsável por uma obra, decide exceções de estoque.",
  engenharia: "Obras, equipamentos, documentos e leitura de materiais e estoque.",
  compras: "Materiais, fornecedores, preços, takeoffs e estoque central.",
  estoque: "Movimentações, saldos e estoque central.",
  rh: "Funcionários, folha e ponto.",
  takeoff: "Login no app desktop RLP Takeoff e leitura do catálogo de materiais.",
  qr_operator: "App de campo: etiquetas e obras em que está atribuído.",
  client: "Portal do cliente: leitura das obras atribuídas.",
};

/** Acessos de usuários externos (não são equipe da RLP). */
export const EXTERNAL_ROLES: readonly Role[] = ["qr_operator", "client"];

/** Acessos internos (equipe da RLP). */
export const STAFF_ROLES: readonly Role[] = ROLES.filter(
  (role) => !EXTERNAL_ROLES.includes(role)
);

/** Acessos com todas as permissões, inclusive gestão de usuários. */
export const ADMIN_ROLES: readonly Role[] = ["director", "admin"];

// ---------------------------------------------------------------------------
// Permissões
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  "engenharia.read",
  "engenharia.write",
  "compras.read",
  "compras.write",
  // Leitura compartilhada entre engenharia, compras e o app Takeoff
  // (materiais, fornecedores, preços, takeoffs).
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
  // Login no app desktop RLP Takeoff (publicar orçamento exige engenharia.write).
  "takeoff.use",
  // Gestão de usuários e operações sensíveis.
  "admin.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ENGINEERING: readonly Permission[] = [
  "engenharia.read",
  "engenharia.write",
  "suprimentos.read",
  "estoque.read",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  director: PERMISSIONS,
  admin: PERMISSIONS,
  engenheiro: ENGINEERING,
  engenharia: ENGINEERING,
  compras: [
    "compras.read",
    "compras.write",
    "suprimentos.read",
    "estoque.read",
    "estoque.central.read",
  ],
  estoque: ["estoque.read", "estoque.write", "estoque.central.read"],
  rh: ["rh.read", "rh.write"],
  takeoff: ["takeoff.use", "suprimentos.read"],
  qr_operator: [],
  client: [],
};

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
  "takeoff.use": "Seu usuário não tem acesso ao app RLP Takeoff",
  "admin.manage": "Insufficient permissions",
};

// ---------------------------------------------------------------------------
// Legado: cargo + departamento
// ---------------------------------------------------------------------------

/** Valores do campo legado `users.role` (cargo). */
export const LEGACY_USER_ROLES = [
  "director",
  "admin",
  "manager",
  "operator",
  "engenheiro",
  "qr_operator",
  "client",
] as const;

export type LegacyUserRole = (typeof LEGACY_USER_ROLES)[number];

export const DEPARTMENTS = ["rh", "engenharia", "compras", "estoque"] as const;

export type Department = (typeof DEPARTMENTS)[number];

/**
 * Traduz o par legado cargo + departamento para acessos com as mesmas
 * permissões efetivas que o usuário tinha:
 * - director/admin: o próprio acesso (+ o departamento, que define a área
 *   inicial);
 * - engenheiro: `engenheiro` (+ outro departamento, se tiver);
 * - manager/operator: o departamento (nenhum acesso sem departamento);
 * - quem tinha leitura de suprimentos (engenharia, compras, engenheiro) também
 *   podia entrar no app desktop, então recebe `takeoff`;
 * - qr_operator/client: o próprio acesso.
 */
export function rolesFromLegacy(
  role: LegacyUserRole,
  department?: Department | null
): Role[] {
  const roles: Role[] = [];
  switch (role) {
    case "director":
    case "admin":
    case "engenheiro":
    case "qr_operator":
    case "client":
      roles.push(role);
      break;
    case "manager":
    case "operator":
      break;
  }
  if (department && !(role === "engenheiro" && department === "engenharia")) {
    roles.push(department);
  }
  if (
    role !== "director" &&
    role !== "admin" &&
    (role === "engenheiro" || department === "engenharia" || department === "compras")
  ) {
    roles.push("takeoff");
  }
  return normalizeRoles(roles);
}

/**
 * Projeção dos acessos para os campos legados, mantidos preenchidos enquanto
 * houver código lendo `role`/`department` (índice `by_role`, rótulos antigos).
 */
export function legacyFromRoles(roles: readonly Role[]): {
  role: LegacyUserRole;
  department?: Department;
} {
  const has = (role: Role) => roles.includes(role);
  const role: LegacyUserRole = has("director")
    ? "director"
    : has("admin")
      ? "admin"
      : has("engenheiro")
        ? "engenheiro"
        : has("qr_operator")
          ? "qr_operator"
          : has("client")
            ? "client"
            : "operator";
  const department =
    DEPARTMENTS.find((department) => has(department)) ??
    (role === "engenheiro" ? "engenharia" : undefined);
  return department ? { role, department } : { role };
}

// ---------------------------------------------------------------------------
// Sujeito e consultas
// ---------------------------------------------------------------------------

/**
 * O que a política precisa saber de um usuário (subconjunto de `users`).
 * `roles` manda; sem ele, vale a tradução do par legado.
 */
export type AccessSubject = {
  roles?: readonly Role[] | null;
  role?: LegacyUserRole | null;
  department?: Department | null;
};

/** Remove repetidos e valores desconhecidos; ordena como em `ROLES`. */
export function normalizeRoles(roles: readonly string[]): Role[] {
  return ROLES.filter((role) => roles.includes(role));
}

export function resolveRoles(subject: AccessSubject): Role[] {
  if (subject.roles) return normalizeRoles(subject.roles);
  if (subject.role) return rolesFromLegacy(subject.role, subject.department);
  return [];
}

export function hasRole(subject: AccessSubject, role: Role): boolean {
  return resolveRoles(subject).includes(role);
}

export function isStaff(subject: AccessSubject): boolean {
  return resolveRoles(subject).some((role) => STAFF_ROLES.includes(role));
}

export function isAdmin(subject: AccessSubject): boolean {
  return resolveRoles(subject).some((role) => ADMIN_ROLES.includes(role));
}

/** Decide se o usuário possui a permissão (união dos acessos dele). */
export function hasPermission(
  subject: AccessSubject,
  permission: Permission
): boolean {
  return resolveRoles(subject).some((role) =>
    ROLE_PERMISSIONS[role].includes(permission)
  );
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

/**
 * Área inicial do usuário no dashboard (`/<área>`), ou `null` para quem fica
 * na página inicial do app (diretoria). Navegação, não autorização: a área só
 * abre se o backend conceder as permissões correspondentes.
 */
export type HomeArea = Department | "qr-operador" | null;

export function resolveHomeArea(subject: AccessSubject): HomeArea {
  const roles = resolveRoles(subject);
  const has = (role: Role) => roles.includes(role);
  if (has("qr_operator") && !isStaff(subject)) return "qr-operador";
  if (has("director")) return null;
  if (has("engenheiro") || has("engenharia")) return "engenharia";
  return DEPARTMENTS.find((department) => has(department)) ?? "engenharia";
}
