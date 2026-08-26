import { getMcpEnv } from "@rlpapp/env/mcp";
import { createFileRoute } from "@tanstack/react-router";

import { isAllowedHost, parseAllowedHosts } from "@/lib/mcp/host";
import { createAuthenticatedMcpHandler } from "@/lib/mcp/server";

function rejectDisallowedHost(request: Request): Response | null {
  let allowedHosts: string[];
  try {
    allowedHosts = parseAllowedHosts(getMcpEnv().MCP_ALLOWED_HOSTS);
  } catch {
    return new Response("MCP is not configured", { status: 503 });
  }

  if (!isAllowedHost(request.headers.get("host"), allowedHosts)) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

let handler: ((request: Request) => Promise<Response>) | undefined;

function getHandler() {
  handler ??= createAuthenticatedMcpHandler();
  return handler;
}

async function handleMcp({ request }: { request: Request }): Promise<Response> {
  const denied = rejectDisallowedHost(request);
  if (denied) return denied;
  return await getHandler()(request);
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      GET: handleMcp,
      POST: handleMcp,
      DELETE: handleMcp,
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers":
              "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id",
          },
        }),
    },
  },
});
