import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { getMcpEnv } from "@rlpapp/env/mcp";

import { api } from "@rlpapp/backend/convex/_generated/api";

import type { EngineeringAdapter } from "./adapter";
import type { McpPrincipal } from "./auth";
import { signDelegationJwt } from "./delegation";

/**
 * Cliente Convex autenticado como o principal da conexão: um JWT de
 * delegação RS256 curto com `sub` = Clerk user id e, quando a conexão veio de
 * um token de agente, as claims `agent_token.{id,permission}`.
 */
export async function createDelegatedConvexClient(
  principal: McpPrincipal
): Promise<ConvexHttpClient> {
  const env = getMcpEnv();
  const jwt = await signDelegationJwt(principal.userId, {
    issuer: env.MCP_JWT_ISSUER,
    privateKeyPem: env.MCP_JWT_PRIVATE_KEY,
    kid: env.MCP_JWT_KEY_ID,
    claims: principal.agentToken
      ? {
          agent_token: {
            id: principal.agentToken.id,
            permission: principal.agentToken.permission,
          },
        }
      : undefined,
  });
  const client = new ConvexHttpClient(env.VITE_CONVEX_URL);
  client.setAuth(jwt);
  return client;
}

export async function createConvexEngineeringAdapter(
  principal: McpPrincipal
): Promise<EngineeringAdapter> {
  const client = await createDelegatedConvexClient(principal);

  return {
    listProjects: (args) => client.query(api.projects.list, args),
    resolveProject: (args) => client.query(api.projects.resolve, args),
    getProjectOverview: (args) => client.query(api.projects.getOverview, args),
    getProjectHierarchy: (args) =>
      client.query(api.projects.getHierarchy, args),
    getEquipment: (args) => client.query(api.equipment.getForEngineering, args),
    getProjectReport: (args) => client.query(api.reports.getProjectReport, args),
  };
}

export type FunctionKind = "query" | "mutation" | "action";

/**
 * Chamada genérica por caminho (`modulo:funcao`), usada pelas ferramentas
 * derivadas do catálogo. Os argumentos já foram validados pelo schema zod
 * gerado a partir do validador da própria função.
 */
export type ConvexCaller = {
  call: (
    kind: FunctionKind,
    path: string,
    args: Record<string, unknown>
  ) => Promise<unknown>;
};

export type ConvexCallerFactory = (
  principal: McpPrincipal
) => ConvexCaller | Promise<ConvexCaller>;

export async function createConvexCaller(
  principal: McpPrincipal
): Promise<ConvexCaller> {
  const client = await createDelegatedConvexClient(principal);
  return {
    call: async (kind, path, args) => {
      switch (kind) {
        case "query":
          return await client.query(makeFunctionReference<"query">(path), args);
        case "mutation":
          return await client.mutation(
            makeFunctionReference<"mutation">(path),
            args
          );
        case "action":
          return await client.action(makeFunctionReference<"action">(path), args);
      }
    },
  };
}
