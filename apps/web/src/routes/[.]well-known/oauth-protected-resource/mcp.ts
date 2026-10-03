import { createFileRoute } from "@tanstack/react-router";
import { getMcpEnv } from "@rlpapp/env/mcp";

import {
  buildProtectedResourceMetadata,
  corsHeaders,
  metadataJsonResponse,
} from "@/lib/mcp/metadata";

function handleMetadata() {
  let resourceUrl: string;
  try {
    resourceUrl = getMcpEnv().MCP_RESOURCE_URL;
  } catch {
    return new Response("MCP is not configured", { status: 503 });
  }
  return metadataJsonResponse(buildProtectedResourceMetadata(resourceUrl));
}

export const Route = createFileRoute(
  "/.well-known/oauth-protected-resource/mcp"
)({
  server: {
    handlers: {
      GET: handleMetadata,
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
    },
  },
});
