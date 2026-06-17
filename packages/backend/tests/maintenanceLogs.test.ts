import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup, withUser } from "./helpers";

async function userIdByClerk(
  t: ReturnType<typeof setup>,
  clerkId: string
): Promise<Id<"users">> {
  return t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .first();
    if (!user) throw new Error("user not found");
    return user._id;
  });
}

async function seedLog(
  t: ReturnType<typeof setup>,
  createdByUserId: Id<"users">,
  technicianName: string
): Promise<void> {
  await t.run(async (ctx) => {
    const equipmentId = await ctx.db.insert("equipment", {
      description: "Equipamento de teste",
      status: "operational",
      createdAt: Date.now(),
    });
    await ctx.db.insert("maintenanceLogs", {
      equipmentId,
      type: "maintenance",
      technicianName,
      createdByUserId,
      status: "operational",
      photoIds: [],
      createdAt: Date.now(),
    });
  });
}

describe("maintenanceLogs.listMine", () => {
  test("qr_operator vê apenas seus próprios registros", async () => {
    const t = setup();
    const asA = await withUser(t, { clerkId: "tech-a", role: "qr_operator" });
    await withUser(t, { clerkId: "tech-b", role: "qr_operator" });

    const userA = await userIdByClerk(t, "tech-a");
    const userB = await userIdByClerk(t, "tech-b");

    await seedLog(t, userA, "Técnico A");
    await seedLog(t, userA, "Técnico A");
    await seedLog(t, userB, "Técnico B");

    const result = await asA.query(api.maintenanceLogs.listMine, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page).toHaveLength(2);
    expect(
      result.page.every((log) => log.createdByUserId === userA)
    ).toBe(true);
  });

  test("listMine exige autenticação", async () => {
    const t = setup();
    await expect(
      t.query(api.maintenanceLogs.listMine, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).rejects.toThrow("Not authenticated");
  });
});
