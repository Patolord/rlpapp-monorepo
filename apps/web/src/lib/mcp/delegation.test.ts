import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { describe, expect, test } from "vitest";

import { signDelegationJwt } from "./delegation";

describe("MCP delegation JWT", () => {
  test("signs an RS256 token with aud convex and the original subject", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256", {
      extractable: true,
    });
    const privateKeyPem = await exportPKCS8(privateKey);
    const now = Date.now();

    const jwt = await signDelegationJwt(
      "user_2clerk",
      {
        issuer: "https://app.example.com/mcp",
        privateKeyPem,
        kid: "mcp-delegation",
      },
      now
    );

    const { payload, protectedHeader } = await jwtVerify(jwt, publicKey, {
      issuer: "https://app.example.com/mcp",
      audience: "convex",
    });

    expect(protectedHeader.alg).toBe("RS256");
    expect(protectedHeader.kid).toBe("mcp-delegation");
    expect(payload.sub).toBe("user_2clerk");
    expect(payload.iss).toBe("https://app.example.com/mcp");
    expect(payload.aud).toBe("convex");
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(120);
  });
});
