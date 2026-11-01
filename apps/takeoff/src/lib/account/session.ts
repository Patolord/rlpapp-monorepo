import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { httpRequest } from "../catalogRemote";
import { IS_MAC, isTauri } from "../platform";
import { CONVEX_SITE_URL, WEB_URL } from "./config";
import { connectUrl, createPkce, parseCallback, randomString } from "./pkce";
import { createJwtCache, type Jwt } from "./tokens";

/**
 * The company account on this computer.
 *
 * Signing in opens the browser at the dashboard's `/takeoff/conectar` page; the user confirms
 * with the session they already have there (Clerk), the browser comes back to a one-shot
 * listener on 127.0.0.1 (Rust, src-tauri/src/auth.rs) with a one-time code, and the code plus the
 * PKCE verifier become a *device token* (`rlp_…`, listed and revocable in the dashboard under
 * Minha conta › Agentes). The device token stays in the OS credential store (never on disk in
 * the clear, never in localStorage); every hour or so it is exchanged for a short JWT that the
 * typed Convex client sends (see convex.ts).
 */

export interface AccountUser {
  name: string;
  email: string | null;
}

/** The device token was refused (revoked in the dashboard, or the user was deactivated). */
export class SignedOutError extends Error {
  constructor(message = "Sessão encerrada: entre de novo com a conta da empresa") {
    super(message);
    this.name = "SignedOutError";
  }
}

/** How long the app waits for the user to confirm in the browser. */
export const SIGN_IN_TIMEOUT_SECS = 300;

const EXCHANGE_URL = `${CONVEX_SITE_URL}/takeoff/auth/exchange`;
const REVOKE_URL = `${CONVEX_SITE_URL}/takeoff/auth/revoke`;
const TOKEN_URL = `${CONVEX_SITE_URL}/api/v1/auth/token`;

function readJson(body: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function errorText(json: Record<string, unknown>, fallback: string): string {
  if (typeof json.message === "string") return json.message;
  const error = json.error as { message?: unknown } | string | undefined;
  if (typeof error === "object" && typeof error?.message === "string") return error.message;
  return fallback;
}

function readUser(raw: unknown): AccountUser {
  const user = (raw ?? {}) as { name?: unknown; email?: unknown };
  return {
    name: typeof user.name === "string" && user.name ? user.name : "Conta da empresa",
    email: typeof user.email === "string" ? user.email : null,
  };
}

/** `POST /takeoff/auth/exchange`: one-time code + PKCE verifier → device token and a first JWT. */
export async function exchangeCode(
  code: string,
  verifier: string,
): Promise<{ deviceToken: string; jwt: Jwt; user: AccountUser }> {
  const res = await httpRequest({
    method: "POST",
    url: EXCHANGE_URL,
    body: JSON.stringify({ code, verifier }),
  });
  const json = readJson(res.body);
  if (res.status !== 200) {
    throw new Error(errorText(json, `Falha ao concluir o login (HTTP ${res.status})`));
  }
  if (typeof json.token !== "string" || typeof json.jwt !== "string") {
    throw new Error("Resposta inesperada do servidor ao concluir o login");
  }
  return {
    deviceToken: json.token,
    jwt: { token: json.jwt, expiresAt: Number(json.jwtExpiresAt) || Date.now() + 30 * 60_000 },
    user: readUser(json.user),
  };
}

/** `POST /api/v1/auth/token`: a fresh JWT for the device token. 401 → SignedOutError. */
export async function fetchJwt(deviceToken: string): Promise<{ jwt: Jwt; user: AccountUser }> {
  const res = await httpRequest({ method: "POST", url: TOKEN_URL, token: deviceToken });
  const json = readJson(res.body);
  if (res.status === 401) throw new SignedOutError();
  if (res.status !== 200 || typeof json.token !== "string") {
    throw new Error(errorText(json, `Falha ao renovar o acesso (HTTP ${res.status})`));
  }
  const expiresAt = typeof json.expires_at === "string" ? Date.parse(json.expires_at) : Number.NaN;
  return {
    jwt: { token: json.token, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() },
    user: readUser(json.user),
  };
}

// ---------------------------------------------------------------------------
// The signed-in account (module state: one account per app instance)
// ---------------------------------------------------------------------------

let deviceToken: string | null = null;
let onUser: ((user: AccountUser) => void) | null = null;

const jwtCache = createJwtCache(async () => {
  if (!deviceToken) throw new SignedOutError("Entre com a conta da empresa");
  const { jwt, user } = await fetchJwt(deviceToken);
  onUser?.(user);
  return jwt;
});

/** Called with the account's name whenever the server reports it (sign-in and refreshes). */
export function onAccountUser(listener: ((user: AccountUser) => void) | null): void {
  onUser = listener;
}

export const isSignedIn = (): boolean => deviceToken !== null;

/** A valid JWT for the Convex client; `force` after the server refused the current one. */
export function getJwt(force = false): Promise<string> {
  return jwtCache.get(force);
}

/** Sign-in needs the native window: the loopback listener and the keychain are in Rust. */
export const canSignIn = (): boolean => isTauri();

/**
 * Pick up a device token stored by an earlier session. Returns the account when the server
 * confirms it, `"offline"` when it could not be reached (still signed in: calls retry later),
 * null when there is none or it was revoked (then it is forgotten).
 */
export async function restoreSession(): Promise<AccountUser | "offline" | null> {
  if (!canSignIn()) return null;
  const stored = await invoke<string | null>("device_token_get");
  if (!stored) return null;
  deviceToken = stored;
  try {
    const { jwt, user } = await fetchJwt(stored);
    jwtCache.set(jwt);
    return user;
  } catch (e) {
    if (e instanceof SignedOutError) {
      await forgetSession();
      return null;
    }
    return "offline";
  }
}

function deviceLabel(name: string | null): string {
  return name?.trim() || (IS_MAC ? "Mac" : "Windows");
}

/** The user closed the sign-in prompt (×) before it finished. */
export class SignInCancelledError extends Error {
  constructor() {
    super("cancelado");
    this.name = "SignInCancelledError";
  }
}

/** The sign-in in progress; cancelling marks it, and every step after an await checks. */
let attempt: { cancelled: boolean } | null = null;

/**
 * This installation's random id (src-tauri/src/installation.rs): generated once, then the same
 * on every sign-in, so the server replaces only this installation's previous token.
 */
async function installationId(): Promise<string> {
  return await invoke<string>("installation_id", { candidate: randomString(18) });
}

/** `POST /takeoff/auth/revoke` with the device token; true only when the server confirms. */
async function revokeOnServer(token: string): Promise<boolean> {
  try {
    const res = await httpRequest({ method: "POST", url: REVOKE_URL, token });
    return res.status === 200 && readJson(res.body).revoked === true;
  } catch {
    return false;
  }
}

/**
 * The whole browser sign-in: listener, browser, wait, code exchange, keychain. Resolves with the
 * account once this computer is connected; rejects when the user cancels, the wait times out or
 * the server refuses the code. A cancel at any step wins: nothing is kept or activated, and a
 * token the server already issued to this attempt is revoked and removed from the keychain.
 */
export async function signInWithBrowser(): Promise<AccountUser> {
  if (!canSignIn()) throw new Error("O login com a conta da empresa só funciona no app instalado");
  // a "Sair" still running finishes first: it deletes the keychain entry this login will write
  if (pendingSignOut) await pendingSignOut.catch(() => undefined);
  if (attempt) attempt.cancelled = true;
  const current = { cancelled: false };
  attempt = current;
  const check = () => {
    if (current.cancelled) throw new SignInCancelledError();
  };
  let issued: string | null = null;
  let stored = false;
  try {
    const device = deviceLabel(await invoke<string | null>("device_name").catch(() => null));
    const installation = await installationId();
    const { verifier, challenge } = await createPkce();
    const state = randomString(24);
    check();
    const port = await invoke<number>("auth_listen");
    try {
      check();
      await openUrl(connectUrl(WEB_URL, { port, state, challenge, device, installation }));
    } catch (e) {
      await invoke("auth_cancel").catch(() => undefined);
      throw e;
    }
    const query = await invoke<string>("auth_wait", { timeoutSecs: SIGN_IN_TIMEOUT_SECS });
    check();
    const { code } = parseCallback(query, state);
    const result = await exchangeCode(code, verifier);
    issued = result.deviceToken;
    check();
    await invoke("device_token_set", { token: result.deviceToken });
    stored = true;
    check();
    // the last check and the activation run without an await in between
    deviceToken = result.deviceToken;
    jwtCache.set(result.jwt);
    return result.user;
  } catch (e) {
    if (current.cancelled && issued) {
      if (stored) await invoke("device_token_delete").catch(() => undefined);
      await revokeOnServer(issued);
    }
    throw current.cancelled ? new SignInCancelledError() : e;
  } finally {
    if (attempt === current) attempt = null;
  }
}

/** Stop the sign-in in progress (the user closed the prompt), whatever step it is at. */
export async function cancelSignIn(): Promise<void> {
  if (attempt) attempt.cancelled = true;
  if (canSignIn()) await invoke("auth_cancel");
}

/** Forget the session here: memory first, then the keychain (which may fail). */
async function forgetSession(): Promise<void> {
  deviceToken = null;
  jwtCache.clear();
  if (canSignIn()) await invoke("device_token_delete");
}

/**
 * "Sair" could not fully disconnect: the credential is still in this computer's keychain (and
 * would sign back in on the next start unless the server revoked it).
 */
export class SignOutIncompleteError extends Error {
  constructor(
    readonly revoked: boolean,
    cause: unknown,
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      revoked
        ? `Acesso revogado no servidor, mas a credencial não pôde ser apagada deste computador (${detail})`
        : `A credencial não pôde ser apagada deste computador (${detail}) nem revogada no servidor: revogue em Minha conta › Agentes, no app web`,
    );
    this.name = "SignOutIncompleteError";
  }
}

/**
 * "Sair": revoke the device token on the server, then forget it here. Revocation is always
 * attempted, whatever happens to the keychain. Resolves with whether the server confirmed the
 * revocation (offline, the token stays listed in the dashboard until revoked there); rejects with
 * SignOutIncompleteError when the keychain entry could not be deleted.
 */
export function signOut(): Promise<{ revoked: boolean }> {
  // a second "Sair" while one is running shares it, so the first can't later delete a new login
  pendingSignOut ??= runSignOut().finally(() => {
    pendingSignOut = null;
  });
  return pendingSignOut;
}

let pendingSignOut: Promise<{ revoked: boolean }> | null = null;

async function runSignOut(): Promise<{ revoked: boolean }> {
  const token = deviceToken;
  deviceToken = null;
  jwtCache.clear();
  const revoked = token ? await revokeOnServer(token) : false;
  try {
    if (canSignIn()) await invoke("device_token_delete");
  } catch (e) {
    throw new SignOutIncompleteError(revoked, e);
  }
  return { revoked };
}

/** The server refused the device token while in use: forget it so the UI asks to sign in. */
export async function dropRevokedSession(): Promise<void> {
  await forgetSession();
}
