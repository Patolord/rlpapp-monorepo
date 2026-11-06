import type { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type TokenRow = FunctionReturnType<typeof api.agentTokens.list>[number];
export type AdminTokenRow = FunctionReturnType<typeof api.agentTokens.listAll>[number];
export type CallRow = FunctionReturnType<typeof api.agentTokens.listMyCalls>[number];
export type Permission = "full_access" | "read_only";

export const cardCls = "rounded-2xl border border-slate-100 bg-white shadow-sm";

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(ts: number): string {
  const minutes = Math.round((Date.now() - ts) / 60_000);
  if (minutes < 1) return "agora há pouco";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} d`;
  return formatDate(ts);
}

export function tokenStatus(token: {
  revokedAt?: number;
  expiresAt?: number;
}): "active" | "revoked" | "expired" {
  if (token.revokedAt !== undefined) return "revoked";
  if (token.expiresAt !== undefined && token.expiresAt <= Date.now()) {
    return "expired";
  }
  return "active";
}
