import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

const NOW = Date.UTC(2026, 10, 18);

/** A catalog with the copper of a 1/4" + 1/2" line set priced, and nothing else. */
async function seed() {
  const t = setup();
  await t.run(async (ctx) => {
    const insert = async (name: string, sku: string, cents: number, laborCents?: number) => {
      const id = await ctx.db.insert("materials", {
        name,
        sku,
        unit: "m",
        category: "Tubulações",
        laborPriceCents: laborCents,
        laborPriceUpdatedAt: laborCents ? NOW : undefined,
        active: true,
        createdAt: NOW - 1000,
      });
      await ctx.db.insert("priceEvents", {
        materialId: id,
        supplierNameRaw: "Fornecedor",
        unitPriceCents: cents,
        unit: "m",
        source: "quote",
        occurredAt: NOW - 1000,
        reviewStatus: "reviewed",
        needsReview: false,
        createdAt: NOW - 1000,
      });
    };
    await insert('Tubulação de Cobre 1/4"', "MAT-000001", 3000, 500);
    await insert('Tubulação de Cobre 1/2"', "MAT-000002", 5000);
  });
  return t;
}

describe("takeoffEstimates.split", () => {
  test("sizes each machine's line set by capacity and prices it from the catalog", async () => {
    const t = await seed();
    const asEngineer = await withUser(t, { clerkId: "eng", roles: ["engenharia"] });
    const result = await asEngineer.query(api.takeoffEstimates.split, {
      machines: [
        { type: "Hi Wall", capacityBtu: 18000, quantity: 1, lineMeters: 10, unitPriceBrl: 3000 },
        { type: "Hi Wall", capacityBtu: 24000, quantity: 2, lineMeters: 12 },
        { type: "Cassete", capacityBtu: 18000, quantity: 2, lineMeters: 12 },
      ],
      laborPerEvaporatorBrl: 450,
      bdiPercent: 30,
      now: NOW,
    });

    const line = (name: string) => result.lines.find((l) => l.name === name);
    // no company kits: the factory line sets (18k → 1/4" + 1/2", 24k → 3/8" + 5/8")
    expect(line('Tubulação de Cobre 1/4"')).toMatchObject({
      quantity: 34,
      materialUnitPrice: 30,
      laborUnitPrice: 5,
      priceSource: "catalogo",
    });
    expect(line('Tubulação de Cobre 1/2"')).toMatchObject({ quantity: 34, materialUnitPrice: 50 });
    // no quote for 3/8": by weight from the factory table (0,193 kg/m × R$ 120/kg)
    expect(line('Tubulação de Cobre 3/8"')).toMatchObject({
      quantity: 24,
      materialUnitPrice: 23.16,
      priceSource: "peso",
    });
    expect(line("Split Hi Wall 18.000 Btu/h")).toMatchObject({
      quantity: 1,
      materialUnitPrice: 3000,
      priceSource: "digitado",
    });
    expect(line("Mão de obra instalação de evaporadora")).toMatchObject({
      quantity: 5,
      laborUnitPrice: 450,
      laborTotal: 2250,
    });
    expect(result.totals.bdiPercent).toBe(30);
    expect(result.totals.total).toBeCloseTo(result.totals.subtotal * 1.3, 2);
    expect(result.assumptions[0]).toContain('kit "18.000 Inverter"');
    expect(result.warnings.some((w) => w.includes('Isolamento Polipex 3/8"'))).toBe(true);
    expect(result.warnings.some((w) => w.startsWith("Sem mão de obra"))).toBe(false);
  });

  test("rejects a capacity with no line set and warns when labour is missing", async () => {
    const t = await seed();
    const asEngineer = await withUser(t, { clerkId: "eng", roles: ["engenharia"] });
    await expect(
      asEngineer.query(api.takeoffEstimates.split, {
        machines: [{ capacityBtu: 15000, quantity: 1 }],
        now: NOW,
      })
    ).rejects.toThrow();
    const result = await asEngineer.query(api.takeoffEstimates.split, {
      machines: [{ capacityBtu: 12000, quantity: 1 }],
      now: NOW,
    });
    expect(result.warnings.some((w) => w.startsWith("Sem mão de obra"))).toBe(true);
    expect(result.assumptions[0]).toContain("8 m de linha por máquina (padrão)");
  });

  test("needs read access to purchasing", async () => {
    const t = await seed();
    const asField = await withUser(t, { clerkId: "op", roles: ["qr_operator"] });
    await expect(
      asField.query(api.takeoffEstimates.split, {
        machines: [{ capacityBtu: 12000, quantity: 1 }],
        now: NOW,
      })
    ).rejects.toThrow();
  });
});

describe("takeoffEstimates.bathroomExhaust", () => {
  test("generates the exhaust per bathroom at the duct diameter", async () => {
    const t = await seed();
    const asEngineer = await withUser(t, { clerkId: "eng", roles: ["engenharia"] });
    const result = await asEngineer.query(api.takeoffEstimates.bathroomExhaust, {
      bathrooms: 8,
      diameterMm: 125,
      fanPriceBrl: 180,
      laborPerBathroomBrl: 120,
      now: NOW,
    });
    expect(result.lines.map((l) => [l.name, l.quantity])).toEqual([
      ["Exaustor para banheiro Ø125 mm", 8],
      ["Duto flexível de alumínio Ø125 mm", 24],
      ["Abraçadeira Ø125 mm", 16],
      ["Grelha de exaustão Ø125 mm", 8],
      ["Terminal de exaustão (chapéu) Ø125 mm", 8],
      ["Mão de obra instalação de exaustor", 8],
    ]);
    expect(result.totals.subtotal).toBe(8 * 180 + 8 * 120);
  });
});
