import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { getUserByIdentity } from "./auth";

// Roles internas (qr_operator só acessa o fluxo público /q/$token e
// funções explicitamente liberadas via authedQuery/authedMutation).
const STAFF_ROLES = ["director", "admin", "manager", "operator", "engenheiro"];
const ADMIN_ROLES = ["director", "admin"];

async function requireUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await getUserByIdentity(ctx);
  if (!user) {
    throw new Error("Not authenticated");
  }
  if (!user.isActive) {
    throw new Error("Usuário desativado");
  }
  return user;
}

function assertStaff(user: Doc<"users">) {
  if (!STAFF_ROLES.includes(user.role)) {
    throw new Error("Insufficient permissions");
  }
}

function assertAdmin(user: Doc<"users">) {
  if (!ADMIN_ROLES.includes(user.role)) {
    throw new Error("Insufficient permissions");
  }
}

// Diretores e admins acessam tudo; demais roles internas precisam
// pertencer ao departamento financeiro (mesma regra da navegação no web).
function assertFinance(user: Doc<"users">) {
  assertStaff(user);
  if (ADMIN_ROLES.includes(user.role)) return;
  if (user.department !== "financeiro") {
    throw new Error("Acesso restrito ao departamento financeiro");
  }
}

// Diretores e admins acessam tudo; engenheiro tem acesso direto;
// demais roles internas precisam pertencer ao departamento engenharia.
function assertEngineering(user: Doc<"users">) {
  assertStaff(user);
  if (ADMIN_ROLES.includes(user.role)) return;
  if (user.role === "engenheiro") return;
  if (user.department !== "engenharia") {
    throw new Error("Acesso restrito à área de engenharia");
  }
}

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

/** Director/admin ou staff do departamento financeiro. */
export const financeQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await requireUser(ctx);
    assertFinance(user);
    return { user };
  })
);

/** Director/admin ou staff do departamento financeiro. */
export const financeMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const user = await requireUser(ctx);
    assertFinance(user);
    return { user };
  })
);

/** Director/admin, engenheiro, ou staff do departamento engenharia. */
export const engineeringQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await requireUser(ctx);
    assertEngineering(user);
    return { user };
  })
);

/** Director/admin, engenheiro, ou staff do departamento engenharia. */
export const engineeringMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const user = await requireUser(ctx);
    assertEngineering(user);
    return { user };
  })
);

/** Apenas director/admin (gestão de usuários e operações sensíveis). */
export const adminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const user = await requireUser(ctx);
    assertAdmin(user);
    return { user };
  })
);
