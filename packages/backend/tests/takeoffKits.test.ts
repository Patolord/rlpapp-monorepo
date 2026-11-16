import { describe, expect, test } from "vitest";
import { SEED_KITS } from "@rlpapp/shared/takeoff/kits";
import { api } from "../convex/_generated/api";
import {
  listPublishedTakeoffKits,
  sanitizeTakeoffKitInput,
} from "../convex/model/procurement/takeoffKits";
import { setup, withUser } from "./helpers";

async function seedUsers() {
  const t = setup();
  const engineering = await withUser(t, {
    clerkId: "eng",
    name: "Engenharia",
    role: "operator",
    department: "engenharia",
  });
  const purchasing = await withUser(t, {
    clerkId: "buy",
    name: "Compras",
    role: "operator",
    department: "compras",
  });
  const hr = await withUser(t, { clerkId: "hr", role: "operator", department: "rh" });
  return { t, engineering, purchasing, hr };
}

const lineSet = {
  name: "Linha frigorígena 9.000",
  mode: "linear" as const,
  label: '1/4" · 3/8"',
  components: [
    { name: 'Cobre de 1/4"', group: "Tubulações", system: "Infra AC", kind: "linear" as const, factor: 1 },
    { name: "Cabo PP 5 x 1,5 mm²", group: "Elétrica", kind: "linear" as const, factor: 2 },
  ],
};

describe("sanitizeTakeoffKitInput", () => {
  test("trims, defaults the group, drops nameless rows and keeps a cleared label out", () => {
    const clean = sanitizeTakeoffKitInput({
      name: "  Kit  ",
      mode: "count",
      label: "  ",
      components: [
        { name: " Detector ", group: " ", system: "", kind: "count", factor: 1 },
        { name: "   ", group: "x", kind: "count", factor: 1 },
      ],
    });
    expect(clean).toEqual({
      name: "Kit",
      mode: "count",
      components: [{ name: "Detector", group: "Geral", kind: "count", factor: 1 }],
    });
  });

  test("keeps a component's catalog code, upper case", () => {
    const clean = sanitizeTakeoffKitInput({
      ...lineSet,
      components: [{ ...lineSet.components[0], sku: " mat-000010 " }, lineSet.components[1]],
    });
    expect(clean.components.map((c) => c.sku)).toEqual(["MAT-000010", undefined]);
  });

  test("refuses an empty kit, a blank name and a non-positive factor", () => {
    expect(() => sanitizeTakeoffKitInput({ ...lineSet, name: " " })).toThrow(/nome/);
    expect(() => sanitizeTakeoffKitInput({ ...lineSet, components: [] })).toThrow(/componente/);
    expect(() =>
      sanitizeTakeoffKitInput({
        ...lineSet,
        components: [{ ...lineSet.components[0], factor: 0 }],
      })
    ).toThrow(/fator/);
  });
});

describe("takeoffKits", () => {
  test("engineering and purchasing manage the company defaults; others cannot", async () => {
    const { engineering, purchasing, hr } = await seedUsers();
    const id = await engineering.mutation(api.takeoffKits.save, lineSet);
    await purchasing.mutation(api.takeoffKits.save, {
      id,
      ...lineSet,
      name: "Linha 9.000 Inverter",
    });
    const rows = await purchasing.query(api.takeoffKits.list, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      _id: id,
      key: "kit-linha-frigorigena-9-000",
      name: "Linha 9.000 Inverter",
      label: '1/4" · 3/8"',
      updatedBy: "Compras",
      factory: false,
    });
    await expect(hr.query(api.takeoffKits.list, {})).rejects.toThrow();
    await expect(hr.mutation(api.takeoffKits.save, lineSet)).rejects.toThrow();
  });

  test("a second kit with the same name gets its own key", async () => {
    const { engineering } = await seedUsers();
    await engineering.mutation(api.takeoffKits.save, lineSet);
    await engineering.mutation(api.takeoffKits.save, lineSet);
    const keys = (await engineering.query(api.takeoffKits.list, {})).map((k) => k.key);
    expect(keys).toEqual(["kit-linha-frigorigena-9-000", "kit-linha-frigorigena-9-000-2"]);
  });

  test("is published with the catalog in the app's shape, without removed kits", async () => {
    const { t, engineering } = await seedUsers();
    const keep = await engineering.mutation(api.takeoffKits.save, lineSet);
    const gone = await engineering.mutation(api.takeoffKits.save, { ...lineSet, name: "Antigo" });
    await engineering.mutation(api.takeoffKits.remove, { id: gone });

    const published = await t.run((ctx) => listPublishedTakeoffKits(ctx));
    expect(published).toEqual([
      {
        id: "kit-linha-frigorigena-9-000",
        name: lineSet.name,
        mode: "linear",
        label: '1/4" · 3/8"',
        components: [
          { name: 'Cobre de 1/4"', sku: null, group: "Tubulações", system: "Infra AC", kind: "linear", factor: 1 },
          { name: "Cabo PP 5 x 1,5 mm²", sku: null, group: "Elétrica", system: null, kind: "linear", factor: 2 },
        ],
      },
    ]);
    const current = await engineering.query(api.takeoffCatalog.current, {});
    expect(current.kits).toEqual(published);
    expect(current.items).toEqual([]);
    // the removed kit keeps its key: saving it again cannot reuse the id
    await expect(
      engineering.mutation(api.takeoffKits.save, { id: gone, ...lineSet })
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND", message: "Kit não encontrado" } });
    expect((await engineering.query(api.takeoffKits.list, {})).map((k) => k._id)).toEqual([keep]);
  });

  test("seedDefaults loads the factory presets once and never overwrites an edit", async () => {
    const { engineering } = await seedUsers();
    expect(await engineering.query(api.takeoffKits.missingFactory, {})).toBe(SEED_KITS.length);
    expect(await engineering.mutation(api.takeoffKits.seedDefaults, {})).toBe(SEED_KITS.length);
    expect(await engineering.query(api.takeoffKits.missingFactory, {})).toBe(0);
    const rows = await engineering.query(api.takeoffKits.list, {});
    expect(rows.map((k) => k.key)).toEqual(SEED_KITS.map((k) => k.id));
    expect(rows.every((k) => k.factory)).toBe(true);
    const inverter = rows.find((k) => k.key === "kit-9-000-inverter")!;
    expect(inverter).toMatchObject({ name: "9.000 Inverter", label: '1/4" · 3/8"' });

    await engineering.mutation(api.takeoffKits.save, {
      id: inverter._id,
      name: "9.000 Inverter (RLP)",
      mode: "linear",
      components: inverter.components,
    });
    await engineering.mutation(api.takeoffKits.remove, { id: rows[1]._id });
    // a removed factory kit keeps its key: nothing left to add, and the page knows it
    expect(await engineering.query(api.takeoffKits.missingFactory, {})).toBe(0);
    expect(await engineering.mutation(api.takeoffKits.seedDefaults, {})).toBe(0);
    const after = await engineering.query(api.takeoffKits.list, {});
    expect(after).toHaveLength(SEED_KITS.length - 1);
    expect(after.find((k) => k.key === "kit-9-000-inverter")?.name).toBe("9.000 Inverter (RLP)");
  });
});
