import { ConvexError } from "convex/values";
import type { Permission } from "@rlpapp/shared/auth/permissions";
import type { AccessErrorCode } from "@rlpapp/shared/errors";

/**
 * Erros de autenticação e autorização lançados pelos gates de lib/rbac.ts e
 * lib/auth.ts. São `ConvexError` para que a mensagem chegue ao cliente também
 * em produção (o Convex redige `Error` comum para "Server Error") e para que
 * o app, o MCP e o gateway `/api/v1` distingam negação de acesso de outras
 * falhas pelo `code` (o gateway já mapeia UNAUTHENTICATED → 401 e
 * FORBIDDEN → 403).
 */
export type { AccessErrorCode };

export type AccessErrorData = {
  code: AccessErrorCode;
  message: string;
  /** Permissão que faltou, quando a negação veio de `requirePermission`. */
  permission?: Permission;
};

export function accessError(
  code: AccessErrorCode,
  message: string,
  permission?: Permission
): ConvexError<AccessErrorData> {
  return new ConvexError<AccessErrorData>(
    permission ? { code, message, permission } : { code, message }
  );
}

export function unauthenticated(message = "Not authenticated") {
  return accessError("UNAUTHENTICATED", message);
}

export function forbidden(message = "Insufficient permissions", permission?: Permission) {
  return accessError("FORBIDDEN", message, permission);
}
