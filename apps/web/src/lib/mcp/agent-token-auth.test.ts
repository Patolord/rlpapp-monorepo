import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  agentTokenAuthInfo,
  isAgentTokenBearer,
  resetAgentTokenCacheForTests,
  verifyAgentToken,
} from "./agent-token-auth";
import { AGENT_WRITE_SCOPE, ENGINEERING_READ_SCOPE } from "./constants";

const TOKEN = "rlp_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

const verifyBody = {
  token: {
    _id: "tok1",
    name: "Claude",
    tokenPrefix: "rlp_abcdefgh",
    permission: "read_only",
    expiresAt: null,
  },
  user: {
    _id: "usr1",
    clerkId: "user_clerk1",
    name: "Eng",
    email: "eng@rlp.test",
    username: null,
    role: "engenheiro",
    department: null,
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("agent token auth", () => {
  beforeEach(() => resetAgentTokenCacheForTests());

  test("reconhece só bearers com o prefixo rlp_", () => {
    expect(isAgentTokenBearer(TOKEN)).toBe(true);
    expect(isAgentTokenBearer("rlp_short")).toBe(false);
    expect(isAgentTokenBearer("eyJhbGciOi...")).toBe(false);
    expect(isAgentTokenBearer(undefined)).toBe(false);
  });

  test("chama o endpoint de verificação do Convex e monta o AuthInfo", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://happy-animal-1.convex.site/agent-tokens/verify");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
      return jsonResponse(verifyBody);
    });

    const verified = await verifyAgentToken(TOKEN, {
      convexSiteUrl: "https://happy-animal-1.convex.site/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(verified).toEqual({
      token: { id: "tok1", name: "Claude", prefix: "rlp_abcdefgh", permission: "read_only" },
      user: {
        id: "usr1",
        clerkId: "user_clerk1",
        name: "Eng",
        email: "eng@rlp.test",
        username: null,
        role: "engenheiro",
        department: null,
      },
    });

    const authInfo = agentTokenAuthInfo(TOKEN, verified!);
    expect(authInfo.scopes).toEqual([ENGINEERING_READ_SCOPE]);
    expect(authInfo.extra).toMatchObject({
      userId: "user_clerk1",
      agentToken: { id: "tok1", permission: "read_only" },
    });

    const fullAccess = agentTokenAuthInfo(TOKEN, {
      ...verified!,
      token: { ...verified!.token, permission: "full_access" },
    });
    expect(fullAccess.scopes).toEqual([ENGINEERING_READ_SCOPE, AGENT_WRITE_SCOPE]);
  });

  test("401 vira null (e fica em cache); 5xx lança", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "Unauthorized" }, 401));
    const options = {
      convexSiteUrl: "https://x.convex.site",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    };
    expect(await verifyAgentToken(TOKEN, options)).toBeNull();
    expect(await verifyAgentToken(TOKEN, options)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resetAgentTokenCacheForTests();
    const failing = vi.fn(async () => new Response("boom", { status: 503 }));
    await expect(
      verifyAgentToken(TOKEN, {
        convexSiteUrl: "https://x.convex.site",
        fetchImpl: failing as unknown as typeof fetch,
      })
    ).rejects.toThrow("503");
  });

  test("resultado positivo também é reutilizado dentro da janela de cache", async () => {
    let now = 1_000_000;
    const fetchImpl = vi.fn(async () => jsonResponse(verifyBody));
    const options = {
      convexSiteUrl: "https://x.convex.site",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => now,
    };
    await verifyAgentToken(TOKEN, options);
    await verifyAgentToken(TOKEN, options);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += 60_000;
    await verifyAgentToken(TOKEN, options);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
