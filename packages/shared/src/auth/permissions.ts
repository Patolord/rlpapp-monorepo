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
 * `["engenheiro", "takeoff"]`. Cada acesso concede um conjunto de permissões
 * por funcionalidade (`ROLE_PERMISSIONS`), e cada usuário pode ter ajustes
 * individuais por cima: permissões concedidas (`permissionGrants`) e
 * retiradas (`permissionDenials`). As permissões efetivas são a união dos
 * acessos mais as concedidas, menos as retiradas, respeitando os
 * pré-requisitos (`PERMISSION_DEPENDENCIES`). Ver `getPermissions`.
 *
 * Legado: cadastros anteriores à migração `migrations:migrateUserAccess`
 * guardam `role` (cargo) + `department` (departamento). `rolesFromLegacy`
 * traduz esse par para acessos equivalentes e só vale enquanto um documento
 * ainda não tem `roles`; depois da migração, nada lê esses campos. Os apps
 * nunca comparam `role`/`department`: perguntam por uma permissão (`can`) ou
 * por um acesso (`hasRole`).
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
  // decide exceções (regra por recurso, ver packages/backend/convex/model/inventory/operations.ts).
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
// Permissões (por funcionalidade)
// ---------------------------------------------------------------------------
//
// Cada permissão libera uma funcionalidade (ver ou editar contratos, lançar
// medições, validar pedidos de material...), não uma área inteira. Os acessos
// (`ROLE_PERMISSIONS`) são só o ponto de partida: cada usuário pode ganhar
// permissões avulsas (`users.permissionGrants`) ou perder permissões do
// próprio acesso (`users.permissionDenials`), editadas em Configurações →
// Usuários. É assim que um técnico líder enxerga todas as obras, um
// engenheiro júnior fica sem contratos ou um técnico ganha só as medições.

export const PERMISSIONS = [
  // Engenharia
  "obras.read",
  "obras.write",
  "obras.gestao",
  "contratos.read",
  "contratos.write",
  "medicoes.read",
  "medicoes.write",
  "medicoes.aprovar",
  "documentos.read",
  "documentos.write",
  "orcamentos.write",
  "assistente.use",
  // Cadastros compartilhados (Backoffice)
  "cadastros.read",
  "cadastros.write",
  // Compras e suprimentos
  "suprimentos.read",
  "compras.read",
  "materiais.write",
  "fornecedores.write",
  "precos.write",
  // App desktop RLP Takeoff
  "takeoff.use",
  "takeoff.config",
  // Estoque
  "estoque.read",
  "estoque.central.read",
  "estoque.write",
  "estoque.entrada",
  "estoque.obras.write",
  "estoque.solicitacoes",
  "estoque.rules",
  // Recursos humanos
  "rh.funcionarios.read",
  "rh.funcionarios.write",
  "rh.folha.read",
  "rh.folha.write",
  "rh.ponto.read",
  "rh.ponto.write",
  // Ponto eletrônico (dever pessoal, não acesso a uma área)
  "ponto.registrar",
  // App de campo
  "campo.todas_obras",
  "campo.equipe",
  // Administração
  "admin.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "obras.read": "Ver obras",
  "obras.write": "Editar obras",
  "obras.gestao": "Gerir obras",
  "contratos.read": "Ver contratos",
  "contratos.write": "Editar contratos",
  "medicoes.read": "Ver medições",
  "medicoes.write": "Lançar medições",
  "medicoes.aprovar": "Aprovar medições",
  "documentos.read": "Ver documentos das obras",
  "documentos.write": "Gerenciar documentos das obras",
  "orcamentos.write": "Editar orçamentos (takeoffs)",
  "assistente.use": "Assistente IA",
  "cadastros.read": "Ver clientes e empreiteiros",
  "cadastros.write": "Editar clientes e empreiteiros",
  "suprimentos.read": "Ver catálogo de suprimentos",
  "compras.read": "Área de Compras",
  "materiais.write": "Editar materiais",
  "fornecedores.write": "Editar fornecedores",
  "precos.write": "Registrar e revisar preços",
  "takeoff.use": "Usar o app RLP Takeoff",
  "takeoff.config": "Configurar o App Takeoff",
  "estoque.read": "Ver estoque",
  "estoque.central.read": "Ver estoque central",
  "estoque.write": "Movimentar estoque central",
  "estoque.entrada": "Registrar entradas de material",
  "estoque.obras.write": "Movimentar estoque das obras",
  "estoque.solicitacoes": "Validar pedidos de material",
  "estoque.rules": "Regras de compatibilidade",
  "rh.funcionarios.read": "Ver funcionários",
  "rh.funcionarios.write": "Editar funcionários",
  "rh.folha.read": "Ver folha de pagamento",
  "rh.folha.write": "Editar folha de pagamento",
  "rh.ponto.read": "Ver ponto",
  "rh.ponto.write": "Configurar ponto",
  "ponto.registrar": "Bater ponto pelo app",
  "campo.todas_obras": "Todas as obras no campo",
  "campo.equipe": "Registros de campo da equipe",
  "admin.manage": "Administração do sistema",
};

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  "obras.read":
    "Lista de obras, hub, prédio, equipamentos, QR codes, relatórios e painel.",
  "obras.write":
    "Editar obras: prédio, sistemas, equipamentos, checklists e etiquetas QR.",
  "obras.gestao":
    "Criar, arquivar e excluir obras; definir técnicos e clientes do portal.",
  "contratos.read": "Contratos das obras e visão de faturamento.",
  "contratos.write": "Criar, editar e excluir contratos.",
  "medicoes.read": "Medições e progresso dos contratos.",
  "medicoes.write": "Criar, editar e excluir medições em rascunho.",
  "medicoes.aprovar": "Aprovar, marcar como paga e reabrir medições.",
  "documentos.read": "Documentos anexados às obras (lado do escritório).",
  "documentos.write": "Enviar, editar e excluir documentos das obras.",
  "orcamentos.write":
    "Criar e editar takeoffs e publicar orçamentos pelo app desktop.",
  "assistente.use": "Assistente IA da obra (gera e aplica layouts).",
  "cadastros.read": "Clientes e empreiteiros (Backoffice).",
  "cadastros.write": "Criar e editar clientes, empreiteiros e contatos.",
  "suprimentos.read": "Materiais, fornecedores, preços e takeoffs (leitura).",
  "compras.read": "Painel de Compras e fila de revisão de preços.",
  "materiais.write":
    "Cadastrar, editar e mesclar materiais; políticas de reposição.",
  "fornecedores.write": "Cadastrar e editar fornecedores e o que oferecem.",
  "precos.write": "Registrar eventos de preço e revisar a fila.",
  "takeoff.use": "Login no app desktop e leitura do catálogo de materiais.",
  "takeoff.config":
    "Kits, pesos, preços base, marcas VRF e mão de obra do app desktop.",
  "estoque.read": "Saldos e movimentações, inclusive das obras.",
  "estoque.central.read": "Estoque central e políticas de reposição.",
  "estoque.write": "Transferir, ajustar, estornar e atender pedidos.",
  "estoque.entrada": "Lançar entradas de material no estoque.",
  "estoque.obras.write": "Consumo e devolução de material nas obras.",
  "estoque.solicitacoes": "Aprovar ou recusar pedidos de material dos técnicos.",
  "estoque.rules": "Configurar as regras de compatibilidade de materiais.",
  "rh.funcionarios.read": "Cadastro de funcionários.",
  "rh.funcionarios.write": "Criar, editar e arquivar funcionários.",
  "rh.folha.read": "Folha de pagamento, empréstimos e pensões.",
  "rh.folha.write": "Editar, fechar e reabrir folhas; empréstimos e pensões.",
  "rh.ponto.read": "Controle de ponto: agora, dia e mês.",
  "rh.ponto.write":
    "Regras da marcação, cercas das obras e quem bate ponto pelo app.",
  "ponto.registrar":
    "Registra o próprio ponto no app (foto e localização) e aparece no controle de ponto do RH.",
  "campo.todas_obras":
    "No app de campo, enxerga e opera todas as obras, não só as atribuídas.",
  "campo.equipe": "Ver o histórico de campo de outros técnicos.",
  "admin.manage": "Gestão de usuários, tokens e operações sensíveis.",
};

/** Agrupamento das permissões para telas de edição (Configurações → Usuários). */
export const PERMISSION_GROUPS: readonly {
  key: string;
  label: string;
  permissions: readonly Permission[];
}[] = [
  {
    key: "engenharia",
    label: "Engenharia",
    permissions: [
      "obras.read",
      "obras.write",
      "obras.gestao",
      "contratos.read",
      "contratos.write",
      "medicoes.read",
      "medicoes.write",
      "medicoes.aprovar",
      "documentos.read",
      "documentos.write",
      "orcamentos.write",
      "assistente.use",
    ],
  },
  {
    key: "ponto",
    label: "Ponto eletrônico",
    permissions: ["ponto.registrar"],
  },
  {
    key: "campo",
    label: "App de campo",
    permissions: ["campo.todas_obras", "campo.equipe"],
  },
  {
    key: "backoffice",
    label: "Backoffice",
    permissions: ["cadastros.read", "cadastros.write"],
  },
  {
    key: "compras",
    label: "Compras",
    permissions: [
      "suprimentos.read",
      "compras.read",
      "materiais.write",
      "fornecedores.write",
      "precos.write",
    ],
  },
  {
    key: "takeoff",
    label: "App Takeoff",
    permissions: ["takeoff.use", "takeoff.config"],
  },
  {
    key: "estoque",
    label: "Estoque",
    permissions: [
      "estoque.read",
      "estoque.central.read",
      "estoque.write",
      "estoque.entrada",
      "estoque.obras.write",
      "estoque.solicitacoes",
      "estoque.rules",
    ],
  },
  {
    key: "rh",
    label: "Recursos Humanos",
    permissions: [
      "rh.funcionarios.read",
      "rh.funcionarios.write",
      "rh.folha.read",
      "rh.folha.write",
      "rh.ponto.read",
      "rh.ponto.write",
    ],
  },
  {
    key: "admin",
    label: "Administração",
    permissions: ["admin.manage"],
  },
];

/**
 * Pré-requisitos: uma permissão só vale se as dela também valerem. Conceder
 * "Lançar medições" traz junto "Ver medições" e "Ver obras"; remover "Ver
 * obras" de alguém tira também tudo o que depende dela.
 */
export const PERMISSION_DEPENDENCIES: Partial<
  Record<Permission, readonly Permission[]>
> = {
  "obras.write": ["obras.read"],
  "obras.gestao": ["obras.write"],
  "contratos.read": ["obras.read"],
  "contratos.write": ["contratos.read"],
  "medicoes.read": ["obras.read"],
  "medicoes.write": ["medicoes.read"],
  "medicoes.aprovar": ["medicoes.write"],
  "documentos.read": ["obras.read"],
  "documentos.write": ["documentos.read"],
  "orcamentos.write": ["obras.read", "suprimentos.read"],
  "assistente.use": ["obras.write"],
  "cadastros.write": ["cadastros.read"],
  "compras.read": ["suprimentos.read"],
  "materiais.write": ["suprimentos.read"],
  "fornecedores.write": ["suprimentos.read"],
  "precos.write": ["compras.read"],
  "takeoff.use": ["suprimentos.read"],
  "takeoff.config": ["suprimentos.read"],
  "estoque.central.read": ["estoque.read"],
  "estoque.write": ["estoque.read"],
  "estoque.entrada": ["estoque.read"],
  "estoque.obras.write": ["estoque.read"],
  "estoque.solicitacoes": ["estoque.read"],
  "estoque.rules": ["estoque.read"],
  "rh.funcionarios.write": ["rh.funcionarios.read"],
  "rh.folha.read": ["rh.funcionarios.read"],
  "rh.folha.write": ["rh.folha.read"],
  "rh.ponto.read": ["rh.funcionarios.read"],
  "rh.ponto.write": ["rh.ponto.read"],
};

const ENGINEERING: readonly Permission[] = [
  "obras.read",
  "obras.write",
  "obras.gestao",
  "contratos.read",
  "contratos.write",
  "medicoes.read",
  "medicoes.write",
  "medicoes.aprovar",
  "documentos.read",
  "documentos.write",
  "orcamentos.write",
  "assistente.use",
  "cadastros.read",
  "cadastros.write",
  "suprimentos.read",
  "takeoff.config",
  "estoque.read",
  "estoque.obras.write",
  "estoque.solicitacoes",
  "campo.equipe",
];

/**
 * Permissões que são um dever pessoal e não acesso a uma funcionalidade: quem
 * as tem passa a ser cobrado por elas (bater ponto põe a pessoa na lista de
 * presença do RH). Nenhum acesso as concede, nem diretoria e administração;
 * entram só como ajuste individual.
 */
export const PERSONAL_PERMISSIONS: readonly Permission[] = ["ponto.registrar"];

/** Tudo o que diretoria e administração recebem: o catálogo menos os deveres pessoais. */
const ALL_ACCESS: readonly Permission[] = PERMISSIONS.filter(
  (permission) => !PERSONAL_PERMISSIONS.includes(permission)
);

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  director: ALL_ACCESS,
  admin: ALL_ACCESS,
  engenheiro: ENGINEERING,
  engenharia: ENGINEERING,
  compras: [
    "suprimentos.read",
    "compras.read",
    "materiais.write",
    "fornecedores.write",
    "precos.write",
    "takeoff.config",
    "estoque.read",
    "estoque.central.read",
    "estoque.entrada",
  ],
  estoque: [
    "estoque.read",
    "estoque.central.read",
    "estoque.write",
    "estoque.entrada",
    "estoque.obras.write",
  ],
  rh: [
    "rh.funcionarios.read",
    "rh.funcionarios.write",
    "rh.folha.read",
    "rh.folha.write",
    "rh.ponto.read",
    "rh.ponto.write",
  ],
  takeoff: ["takeoff.use", "suprimentos.read"],
  qr_operator: [],
  client: [],
};

export const PERMISSION_DENIED_MESSAGES: Record<Permission, string> = {
  "obras.read": "Seu usuário não tem acesso às obras",
  "obras.write": "Seu usuário não pode editar obras",
  "obras.gestao": "Seu usuário não pode criar, arquivar ou atribuir equipe às obras",
  "contratos.read": "Seu usuário não tem acesso aos contratos",
  "contratos.write": "Seu usuário não pode editar contratos",
  "medicoes.read": "Seu usuário não tem acesso às medições",
  "medicoes.write": "Seu usuário não pode lançar medições",
  "medicoes.aprovar": "Seu usuário não pode aprovar medições",
  "documentos.read": "Seu usuário não tem acesso aos documentos das obras",
  "documentos.write": "Seu usuário não pode gerenciar documentos das obras",
  "orcamentos.write": "Seu usuário não pode editar orçamentos",
  "assistente.use": "Seu usuário não tem acesso ao assistente IA",
  "cadastros.read": "Seu usuário não tem acesso a clientes e empreiteiros",
  "cadastros.write": "Seu usuário não pode editar clientes e empreiteiros",
  "suprimentos.read": "Acesso restrito à engenharia ou compras",
  "compras.read": "Acesso restrito à área de compras",
  "materiais.write": "Seu usuário não pode editar materiais",
  "fornecedores.write": "Seu usuário não pode editar fornecedores",
  "precos.write": "Seu usuário não pode registrar ou revisar preços",
  "takeoff.use": "Seu usuário não tem acesso ao app RLP Takeoff",
  "takeoff.config": "Seu usuário não pode configurar o App Takeoff",
  "estoque.read": "Acesso restrito às áreas de estoque, compras ou engenharia",
  "estoque.central.read": "Acesso restrito às equipes de estoque ou compras",
  "estoque.write": "Acesso restrito à equipe de estoque",
  "estoque.entrada": "Seu usuário não pode registrar entradas de material",
  "estoque.obras.write": "Seu usuário não pode movimentar o estoque das obras",
  "estoque.solicitacoes": "Seu usuário não pode validar pedidos de material",
  "estoque.rules": "Apenas administradores podem configurar regras de estoque",
  "rh.funcionarios.read": "Acesso restrito à área de recursos humanos",
  "rh.funcionarios.write": "Seu usuário não pode editar funcionários",
  "rh.folha.read": "Seu usuário não tem acesso à folha de pagamento",
  "rh.folha.write": "Seu usuário não pode editar a folha de pagamento",
  "rh.ponto.read": "Seu usuário não tem acesso ao ponto",
  "rh.ponto.write": "Seu usuário não pode configurar o ponto",
  "ponto.registrar":
    "Seu usuário não bate ponto pelo app. Peça ao RH para liberar a marcação.",
  "campo.todas_obras": "Acesso negado a esta obra",
  "campo.equipe": "Sem permissão para ver o histórico de outros usuários",
  "admin.manage": "Insufficient permissions",
};

// ---------------------------------------------------------------------------
// Legado: cargo + departamento (só para a migração e para documentos ainda
// não migrados; sai junto com os campos no passo final do schema)
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

// ---------------------------------------------------------------------------
// Sujeito e consultas
// ---------------------------------------------------------------------------

/**
 * O que a política precisa saber de um usuário (subconjunto de `users`).
 * `roles` manda; sem ele (documento ainda não migrado), vale a tradução do
 * par legado.
 */
export type AccessSubject = {
  roles?: readonly Role[] | null;
  role?: LegacyUserRole | null;
  department?: Department | null;
  /** Permissões avulsas além das do acesso (ajuste individual). */
  permissionGrants?: readonly string[] | null;
  /** Permissões do acesso retiradas deste usuário (ajuste individual). */
  permissionDenials?: readonly string[] | null;
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

/** Remove repetidos e valores desconhecidos; ordena como em `PERMISSIONS`. */
export function normalizePermissions(
  permissions: readonly string[] | null | undefined
): Permission[] {
  if (!permissions) return [];
  return PERMISSIONS.filter((permission) => permissions.includes(permission));
}

/** O conjunto mais seus pré-requisitos (fecho de `PERMISSION_DEPENDENCIES`). */
export function withDependencies(
  permissions: readonly Permission[]
): Set<Permission> {
  const result = new Set<Permission>();
  const pending = [...permissions];
  while (pending.length > 0) {
    const permission = pending.pop()!;
    if (result.has(permission)) continue;
    result.add(permission);
    pending.push(...(PERMISSION_DEPENDENCIES[permission] ?? []));
  }
  return result;
}

/** Permissões que os acessos concedem, sem ajustes individuais. */
export function getRolePermissions(roles: readonly Role[]): Permission[] {
  const granted = withDependencies(
    roles.flatMap((role) => ROLE_PERMISSIONS[role])
  );
  return PERMISSIONS.filter((permission) => granted.has(permission));
}

/**
 * Permissões efetivas: (acessos ∪ concedidas, com pré-requisitos) − retiradas,
 * e sai também tudo o que perdeu um pré-requisito.
 */
function resolvePermissionSet(subject: AccessSubject): Set<Permission> {
  const effective = withDependencies([
    ...resolveRoles(subject).flatMap((role) => ROLE_PERMISSIONS[role]),
    ...normalizePermissions(subject.permissionGrants),
  ]);
  for (const denied of normalizePermissions(subject.permissionDenials)) {
    effective.delete(denied);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const permission of effective) {
      const deps = PERMISSION_DEPENDENCIES[permission] ?? [];
      if (deps.some((dep) => !effective.has(dep))) {
        effective.delete(permission);
        changed = true;
      }
    }
  }
  return effective;
}

/** Decide se o usuário possui a permissão (acessos + ajustes individuais). */
export function hasPermission(
  subject: AccessSubject,
  permission: Permission
): boolean {
  return resolvePermissionSet(subject).has(permission);
}

/** Todas as permissões do usuário, na ordem de `PERMISSIONS`. */
export function getPermissions(subject: AccessSubject): Permission[] {
  const effective = resolvePermissionSet(subject);
  return PERMISSIONS.filter((permission) => effective.has(permission));
}

/**
 * Ajustes individuais a gravar: só o que difere dos acessos. Concedidas que o
 * acesso já dá e retiradas que o acesso não dá são descartadas, para o
 * cadastro não guardar ruído que mudaria de sentido se o acesso mudar.
 */
export function normalizePermissionOverrides(
  roles: readonly Role[],
  grants: readonly string[],
  denials: readonly string[]
): { permissionGrants: Permission[]; permissionDenials: Permission[] } {
  const fromRoles = new Set(getRolePermissions(roles));
  const denied = normalizePermissions(denials);
  return {
    permissionGrants: normalizePermissions(grants).filter(
      (permission) => !fromRoles.has(permission) && !denied.includes(permission)
    ),
    permissionDenials: denied.filter((permission) => fromRoles.has(permission)),
  };
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
  const byRole = DEPARTMENTS.find((department) => has(department));
  if (byRole) return byRole;
  // Sem acesso de departamento (só ajustes individuais): a primeira área que
  // as permissões abrem.
  const permissions = resolvePermissionSet(subject);
  if (permissions.has("obras.read")) return "engenharia";
  if (permissions.has("rh.funcionarios.read")) return "rh";
  if (permissions.has("compras.read")) return "compras";
  if (permissions.has("estoque.read")) return "estoque";
  return "engenharia";
}
