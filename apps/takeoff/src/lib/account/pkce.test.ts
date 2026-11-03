import { describe, expect, it } from "vitest";
import {
  base64Url,
  challengeFor,
  connectUrl,
  createPkce,
  parseCallback,
  randomString,
} from "./pkce";

describe("PKCE", () => {
  it("S256 challenge matches the RFC 7636 example", async () => {
    expect(await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("base64url has no padding or URL-unsafe characters", () => {
    expect(base64Url(new Uint8Array([251, 255, 191]))).toBe("-_-_");
    expect(base64Url(new Uint8Array([1]))).toBe("AQ");
  });

  it("verifier and state are random, URL-safe and long enough", async () => {
    const a = await createPkce();
    const b = await createPkce();
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.verifier).not.toBe(b.verifier);
    expect(await challengeFor(a.verifier)).toBe(a.challenge);
    expect(randomString(24)).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

describe("browser round trip", () => {
  it("builds the dashboard URL with every parameter encoded", () => {
    const url = new URL(
      connectUrl("https://app.rlpeng.com.br", {
        port: 53111,
        state: "s".repeat(32),
        challenge: "c".repeat(43),
        device: "PC da Ana & cia",
        installation: "inst-0123456789abcdef",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://app.rlpeng.com.br/takeoff/conectar");
    expect(url.searchParams.get("port")).toBe("53111");
    expect(url.searchParams.get("device")).toBe("PC da Ana & cia");
    expect(url.searchParams.get("challenge")).toBe("c".repeat(43));
    expect(url.searchParams.get("installation")).toBe("inst-0123456789abcdef");
  });

  it("accepts the code only with the expected state", () => {
    expect(parseCallback("code=abc&state=xyz", "xyz")).toEqual({ code: "abc" });
    expect(() => parseCallback("code=abc&state=other", "xyz")).toThrow(/não confere/);
    expect(() => parseCallback("code=abc", "xyz")).toThrow(/não confere/);
    expect(() => parseCallback("state=xyz", "xyz")).toThrow(/sem o código/);
  });

  it("reports a cancel in the browser", () => {
    expect(() => parseCallback("error=access_denied&state=xyz", "xyz")).toThrow(/cancelada/);
    expect(() => parseCallback("error=other&state=xyz", "xyz")).toThrow(/recusado/);
  });
});
