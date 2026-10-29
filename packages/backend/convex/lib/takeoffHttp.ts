import { env } from "../_generated/server";

/** JSON response with the charset the desktop app expects. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Bearer check shared by every `/takeoff/*` route the RLP Takeoff desktop app
 * calls. Returns the response to send when the call must stop (503 while no
 * token is configured on the deployment, 401 for a missing or wrong one), or
 * null when the request is authorised.
 */
export function takeoffTokenError(request: Request): Response | null {
  const token = env.TAKEOFF_CATALOG_TOKEN;
  if (!token) return json({ error: "Takeoff catalog is not configured" }, 503);
  if (request.headers.get("Authorization") !== `Bearer ${token}`) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}
