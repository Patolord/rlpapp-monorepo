import { createFileRoute } from "@tanstack/react-router";

import {
  corsHeaders,
  loadAuthorizationServerMetadata,
  metadataJsonResponse,
} from "@/lib/mcp/metadata";

async function handleMetadata() {
  try {
    const metadata = await loadAuthorizationServerMetadata();
    return metadataJsonResponse(metadata);
  } catch (error) {
    console.error("Failed to load Clerk authorization server metadata", error);
    return new Response("Authorization server metadata unavailable", {
      status: 502,
    });
  }
}

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      GET: handleMetadata,
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: corsHeaders }),
    },
  },
});
