/**
 * Browser dev mode only: lets an MCP client reach the app running in a browser tab, so the
 * agent tools can be exercised (and the evals run) without building the native window. The Vite
 * dev server takes `POST /mcp`, relays the body to the page over the HMR socket and answers with
 * what the page sends back (src/lib/agent/bridge.ts, `connectDevBridge`). In the installed app
 * the same job is done by the Rust listener (src-tauri/src/agent.rs), with a token.
 *
 * As there: loopback only (Vite's default host) and no browser clients, so a web page open on
 * the developer's machine cannot drive the takeoff.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

interface Reply {
  id: number;
  status: number;
  body: string;
}

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const REPLY_TIMEOUT_MS = 300_000;

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
  });
}

function send(res: ServerResponse, status: number, body: string) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  if (body) res.setHeader("Content-Type", "application/json");
  res.end(body);
}

export function agentBridge(): Plugin {
  return {
    name: "takeoff-agent-bridge",
    apply: "serve",
    configureServer(server) {
      let nextId = 1;
      const pending = new Map<number, (reply: Reply) => void>();
      server.ws.on("takeoff:agent-response", (reply: Reply) => {
        const done = pending.get(reply.id);
        pending.delete(reply.id);
        done?.(reply);
      });
      server.middlewares.use("/mcp", (req, res) => {
        void (async () => {
          if (req.headers.origin) {
            return send(res, 403, '{"error":"requests from a browser are not accepted"}');
          }
          if (req.method !== "POST") {
            res.setHeader("Allow", "POST");
            return send(res, 405, '{"error":"only POST is supported"}');
          }
          const body = await readBody(req);
          if (body === null) return send(res, 413, '{"error":"request body too large"}');
          if (server.ws.clients.size === 0) {
            return send(res, 503, '{"error":"the app is not open in a browser tab"}');
          }
          const id = nextId++;
          const reply = await new Promise<Reply | null>((resolve) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              resolve(null);
            }, REPLY_TIMEOUT_MS);
            pending.set(id, (r) => {
              clearTimeout(timer);
              resolve(r);
            });
            server.ws.send("takeoff:agent-request", { id, body });
          });
          if (!reply) return send(res, 504, '{"error":"the app did not answer in time"}');
          send(res, reply.status, reply.body);
        })();
      });
    },
  };
}
