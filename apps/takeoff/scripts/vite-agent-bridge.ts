/**
 * Browser dev mode only: lets an MCP client reach the app running in a browser tab, so the
 * agent tools can be exercised (and the evals run) without building the native window. The Vite
 * dev server takes `POST /mcp`, relays the body to the page over the HMR socket and answers with
 * what the page sends back (src/lib/agent/bridge.ts, `connectDevBridge`). In the installed app
 * the same job is done by the Rust listener (src-tauri/src/agent.rs), with a token.
 *
 * There is no token here, so the door is narrower in other ways:
 * - only a client on this machine: the peer address must be loopback, whatever interface Vite
 *   is listening on (`TAURI_DEV_HOST` binds it to the LAN);
 * - no browser clients (a request carrying `Origin` is refused), so a web page open on the
 *   developer's machine cannot drive the takeoff;
 * - exactly one tab: a request goes to the single tab that announced itself as a responder and
 *   only that tab's answer is accepted. With two tabs open the request is refused rather than
 *   run in both.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, WebSocketClient } from "vite";

interface Reply {
  id: number;
  status: number;
  body: string;
}

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const REPLY_TIMEOUT_MS = 300_000;

/** Whether a peer address is this machine (IPv4, IPv6 and IPv4 mapped into IPv6). */
export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  const plain = address.startsWith("::ffff:") ? address.slice(7) : address;
  return plain === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(plain);
}

/** The request body, or null when it passes the limit (the rest is then left unread). */
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // stop buffering but keep the socket: the caller answers 413 before closing it
        req.off("data", onData);
        req.pause();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    };
    req.on("data", onData);
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
  });
}

function send(res: ServerResponse, status: number, body: string, close = false) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  if (close) res.setHeader("Connection", "close");
  if (body) res.setHeader("Content-Type", "application/json");
  res.end(body);
}

export function agentBridge(): Plugin {
  return {
    name: "takeoff-agent-bridge",
    apply: "serve",
    configureServer(server) {
      let nextId = 1;
      const pending = new Map<number, { from: WebSocketClient; done: (reply: Reply) => void }>();
      /** Tabs that installed the agent responder (a tab connected to HMR has not necessarily). */
      const responders = new Set<WebSocketClient>();
      server.ws.on("takeoff:agent-ready", (_data: unknown, client: WebSocketClient) => {
        responders.add(client);
      });
      server.ws.on("takeoff:agent-response", (reply: Reply, client: WebSocketClient) => {
        const waiting = pending.get(reply.id);
        // only the tab the request went to may answer it
        if (!waiting || waiting.from !== client) return;
        pending.delete(reply.id);
        waiting.done(reply);
      });
      server.middlewares.use("/mcp", (req, res) => {
        void (async () => {
          if (!isLoopback(req.socket.remoteAddress)) {
            return send(res, 403, '{"error":"only this computer may use the agent endpoint"}');
          }
          if (req.headers.origin) {
            return send(res, 403, '{"error":"requests from a browser are not accepted"}');
          }
          if (req.method !== "POST") {
            res.setHeader("Allow", "POST");
            return send(res, 405, '{"error":"only POST is supported"}');
          }
          const body = await readBody(req);
          if (body === null) {
            send(res, 413, '{"error":"request body too large"}', true);
            res.once("finish", () => req.destroy());
            return;
          }
          // tabs closed since they announced themselves are no longer connected
          for (const client of responders) {
            if (!server.ws.clients.has(client)) responders.delete(client);
          }
          if (responders.size === 0) {
            return send(res, 503, '{"error":"the app is not open in a browser tab"}');
          }
          if (responders.size > 1) {
            return send(
              res,
              409,
              '{"error":"the app is open in more than one browser tab: close the others, so the agent works on one takeoff"}',
            );
          }
          const [tab] = responders;
          const id = nextId++;
          const reply = await new Promise<Reply | null>((resolve) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              resolve(null);
            }, REPLY_TIMEOUT_MS);
            pending.set(id, {
              from: tab,
              done: (r) => {
                clearTimeout(timer);
                resolve(r);
              },
            });
            tab.send("takeoff:agent-request", { id, body });
          });
          if (!reply) return send(res, 504, '{"error":"the app did not answer in time"}');
          send(res, reply.status, reply.body);
        })();
      });
    },
  };
}
