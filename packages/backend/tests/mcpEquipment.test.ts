import { describe, expect, test } from "vitest";

import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

describe("MCP engineering equipment query", () => {
  test("rejeita não autenticados", async () => {
    const t = setup();
    const equipmentId = await t.run(async (ctx) => {
      return await ctx.db.insert("equipment", {
        description: "Evaporadora",
        status: "installing",
        createdAt: Date.now(),
      });
    });
    await expect(
      t.query(api.equipment.getForEngineering, { id: equipmentId })
    ).rejects.toThrow("Not authenticated");
  });

  test("qr_operator e client não leem equipamentos de engenharia", async () => {
    const t = setup();
    const equipmentId = await t.run(async (ctx) => {
      return await ctx.db.insert("equipment", {
        description: "Evaporadora",
        status: "installing",
        createdAt: Date.now(),
      });
    });

    const asQr = await withUser(t, { clerkId: "qr1", role: "qr_operator" });
    await expect(
      asQr.query(api.equipment.getForEngineering, { id: equipmentId })
    ).rejects.toThrow("Insufficient permissions");

    const asClient = await withUser(t, { clerkId: "cli1", role: "client" });
    await expect(
      asClient.query(api.equipment.getForEngineering, { id: equipmentId })
    ).rejects.toThrow("Insufficient permissions");
  });

  test("engenheiro lê o recorte sem IDs de storage", async () => {
    const t = setup();
    const equipmentId = await t.run(async (ctx) => {
      return await ctx.db.insert("equipment", {
        description: "Condensadora",
        status: "operational",
        createdAt: 1,
        notes: "ok",
      });
    });

    const asEngineer = await withUser(t, {
      clerkId: "eng1",
      role: "engenheiro",
    });
    const equipment = await asEngineer.query(api.equipment.getForEngineering, {
      id: equipmentId,
    });

    expect(equipment).toMatchObject({
      _id: equipmentId,
      description: "Condensadora",
      status: "operational",
      createdAt: 1,
      projectEquipmentId: null,
      createdByUserId: null,
      notes: "ok",
    });
    expect(equipment).not.toHaveProperty("labelPhotoIds");
  });
});
