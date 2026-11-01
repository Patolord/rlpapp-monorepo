import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  AGENT_TOKEN_CANNOT_MANAGE_TOKENS_MESSAGE,
  READ_ONLY_AGENT_TOKEN_MESSAGE,
  REVOKED_AGENT_TOKEN_MESSAGE,
  hashAgentToken,
} from "../convex/lib/agentTokens";
import { setup, withUser } from "./helpers";

/** Identidade como o JWT de delegação do MCP a apresenta ao Convex. */
function agentIdentity(
  clerkId: string,
  tokenId: Id<"agentTokens">,
  permission: "full_access" | "read_only"
) {
  return {
    subject: clerkId,
    "agent_token.id": tokenId,
    "agent_token.permission": permission,
  };
}

describe("tokens de agente", () => {
  test("staff cria um token e vê só prefixo e metadados", async () => {
    const t = setup();
    const asEng = await withUser(t, { clerkId: "eng1", role: "engenheiro" });

    const created = await asEng.action(api.agentTokens.create, {
      name: "  Claude  ",
      permission: "full_access",
      expiresInDays: 30,
    });
    expect(created.token).toMatch(/^rlp_[A-Za-z0-9_-]{43}$/);
    expect(created.tokenPrefix).toBe(created.token.slice(0, 12));
    expect(created.name).toBe("Claude");
    expect(created.expiresAt).toBeGreaterThan(Date.now());

    const listed = await asEng.query(api.agentTokens.list, {});
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      _id: created.id,
      name: "Claude",
      tokenPrefix: created.tokenPrefix,
      permission: "full_access",
    });
    expect(JSON.stringify(listed)).not.toContain(created.token);
    expect(listed[0]).not.toHaveProperty("tokenHash");
    expect(listed[0]).not.toHaveProperty("userId");
  });

  test("qr_operator e usuário sem clerkId não criam tokens", async () => {
    const t = setup();
    const asQr = await withUser(t, { clerkId: "qr1", role: "qr_operator" });
    await expect(
      asQr.action(api.agentTokens.create, {
        name: "x",
        permission: "read_only",
      })
    ).rejects.toThrow("Insufficient permissions");

    await expect(
      t.action(api.agentTokens.create, { name: "x", permission: "read_only" })
    ).rejects.toThrow("Not authenticated");
  });

  test("verify resolve o hash ao dono e nega revogado/expirado/inativo", async () => {
    const t = setup();
    const asEng = await withUser(t, {
      clerkId: "eng1",
      role: "engenheiro",
      email: "eng@rlp.test",
    });
    const created = await asEng.action(api.agentTokens.create, {
      name: "Cursor",
      permission: "read_only",
    });
    const tokenHash = await hashAgentToken(created.token);

    const verified = await t.query(internal.agentTokens.verify, {
      tokenHash,
      now: Date.now(),
    });
    expect(verified).toMatchObject({
      token: { _id: created.id, permission: "read_only", expiresAt: null },
      user: { clerkId: "eng1", role: "engenheiro", email: "eng@rlp.test" },
    });

    expect(
      await t.query(internal.agentTokens.verify, {
        tokenHash: await hashAgentToken("rlp_nao_existe"),
        now: Date.now(),
      })
    ).toBeNull();

    await asEng.mutation(api.agentTokens.revoke, { id: created.id });
    expect(
      await t.query(internal.agentTokens.verify, { tokenHash, now: Date.now() })
    ).toBeNull();

    const expiring = await asEng.action(api.agentTokens.create, {
      name: "curto",
      permission: "read_only",
      expiresInDays: 1,
    });
    const expiringHash = await hashAgentToken(expiring.token);
    expect(
      await t.query(internal.agentTokens.verify, {
        tokenHash: expiringHash,
        now: Date.now() + 2 * 24 * 60 * 60 * 1000,
      })
    ).toBeNull();

    // Dono desativado: token para de valer sem precisar revogar.
    await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", "eng1"))
        .unique();
      await ctx.db.patch("users", user!._id, { isActive: false });
    });
    expect(
      await t.query(internal.agentTokens.verify, {
        tokenHash: expiringHash,
        now: Date.now(),
      })
    ).toBeNull();
  });

  test("endpoint HTTP /agent-tokens/verify", async () => {
    const t = setup();
    const asEng = await withUser(t, { clerkId: "eng1", role: "engenheiro" });
    const created = await asEng.action(api.agentTokens.create, {
      name: "HTTP",
      permission: "full_access",
    });

    const missing = await t.fetch("/agent-tokens/verify", { method: "POST" });
    expect(missing.status).toBe(401);
    expect(missing.headers.get("WWW-Authenticate")).toContain("Bearer");

    const wrong = await t.fetch("/agent-tokens/verify", {
      method: "POST",
      headers: { Authorization: "Bearer rlp_tokeninvalidoinvalidoinvalido" },
    });
    expect(wrong.status).toBe(401);

    const ok = await t.fetch("/agent-tokens/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${created.token}` },
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body).toMatchObject({
      token: { _id: created.id, name: "HTTP", permission: "full_access" },
      user: { clerkId: "eng1", role: "engenheiro" },
    });

    const listed = await asEng.query(api.agentTokens.list, {});
    expect(listed[0]?.lastUsedAt).toBeTypeOf("number");
  });

  test("política central: somente-leitura não grava e revogado não lê", async () => {
    const t = setup();
    const asEng = await withUser(t, { clerkId: "eng1", role: "engenheiro" });
    const readOnly = await asEng.action(api.agentTokens.create, {
      name: "leitura",
      permission: "read_only",
    });
    const full = await asEng.action(api.agentTokens.create, {
      name: "total",
      permission: "full_access",
    });

    const asReadOnly = t.withIdentity(
      agentIdentity("eng1", readOnly.id, "read_only")
    );
    // Queries passam normalmente, com a role do dono.
    expect(await asReadOnly.query(api.projects.list, {})).toEqual([]);
    expect(await asReadOnly.query(api.users.getCurrentUser, {})).toMatchObject({
      clerkId: "eng1",
    });
    // Qualquer mutation é recusada antes de rodar.
    await expect(
      asReadOnly.mutation(api.customers.create, { name: "Cliente" })
    ).rejects.toThrow(READ_ONLY_AGENT_TOKEN_MESSAGE);

    const asFull = t.withIdentity(agentIdentity("eng1", full.id, "full_access"));
    const customerId = await asFull.mutation(api.customers.create, {
      name: "Cliente",
    });
    expect(customerId).toBeTruthy();

    // Nenhum token gerencia tokens: um token vazado não se perpetua criando
    // outro, nem revoga/renomeia os demais.
    for (const agent of [asReadOnly, asFull]) {
      await expect(
        agent.action(api.agentTokens.create, {
          name: "escalada",
          permission: "full_access",
        })
      ).rejects.toThrow(AGENT_TOKEN_CANNOT_MANAGE_TOKENS_MESSAGE);
    }
    await expect(
      asFull.mutation(api.agentTokens.rename, { id: readOnly.id, name: "x" })
    ).rejects.toThrow(AGENT_TOKEN_CANNOT_MANAGE_TOKENS_MESSAGE);
    await expect(
      asFull.mutation(api.agentTokens.revoke, { id: readOnly.id })
    ).rejects.toThrow(AGENT_TOKEN_CANNOT_MANAGE_TOKENS_MESSAGE);
    // Para o token somente-leitura a política de escrita recusa antes.
    await expect(
      asReadOnly.mutation(api.agentTokens.revoke, { id: readOnly.id })
    ).rejects.toThrow(READ_ONLY_AGENT_TOKEN_MESSAGE);
    // Mas listam os próprios tokens e chamadas normalmente.
    expect(await asFull.query(api.agentTokens.list, {})).toHaveLength(2);
    // A role do dono continua valendo: engenheiro não acessa RH.
    await expect(asFull.query(api.employees.list, {})).rejects.toThrow(
      "Acesso restrito à área de recursos humanos"
    );

    // A claim diz full_access, mas o banco manda: permissão gravada prevalece.
    await t.run(async (ctx) => {
      await ctx.db.patch("agentTokens", full.id, { permission: "read_only" });
    });
    await expect(
      asFull.mutation(api.customers.create, { name: "Outro" })
    ).rejects.toThrow(READ_ONLY_AGENT_TOKEN_MESSAGE);

    await asEng.mutation(api.agentTokens.revoke, { id: readOnly.id });
    await expect(asReadOnly.query(api.projects.list, {})).rejects.toThrow(
      REVOKED_AGENT_TOKEN_MESSAGE
    );
    await expect(
      asReadOnly.query(api.users.getCurrentUser, {})
    ).rejects.toThrow(REVOKED_AGENT_TOKEN_MESSAGE);
  });

  test("recordCall só aceita identidades com token e atribui ao token da claim", async () => {
    const t = setup();
    const asEng = await withUser(t, { clerkId: "eng1", role: "engenheiro" });
    const created = await asEng.action(api.agentTokens.create, {
      name: "leitura",
      permission: "read_only",
    });

    await expect(
      asEng.mutation(api.agentTokens.recordCall, {
        tool: "list_projects",
        outcome: "success",
        durationMs: 10,
      })
    ).rejects.toThrow("Somente conexões com token de agente");

    const asAgent = t.withIdentity(
      agentIdentity("eng1", created.id, "read_only")
    );
    await asAgent.mutation(api.agentTokens.recordCall, {
      tool: "list_projects",
      functionPath: "projects:list",
      outcome: "success",
      durationMs: 12.6,
    });
    await asAgent.mutation(api.agentTokens.recordCall, {
      tool: "call_function",
      functionPath: "customers:create",
      outcome: "error",
      errorMessage: READ_ONLY_AGENT_TOKEN_MESSAGE,
      durationMs: 3,
    });

    const calls = await asEng.query(api.agentTokens.listMyCalls, {});
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      tokenId: created.id,
      tokenName: "leitura",
      tool: "call_function",
      outcome: "error",
    });
    expect(calls[1]).toMatchObject({
      tool: "list_projects",
      functionPath: "projects:list",
      durationMs: 13,
    });
  });

  test("dono e administradores gerenciam; outros não", async () => {
    const t = setup();
    const asEng = await withUser(t, { clerkId: "eng1", role: "engenheiro" });
    const asOther = await withUser(t, {
      clerkId: "eng2",
      role: "operator",
      department: "engenharia",
    });
    const asAdmin = await withUser(t, { clerkId: "adm", role: "admin" });
    const created = await asEng.action(api.agentTokens.create, {
      name: "meu",
      permission: "full_access",
    });

    await expect(
      asOther.mutation(api.agentTokens.rename, { id: created.id, name: "x" })
    ).rejects.toThrow("próprios tokens");
    await expect(
      asOther.query(api.agentTokens.listAll, {})
    ).rejects.toThrow("Insufficient permissions");

    const renamed = await asEng.mutation(api.agentTokens.rename, {
      id: created.id,
      name: "renomeado",
    });
    expect(renamed.name).toBe("renomeado");

    const all = await asAdmin.query(api.agentTokens.listAll, {});
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      name: "renomeado",
      owner: { role: "engenheiro" },
    });

    const revoked = await asAdmin.mutation(api.agentTokens.revoke, {
      id: created.id,
    });
    expect(revoked.revokedAt).toBeTypeOf("number");
  });

  test("limite de tokens ativos e revokeAllForUser percorrem todas as linhas", async () => {
    const t = setup();
    const asEng = await withUser(t, { clerkId: "eng1", role: "engenheiro" });
    const asAdmin = await withUser(t, { clerkId: "adm", role: "admin" });
    const userId = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", "eng1"))
        .unique();
      // 120 tokens revogados antigos: mais do que qualquer janela fixa.
      for (let i = 0; i < 120; i++) {
        await ctx.db.insert("agentTokens", {
          userId: user!._id,
          name: `antigo ${i}`,
          tokenHash: `hash-${i}`,
          tokenPrefix: "rlp_antigo00",
          permission: "read_only",
          createdAt: i,
          revokedAt: i + 1,
        });
      }
      return user!._id;
    });

    for (let i = 0; i < 25; i++) {
      await asEng.action(api.agentTokens.create, {
        name: `ativo ${i}`,
        permission: "read_only",
      });
    }
    await expect(
      asEng.action(api.agentTokens.create, { name: "26", permission: "read_only" })
    ).rejects.toThrow("Limite de 25 tokens ativos");

    expect(
      await asAdmin.mutation(api.agentTokens.revokeAllForUser, { userId })
    ).toBe(25);
    const active = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("agentTokens")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      return rows.filter((r) => r.revokedAt === undefined).length;
    });
    expect(active).toBe(0);
  });

  test("createForUser (bootstrap) emite token por email", async () => {
    const t = setup();
    await withUser(t, {
      clerkId: "adm",
      role: "admin",
      email: "admin@rlp.test",
    });
    const created = await t.action(internal.agentTokens.createForUser, {
      login: "admin@rlp.test",
      name: "CLI",
      permission: "full_access",
    });
    expect(created.token.startsWith("rlp_")).toBe(true);
    await expect(
      t.action(internal.agentTokens.createForUser, {
        login: "ninguem@rlp.test",
        name: "CLI",
        permission: "full_access",
      })
    ).rejects.toThrow("Usuário não encontrado");
  });

  test("purgeCalls apaga só o que passou da retenção", async () => {
    const t = setup();
    const asEng = await withUser(t, { clerkId: "eng1", role: "engenheiro" });
    const created = await asEng.action(api.agentTokens.create, {
      name: "x",
      permission: "read_only",
    });
    const userId = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", "eng1"))
        .unique();
      const base = {
        tokenId: created.id,
        userId: user!._id,
        tool: "t",
        outcome: "success" as const,
        durationMs: 1,
      };
      await ctx.db.insert("agentTokenCalls", {
        ...base,
        createdAt: Date.now() - 40 * 24 * 60 * 60 * 1000,
      });
      await ctx.db.insert("agentTokenCalls", { ...base, createdAt: Date.now() });
      return user!._id;
    });
    expect(await t.mutation(internal.agentTokens.purgeCalls, {})).toBe(1);
    const remaining = await t.run(async (ctx) =>
      ctx.db
        .query("agentTokenCalls")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    );
    expect(remaining).toHaveLength(1);
  });
});
