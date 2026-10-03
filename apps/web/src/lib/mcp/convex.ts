import { ConvexHttpClient } from "convex/browser";
import { getMcpEnv } from "@rlpapp/env/mcp";

import { api } from "@rlpapp/backend/convex/_generated/api";

import type { EngineeringAdapter } from "./adapter";
import { signDelegationJwt } from "./delegation";

export async function createConvexEngineeringAdapter(
  userId: string
): Promise<EngineeringAdapter> {
  const env = getMcpEnv();
  const jwt = await signDelegationJwt(userId, {
    issuer: env.MCP_JWT_ISSUER,
    privateKeyPem: env.MCP_JWT_PRIVATE_KEY,
    kid: env.MCP_JWT_KEY_ID,
  });
  const client = new ConvexHttpClient(env.VITE_CONVEX_URL);
  client.setAuth(jwt);

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
