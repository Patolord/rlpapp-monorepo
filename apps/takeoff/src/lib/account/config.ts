/**
 * Where the company account lives. Production by default; a dev build points elsewhere with
 * `VITE_TAKEOFF_CONVEX_URL` (the deployment, `https://<name>.convex.cloud`) and
 * `VITE_TAKEOFF_WEB_URL` (the dashboard that shows the sign-in page). Takeoff-specific names on
 * purpose: `VITE_CONVEX_URL` belongs to the web app and is often set in a developer's shell, where
 * it must not redirect a desktop build.
 */

/** `https://x.convex.cloud` → `https://x.convex.site` (local backend: port 3210 → 3211). */
export function siteUrlFromCloud(cloud: string): string {
  const url = new URL(cloud);
  url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  if (url.port === "3210") url.port = "3211";
  return url.origin;
}

const env = import.meta.env as Record<string, string | undefined>;
const trimmed = (value: string | undefined) => value?.trim().replace(/\/+$/, "") || undefined;

/** The Convex deployment: catalog, proposals and approved budgets, all as the signed-in user. */
export const CONVEX_URL: string =
  trimmed(env.VITE_TAKEOFF_CONVEX_URL) ?? "https://rosy-crow-250.convex.cloud";

/** HTTP actions of the same deployment (code exchange, JWT refresh). */
export const CONVEX_SITE_URL: string = siteUrlFromCloud(CONVEX_URL);

export const WEB_URL: string = trimmed(env.VITE_TAKEOFF_WEB_URL) ?? "https://app.rlpeng.com.br";
