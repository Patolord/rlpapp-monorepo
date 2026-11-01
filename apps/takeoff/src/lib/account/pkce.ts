/**
 * PKCE (RFC 7636, S256) and the `state` of the browser sign-in: the app keeps the verifier, the
 * web page only sees its challenge, and the code that comes back is useless without the
 * verifier. See packages/backend/convex/lib/takeoffAuth.ts for the whole flow.
 */

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL-safe random string from `byteLength` random bytes (32 → 43 characters). */
export function randomString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** S256 challenge: base64url(SHA-256(verifier)). */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString(32);
  return { verifier, challenge: await challengeFor(verifier) };
}

export interface ConnectRequest {
  /** Port of the app's loopback listener. */
  port: number;
  state: string;
  challenge: string;
  /** Computer name, shown on the confirmation page and in the token list. */
  device: string;
}

/** The web page that asks the signed-in user to connect this computer. */
export function connectUrl(webUrl: string, req: ConnectRequest): string {
  const url = new URL("/takeoff/conectar", webUrl);
  url.searchParams.set("port", String(req.port));
  url.searchParams.set("state", req.state);
  url.searchParams.set("challenge", req.challenge);
  url.searchParams.set("device", req.device);
  return url.toString();
}

/**
 * The browser's redirect back to the listener (`/callback?code=…&state=…`). A state that does
 * not match is someone else's redirect: refused. `error` is the user's "Cancelar".
 */
export function parseCallback(query: string, expectedState: string): { code: string } {
  const params = new URLSearchParams(query);
  if (params.get("state") !== expectedState) {
    throw new Error("Resposta do navegador não confere com este login; tente de novo");
  }
  const error = params.get("error");
  if (error) {
    throw new Error(
      error === "access_denied" ? "Conexão cancelada no navegador" : `Login recusado (${error})`,
    );
  }
  const code = params.get("code");
  if (!code) throw new Error("O navegador voltou sem o código de acesso");
  return { code };
}
