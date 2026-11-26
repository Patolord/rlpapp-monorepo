/**
 * The Model Context Protocol, server side, over the "Streamable HTTP" transport reduced to what
 * a local tool server needs: every client message is one HTTP POST carrying JSON-RPC, answered
 * with one JSON body (or 202 for a notification). No sessions, no server-initiated stream. The
 * transport itself (the loopback HTTP listener in Rust, or the Vite bridge in browser dev mode)
 * only carries the bytes; this file is the whole protocol and is pure given the tools.
 */
import type { AgentContext } from "./context";
import { type AgentTool, ToolError, type ToolResult } from "./toolTypes";

/** Protocol revisions this server speaks, newest first. */
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export interface McpServer {
  name: string;
  title: string;
  version: string;
  instructions: string;
  tools: readonly AgentTool[];
  context: AgentContext;
}

/** What the transport sends back: an HTTP status and, for 200, a JSON body. */
export interface HttpReply {
  status: number;
  body: string;
}

interface RpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

type RpcId = string | number | null;

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const rpcError = (id: RpcId, code: number, message: string) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

const rpcResult = (id: RpcId, result: unknown) => ({ jsonrpc: "2.0", id, result });

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Run one tool call; a failure the model can act on comes back as an `isError` result. */
async function callTool(server: McpServer, params: unknown): Promise<ToolResult | null> {
  if (!isObject(params) || typeof params.name !== "string") return null;
  const tool = server.tools.find((t) => t.name === params.name);
  if (!tool) return null;
  const args = isObject(params.arguments) ? params.arguments : {};
  try {
    return await tool.run(args, server.context);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!(e instanceof ToolError)) console.warn(`agent tool ${tool.name} failed`, e);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

/** Answer one JSON-RPC message; undefined for a notification (it gets no response). */
async function answer(server: McpServer, msg: unknown): Promise<object | undefined> {
  if (!isObject(msg)) return rpcError(null, INVALID_REQUEST, "Invalid request");
  const req = msg as RpcRequest;
  const hasId = typeof req.id === "string" || typeof req.id === "number";
  const id: RpcId = hasId ? (req.id as string | number) : null;
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    // a response to a server request (we send none) or junk: nothing to answer unless it asks
    return hasId && typeof req.method !== "string" && ("result" in req || "error" in req)
      ? undefined
      : rpcError(id, INVALID_REQUEST, "Invalid request");
  }
  if (!hasId) return undefined; // notifications/initialized, notifications/cancelled, ...
  switch (req.method) {
    case "initialize": {
      const asked = isObject(req.params) ? req.params.protocolVersion : undefined;
      const version = PROTOCOL_VERSIONS.find((v) => v === asked) ?? PROTOCOL_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: server.name, title: server.title, version: server.version },
        instructions: server.instructions,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: server.tools.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: t.readOnly, openWorldHint: false },
        })),
      });
    case "tools/call": {
      try {
        const result = await callTool(server, req.params);
        return result
          ? rpcResult(id, result)
          : rpcError(id, INVALID_PARAMS, "Unknown tool, or malformed tool call");
      } catch (e) {
        return rpcError(id, INTERNAL_ERROR, e instanceof Error ? e.message : String(e));
      }
    }
    // offered by some clients on connect; this server has none of them
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "resources/templates/list":
      return rpcResult(id, { resourceTemplates: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${req.method}`);
  }
}

/** Handle the body of one HTTP POST to the MCP endpoint. */
export async function handleMcpPost(server: McpServer, body: string): Promise<HttpReply> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 400, body: JSON.stringify(rpcError(null, PARSE_ERROR, "Parse error")) };
  }
  // batches were dropped from the protocol in 2025-06-18; older clients may still send one
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return { status: 400, body: JSON.stringify(rpcError(null, INVALID_REQUEST, "Empty batch")) };
    }
    const replies = (await Promise.all(parsed.map((m) => answer(server, m)))).filter(
      (r) => r !== undefined,
    );
    return replies.length === 0
      ? { status: 202, body: "" }
      : { status: 200, body: JSON.stringify(replies) };
  }
  const reply = await answer(server, parsed);
  return reply === undefined
    ? { status: 202, body: "" }
    : { status: 200, body: JSON.stringify(reply) };
}
