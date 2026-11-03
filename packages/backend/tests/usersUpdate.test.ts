import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

describe("users.update e users.remove", () => {
  test("null limpa email e telefone; omitido mantém; roles substitui o conjunto", async () => {
    const t = setup();
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    const id = await asDirector.mutation(api.users.create, {
      name: "Ana",
      email: "ana@rlp.com",
      phone: "11999999999",
      roles: ["compras"],
    });

    await asDirector.mutation(api.users.update, { id, name: "Ana Souza" });
    let user = await asDirector.query(api.users.get, { id });
    expect(user?.name).toBe("Ana Souza");
    expect(user?.email).toBe("ana@rlp.com");
    expect(user?.roles).toEqual(["compras"]);

    await asDirector.mutation(api.users.update, {
      id,
      email: null,
      phone: null,
      roles: ["estoque", "compras", "qr_operator"],
    });
    user = await asDirector.query(api.users.get, { id });
    expect(user?.email).toBeUndefined();
    expect(user?.phone).toBeUndefined();
    expect(user?.roles).toEqual(["compras", "estoque", "qr_operator"]);

    await asDirector.mutation(api.users.update, { id, roles: [] });
    user = await asDirector.query(api.users.get, { id });
    expect(user?.roles).toEqual([]);
  });

  test("admin não remove o próprio acesso de administração", async () => {
    const t = setup();
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    const me = await asDirector.query(api.users.getCurrentUser, {});
    await expect(
      asDirector.mutation(api.users.update, { id: me!._id, roles: ["compras"] })
    ).rejects.toThrow("Você não pode remover o próprio acesso de administração");
    await asDirector.mutation(api.users.update, { id: me!._id, roles: ["admin", "rh"] });
    const after = await asDirector.query(api.users.getCurrentUser, {});
    expect(after?.roles).toEqual(["admin", "rh"]);
  });

  test("admin não desativa o próprio acesso", async () => {
    const t = setup();
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    const me = await asDirector.query(api.users.getCurrentUser, {});
    expect(me).not.toBeNull();
    await expect(
      asDirector.mutation(api.users.remove, { id: me!._id })
    ).rejects.toThrow("Você não pode desativar o próprio acesso");
  });
});
