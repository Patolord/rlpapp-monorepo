import { beforeAll, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import {
  TAKEOFF_AUTH_CODE_TTL_MS,
  deviceTokenName,
  hashAuthCode,
  isValidChallenge,
  isValidVerifier,
  normalizeDeviceName,
  pkceChallengeFromVerifier,
} from "../convex/lib/takeoffAuth";
import { setup, withUser } from "./helpers";

/**
 * Login do RLP Takeoff (desktop): código de uso único emitido pela página
 * /takeoff/conectar, trocado com PKCE por um token de dispositivo.
 */

const SITE_URL = "https://some.convex.site";

// RFC 7636, apêndice B.
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

async function generatePrivateJwk(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d });
}

beforeAll(async () => {
  process.env.CONVEX_SITE_URL = SITE_URL;
  process.env.CONVEX_CLOUD_URL = "https://some.convex.cloud";
  process.env.API_JWT_PRIVATE_KEY = await generatePrivateJwk();
});

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
}

async function signIn(
  role: "engenheiro" | "operator" = "engenheiro",
  department?: "compras" | "engenharia"
) {
  const t = setup();
  const asUser = await withUser(t, {
    clerkId: "eng_1",
    name: "Eng. Ana",
    email: "ana@rlpeng.com.br",
    role,
    department,
  });
  return { t, asUser };
}

function exchange(
  t: ReturnType<typeof setup>,
  body: Record<string, unknown>
): Promise<Response> {
  return t.fetch("/takeoff/auth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PKCE e helpers", () => {
  test("desafio S256 bate com o vetor da RFC 7636", async () => {
    expect(await pkceChallengeFromVerifier(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
    expect(isValidChallenge(RFC_CHALLENGE)).toBe(true);
    expect(isValidVerifier(RFC_VERIFIER)).toBe(true);
  });

  test("rejeita desafio e verificador malformados", () => {
    expect(isValidChallenge("curto")).toBe(false);
    expect(isValidChallenge(`${RFC_CHALLENGE}=`)).toBe(false);
    expect(isValidVerifier("a".repeat(42))).toBe(false);
    expect(isValidVerifier("a".repeat(129))).toBe(false);
    expect(isValidVerifier(`${"a".repeat(42)} `)).toBe(false);
  });

  test("nome do computador: sem controle, colapsado, limitado, com padrão", () => {
    expect(normalizeDeviceName("  PC\n\tROD  ")).toBe("PC ROD");
    expect(normalizeDeviceName("")).toBe("computador");
    expect(normalizeDeviceName(undefined)).toBe("computador");
    expect(normalizeDeviceName("x".repeat(100))).toHaveLength(60);
    expect(deviceTokenName("PC-ROD")).toBe("Takeoff · PC-ROD");
  });
});

describe("takeoffAuth.createCode", () => {
  test("grava só o hash, ligado ao usuário e ao desafio, com TTL curto", async () => {
    const { t, asUser } = await signIn();
    const before = Date.now();
    const { code, expiresAt } = await asUser.action(api.takeoffAuth.createCode, {
      challenge: RFC_CHALLENGE,
      device: "PC-ROD",
    });
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(expiresAt).toBeGreaterThanOrEqual(before + TAKEOFF_AUTH_CODE_TTL_MS);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + TAKEOFF_AUTH_CODE_TTL_MS);

    const rows = await t.run((ctx) => ctx.db.query("takeoffAuthCodes").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).toBe(await hashAuthCode(code));
    expect(rows[0]!.codeChallenge).toBe(RFC_CHALLENGE);
    expect(rows[0]!.device).toBe("PC-ROD");
    expect(JSON.stringify(rows)).not.toContain(code);
  });

  test("exige login, desafio válido e role interna", async () => {
    const t = setup();
    await expect(
      t.action(api.takeoffAuth.createCode, { challenge: RFC_CHALLENGE, device: "PC" })
    ).rejects.toThrow("Not authenticated");

    const { asUser } = await signIn();
    await expect(
      asUser.action(api.takeoffAuth.createCode, { challenge: "abc", device: "PC" })
    ).rejects.toThrow("Desafio PKCE inválido");

    const qr = setup();
    const asQr = await withUser(qr, { clerkId: "qr_1", role: "qr_operator" });
    await expect(
      asQr.action(api.takeoffAuth.createCode, { challenge: RFC_CHALLENGE, device: "PC" })
    ).rejects.toThrow("Insufficient permissions");
  });

  test("um token de agente não emite códigos", async () => {
    const { t } = await signIn();
    const asToken = t.withIdentity({
      subject: "eng_1",
      "agent_token.id": "x",
      "agent_token.permission": "full_access",
    } as never);
    await expect(
      asToken.action(api.takeoffAuth.createCode, { challenge: RFC_CHALLENGE, device: "PC" })
    ).rejects.toThrow(/Tokens de agente não podem/);
  });
});

describe("POST /takeoff/auth/exchange", () => {
  test("troca código + verificador por token de dispositivo e JWT", async () => {
    const { t, asUser } = await signIn();
    const { code } = await asUser.action(api.takeoffAuth.createCode, {
      challenge: RFC_CHALLENGE,
      device: "PC-ROD",
    });
    const res = await exchange(t, { code, verifier: RFC_VERIFIER });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^rlp_/);
    expect(body.user).toEqual({ name: "Eng. Ana", email: "ana@rlpeng.com.br" });
    expect(body.jwtExpiresAt).toBeGreaterThan(Date.now());
    const claims = decodeJwtPayload(body.jwt);
    expect(claims.sub).toBe("eng_1");
    expect(claims.iss).toBe(SITE_URL);
    expect(claims.agent_token).toMatchObject({ permission: "full_access" });

    // aparece (e é revogável) na página Agentes, marcado como dispositivo
    const tokens = await asUser.query(api.agentTokens.list, {});
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      name: "Takeoff · PC-ROD",
      kind: "device",
      permission: "full_access",
      tokenPrefix: body.tokenPrefix,
    });
    expect(await t.run((ctx) => ctx.db.query("takeoffAuthCodes").collect())).toHaveLength(0);

    // o token renova o JWT pela API como qualquer token de agente
    const refreshed = await t.fetch("/api/v1/auth/token", {
      method: "POST",
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(refreshed.status).toBe(200);
    expect(decodeJwtPayload((await refreshed.json()).token).sub).toBe("eng_1");
  });

  test("o código vale uma vez só", async () => {
    const { t, asUser } = await signIn();
    const { code } = await asUser.action(api.takeoffAuth.createCode, {
      challenge: RFC_CHALLENGE,
      device: "PC",
    });
    expect((await exchange(t, { code, verifier: RFC_VERIFIER })).status).toBe(200);
    const again = await exchange(t, { code, verifier: RFC_VERIFIER });
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ error: "invalid_grant" });
  });

  test("verificador errado é recusado e queima o código", async () => {
    const { t, asUser } = await signIn();
    const { code } = await asUser.action(api.takeoffAuth.createCode, {
      challenge: RFC_CHALLENGE,
      device: "PC",
    });
    const wrong = await exchange(t, { code, verifier: "b".repeat(43) });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ error: "invalid_grant" });
    // nem o verificador certo salva o código depois disso
    expect((await exchange(t, { code, verifier: RFC_VERIFIER })).status).toBe(400);
    expect(await asUser.query(api.agentTokens.list, {})).toHaveLength(0);
  });

  test("código vencido é recusado", async () => {
    const { t, asUser } = await signIn();
    const { code } = await asUser.action(api.takeoffAuth.createCode, {
      challenge: RFC_CHALLENGE,
      device: "PC",
    });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("takeoffAuthCodes").first();
      await ctx.db.patch("takeoffAuthCodes", row!._id, { expiresAt: Date.now() - 1 });
    });
    const res = await exchange(t, { code, verifier: RFC_VERIFIER });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "invalid_grant",
      message: expect.stringContaining("expirou"),
    });
    expect(await asUser.query(api.agentTokens.list, {})).toHaveLength(0);
  });

  test("corpo malformado e código desconhecido", async () => {
    const { t } = await signIn();
    expect((await exchange(t, { code: "x", verifier: RFC_VERIFIER })).status).toBe(400);
    expect((await exchange(t, { code: "a".repeat(43) })).status).toBe(400);
    const unknown = await exchange(t, { code: "a".repeat(43), verifier: RFC_VERIFIER });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ error: "invalid_grant" });
  });

  test("entrar de novo no mesmo computador revoga o token anterior dele", async () => {
    const { t, asUser } = await signIn();
    for (const device of ["PC-ROD", "PC-ROD", "NOTE"]) {
      const { code } = await asUser.action(api.takeoffAuth.createCode, {
        challenge: RFC_CHALLENGE,
        device,
      });
      expect((await exchange(t, { code, verifier: RFC_VERIFIER })).status).toBe(200);
    }
    const tokens = await asUser.query(api.agentTokens.list, {});
    const active = tokens.filter((tk) => tk.revokedAt === undefined).map((tk) => tk.name);
    expect(active.sort()).toEqual(["Takeoff · NOTE", "Takeoff · PC-ROD"]);
    expect(tokens).toHaveLength(3);
  });
});

describe("POST /takeoff/auth/revoke", () => {
  test("o token do dispositivo se revoga; tokens de agente não", async () => {
    const { t, asUser } = await signIn();
    const { code } = await asUser.action(api.takeoffAuth.createCode, {
      challenge: RFC_CHALLENGE,
      device: "PC",
    });
    const { token } = await (await exchange(t, { code, verifier: RFC_VERIFIER })).json();
    const agent = await asUser.action(api.agentTokens.create, {
      name: "Script",
      permission: "read_only",
    });

    const revokeWith = (bearer: string) =>
      t.fetch("/takeoff/auth/revoke", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
      });
    expect(await (await revokeWith(agent.token)).json()).toEqual({ revoked: false });
    expect(await (await revokeWith(token)).json()).toEqual({ revoked: true });
    expect((await revokeWith("nada")).status).toBe(401);

    const tokens = await asUser.query(api.agentTokens.list, {});
    expect(tokens.find((tk) => tk.kind === "device")?.revokedAt).toBeDefined();
    expect(tokens.find((tk) => tk.name === "Script")?.revokedAt).toBeUndefined();

    const refresh = await t.fetch("/api/v1/auth/token", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(refresh.status).toBe(401);
  });
});

describe("catálogo e propostas como o usuário logado", () => {
  test("takeoffCatalog.current segue a permissão do usuário", async () => {
    const { asUser } = await signIn();
    const catalog = await asUser.query(api.takeoffCatalog.current, {});
    expect(catalog.items).toEqual([]);
    expect(catalog.generatedAt).toBeGreaterThan(0);

    const other = setup();
    const asOperator = await withUser(other, { clerkId: "op_1", role: "operator" });
    await expect(asOperator.query(api.takeoffCatalog.current, {})).rejects.toThrow(
      /engenharia ou compras/
    );
  });

  test("proposeAsUser grava o usuário como solicitante e usa as dimensões", async () => {
    const { t, asUser } = await signIn();
    const result = await asUser.mutation(api.takeoffMaterials.proposeAsUser, {
      clientId: "c-1",
      name: "Grelha de insuflamento",
      unit: "pç",
      dimensions: { widthMm: 400, heightMm: 200 },
      unitPrice: 120,
    });
    expect(result.outcome).toBe("created");
    const again = await asUser.mutation(api.takeoffMaterials.proposeAsUser, {
      clientId: "c-2",
      name: "Grelha de insuflamento",
      unit: "pç",
      variantLabel: "400 × 200 mm",
      dimensions: { widthMm: 400, heightMm: 200 },
    });
    expect(again).toMatchObject({ outcome: "matched", materialId: result.materialId });

    const proposal = await t.run((ctx) =>
      ctx.db
        .query("takeoffMaterialProposals")
        .withIndex("by_client_id", (q) => q.eq("clientId", "c-1"))
        .unique()
    );
    expect(proposal?.requestedBy).toBe("Eng. Ana");
    expect(proposal?.requestedByUserId).toBeDefined();
    const material = await t.run((ctx) => ctx.db.get("materials", result.materialId));
    expect(material?.dimensions).toEqual({ widthMm: 400, heightMm: 200 });
  });

  test("proposta inválida ou material inexistente viram ConvexError com código", async () => {
    const { asUser } = await signIn();
    await expect(
      asUser.mutation(api.takeoffMaterials.proposeAsUser, { clientId: "c-1" })
    ).rejects.toMatchObject({ data: { code: "INVALID_PROPOSAL" } });
    await expect(
      asUser.mutation(api.takeoffMaterials.proposeAsUser, {
        clientId: "c-2",
        materialId: "nao-existe",
      })
    ).rejects.toMatchObject({ data: { code: "MATERIAL_NOT_FOUND" } });
  });

  test("só engenharia ou compras propõem", async () => {
    const t = setup();
    const asOperator = await withUser(t, { clerkId: "op_1", role: "operator" });
    await expect(
      asOperator.mutation(api.takeoffMaterials.proposeAsUser, { clientId: "c", name: "X" })
    ).rejects.toThrow(/engenharia ou compras/);
  });
});
