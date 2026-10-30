import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { allowRawMcpCalls, getMcpEnv } from "@rlpapp/env/mcp";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { makeFunctionReference } from "convex/server";

import type { EngineeringAdapterFactory } from "./adapter";
import { getPrincipal, readBearer, verifyMcpToken, type McpPrincipal } from "./auth";
import { loadCatalog, type CatalogEntry, type CatalogLoader } from "./catalog";
import {
  buildInstructions,
  registerCatalogTools,
  type CallRecorder,
} from "./catalog-tools";
import {
  ENGINEERING_READ_SCOPE,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  RESOURCE_METADATA_PATH,
} from "./constants";
import {
  createConvexCaller,
  createConvexEngineeringAdapter,
  createDelegatedConvexClient,
  type ConvexCaller,
  type ConvexCallerFactory,
} from "./convex";
import { BUILT_IN_TOOL_NAMES, registerEngineeringTools } from "./tools";

export type CreateEngineeringMcpHandlerOptions = {
  adapterFactory: EngineeringAdapterFactory;
  /**
   * Ferramentas derivadas do catálogo (manifest.ts) para o principal da
   * conexão. Ausente → só as ferramentas de engenharia embutidas.
   */
  catalogTools?: {
    principal: McpPrincipal;
    catalog: readonly CatalogEntry[];
    caller: ConvexCaller;
    allowRawCalls?: boolean;
    recordCall?: CallRecorder;
  };
};

export type VerifyToken = (
  request: Request,
  bearerToken?: string
) => AuthInfo | undefined | Promise<AuthInfo | undefined>;

export type CreateAuthenticatedMcpHandlerOptions = {
  adapterFactory?: EngineeringAdapterFactory;
  verifyToken?: VerifyToken;
  resourceUrl?: string;
  /** Carrega o catálogo de funções para o principal; ausente desliga as ferramentas de catálogo. */
  catalogLoader?: CatalogLoader | null;
  callerFactory?: ConvexCallerFactory;
  allowRawCalls?: boolean;
  recordCall?: CallRecorder | null;
  log?: (message: string) => void;
};

export function createEngineeringMcpHandler(
  options: CreateEngineeringMcpHandlerOptions
) {
  const { catalogTools } = options;
  return createMcpHandler(
    (server) => {
      registerEngineeringTools(server, options.adapterFactory);
      if (catalogTools) {
        registerCatalogTools(server, {
          ...catalogTools,
          reservedNames: BUILT_IN_TOOL_NAMES,
        });
      }
    },
    {
      serverInfo: {
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
      },
      ...(catalogTools
        ? {
            instructions: buildInstructions(
              catalogTools.principal,
              catalogTools.allowRawCalls ?? false
            ),
          }
        : {}),
    }
  );
}

function allowRawCallsFromEnv(): boolean {
  try {
    return allowRawMcpCalls(getMcpEnv());
  } catch {
    // Ambiente MCP incompleto (ex.: testes): a opção fica desligada.
    return false;
  }
}

/** Grava a chamada em `agentTokens.recordCall` como o próprio principal. */
export const recordCallInConvex: CallRecorder = async (principal, record) => {
  const client = await createDelegatedConvexClient(principal);
  await client.mutation(
    makeFunctionReference<"mutation">("agentTokens:recordCall"),
    record
  );
};

/**
 * Handler do `/mcp`. A cada requisição: autentica o bearer (token de agente
 * ou OAuth do Clerk), carrega o catálogo do usuário e monta um servidor com
 * as ferramentas que *esse* principal pode usar. Montar por requisição é
 * barato (o transporte é stateless) e é o que permite filtrar ferramentas por
 * permissão; `withMcpAuth` continua respondendo 401/403 com os cabeçalhos
 * de descoberta OAuth quando não há credencial válida.
 */
export function createAuthenticatedMcpHandler(
  options: CreateAuthenticatedMcpHandlerOptions = {}
) {
  const resourceUrl = options.resourceUrl ?? getMcpEnv().MCP_RESOURCE_URL;
  const adapterFactory = options.adapterFactory ?? createConvexEngineeringAdapter;
  const verifyToken = options.verifyToken ?? verifyMcpToken;
  const catalogLoader =
    options.catalogLoader === undefined ? loadCatalog : options.catalogLoader;
  const callerFactory = options.callerFactory ?? createConvexCaller;
  const recordCall =
    options.recordCall === undefined ? recordCallInConvex : options.recordCall;
  const allowRawCalls = options.allowRawCalls ?? allowRawCallsFromEnv();
  const log = options.log ?? ((message: string) => console.error(message));

  return async (request: Request): Promise<Response> => {
    const bearer = readBearer(request);
    let authInfo: AuthInfo | undefined;
    try {
      authInfo = await verifyToken(request, bearer);
    } catch (error) {
      // Convex/Clerk fora do ar: não confundir com credencial inválida.
      log(
        `[mcp] token verification unavailable: ${error instanceof Error ? error.message : String(error)}`
      );
      return new Response(
        JSON.stringify({ error: "Token verification is temporarily unavailable" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
    const principal = getPrincipal(authInfo);

    let catalogTools: CreateEngineeringMcpHandlerOptions["catalogTools"];
    if (principal && catalogLoader) {
      try {
        const [catalog, caller] = await Promise.all([
          catalogLoader(principal),
          callerFactory(principal),
        ]);
        catalogTools = {
          principal,
          catalog,
          caller,
          allowRawCalls,
          ...(recordCall ? { recordCall } : {}),
        };
      } catch (error) {
        // Sem catálogo o servidor ainda serve as ferramentas embutidas.
        log(
          `[mcp] catalog unavailable: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const handler = createEngineeringMcpHandler({ adapterFactory, catalogTools });
    const authenticated = withMcpAuth(handler, async () => authInfo, {
      required: true,
      requiredScopes: [ENGINEERING_READ_SCOPE],
      resourceMetadataPath: RESOURCE_METADATA_PATH,
      resourceUrl,
    });
    return await authenticated(request);
  };
}
