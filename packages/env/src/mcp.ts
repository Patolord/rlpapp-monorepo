import { z } from "zod";

const mcpEnvSchema = z.object({
  VITE_CONVEX_URL: z.url(),
  VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  MCP_RESOURCE_URL: z.url(),
  MCP_JWT_ISSUER: z.url(),
  MCP_JWT_PRIVATE_KEY: z.string().min(1),
  MCP_ALLOWED_HOSTS: z.string().min(1),
  MCP_JWT_KEY_ID: z.string().min(1).default("mcp-delegation"),
  // URL *site* do deployment Convex (https://<nome>.convex.site), onde fica o
  // endpoint de verificação de tokens de agente. Derivada de VITE_CONVEX_URL
  // quando ausente.
  VITE_CONVEX_SITE_URL: z.url().optional(),
  // "1" expõe a ferramenta `call_function` (qualquer função pública por nome).
  MCP_ALLOW_RAW_CALLS: z.string().optional(),
});

export type McpEnv = z.infer<typeof mcpEnvSchema>;

function viteEnv(name: string): string | undefined {
  return (import.meta as { env?: Record<string, string | undefined> }).env?.[
    name
  ];
}

function readValue(name: string): string | undefined {
  const fromProcess =
    typeof process !== "undefined" ? process.env[name] : undefined;
  if (fromProcess && fromProcess.length > 0) return fromProcess;
  const fromVite = viteEnv(name);
  if (fromVite && fromVite.length > 0) return fromVite;
  return undefined;
}

let cached: McpEnv | undefined;

export function getMcpEnv(): McpEnv {
  if (cached) return cached;
  cached = mcpEnvSchema.parse({
    VITE_CONVEX_URL: readValue("VITE_CONVEX_URL"),
    VITE_CLERK_PUBLISHABLE_KEY: readValue("VITE_CLERK_PUBLISHABLE_KEY"),
    MCP_RESOURCE_URL: readValue("MCP_RESOURCE_URL"),
    MCP_JWT_ISSUER: readValue("MCP_JWT_ISSUER"),
    MCP_JWT_PRIVATE_KEY: readValue("MCP_JWT_PRIVATE_KEY"),
    MCP_ALLOWED_HOSTS: readValue("MCP_ALLOWED_HOSTS"),
    MCP_JWT_KEY_ID: readValue("MCP_JWT_KEY_ID"),
    VITE_CONVEX_SITE_URL: readValue("VITE_CONVEX_SITE_URL"),
    MCP_ALLOW_RAW_CALLS: readValue("MCP_ALLOW_RAW_CALLS"),
  });
  return cached;
}

export function resetMcpEnvForTests(): void {
  cached = undefined;
}

/**
 * URL do endpoint que valida tokens de agente (Convex HTTP action). O site URL
 * difere do URL do cliente só pelo TLD (`.convex.cloud` → `.convex.site`) ou,
 * no backend local, pela porta (3210 → 3211).
 */
export function deriveConvexSiteUrl(env: Pick<McpEnv, "VITE_CONVEX_URL" | "VITE_CONVEX_SITE_URL">): string {
  if (env.VITE_CONVEX_SITE_URL) return env.VITE_CONVEX_SITE_URL.replace(/\/+$/, "");
  return env.VITE_CONVEX_URL.replace(/\/+$/, "")
    .replace(".convex.cloud", ".convex.site")
    .replace(":3210", ":3211");
}

export function allowRawMcpCalls(env: Pick<McpEnv, "MCP_ALLOW_RAW_CALLS">): boolean {
  return ["1", "true", "yes"].includes((env.MCP_ALLOW_RAW_CALLS ?? "").trim().toLowerCase());
}
