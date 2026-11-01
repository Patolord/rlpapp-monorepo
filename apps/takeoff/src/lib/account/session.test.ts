import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The sign-in/sign-out sequence against fake Rust commands and a fake server: a cancel at any
 * step must leave nothing behind, and "Sair" must always try the server and report a keychain
 * failure instead of claiming a clean disconnect.
 */

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const keychain: { token: string | null; deleteFails: boolean } = {
  token: null,
  deleteFails: false,
};
const calls: string[] = [];
let callbackQuery: () => Promise<string>;
let tokenSet: () => Promise<void>;
let exchangeResponse: () => Promise<{ status: number; body: string }>;
const revoked: string[] = [];
let revokeReachable = true;
let revokeGate: () => Promise<void> = async () => {};

vi.mock("../platform", () => ({ isTauri: () => true, IS_MAC: false }));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async (url: string) => {
    calls.push(`open ${new URL(url).pathname}`);
  }),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    calls.push(cmd);
    switch (cmd) {
      case "device_name":
        return "PC-TESTE";
      case "installation_id":
        return "inst-0123456789abcdef";
      case "auth_listen":
        return 53000;
      case "auth_wait":
        return await callbackQuery();
      case "auth_cancel":
        return null;
      case "device_token_get":
        return keychain.token;
      case "device_token_set":
        await tokenSet();
        keychain.token = String(args?.token);
        return null;
      case "device_token_delete":
        if (keychain.deleteFails) throw "cofre indisponível";
        keychain.token = null;
        return null;
      default:
        throw new Error(`unexpected command ${cmd}`);
    }
  }),
}));
vi.mock("../catalogRemote", () => ({
  CATALOG_URL: "https://rosy-crow-250.convex.site/takeoff/catalog",
  httpRequest: vi.fn(async (req: { url: string; token?: string }) => {
    if (req.url.endsWith("/takeoff/auth/exchange")) {
      calls.push("exchange");
      return await exchangeResponse();
    }
    if (req.url.endsWith("/takeoff/auth/revoke")) {
      if (!revokeReachable) throw new Error("offline");
      await revokeGate();
      revoked.push(req.token ?? "");
      return { status: 200, body: JSON.stringify({ revoked: true }) };
    }
    if (req.url.endsWith("/api/v1/auth/token")) {
      return {
        status: 200,
        body: JSON.stringify({
          token: "jwt-refreshed",
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          user: { name: "Ana", email: null },
        }),
      };
    }
    throw new Error(`unexpected url ${req.url}`);
  }),
}));

const session = await import("./session");

const exchangeOk = async () => ({
  status: 200,
  body: JSON.stringify({
    token: "rlp_issued",
    tokenPrefix: "rlp_issu",
    jwt: "jwt-1",
    jwtExpiresAt: Date.now() + 3_600_000,
    user: { name: "Ana", email: "ana@rlpeng.com.br" },
  }),
});

/** The state the app sends is random: answer the callback with whatever it put in the URL. */
let lastState = "";
beforeEach(async () => {
  calls.length = 0;
  revoked.length = 0;
  revokeReachable = true;
  revokeGate = async () => {};
  keychain.token = null;
  keychain.deleteFails = false;
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  vi.mocked(openUrl).mockImplementation(async (url: string | URL) => {
    lastState = new URL(String(url)).searchParams.get("state") ?? "";
    calls.push("open");
  });
  callbackQuery = async () => `code=${"c".repeat(43)}&state=${lastState}`;
  tokenSet = async () => {};
  exchangeResponse = exchangeOk;
  await session.signOut().catch(() => undefined);
  calls.length = 0;
  revoked.length = 0;
});

describe("signInWithBrowser", () => {
  it("connects: token in the keychain, signed in, installation id in the URL", async () => {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    const user = await session.signInWithBrowser();
    expect(user.name).toBe("Ana");
    expect(keychain.token).toBe("rlp_issued");
    expect(session.isSignedIn()).toBe(true);
    const url = new URL(vi.mocked(openUrl).mock.calls.at(-1)![0] as string);
    expect(url.searchParams.get("installation")).toBe("inst-0123456789abcdef");
    expect(url.searchParams.get("device")).toBe("PC-TESTE");
  });

  it("cancel while the code is being exchanged: nothing stored, issued token revoked", async () => {
    const pending = deferred<{ status: number; body: string }>();
    exchangeResponse = () => pending.promise;
    const signIn = session.signInWithBrowser();
    await vi.waitFor(() => expect(calls).toContain("exchange"), { timeout: 5000 });
    await session.cancelSignIn();
    pending.resolve(await exchangeOk());
    await expect(signIn).rejects.toBeInstanceOf(session.SignInCancelledError);
    expect(calls).not.toContain("device_token_set");
    expect(keychain.token).toBeNull();
    expect(session.isSignedIn()).toBe(false);
    expect(revoked).toEqual(["rlp_issued"]);
  });

  it("cancel while the keychain is being written: entry deleted, token revoked", async () => {
    const pending = deferred<void>();
    tokenSet = () => pending.promise;
    const signIn = session.signInWithBrowser();
    await vi.waitFor(() => expect(calls).toContain("device_token_set"), { timeout: 5000 });
    await session.cancelSignIn();
    pending.resolve();
    await expect(signIn).rejects.toBeInstanceOf(session.SignInCancelledError);
    expect(calls).toContain("device_token_delete");
    expect(keychain.token).toBeNull();
    expect(session.isSignedIn()).toBe(false);
    expect(revoked).toEqual(["rlp_issued"]);
  });

  it("cancel while waiting for the browser: no exchange, nothing to revoke", async () => {
    const pending = deferred<string>();
    callbackQuery = () => pending.promise;
    const signIn = session.signInWithBrowser();
    await vi.waitFor(() => expect(calls).toContain("auth_wait"), { timeout: 5000 });
    await session.cancelSignIn();
    pending.reject("cancelado");
    await expect(signIn).rejects.toBeInstanceOf(session.SignInCancelledError);
    expect(calls).toContain("auth_cancel");
    expect(revoked).toEqual([]);
    expect(session.isSignedIn()).toBe(false);
  });
});

describe("signOut", () => {
  it("revokes on the server and deletes the keychain entry", async () => {
    await session.signInWithBrowser();
    await expect(session.signOut()).resolves.toEqual({ revoked: true });
    expect(revoked).toEqual(["rlp_issued"]);
    expect(keychain.token).toBeNull();
    expect(session.isSignedIn()).toBe(false);
  });

  it("a keychain failure still revokes on the server, and is reported", async () => {
    await session.signInWithBrowser();
    keychain.deleteFails = true;
    const result = session.signOut();
    await expect(result).rejects.toBeInstanceOf(session.SignOutIncompleteError);
    await expect(result).rejects.toMatchObject({ revoked: true });
    expect(revoked).toEqual(["rlp_issued"]);
    expect(keychain.token).toBe("rlp_issued");
  });

  it("a second Sair shares the first, and a new login waits for it to finish", async () => {
    await session.signInWithBrowser();
    const gate = deferred<void>();
    revokeGate = () => gate.promise;
    const first = session.signOut();
    const second = session.signOut();
    revokeGate = async () => {};
    calls.length = 0;
    const again = session.signInWithBrowser();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).not.toContain("exchange");
    gate.resolve();
    await expect(first).resolves.toEqual({ revoked: true });
    await expect(second).resolves.toEqual({ revoked: true });
    await again;
    expect(revoked).toEqual(["rlp_issued"]);
    expect(keychain.token).toBe("rlp_issued");
    expect(session.isSignedIn()).toBe(true);
  });

  it("offline: forgets locally and says the server did not confirm", async () => {
    await session.signInWithBrowser();
    revokeReachable = false;
    await expect(session.signOut()).resolves.toEqual({ revoked: false });
    expect(keychain.token).toBeNull();
  });
});
