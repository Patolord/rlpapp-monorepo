import { describe, expect, test } from "vitest";
import { DEFAULT_DUCT_NORMAS } from "@rlpapp/shared/engenharia/ducts";
import { SEED_BRANDS } from "@rlpapp/shared/takeoff/vrfBrands";
import { SEED_WEIGHTS } from "@rlpapp/shared/takeoff/weights";
import { api } from "../convex/_generated/api";
import {
  listPublishedTakeoffSettings,
  sanitizeTakeoffBasePrices,
  sanitizeTakeoffVrfBrands,
  sanitizeTakeoffWeights,
} from "../convex/model/procurement/takeoffSettings";
import { setup, withUser } from "./helpers";

async function seedUsers() {
  const t = setup();
  const engineering = await withUser(t, {
    clerkId: "eng",
    name: "Engenharia",
    role: "operator",
    department: "engenharia",
  });
  const hr = await withUser(t, { clerkId: "hr", role: "operator", department: "rh" });
  return { t, engineering, hr };
}

const copper = {
  name: 'Tubo de cobre 1/2"',
  group: "Tubulações",
  unit: "m" as const,
  material: "cobre",
  kgPerUnit: 0.263,
};

describe("sanitize", () => {
  test("weights: trims, defaults the group, refuses duplicates, unknown materials and zero", () => {
    expect(
      sanitizeTakeoffWeights({
        rows: [
          { ...copper, name: " Tubo ", group: " " },
          { ...copper, name: "" },
        ],
        gaugeWeights: { "# 26": 4.5 },
      })
    ).toEqual({
      rows: [{ ...copper, name: "Tubo", group: "Tubulações" }],
      gaugeWeights: { "# 26": 4.5 },
    });
    expect(() =>
      sanitizeTakeoffWeights({ rows: [copper, { ...copper, name: "tubo de cobre 1/2\"" }], gaugeWeights: {} })
    ).toThrow(/repetido/);
    expect(() =>
      sanitizeTakeoffWeights({ rows: [{ ...copper, material: "ouro" }], gaugeWeights: {} })
    ).toThrow(/insumo/);
    expect(() =>
      sanitizeTakeoffWeights({ rows: [{ ...copper, kgPerUnit: 0 }], gaugeWeights: {} })
    ).toThrow(/peso/);
    expect(() => sanitizeTakeoffWeights({ rows: [], gaugeWeights: { "# 26": 0 } })).toThrow(
      /Bitola/
    );
  });

  test("base prices: known keys with positive prices", () => {
    expect(sanitizeTakeoffBasePrices({ cobre: 120, chapa: 9.5 })).toEqual({ cobre: 120, chapa: 9.5 });
    expect(() => sanitizeTakeoffBasePrices({ ouro: 1 })).toThrow(/desconhecido/);
    expect(() => sanitizeTakeoffBasePrices({ cobre: -1 })).toThrow(/maior que zero/);
  });

  test("VRF brands: sorted tables, known diameters, unique ids", () => {
    const [daikin] = SEED_BRANDS;
    const clean = sanitizeTakeoffVrfBrands([
      { ...daikin, name: " Daikin ", main: [...daikin.main].reverse() },
    ]);
    expect(clean[0].name).toBe("Daikin");
    expect(clean[0].main.map((r) => r.hp)).toEqual(daikin.main.map((r) => r.hp));
    expect(() =>
      sanitizeTakeoffVrfBrands([{ ...daikin, main: [{ hp: 0, gas: "9/9", liquid: "1/4" }] }])
    ).toThrow(/bitola/);
    expect(() => sanitizeTakeoffVrfBrands([daikin, { ...daikin, name: "Outra" }])).toThrow(
      /repetido/
    );
    expect(() => sanitizeTakeoffVrfBrands([{ ...daikin, branch: [] }])).toThrow(/branch/);
  });
});

describe("takeoffSettings", () => {
  test("nothing published: every kind is null, in the query and in the catalog", async () => {
    const { t, engineering } = await seedUsers();
    const settings = await engineering.query(api.takeoffSettings.get, {});
    expect(settings).toEqual({
      weights: null,
      basePrices: null,
      vrfBrands: null,
      labor: null,
      ductNormas: null,
      meta: { weights: null, basePrices: null, vrfBrands: null, labor: null, ductNormas: null },
    });
    const published = await t.run((ctx) => listPublishedTakeoffSettings(ctx));
    expect(published).toEqual({
      weights: null,
      basePrices: null,
      vrfBrands: null,
      labor: null,
      ductNormas: null,
    });
    const catalog = await engineering.query(api.takeoffCatalog.current, {});
    expect(catalog).toMatchObject({ weights: null, basePrices: null, vrfBrands: null, kits: [] });
  });

  test("saving replaces a kind and publishes it with the catalog; others cannot", async () => {
    const { t, engineering, hr } = await seedUsers();
    await engineering.mutation(api.takeoffSettings.saveWeights, {
      rows: [copper],
      gaugeWeights: { "# 26": 4.5 },
    });
    await engineering.mutation(api.takeoffSettings.saveBasePrices, { prices: { cobre: 125 } });
    await engineering.mutation(api.takeoffSettings.saveVrfBrands, { brands: [SEED_BRANDS[1]] });
    const settings = await engineering.query(api.takeoffSettings.get, {});
    expect(settings.weights).toEqual({ rows: [copper], gaugeWeights: { "# 26": 4.5 } });
    expect(settings.basePrices).toEqual({ cobre: 125 });
    expect(settings.vrfBrands?.map((b) => b.id)).toEqual(["hitachi"]);
    expect(settings.meta.weights?.updatedBy).toBe("Engenharia");

    // a second save replaces, it does not append
    await engineering.mutation(api.takeoffSettings.saveBasePrices, { prices: { chapa: 9 } });
    const again = await t.run((ctx) => listPublishedTakeoffSettings(ctx));
    expect(again.basePrices).toEqual({ chapa: 9 });
    const catalog = await engineering.query(api.takeoffCatalog.current, {});
    expect(catalog.basePrices).toEqual({ chapa: 9 });
    expect(catalog.weights?.rows).toEqual([copper]);

    await expect(hr.query(api.takeoffSettings.get, {})).rejects.toThrow();
    await expect(
      hr.mutation(api.takeoffSettings.saveBasePrices, { prices: { cobre: 1 } })
    ).rejects.toThrow();
  });

  test("labour and duct normas: saved whole, validated, seeded from the workbook", async () => {
    const { t, engineering } = await seedUsers();
    await engineering.mutation(api.takeoffSettings.saveLabor, { ductPerKg: 22 });
    let settings = await engineering.query(api.takeoffSettings.get, {});
    expect(settings.labor).toEqual({ ductPerKg: 22 });
    await engineering.mutation(api.takeoffSettings.saveLabor, { vrfPerEvap: 800 });
    settings = await engineering.query(api.takeoffSettings.get, {});
    expect(settings.labor).toEqual({ vrfPerEvap: 800 });
    await expect(
      engineering.mutation(api.takeoffSettings.saveLabor, { ductPerKg: 0 })
    ).rejects.toThrow(/maior que zero/);

    expect(await engineering.mutation(api.takeoffSettings.seedDefaults, { kind: "ductNormas" })).toBe(true);
    settings = await engineering.query(api.takeoffSettings.get, {});
    expect(settings.ductNormas).toEqual(DEFAULT_DUCT_NORMAS);
    const [abnt] = settings.ductNormas!;
    await engineering.mutation(api.takeoffSettings.saveDuctNormas, {
      normas: [{ ...abnt, insulThickness: 38, gaugeLimits: [50, 80, 140, 210] }],
    });
    const published = await t.run((ctx) => listPublishedTakeoffSettings(ctx));
    expect(published.ductNormas).toEqual([
      { ...abnt, insulThickness: 38, gaugeLimits: [50, 80, 140, 210] },
    ]);
    expect(published.labor).toEqual({ vrfPerEvap: 800 });
    await expect(
      engineering.mutation(api.takeoffSettings.saveDuctNormas, {
        normas: [{ ...abnt, gaugeLimits: [50, 40, 140, 210] }],
      })
    ).rejects.toThrow(/crescentes/);
    await expect(
      engineering.mutation(api.takeoffSettings.saveDuctNormas, { normas: [abnt, abnt] })
    ).rejects.toThrow(/repetida/);
  });

  test("seedDefaults loads a factory table once and never overwrites", async () => {
    const { engineering } = await seedUsers();
    expect(await engineering.mutation(api.takeoffSettings.seedDefaults, { kind: "weights" })).toBe(true);
    expect(await engineering.mutation(api.takeoffSettings.seedDefaults, { kind: "vrfBrands" })).toBe(true);
    const settings = await engineering.query(api.takeoffSettings.get, {});
    expect(settings.weights?.rows).toEqual(SEED_WEIGHTS);
    expect(settings.weights?.gaugeWeights).toEqual({});
    expect(settings.vrfBrands?.map((b) => b.id)).toEqual(["daikin", "hitachi"]);

    await engineering.mutation(api.takeoffSettings.saveVrfBrands, { brands: [SEED_BRANDS[0]] });
    expect(await engineering.mutation(api.takeoffSettings.seedDefaults, { kind: "vrfBrands" })).toBe(false);
    const after = await engineering.query(api.takeoffSettings.get, {});
    expect(after.vrfBrands?.map((b) => b.id)).toEqual(["daikin"]);
  });

  test("an empty published table still takes the factory one, keeping the gauges", async () => {
    const { engineering } = await seedUsers();
    await engineering.mutation(api.takeoffSettings.saveWeights, {
      rows: [],
      gaugeWeights: { "# 26": 4.5 },
    });
    await engineering.mutation(api.takeoffSettings.saveVrfBrands, { brands: [] });
    expect(await engineering.mutation(api.takeoffSettings.seedDefaults, { kind: "weights" })).toBe(true);
    expect(await engineering.mutation(api.takeoffSettings.seedDefaults, { kind: "vrfBrands" })).toBe(true);
    const settings = await engineering.query(api.takeoffSettings.get, {});
    expect(settings.weights).toEqual({ rows: SEED_WEIGHTS, gaugeWeights: { "# 26": 4.5 } });
    expect(settings.vrfBrands?.map((b) => b.id)).toEqual(["daikin", "hitachi"]);
  });
});
