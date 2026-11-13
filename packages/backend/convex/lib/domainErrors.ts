import { ConvexError } from "convex/values";
import type { DomainErrorCode } from "@rlpapp/shared/errors";

/**
 * Recusas de regra de negócio. São `ConvexError({ code, message })` porque o
 * Convex troca a mensagem de um `Error` comum por "Server Error" em produção:
 * só assim o texto em pt-BR chega ao usuário (web, native, desktop) e o código
 * chega ao MCP e à API `/api/v1` (gateway/responses.ts mapeia o status HTTP).
 * Os apps leem com `errorMessage` de @rlpapp/shared/errors.
 *
 * `Error` comum fica só para defeitos internos (invariante quebrada), que o
 * usuário não tem como resolver; o ESLint pede o motivo nesses casos.
 */
export type DomainErrorData = { code: DomainErrorCode; message: string };

function domainError(code: DomainErrorCode, message: string) {
  return new ConvexError<DomainErrorData>({ code, message });
}

/** O registro pedido não existe (ou não é visível para quem pediu). */
export function notFound(message: string) {
  return domainError("NOT_FOUND", message);
}

/** Criar ou renomear colidiria com um registro existente. */
export function alreadyExists(message: string) {
  return domainError("ALREADY_EXISTS", message);
}

/** Entrada ou transição de estado recusada por uma regra do domínio. */
export function ruleViolation(message: string) {
  return domainError("RULE_VIOLATION", message);
}
