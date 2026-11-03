import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

const REDIRECT = "https://app.rlpeng.com.br/convite";

describe("convites por email", () => {
  test("actions de convite exigem admin.manage antes de falar com o Clerk", async () => {
    const t = setup();
    const asOperator = await withUser(t, { clerkId: "op1", role: "operator" });
    await expect(
      asOperator.action(api.userAdmin.adminInviteUser, {
        email: "nova@rlp.com",
        roles: ["compras"],
        redirectUrl: REDIRECT,
      })
    ).rejects.toThrow("Insufficient permissions");
  });

  test("convite de email já cadastrado falha antes do Clerk", async () => {
    const t = setup();
    await withUser(t, { clerkId: "ana", role: "operator", email: "ana@rlp.com" });
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    await expect(
      asDirector.action(api.userAdmin.adminInviteUser, {
        email: "  Ana@RLP.com ",
        roles: ["compras"],
        redirectUrl: REDIRECT,
      })
    ).rejects.toThrow("Já existe um usuário com este email");
  });

  test("email e URL de retorno são validados antes do Clerk", async () => {
    const t = setup();
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    await expect(
      asDirector.action(api.userAdmin.adminInviteUser, {
        email: "sem-arroba",
        roles: ["compras"],
        redirectUrl: REDIRECT,
      })
    ).rejects.toThrow("Email inválido");
    await expect(
      asDirector.action(api.userAdmin.adminInviteUser, {
        email: "nova@rlp.com",
        roles: ["compras"],
        redirectUrl: "javascript:alert(1)",
      })
    ).rejects.toThrow("URL de retorno do convite inválida");
  });

  test("upsertInvited cria o cadastro pendente e o reenvio atualiza o mesmo cadastro", async () => {
    const t = setup();
    const id = await t.mutation(internal.users.upsertInvited, {
      email: "Nova@RLP.com",
      roles: ["compras"],
      clerkInvitationId: "inv_1",
    });
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    let user = await asDirector.query(api.users.get, { id });
    expect(user?.email).toBe("nova@rlp.com");
    expect(user?.name).toBe("nova");
    expect(user?.roles).toEqual(["compras"]);
    expect(user?.clerkId).toBeUndefined();
    expect(user?.invitedAt).toBeTypeOf("number");
    // o id da invitation não sai para os apps
    expect(user).not.toHaveProperty("clerkInvitationId");

    const again = await t.mutation(internal.users.upsertInvited, {
      email: "nova@rlp.com",
      name: "Nova Pessoa",
      roles: ["compras", "estoque"],
      clerkInvitationId: "inv_2",
    });
    expect(again).toBe(id);
    user = await asDirector.query(api.users.get, { id });
    expect(user?.name).toBe("Nova Pessoa");
    expect(user?.roles).toEqual(["compras", "estoque"]);
    const stored = await t.run((ctx) => ctx.db.get("users", id));
    expect(stored?.clerkInvitationId).toBe("inv_2");
  });

  test("upsertInvited recusa email de quem já tem conta", async () => {
    const t = setup();
    await withUser(t, { clerkId: "ana", role: "operator", email: "ana@rlp.com" });
    await expect(
      t.mutation(internal.users.upsertInvited, {
        email: "ana@rlp.com",
        roles: ["compras"],
        clerkInvitationId: "inv_1",
      })
    ).rejects.toThrow("Já existe um usuário com este email");
  });

  test("webhook user.created vincula o convite pelo email, com nome, login e telefone da pessoa", async () => {
    const t = setup();
    const id = await t.mutation(internal.users.upsertInvited, {
      email: "nova@rlp.com",
      roles: ["rh"],
      clerkInvitationId: "inv_1",
    });
    const linked = await t.mutation(internal.users.upsertFromClerk, {
      clerkId: "clerk_nova",
      email: "nova@rlp.com",
      username: "nova.pessoa",
      name: "Nova Pessoa",
      phone: "11999999999",
    });
    expect(linked).toBe(id);
    const asNova = t.withIdentity({ subject: "clerk_nova" });
    const me = await asNova.query(api.users.getCurrentUser, {});
    expect(me?._id).toBe(id);
    expect(me?.name).toBe("Nova Pessoa");
    expect(me?.username).toBe("nova.pessoa");
    expect(me?.phone).toBe("11999999999");
    expect(me?.roles).toEqual(["rh"]);
  });

  test("ensureUser vincula o convite pelo email quando o webhook ainda não chegou", async () => {
    const t = setup();
    const id = await t.mutation(internal.users.upsertInvited, {
      email: "nova@rlp.com",
      roles: ["estoque"],
      clerkInvitationId: "inv_1",
    });
    const asNova = t.withIdentity({
      subject: "clerk_nova",
      email: "nova@rlp.com",
      name: "Nova Pessoa",
      nickname: "nova.pessoa",
    });
    const ensured = await asNova.mutation(api.users.ensureUser, {});
    expect(ensured).toBe(id);
    const me = await asNova.query(api.users.getCurrentUser, {});
    expect(me?.clerkId).toBe("clerk_nova");
    expect(me?.name).toBe("Nova Pessoa");
    expect(me?.username).toBe("nova.pessoa");
    expect(me?.roles).toEqual(["estoque"]);
    expect(me?.lastLoginAt).toBeTypeOf("number");
  });

  test("o email de um convite pendente não muda pelo update; nome e acessos sim", async () => {
    const t = setup();
    const id = await t.mutation(internal.users.upsertInvited, {
      email: "nova@rlp.com",
      roles: ["compras"],
      clerkInvitationId: "inv_1",
    });
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    await expect(
      asDirector.mutation(api.users.update, { id, email: "outra@rlp.com" })
    ).rejects.toThrow("Cancele o convite");
    await asDirector.mutation(api.users.update, {
      id,
      name: "Nova Pessoa",
      email: "nova@rlp.com",
      roles: ["compras", "rh"],
    });
    const user = await asDirector.query(api.users.get, { id });
    expect(user?.name).toBe("Nova Pessoa");
    expect(user?.roles).toEqual(["compras", "rh"]);
  });

  test("deleteInvited apaga só convites pendentes", async () => {
    const t = setup();
    const id = await t.mutation(internal.users.upsertInvited, {
      email: "nova@rlp.com",
      roles: ["compras"],
      clerkInvitationId: "inv_1",
    });
    await t.mutation(internal.users.deleteInvited, { id });
    expect(await t.run((ctx) => ctx.db.get("users", id))).toBeNull();

    const asAna = await withUser(t, { clerkId: "ana", role: "operator", email: "ana@rlp.com" });
    const ana = await asAna.query(api.users.getCurrentUser, {});
    await expect(
      t.mutation(internal.users.deleteInvited, { id: ana!._id })
    ).rejects.toThrow("Este usuário já aceitou o convite");
  });

  test("reenviar e cancelar recusam usuário que já aceitou", async () => {
    const t = setup();
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    const me = await asDirector.query(api.users.getCurrentUser, {});
    await expect(
      asDirector.action(api.userAdmin.adminResendInvite, { id: me!._id, redirectUrl: REDIRECT })
    ).rejects.toThrow("Este usuário já aceitou o convite");
    await expect(
      asDirector.action(api.userAdmin.adminRevokeInvite, { id: me!._id })
    ).rejects.toThrow("Este usuário já aceitou o convite");
  });
});
