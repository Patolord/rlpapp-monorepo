import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

describe("controle de acesso", () => {
  test("queries de staff rejeitam não autenticados", async () => {
    const t = setup();
    await expect(t.query(api.products.list, {})).rejects.toThrow(
      "Not authenticated"
    );
  });

  test("qr_operator não acessa queries de staff", async () => {
    const t = setup();
    const asQr = await withUser(t, { clerkId: "qr1", role: "qr_operator" });
    await expect(asQr.query(api.products.list, {})).rejects.toThrow(
      "Insufficient permissions"
    );
  });

  test("usuário desativado é bloqueado", async () => {
    const t = setup();
    const asInactive = await withUser(t, {
      clerkId: "inativo",
      role: "operator",
      isActive: false,
    });
    await expect(asInactive.query(api.products.list, {})).rejects.toThrow(
      "Usuário desativado"
    );
  });

  test("financeiro: operador de outro departamento é bloqueado, admin acessa", async () => {
    const t = setup();
    const asEstoque = await withUser(t, {
      clerkId: "op-estoque",
      role: "operator",
      department: "estoque",
    });
    await expect(
      asEstoque.query(api.contasPagar.list, {})
    ).rejects.toThrow("Acesso restrito ao departamento financeiro");

    const asAdmin = await withUser(t, { clerkId: "admin1", role: "admin" });
    await expect(asAdmin.query(api.contasPagar.list, {})).resolves.toEqual([]);

    const asFinanceiro = await withUser(t, {
      clerkId: "op-fin",
      role: "operator",
      department: "financeiro",
    });
    await expect(
      asFinanceiro.query(api.contasPagar.list, {})
    ).resolves.toEqual([]);
  });

  test("users.create exige admin/director", async () => {
    const t = setup();
    const asOperator = await withUser(t, {
      clerkId: "op1",
      role: "operator",
    });
    await expect(
      asOperator.mutation(api.users.create, {
        name: "Novo",
        email: "novo@rlp.com",
        role: "operator",
      })
    ).rejects.toThrow("Insufficient permissions");

    const asDirector = await withUser(t, {
      clerkId: "dir1",
      role: "director",
    });
    const id = await asDirector.mutation(api.users.create, {
      name: "Novo",
      email: "novo@rlp.com",
      role: "operator",
    });
    expect(id).toBeDefined();
  });
});
