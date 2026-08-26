import { z } from "zod";

const mcpEnvSchema = z.object({
  VITE_CONVEX_URL: z.url(),
  VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  MCP_RESOURCE_URL: z.url(),
  MCP_JWT_ISSUER: z.url(),
  MCP_JWT_PRIVATE_KEY: z.string().min(1),
  MCP_ALLOWED_HOSTS: z.string().min(1),
  MCP_JWT_KEY_ID: z.string().min(1).default("mcp-delegation"),
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
  });
  return cached;
}

export function resetMcpEnvForTests(): void {
  cached = undefined;
}
