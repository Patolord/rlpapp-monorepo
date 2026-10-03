import {
  corsHeaders,
  fetchClerkAuthorizationServerMetadata,
  generateClerkProtectedResourceMetadata,
} from "@clerk/mcp-tools/server";
import { env } from "@rlpapp/env/web";

import { OAUTH_SCOPES_SUPPORTED } from "./constants";

export { corsHeaders };

export function buildProtectedResourceMetadata(resourceUrl: string) {
  return generateClerkProtectedResourceMetadata({
    publishableKey: env.VITE_CLERK_PUBLISHABLE_KEY,
    resourceUrl,
    properties: {
      scopes_supported: [...OAUTH_SCOPES_SUPPORTED],
    },
  });
}

export async function loadAuthorizationServerMetadata() {
  return await fetchClerkAuthorizationServerMetadata({
    publishableKey: env.VITE_CLERK_PUBLISHABLE_KEY,
  });
}

export function metadataJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}
