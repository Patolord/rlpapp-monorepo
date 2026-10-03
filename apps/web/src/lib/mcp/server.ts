import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { getMcpEnv } from "@rlpapp/env/mcp";
import type { AuthInfo } from "@modelcontextprotocol/server";

import type { EngineeringAdapterFactory } from "./adapter";
import { verifyMcpOAuthToken } from "./auth";
import {
  ENGINEERING_READ_SCOPE,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  RESOURCE_METADATA_PATH,
} from "./constants";
import { createConvexEngineeringAdapter } from "./convex";
import { registerEngineeringTools } from "./tools";

export type CreateEngineeringMcpHandlerOptions = {
  adapterFactory: EngineeringAdapterFactory;
};

export type CreateAuthenticatedMcpHandlerOptions = {
  adapterFactory?: EngineeringAdapterFactory;
  verifyToken?: (
    request: Request,
    bearerToken?: string
  ) => AuthInfo | undefined | Promise<AuthInfo | undefined>;
  resourceUrl?: string;
};

export function createEngineeringMcpHandler(
  options: CreateEngineeringMcpHandlerOptions
) {
  return createMcpHandler(
    (server) => {
      registerEngineeringTools(server, options.adapterFactory);
    },
    {
      serverInfo: {
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
      },
    }
  );
}

export function createAuthenticatedMcpHandler(
  options: CreateAuthenticatedMcpHandlerOptions = {}
) {
  const resourceUrl = options.resourceUrl ?? getMcpEnv().MCP_RESOURCE_URL;
  const adapterFactory =
    options.adapterFactory ?? createConvexEngineeringAdapter;
  const handler = createEngineeringMcpHandler({ adapterFactory });

  return withMcpAuth(handler, options.verifyToken ?? verifyMcpOAuthToken, {
    required: true,
    requiredScopes: [ENGINEERING_READ_SCOPE],
    resourceMetadataPath: RESOURCE_METADATA_PATH,
    resourceUrl,
  });
}
