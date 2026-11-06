import { env } from "@rlpapp/env/web";
import { useEffect, useState } from "react";

import { CodeBlock } from "@/components/conta/agentes/code-block";
import { Button } from "@/components/ui/button";

/** URL do servidor MCP deste app (mesma origem da página). */
export function useMcpUrl(): string {
  const [origin, setOrigin] = useState("https://<app>");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  return `${origin}/mcp`;
}

/**
 * Base da API HTTP para agentes (`/api/v1`), servida pelo próprio deployment
 * Convex no domínio *site* (`.convex.cloud` → `.convex.site`; no backend
 * local, porta 3210 → 3211).
 */
export function apiBaseUrl(): string {
  return `${env.VITE_CONVEX_URL.replace(/\/+$/, "")
    .replace(".convex.cloud", ".convex.site")
    .replace(":3210", ":3211")}/api/v1`;
}

export function ConnectionSnippets({ mcpUrl, token }: { mcpUrl: string; token: string }) {
  const [client, setClient] = useState<"http" | "claude-code" | "cursor" | "curl">(
    "http"
  );
  const apiUrl = apiBaseUrl();
  const snippets = {
    http: `# Quem sou eu / o que posso chamar
curl ${apiUrl}/me -H "Authorization: Bearer ${token}"
curl "${apiUrl}/functions?search=supplier" -H "Authorization: Bearer ${token}"

# Consultar e gravar (path = "modulo:funcao")
curl ${apiUrl}/query -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"path":"suppliers:list","args":{}}'
curl ${apiUrl}/mutation -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"path":"customers:create","args":{"name":"Cliente"}}'`,
    "claude-code": `claude mcp add --transport http rlp ${mcpUrl} \\
  --header "Authorization: Bearer ${token}"`,
    cursor: JSON.stringify(
      {
        mcpServers: {
          rlp: { url: mcpUrl, headers: { Authorization: `Bearer ${token}` } },
        },
      },
      null,
      2
    ),
    curl: `curl ${mcpUrl} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  } as const;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["http", "API HTTP (curl)"],
            ["claude-code", "Claude Code (MCP)"],
            ["cursor", "Cursor / Claude Desktop (MCP)"],
            ["curl", "curl (MCP)"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="xs"
            variant={client === value ? "default" : "outline"}
            onClick={() => setClient(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <CodeBlock code={snippets[client]} label="Configuração" />
    </div>
  );
}
