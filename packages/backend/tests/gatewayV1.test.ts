import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { normalizeFunctionPath } from "../convex/gateway/v1";
import { suggestPaths, validateArgs, type IdCheck } from "../convex/gateway/validate";
import { setup, withUser } from "./helpers";

/**
 * Testes da API HTTP `/api/v1`. O roteador roda de verdade (`t.fetch`); só a
 * chamada ao deployment (`fetch` global para `CONVEX_CLOUD_URL/api/...`) é
 * substituída, pois não há deployment nos testes.
 */

type UpstreamCall = { url: string; init: RequestInit };

const SITE_URL = "https://some.convex.site";
const CLOUD_URL = "https://some.convex.cloud";

async function generatePrivateJwk(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return JSON.stringify({
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    d: jwk.d,
    kid: "test-key",
  });
}

beforeAll(async () => {
  process.env.CONVEX_SITE_URL = SITE_URL;
  process.env.CONVEX_CLOUD_URL = CLOUD_URL;
  process.env.API_JWT_PRIVATE_KEY = await generatePrivateJwk();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Substitui o `fetch` global pela resposta dada e devolve as chamadas feitas. */
function stubUpstream(body: unknown, status = 200): UpstreamCall[] {
  const calls: UpstreamCall[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  return calls;
}

async function createToken(
  t: ReturnType<typeof setup>,
  user: { clerkId: string; role?: string; department?: string; email?: string },
  permission: "full_access" | "read_only" = "full_access"
) {
  const asUser = await withUser(t, {
    clerkId: user.clerkId,
    role: (user.role ?? "engenheiro") as never,
    department: user.department as never,
    email: user.email,
  });
  const created = await asUser.action(api.agentTokens.create, {
    name: "Grok",
    permission,
  });
  return { asUser, created, bearer: { Authorization: `Bearer ${created.token}` } };
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  );
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(payload!)));
}

async function verifyJwtWithJwks(
  token: string,
  jwks: { keys: Array<JsonWebKey & { kid: string }> }
): Promise<boolean> {
  const [header, payload, signature] = token.split(".");
  const { kid } = JSON.parse(new TextDecoder().decode(base64UrlDecode(header!)));
  const jwk = jwks.keys.find((key) => key.kid === kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    base64UrlDecode(signature!),
    new TextEncoder().encode(`${header}.${payload}`)
  );
}

describe("API HTTP /api/v1", () => {
  test("índice e JWKS são públicos; JWKS não expõe a chave privada", async () => {
    const t = setup();
    const index = await t.fetch("/api/v1");
    expect(index.status).toBe(200);
    const body = await index.json();
    expect(body.endpoints).toHaveProperty("GET /api/v1/functions");

    const jwks = await t.fetch("/.well-known/jwks.json");
    expect(jwks.status).toBe(200);
    const keys = await jwks.json();
    expect(keys.keys).toHaveLength(1);
    expect(keys.keys[0]).toMatchObject({
      kty: "EC",
      crv: "P-256",
      alg: "ES256",
      use: "sig",
      kid: "test-key",
    });
    expect(keys.keys[0]).not.toHaveProperty("d");
  });

  test("rotas autenticadas exigem um token de agente válido", async () => {
    const t = setup();
    const missing = await t.fetch("/api/v1/me");
    expect(missing.status).toBe(401);
    expect(missing.headers.get("WWW-Authenticate")).toContain("Bearer");
    expect((await missing.json()).error.code).toBe("UNAUTHENTICATED");

    const notAToken = await t.fetch("/api/v1/me", {
      headers: { Authorization: "Bearer eyJhbGciOi.fake.jwt" },
    });
    expect(notAToken.status).toBe(401);
    expect((await notAToken.json()).error.message).toContain("rlp_");

    const unknown = await t.fetch("/api/v1/me", {
      headers: { Authorization: "Bearer rlp_ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ" },
    });
    expect(unknown.status).toBe(401);
    expect((await unknown.json()).error).toMatchObject({
      code: "UNAUTHENTICATED",
      details: { tokenPrefix: "rlp_ZZZZZZZZ" },
    });
  });

  test("/me descreve o dono e o token; revogar corta o acesso na hora", async () => {
    const t = setup();
    const { asUser, created, bearer } = await createToken(t, {
      clerkId: "eng1",
      email: "eng@rlp.test",
    });

    const me = await t.fetch("/api/v1/me", { headers: bearer });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      user: { email: "eng@rlp.test", role: "engenheiro" },
      agent_token: {
        id: created.id,
        name: "Grok",
        token_prefix: created.tokenPrefix,
        permission: "full_access",
        expires_at: null,
      },
    });

    await asUser.mutation(api.agentTokens.revoke, { id: created.id });
    const after = await t.fetch("/api/v1/me", { headers: bearer });
    expect(after.status).toBe(401);
  });

  test("/auth/token emite um JWT ES256 verificável pelo JWKS com as claims do token", async () => {
    const t = setup();
    const { created, bearer } = await createToken(
      t,
      { clerkId: "eng1", email: "eng@rlp.test" },
      "read_only"
    );

    const response = await t.fetch("/api/v1/auth/token", {
      method: "POST",
      headers: bearer,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      token_type: "Bearer",
      issuer: SITE_URL,
      deployment_url: CLOUD_URL,
      agent_token: { id: created.id, permission: "read_only" },
    });
    expect(body.expires_in).toBeGreaterThan(3500);
    expect(body.expires_in).toBeLessThanOrEqual(3600);

    const payload = decodeJwtPayload(body.token);
    expect(payload).toMatchObject({
      iss: SITE_URL,
      aud: "convex",
      sub: "eng1",
      email: "eng@rlp.test",
      agent_token: { id: created.id, permission: "read_only" },
    });

    const jwks = await (await t.fetch("/.well-known/jwks.json")).json();
    expect(await verifyJwtWithJwks(body.token, jwks)).toBe(true);
  });

  test("/functions lista o catálogo com acesso avaliado para o dono e para o token", async () => {
    const t = setup();
    const { bearer } = await createToken(t, { clerkId: "eng1" }, "read_only");

    const response = await t.fetch("/api/v1/functions", { headers: bearer });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBeGreaterThan(100);
    expect(body.modules).toContain("suppliers");
    expect(body.modules).not.toContain("agentTokens");
    expect(body.agent_token).toEqual({ permission: "read_only" });

    const byPath = new Map<string, Record<string, unknown>>(
      body.functions.map((fn: { path: string }) => [fn.path, fn])
    );
    expect(byPath.get("projects:list")).toMatchObject({
      type: "query",
      access: { kind: "permission", permission: "engenharia.read" },
      allowed: true,
      allowedForToken: true,
      signature: "{ includeArchived?: boolean }",
      args: [{ name: "includeArchived", required: false, type: "boolean" }],
    });
    expect(byPath.get("projects:list")).not.toHaveProperty("argsValidator");
    // Dono pode, mas o token é somente leitura.
    expect(byPath.get("customers:create")).toMatchObject({
      type: "mutation",
      allowed: true,
      allowedForToken: false,
    });
    // Engenheiro não acessa RH.
    expect(byPath.get("employees:list")).toMatchObject({
      allowed: false,
      allowedForToken: false,
    });
    expect(byPath.has("agentTokens:list")).toBe(false);

    const filtered = await (
      await t.fetch("/api/v1/functions?module=suppliers&type=mutation&allowed=true", {
        headers: bearer,
      })
    ).json();
    expect(filtered.count).toBe(0);

    const search = await (
      await t.fetch("/api/v1/functions?search=supplier&type=query", { headers: bearer })
    ).json();
    expect(search.count).toBeGreaterThan(0);
    for (const fn of search.functions) {
      expect(fn.type).toBe("query");
      expect(fn.path.toLowerCase()).toContain("supplier");
    }

    const badType = await t.fetch("/api/v1/functions?type=nope", { headers: bearer });
    expect(badType.status).toBe(400);
  });

  test("query bem-sucedida é repassada ao deployment com JWT e registrada", async () => {
    const t = setup();
    const { asUser, created, bearer } = await createToken(t, { clerkId: "eng1" });
    const calls = stubUpstream({ status: "success", value: [{ name: "Obra A" }] });

    const response = await t.fetch("/api/v1/query", {
      method: "POST",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ path: "projects.list", args: { includeArchived: true } }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ name: "Obra A" }] });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${CLOUD_URL}/api/query`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      path: "projects:list",
      args: { includeArchived: true },
      format: "json",
    });
    const authHeader = (calls[0]!.init.headers as Record<string, string>).Authorization;
    const payload = decodeJwtPayload(authHeader.replace(/^Bearer /, ""));
    expect(payload).toMatchObject({
      sub: "eng1",
      agent_token: { id: created.id, permission: "full_access" },
    });

    // GET com args na query string também funciona.
    const viaGet = await t.fetch(
      `/api/v1/query?path=projects:list&args=${encodeURIComponent("{}")}`,
      { headers: bearer }
    );
    expect(viaGet.status).toBe(200);

    const recorded = await asUser.query(api.agentTokens.listMyCalls, {});
    expect(recorded.length).toBeGreaterThanOrEqual(2);
    expect(recorded[0]).toMatchObject({
      tool: "api:query",
      functionPath: "projects:list",
      outcome: "success",
    });
  });

  test("/run executa mutations em nome do dono e /mutation recusa queries", async () => {
    const t = setup();
    const { bearer } = await createToken(t, { clerkId: "eng1" });
    const calls = stubUpstream({ status: "success", value: "k123" });

    const run = await t.fetch("/api/v1/run/customers:create", {
      method: "POST",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ args: { name: "Cliente X" } }),
    });
    expect(run.status).toBe(200);
    expect(calls[0]!.url).toBe(`${CLOUD_URL}/api/run/customers/create`);

    const wrongKind = await t.fetch("/api/v1/mutation", {
      method: "POST",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ path: "projects:list" }),
    });
    expect(wrongKind.status).toBe(400);
    expect((await wrongKind.json()).error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { type: "query", endpoint: "/api/v1/query" },
    });
    expect(calls).toHaveLength(1);
  });

  test("preflight responde NOT_FOUND com sugestões, FORBIDDEN e VALIDATION_ERROR sem chamar o deployment", async () => {
    const t = setup();
    const { bearer } = await createToken(t, { clerkId: "eng1" });
    const calls = stubUpstream({ status: "success", value: null });
    const post = (path: string, args: unknown = {}) =>
      t.fetch("/api/v1/query", {
        method: "POST",
        headers: { ...bearer, "Content-Type": "application/json" },
        body: JSON.stringify({ path, args }),
      });

    const typo = await post("projects:lits");
    expect(typo.status).toBe(404);
    const typoBody = await typo.json();
    expect(typoBody.error.code).toBe("NOT_FOUND");
    expect(typoBody.error.details.suggestions).toContain("projects:list");

    const unknownModule = await post("foo:bar");
    expect(unknownModule.status).toBe(404);
    expect((await unknownModule.json()).error.message).toContain("GET /api/v1/functions");

    // Engenheiro não tem rh.read.
    const forbidden = await post("employees:list");
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error).toMatchObject({
      code: "FORBIDDEN",
      details: { access: { kind: "permission", permission: "rh.read" }, role: "engenheiro" },
    });

    const badArg = await post("projects:list", { includeArchived: "yes" });
    expect(badArg.status).toBe(400);
    expect((await badArg.json()).error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { field: "includeArchived", expected: "boolean", received: '"yes"' },
    });

    const extra = await post("projects:list", { nope: 1 });
    expect((await extra.json()).error.message).toContain("extra field `nope`");

    // ID de outra tabela é detectado antes do deployment.
    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", {
        name: "C",
        nameNormalized: "c",
        active: true,
        createdAt: Date.now(),
      })
    );
    const wrongTable = await post("projects:getOverview", { projectId: customerId });
    expect(wrongTable.status).toBe(400);
    expect((await wrongTable.json()).error.message).toContain("table `customers`");

    // Nenhuma das chamadas acima chegou ao deployment.
    expect(calls).toHaveLength(0);

    // Módulo bloqueado: tokens não gerenciam tokens.
    const tokens = await post("agentTokens:list");
    expect(tokens.status).toBe(403);
    expect((await tokens.json()).error.message).toContain("/conta/agentes");
  });

  test("token somente leitura não executa mutation/action, nem via /run", async () => {
    const t = setup();
    const { bearer } = await createToken(t, { clerkId: "eng1" }, "read_only");
    const calls = stubUpstream({ status: "success", value: null });

    const mutation = await t.fetch("/api/v1/mutation", {
      method: "POST",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ path: "customers:create", args: { name: "X" } }),
    });
    expect(mutation.status).toBe(403);
    expect((await mutation.json()).error.code).toBe("UNAUTHORIZED");

    const run = await t.fetch("/api/v1/run/customers:create", {
      method: "POST",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ args: { name: "X" } }),
    });
    expect(run.status).toBe(403);
    expect(calls).toHaveLength(0);

    const query = await t.fetch("/api/v1/run/projects:list", { headers: bearer });
    expect(query.status).toBe(200);
    // Para read_only, /run é forçado pelo endpoint de query do deployment.
    expect(calls[0]!.url).toBe(`${CLOUD_URL}/api/query`);
  });

  test("erros do deployment viram códigos documentados", async () => {
    const t = setup();
    const { asUser, bearer } = await createToken(t, { clerkId: "eng1" });
    const call = () =>
      t.fetch("/api/v1/query", {
        method: "POST",
        headers: { ...bearer, "Content-Type": "application/json" },
        body: JSON.stringify({ path: "projects:list" }),
      });

    stubUpstream({
      status: "error",
      errorMessage: "Uncaught Error: Acesso restrito à área de engenharia\n    at handler",
    });
    const denied = await call();
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toMatchObject({
      code: "FORBIDDEN",
      message: "Acesso restrito à área de engenharia",
    });

    stubUpstream({
      status: "error",
      errorMessage: "Uncaught Error: Obra não encontrada\n    at handler",
    });
    expect((await (await call()).json()).error.code).toBe("NOT_FOUND");

    stubUpstream({
      status: "error",
      errorMessage: "[Request ID: abc123] Server Error",
    });
    const redacted = await call();
    expect(redacted.status).toBe(400);
    expect((await redacted.json()).error).toMatchObject({
      code: "FUNCTION_ERROR",
      details: { requestId: "abc123", redacted: true },
    });

    stubUpstream({
      status: "error",
      errorMessage: "Uncaught ConvexError: x",
      errorData: { code: "CONFLICT", message: "Já existe", extra: 1 },
    });
    const conflict = await call();
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error).toMatchObject({
      code: "CONFLICT",
      message: "Já existe",
      details: { function: "projects:list", extra: 1 },
    });

    const recorded = await asUser.query(api.agentTokens.listMyCalls, {});
    expect(recorded[0]).toMatchObject({ outcome: "error", functionPath: "projects:list" });
    expect(recorded[0]!.errorMessage).toContain("CONFLICT");
  });

  test("sem API_JWT_PRIVATE_KEY a API responde NOT_CONFIGURED", async () => {
    const saved = process.env.API_JWT_PRIVATE_KEY;
    delete process.env.API_JWT_PRIVATE_KEY;
    try {
      const t = setup();
      const { bearer } = await createToken(t, { clerkId: "eng1" });
      const jwks = await t.fetch("/.well-known/jwks.json");
      expect(jwks.status).toBe(503);
      const token = await t.fetch("/api/v1/auth/token", { method: "POST", headers: bearer });
      expect(token.status).toBe(503);
      expect((await token.json()).error.code).toBe("NOT_CONFIGURED");
      // /me e /functions continuam funcionando: não precisam assinar nada.
      expect((await t.fetch("/api/v1/me", { headers: bearer })).status).toBe(200);
    } finally {
      process.env.API_JWT_PRIVATE_KEY = saved;
    }
  });
});

describe("normalizeFunctionPath", () => {
  test("aceita módulo:função, módulo.função e módulo/função", () => {
    expect(normalizeFunctionPath("projects:list")).toBe("projects:list");
    expect(normalizeFunctionPath("projects.list")).toBe("projects:list");
    expect(normalizeFunctionPath("/projects/list/")).toBe("projects:list");
    expect(() => normalizeFunctionPath("projects")).toThrow(/Invalid function path/);
    expect(() => normalizeFunctionPath("pro jects:list")).toThrow(/Invalid function path/);
  });
});

describe("validateArgs", () => {
  test("espelha as regras do Convex e coleta IDs para conferência", () => {
    const validator = {
      type: "object" as const,
      value: {
        id: { fieldType: { type: "id" as const, tableName: "projects" }, optional: false },
        status: {
          fieldType: {
            type: "union" as const,
            value: [
              { type: "literal" as const, value: "a" },
              { type: "literal" as const, value: "b" },
            ],
          },
          optional: true,
        },
        tags: {
          fieldType: { type: "array" as const, value: { type: "string" as const } },
          optional: true,
        },
      },
    };
    const ids: IdCheck[] = [];
    expect(validateArgs(validator, { id: "abc", status: "a", tags: ["x"] }, ids)).toBeNull();
    expect(ids).toEqual([{ field: "id", tables: ["projects"], value: "abc" }]);

    expect(validateArgs(validator, {})).toMatchObject({
      field: "id",
      message: "Object is missing the required field `id`.",
    });
    expect(validateArgs(validator, { id: "abc", status: "c" })).toMatchObject({
      field: "status",
      expected: '"a" | "b"',
      received: '"c"',
    });
    expect(validateArgs(validator, { id: "abc", tags: ["x", 2] })).toMatchObject({
      field: "tags[1]",
      expected: "string",
    });
    expect(validateArgs(validator, { id: "abc", extra: true })).toMatchObject({
      field: "extra",
    });
    expect(validateArgs(validator, [])).toMatchObject({ expected: expect.stringContaining("{") });
  });

  test("suggestPaths encontra typos e módulo errado", () => {
    const paths = ["projects:list", "projects:create", "suppliers:list", "customers:list"];
    expect(suggestPaths("projects:lits", paths)).toEqual(["projects:list"]);
    expect(suggestPaths("supplier:list", paths)[0]).toBe("suppliers:list");
    expect(suggestPaths("zzz:yyy", paths)).toEqual([]);
  });
});
