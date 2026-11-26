/**
 * Carries MCP messages between the outside world and protocol.ts. In the desktop app, Rust owns
 * a loopback HTTP listener (src-tauri/src/agent.rs): it checks the bearer token and the request's
 * origin, hands the body over as an `agent-request` event and waits for `agent_respond`. In
 * browser dev mode the Vite dev server plays that part (scripts/vite-agent-bridge.ts), so the
 * tools can be driven without building the native app.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "../platform";
import { appContext } from "./appContext";
import { AGENT_INSTRUCTIONS } from "./instructions";
import { type HttpReply, handleMcpPost, type McpServer } from "./protocol";
import { AGENT_TOOLS } from "./tools";

/** Port the desktop app listens on unless the user picks another (kept per machine). */
export const DEFAULT_AGENT_PORT = 47800;

const server: McpServer = {
  name: "rlp-takeoff",
  title: "RLP Takeoff",
  version: import.meta.env.VITE_APP_VERSION ?? "0",
  instructions: AGENT_INSTRUCTIONS,
  tools: AGENT_TOOLS,
  context: appContext,
};

interface AgentRequest {
  id: number;
  body: string;
}

async function reply(body: string): Promise<HttpReply> {
  try {
    return await handleMcpPost(server, body);
  } catch (e) {
    console.error("agent request failed", e);
    return { status: 500, body: JSON.stringify({ error: "internal error" }) };
  }
}

let unlisten: UnlistenFn | null = null;

export interface AgentEndpoint {
  url: string;
  /** Bearer token the client must send; null in browser dev mode (no token there). */
  token: string | null;
}

/** A URL-safe random token (256 bits). */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Start accepting agent connections on the loopback interface. The token is created once and
 * kept in the OS credential store, so a configured client keeps working across restarts.
 */
export async function startAgentServer(port: number): Promise<AgentEndpoint> {
  if (!isTauri()) {
    throw new Error("O servidor do agente só existe no app instalado.");
  }
  const token = await invoke<string>("agent_token", { candidate: randomToken() });
  unlisten?.();
  unlisten = await listen<AgentRequest>("agent-request", (event) => {
    const { id, body } = event.payload;
    void reply(body).then((r) => invoke("agent_respond", { id, status: r.status, body: r.body }));
  });
  try {
    const bound = await invoke<number>("agent_server_start", { port, token });
    return { url: `http://127.0.0.1:${bound}/mcp`, token };
  } catch (e) {
    unlisten();
    unlisten = null;
    throw e;
  }
}

export async function stopAgentServer(): Promise<void> {
  unlisten?.();
  unlisten = null;
  if (isTauri()) await invoke("agent_server_stop");
}

/** Replace the token: every client configured with the old one stops working. */
export const resetAgentToken = (): Promise<string> =>
  invoke<string>("agent_token_reset", { candidate: randomToken() });

/**
 * Browser dev mode: answer the requests the Vite dev server relays from `POST /mcp`. Always on
 * there (it is a developer's machine and the page is already fully scriptable from devtools).
 */
export function connectDevBridge(): AgentEndpoint | null {
  const hot = import.meta.hot;
  if (isTauri() || !hot) return null;
  hot.on("takeoff:agent-request", (data: AgentRequest) => {
    void reply(data.body).then((r) =>
      hot.send("takeoff:agent-response", { id: data.id, status: r.status, body: r.body }),
    );
  });
  return { url: `${window.location.origin}/mcp`, token: null };
}
