/**
 * Ferramentas MCP de equipe (usuários), auditoria e tokens de agente.
 */

import { PAGINATION_HINT } from "./shared-args";
import type { ToolSpec } from "../manifest";

export const EQUIPE_TOOLS: readonly ToolSpec[] = [
  // --------------------------------------------------------------------------
  // Team and audit
  // --------------------------------------------------------------------------
  {
    name: "list_users",
    function: "users:list",
    title: "List users",
    description: "Internal users with role and department. Use to resolve ids for responsibleId / technicianIds.",
  },
  {
    name: "get_user",
    function: "users:get",
    title: "Get user",
    description: "One internal user by id.",
  },
  {
    name: "list_audit_logs",
    function: "auditLogs:listByTable",
    title: "List audit logs",
    description: "Paginated audit trail for a table (e.g. projects, materials). Admins only.",
    fieldDescriptions: { paginationOpts: PAGINATION_HINT },
  },
];

/** Último bloco de TOOLS; ver a ordem em manifest.ts. */
export const AGENT_TOKEN_TOOLS: readonly ToolSpec[] = [
  // --------------------------------------------------------------------------
  // Agent tokens (self-service)
  // --------------------------------------------------------------------------
  {
    name: "list_my_agent_tokens",
    function: "agentTokens:list",
    title: "List my agent tokens",
    description: "Agent tokens owned by the connected user (prefix, permission, expiry, last use). Never returns the secret.",
  },
  {
    name: "list_my_agent_calls",
    function: "agentTokens:listMyCalls",
    title: "List my recent agent calls",
    description: "Recent MCP tool calls made with the connected user's agent tokens.",
  },
];
