import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

describe("users.update e users.remove", () => {
  test("null limpa email, telefone e departamento; omitido mantém", async () => {
    const t = setup();
    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    const id = await asDirector.mutation(api.users.create, {
      name: "Ana",
      email: "ana@rlp.com",
      phone: "11999999999",
      role: "operator",
      department: "compras",
    });

    await asDirector.mutation(api.users.update, { id, name: "Ana Souza" });
    let user = await asDirector.query(api.users.get, { id });
    expect(user?.name).toBe("Ana Souza");
    expect(user?.email).toBe("ana@rlp.com");
    expect(user?.department).toBe("compras");

    await asDirector.mutation(api.users.update, {
      id,
      email: null,
      phone: null,
      department: null,
    });
    user = await asDirector.query(api.users.get, { id });
    expect(user?.email).toBeUndefined();
    expect(user?.phone).toBeUndefined();
    expect(user?.department).toBeUndefined();
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
