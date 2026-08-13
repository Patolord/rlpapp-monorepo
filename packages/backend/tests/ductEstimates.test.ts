import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

async function seedProject() {
  const t = setup();
  const asEngineer = await withUser(t, {
    clerkId: "engineer-dutos",
    role: "engenheiro",
    department: "engenharia",
  });
  const projectId = await t.run(async (ctx) =>
    ctx.db.insert("projects", {
      name: "Obra Dutos",
      slug: "obra-dutos",
      floors: [],
      createdAt: Date.now(),
    })
  );
  return { t, asEngineer, projectId };
}

describe("ductEstimates", () => {
  test("engineer can create, save, list, rename and remove", async () => {
    const { asEngineer, projectId } = await seedProject();

    const estimateId = await asEngineer.mutation(api.ductEstimates.create, {
      projectId,
      name: " Pressurização ",
    });

    const listed = await asEngineer.query(api.ductEstimates.list, { projectId });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe("Pressurização");
    expect(listed[0]?.lineCount).toBe(0);

    const created = await asEngineer.query(api.ductEstimates.get, { estimateId });
    expect(created?.prices.sheet24).toBe(17);

    await asEngineer.mutation(api.ductEstimates.save, {
      estimateId,
      system: "PRESSURIZAÇÃO",
      budgetNumber: "24.100",
      norma: 1,
      laborRatePerKg: 18,
      insulationAllowancePct: 15,
      supportAllowancePct: 30,
      insulationThicknessMm: 25,
      flangeSpacingM: 1,
      recladThicknessMm: 25,
      splitersQty: 0,
      captorsQty: 2,
      prices: created!.prices,
      lines: [
        {
          tag: "T1",
          largerSideCm: 40,
          smallerSideCm: 25,
          lengthM: 3,
          externalInsulation: "none",
          internalInsulation: "none",
          flange: "powermatic",
          reclad: false,
          paintReclad: false,
        },
        {
          largerSideCm: 0,
          smallerSideCm: 0,
          lengthM: 0,
          externalInsulation: "none",
          internalInsulation: "none",
          flange: "powermatic",
          reclad: false,
          paintReclad: false,
        },
      ],
    });

    const saved = await asEngineer.query(api.ductEstimates.get, { estimateId });
    expect(saved?.system).toBe("PRESSURIZAÇÃO");
    expect(saved?.captorsQty).toBe(2);
    expect(saved?.lines).toHaveLength(1);
    expect(saved?.lines[0]?.tag).toBe("T1");

    await asEngineer.mutation(api.ductEstimates.rename, {
      estimateId,
      name: "Exaustão",
    });
    const renamed = await asEngineer.query(api.ductEstimates.get, { estimateId });
    expect(renamed?.name).toBe("Exaustão");

    await asEngineer.mutation(api.ductEstimates.remove, { estimateId });
    expect(
      await asEngineer.query(api.ductEstimates.list, { projectId })
    ).toHaveLength(0);
  });

  test("compras cannot write duct estimates", async () => {
    const { t, asEngineer, projectId } = await seedProject();
    const estimateId = await asEngineer.mutation(api.ductEstimates.create, {
      projectId,
      name: "Levantamento",
    });
    const asPurchasing = await withUser(t, {
      clerkId: "compras-dutos",
      role: "operator",
      department: "compras",
    });
    await expect(
      asPurchasing.mutation(api.ductEstimates.create, {
        projectId,
        name: "Outro",
      })
    ).rejects.toThrow("engenharia");
    await expect(
      asPurchasing.mutation(api.ductEstimates.remove, { estimateId })
    ).rejects.toThrow("engenharia");
  });
});
