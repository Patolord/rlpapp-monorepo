import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  ADMIN_ROLES,
  PERMISSION_DENIED_MESSAGES,
  STAFF_ROLES,
  getPermissions,
  hasPermission,
  hasRole,
  isAdmin,
  isStaff,
  resolveRoles,
  type Department,
  type LegacyUserRole,
  type Permission,
  type Role,
} from "@rlpapp/shared/auth/permissions";
import { mutation, query } from "../_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { getUserByIdentity } from "./auth";
import { forbidden, unauthenticated } from "./accessErrors";

// ---------------------------------------------------------------------------
// Política de acesso
// ---------------------------------------------------------------------------
//
// A política (quem tem qual permissão) mora em @rlpapp/shared/auth/permissions
// e é compartilhada com os apps, que só a usam para esconder navegação; quem
// aplica é este módulo, nos wrappers abaixo. Este arquivo reexporta o que o
// restante do backend precisa para não depender do caminho do shared.

export {
  ADMIN_ROLES,
  STAFF_ROLES,
  getPermissions,
  hasPermission,
  hasRole,
  isAdmin,
  isStaff,
  resolveRoles,
};
export type { Permission, Role };

// Falha de compilação se os validadores de schema.ts e a política do shared
// divergirem (um acesso, cargo ou departamento criado só de um lado).
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const SCHEMA_ACCESS_ROLES_MATCH_POLICY: Equals<
  NonNullable<Doc<"users">["roles"]>[number],
  Role
> = true;
export const SCHEMA_LEGACY_ROLES_MATCH_POLICY: Equals<
  NonNullable<Doc<"users">["role"]>,
  LegacyUserRole
> = true;
export const SCHEMA_DEPARTMENTS_MATCH_POLICY: Equals<
  NonNullable<Doc<"users">["department"]>,
  Department
> = true;

// ---------------------------------------------------------------------------
// Gates (verificações que lançam erro)
// ---------------------------------------------------------------------------

/** Usuário autenticado e ativo (qualquer role, inclui qr_operator). */
export async function requireUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await getUserByIdentity(ctx);
  if (!user) {
    throw unauthenticated();
  }
  if (!user.isActive) {
    throw forbidden("Usuário desativado");
  }
  return user;
}

export function assertStaff(user: Doc<"users">) {
  if (!isStaff(user)) {
    throw forbidden();
  }
}

export function assertAdmin(user: Doc<"users">) {
  if (!isAdmin(user)) {
    throw forbidden();
  }
}

/**
 * A permissão decide sozinha, inclusive para técnicos de campo e clientes:
 * por padrão esses acessos não têm nenhuma, mas um administrador pode
 * conceder uma funcionalidade avulsa a um técnico (ver `permissionGrants`).
 */
export function requirePermission(
  user: Doc<"users">,
  permission: Permission
): void {
  if (!hasPermission(user, permission)) {
    throw forbidden(PERMISSION_DENIED_MESSAGES[permission], permission);
  }
}

/** Exige qualquer uma das permissões; a mensagem é a da primeira. */
export function requireAnyPermission(
  user: Doc<"users">,
  permissions: readonly [Permission, ...Permission[]]
): void {
  if (!permissions.some((permission) => hasPermission(user, permission))) {
    throw forbidden(PERMISSION_DENIED_MESSAGES[permissions[0]], permissions[0]);
  }
}

/**
 * Enxerga e opera todas as obras no app de campo: equipe do escritório ou
 * técnico com `campo.todas_obras` (técnico líder). Os demais só veem as obras
 * em que estão atribuídos (projects.technicianIds).
 */
export function seesAllFieldProjects(user: Doc<"users">): boolean {
  return isStaff(user) || hasPermission(user, "campo.todas_obras");
}

/** Gate baseado em ctx: exige que o usuário tenha algum dos acessos. */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  allowedRoles: readonly Role[]
) {
  const user = await getUserByIdentity(ctx);
  if (!user) {
    throw unauthenticated("User not found in database");
  }
  if (!resolveRoles(user).some((role) => allowedRoles.includes(role))) {
    throw forbidden();
  }
  return user;
}

/** Qualquer role interna (exclui qr_operator, que só acessa /q/$token). */
export async function requireStaff(ctx: QueryCtx | MutationCtx) {
  return await requireRole(ctx, STAFF_ROLES);
}

/**
 * Gate para actions, que não têm `ctx.db`: roda `requireUser` +
 * `requirePermission` numa query interna sob a mesma identidade. Use no
 * início do handler, antes de qualquer efeito externo (OpenAI, Clerk...).
 */
export async function requireActionPermission(
  ctx: ActionCtx,
  permission: Permission
): Promise<void> {
  await ctx.runQuery(internal.users.assertPermission, { permission });
}

// ---------------------------------------------------------------------------
// Fábricas de wrappers (injetam ctx.user autenticado e ativo)
// ---------------------------------------------------------------------------

export function permissionQuery(permission: Permission) {
  return customQuery(
    query,
    customCtx(async (ctx) => {
      const user = await requireUser(ctx);
      requirePermission(user, permission);
      return { user };
    })
  );
}

export function permissionMutation(permission: Permission) {
  return customMutation(
    mutation,
    customCtx(async (ctx) => {
      const user = await requireUser(ctx);
      requirePermission(user, permission);
      return { user };
    })
  );
}

export function anyPermissionQuery(...permissions: [Permission, ...Permission[]]) {
  return customQuery(
    query,
    customCtx(async (ctx) => {
      const user = await requireUser(ctx);
      requireAnyPermission(user, permissions);
      return { user };
    })
  );
}

export function anyPermissionMutation(
  ...permissions: [Permission, ...Permission[]]
) {
  return customMutation(
    mutation,
    customCtx(async (ctx) => {
      const user = await requireUser(ctx);
      requireAnyPermission(user, permissions);
      return { user };
    })
  );
}

// ---------------------------------------------------------------------------
// Wrappers nomeados (usar nas funções públicas em vez de query/mutation puros)
// ---------------------------------------------------------------------------
//
// Um wrapper por funcionalidade. O gerador do catálogo MCP
// (scripts/generate-mcp-catalog.mjs) lê as declarações abaixo para saber a
// permissão de cada função, então mantenha a forma
// `export const nome = permissionQuery("x");` (ou anyPermission*).

/** Qualquer usuário autenticado e ativo (inclui qr_operator). */
export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) }))
);

/** Qualquer usuário autenticado e ativo (inclui qr_operator). */
export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) }))
);

/** Roles internas (exclui qr_operator). */
export const staffQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await requireUser(ctx);
    assertStaff(user);
    return { user };
  })
);

/** Roles internas (exclui qr_operator). */
export const staffMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const user = await requireUser(ctx);
    assertStaff(user);
    return { user };
  })
);

// Administração
export const adminQuery = permissionQuery("admin.manage");
export const adminMutation = permissionMutation("admin.manage");

// Engenharia: obras (prédio, sistemas, equipamentos, QR codes, relatórios)
export const obrasQuery = permissionQuery("obras.read");
export const obrasMutation = permissionMutation("obras.write");
/** Criar, arquivar e excluir obras; técnicos e clientes do portal. */
export const obrasGestaoMutation = permissionMutation("obras.gestao");

// Engenharia: contratos, medições, documentos, orçamentos e assistente IA
export const contratosQuery = permissionQuery("contratos.read");
export const contratosMutation = permissionMutation("contratos.write");
export const medicoesQuery = permissionQuery("medicoes.read");
export const medicoesMutation = permissionMutation("medicoes.write");
/** Aprovar, marcar como paga e reabrir (mudança de status). */
export const medicoesAprovarMutation = permissionMutation("medicoes.aprovar");
export const documentosQuery = permissionQuery("documentos.read");
export const documentosMutation = permissionMutation("documentos.write");
export const orcamentosMutation = permissionMutation("orcamentos.write");
export const assistenteQuery = permissionQuery("assistente.use");
export const assistenteMutation = permissionMutation("assistente.use");

// Cadastros compartilhados (clientes e empreiteiros)
export const cadastrosQuery = permissionQuery("cadastros.read");
export const cadastrosMutation = permissionMutation("cadastros.write");
/** Listas para escolher cliente/empreiteiro: Backoffice ou quem vê obras. */
export const cadastrosLookupQuery = anyPermissionQuery("cadastros.read", "obras.read");

// Compras e suprimentos
/** Leitura compartilhada: materiais, fornecedores, preços, takeoffs. */
export const engineeringOrPurchasingQuery = permissionQuery("suprimentos.read");
export const purchasingQuery = permissionQuery("compras.read");
export const materiaisMutation = permissionMutation("materiais.write");
export const fornecedoresMutation = permissionMutation("fornecedores.write");
export const precosMutation = permissionMutation("precos.write");
/** Kits, pesos, preços base, marcas VRF e mão de obra do App Takeoff. */
export const takeoffConfigMutation = permissionMutation("takeoff.config");
/**
 * Propor material ao catálogo a partir do RLP Takeoff (vira rascunho que
 * compras avalia; não altera material existente).
 */
export const engineeringOrPurchasingMutation = anyPermissionMutation(
  "orcamentos.write",
  "materiais.write"
);

// Estoque
export const inventoryQuery = permissionQuery("estoque.read");
/** Movimentação do estoque central: transferência, ajuste, estorno. */
export const inventoryMutation = permissionMutation("estoque.write");
/** Cadastro rápido de material a partir da movimentação. */
export const warehouseOrPurchasingMutation = anyPermissionMutation(
  "estoque.entrada",
  "materiais.write"
);
/** Aprovar ou recusar pedidos de material dos técnicos. */
export const materialRequestsMutation = permissionMutation("estoque.solicitacoes");
/** Regras de compatibilidade. */
export const inventoryRulesMutation = permissionMutation("estoque.rules");

// Recursos humanos
export const funcionariosQuery = permissionQuery("rh.funcionarios.read");
export const funcionariosMutation = permissionMutation("rh.funcionarios.write");
export const folhaQuery = permissionQuery("rh.folha.read");
export const folhaMutation = permissionMutation("rh.folha.write");
export const pontoQuery = permissionQuery("rh.ponto.read");
export const pontoMutation = permissionMutation("rh.ponto.write");
/** Bater o próprio ponto pelo app (dever pessoal, liberado por usuário). */
export const registrarPontoMutation = permissionMutation("ponto.registrar");
