import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { buildMaterialSearchText } from "../convex/lib/compras/catalog";
import { setup } from "./helpers";

async function seed() {
  const t = setup();
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("users", { name: "Compras", clerkId: "h-buy", role: "operator", department: "compras", isActive: true, createdAt: now });
    await ctx.db.insert("users", { name: "Eng", clerkId: "h-eng", role: "engenheiro", department: "engenharia", isActive: true, createdAt: now });
    const familyId = await ctx.db.insert("materialFamilies", {
      name: "Cobre",
      nameNormalized: "cobre",
      category: "tubo",
      baseUnit: "m",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const make = async (name: string, key: string) => {
      const base = { name, familyId, identityKey: key, category: "tubo", unit: "m", active: true, status: "active" as const, createdAt: now };
      return await ctx.db.insert("materials", { ...base, searchText: buildMaterialSearchText(base) });
    };
    return {
      copper: await make("Tubo de Cobre 1/4", "h-copper"),
      tape: await make("Fita Isolante", "h-tape"),
      pipe: await make("Tubo PVC 20mm", "h-pvc"),
    };
  });
  return { t, ids, buyer: t.withIdentity({ subject: "h-buy" }), engineer: t.withIdentity({ subject: "h-eng" }) };
}

describe("saúde e busca do estoque central", () => {
  test("conta Crítico, Repor, OK e Sem política e busca por texto", async () => {
    const { ids, buyer, engineer } = await seed();
    const entry = await buyer.mutation(api.inventory.createDocument, {
      type: "entry",
      lines: [
        { materialId: ids.copper, quantity: 2 },
        { materialId: ids.tape, quantity: 8 },
        { materialId: ids.pipe, quantity: 50 },
      ],
    });
    await buyer.mutation(api.inventory.postDocument, { documentId: entry.documentId });
    const locationId = await buyer.mutation(api.inventoryStockPolicies.ensureCentralLocation, {});
    // Cobre: 2 < mínimo 5 → Crítico. Fita: 8 < ponto 10 → Repor. PVC sem política.
    await buyer.mutation(api.inventoryStockPolicies.upsert, { locationId, materialId: ids.copper, minimumQuantity: 5, reorderPoint: 10, targetQuantity: 20 });
    await buyer.mutation(api.inventoryStockPolicies.upsert, { locationId, materialId: ids.tape, minimumQuantity: 5, reorderPoint: 10, targetQuantity: 20 });

    expect(await buyer.query(api.inventory.centralHealth, {})).toEqual({ critical: 1, reorder: 1, healthy: 0, unconfigured: 1 });
    await expect(engineer.query(api.inventory.centralHealth, {})).rejects.toThrow("Engenharia");

    const found = await buyer.query(api.inventory.listBalances, {
      search: "tubo",
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(found.isDone).toBe(true);
    expect(found.page.map((b) => b.materialName).sort()).toEqual(["Tubo PVC 20mm", "Tubo de Cobre 1/4"]);
    expect(found.page.find((b) => b.materialName === "Tubo de Cobre 1/4")?.replenishmentState).toBe("below_minimum");
  });
});
