import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { createProduct, createSite, setup, withUser } from "./helpers";

describe("fluxo de estoque", () => {
  test("recibo aceito incrementa o snapshot de estoque", async () => {
    const t = setup();
    const asOperator = await withUser(t, {
      clerkId: "op1",
      role: "operator",
      department: "estoque",
    });
    const productId = await createProduct(t);

    const receiptId = await asOperator.mutation(api.receipts.createReceipt, {
      lines: [{ productId, qty: 10, unitCost: 500, costSource: "manual" }],
    });

    await asOperator.mutation(api.receipts.acceptReceipt, { receiptId });

    const snapshot = await t.run(async (ctx) =>
      ctx.db
        .query("inventorySnapshot")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .first()
    );
    expect(snapshot?.qtyOnHand).toBe(10);

    const receipt = await t.run(async (ctx) =>
      ctx.db.get("receipts", receiptId)
    );
    expect(receipt?.status).toBe("Accepted");
  });

  test("remessa debita estoque e bloqueia saldo insuficiente", async () => {
    const t = setup();
    const asOperator = await withUser(t, {
      clerkId: "op1",
      role: "operator",
      department: "estoque",
    });
    const productId = await createProduct(t);
    const siteId = await createSite(t);

    // sem estoque → erro
    await expect(
      asOperator.mutation(api.shipments.createShipment, {
        toSiteId: siteId,
        lines: [{ productId, qty: 5 }],
      })
    ).rejects.toThrow("Estoque insuficiente");

    // entrada de 10 unidades
    const receiptId = await asOperator.mutation(api.receipts.createReceipt, {
      lines: [{ productId, qty: 10, unitCost: 100, costSource: "manual" }],
    });
    await asOperator.mutation(api.receipts.acceptReceipt, { receiptId });

    // saída de 4
    const shipmentId = await asOperator.mutation(
      api.shipments.createShipment,
      {
        toSiteId: siteId,
        lines: [{ productId, qty: 4 }],
      }
    );
    expect(shipmentId).toBeDefined();

    const snapshot = await t.run(async (ctx) =>
      ctx.db
        .query("inventorySnapshot")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .first()
    );
    expect(snapshot?.qtyOnHand).toBe(6);
  });

  test("auditoria registra o usuário autenticado (não 'system')", async () => {
    const t = setup();
    const asOperator = await withUser(t, {
      clerkId: "op1",
      email: "op@rlp.com",
      role: "operator",
      department: "estoque",
    });
    const productId = await createProduct(t);

    const receiptId = await asOperator.mutation(api.receipts.createReceipt, {
      lines: [{ productId, qty: 1 }],
    });

    const receipt = await t.run(async (ctx) =>
      ctx.db.get("receipts", receiptId)
    );
    expect(receipt?.userId).toBe("op@rlp.com");
  });
});
