import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { aggregateManDays, derivePosition, toBrtDateKey } from "../convex/model/hr/timeClock";
import { setup, withUser } from "./helpers";

const OBRA_A = { latitude: -23.5290093, longitude: -46.6738077, radiusMeters: 300 };
const OBRA_B = { latitude: -23.6, longitude: -46.7, radiusMeters: 300 };

async function userIdOf(t: ReturnType<typeof setup>, clerkId: string): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    return user!._id;
  });
}

async function seed() {
  const t = setup();
  const hr = await withUser(t, { clerkId: "hr", name: "RH", roles: ["rh"] });
  const ana = await withUser(t, {
    clerkId: "ana",
    name: "Ana",
    roles: ["qr_operator"],
    permissionGrants: ["ponto.registrar"],
  });
  const bruno = await withUser(t, {
    clerkId: "bruno",
    name: "Bruno",
    roles: ["qr_operator"],
    permissionGrants: ["ponto.registrar"],
  });
  // Carla bate ponto mas não marcou hoje; Diego não bate ponto.
  await withUser(t, {
    clerkId: "carla",
    name: "Carla",
    roles: [],
    permissionGrants: ["ponto.registrar"],
  });
  await withUser(t, { clerkId: "diego", name: "Diego", roles: ["engenharia"] });
  await withUser(t, { clerkId: "admin", name: "Admin", roles: ["admin"] });

  const { projectA, projectB } = await t.run(async (ctx) => ({
    projectA: await ctx.db.insert("projects", {
      name: "Obra A",
      floors: [],
      createdAt: Date.now(),
      geofence: OBRA_A,
    }),
    projectB: await ctx.db.insert("projects", {
      name: "Obra B",
      floors: [],
      createdAt: Date.now(),
      geofence: OBRA_B,
    }),
  }));
  await hr.mutation(api.timeClock.updateTimeClockSettings, { duplicateWindowMinutes: 0 });
  return { t, hr, ana, bruno, projectA, projectB };
}

describe("timeClock lib", () => {
  test("posição atual vem da última marcação e da obra dentro da cerca", () => {
    const p = (punchedAt: number, kind: "entrada" | "almoco_saida" | "saida", inside: boolean) => ({
      punchedAt,
      kind,
      projectId: "obra-a",
      projectName: "Obra A",
      geofenceStatus: inside ? ("inside" as const) : ("outside" as const),
    });
    expect(derivePosition([]).status).toBe("absent");
    expect(derivePosition([p(1, "entrada", true)])).toMatchObject({
      status: "on_site",
      projectId: "obra-a",
      locationExact: true,
    });
    expect(derivePosition([p(1, "entrada", true), p(2, "almoco_saida", false)])).toMatchObject({
      status: "lunch",
      projectId: "obra-a",
      locationExact: false,
    });
  });

  test("homem-dia conta uma vez por pessoa e data", () => {
    const aggregate = aggregateManDays([
      { date: "2026-01-14", userId: "u1", personName: "Ana", projectId: "a", projectName: "A" },
      { date: "2026-01-14", userId: "u1", personName: "Ana", projectId: "b", projectName: "B" },
      { date: "2026-01-15", userId: "u1", personName: "Ana", projectId: "b", projectName: "B" },
      { date: "2026-01-15", userId: "u2", personName: "Bruno" },
    ]);
    expect(aggregate.totalManDays).toBe(3);
    expect(aggregate.uniquePeople).toBe(2);
    expect(aggregate.uniqueProjects).toBe(2);
    expect(aggregate.byPerson[0]).toMatchObject({ userId: "u1", totalDays: 2 });
    expect(aggregate.byProject.find((row) => row.projectId === undefined)?.totalManDays).toBe(1);
  });
});

describe("timeClock: presença", () => {
  test("getDay e getLiveStatus listam quem bate ponto, presentes, ausentes e obras", async () => {
    const { t, hr, ana, bruno, projectA, projectB } = await seed();
    const entry = await ana.mutation(api.timeClockPunch.register, {
      clientPunchId: "ana-1",
      capturedAt: Date.now(),
      latitude: OBRA_A.latitude,
      longitude: OBRA_A.longitude,
    });
    await bruno.mutation(api.timeClockPunch.register, {
      clientPunchId: "bruno-1",
      capturedAt: Date.now(),
      latitude: OBRA_B.latitude,
      longitude: OBRA_B.longitude,
    });
    await bruno.mutation(api.timeClockPunch.register, {
      clientPunchId: "bruno-2",
      capturedAt: Date.now(),
      latitude: OBRA_B.latitude,
      longitude: OBRA_B.longitude,
    });
    const date = entry.date;
    const anaId = await userIdOf(t, "ana");

    const day = await hr.query(api.timeClock.getDay, { date });
    expect(day.people.map((person) => person.name)).toEqual(["Ana", "Bruno", "Carla"]);
    expect(day.summary).toMatchObject({ total: 3, present: 2, absent: 1, punches: 3 });
    expect(day.people.find((person) => person.name === "Ana")).toMatchObject({
      userId: anaId,
      present: true,
      projectId: projectA,
      projectName: "Obra A",
      punchCount: 1,
    });
    expect(day.people.find((person) => person.name === "Carla")?.present).toBe(false);
    expect(day.worksites.find((w) => w.projectId === projectB)).toMatchObject({
      peopleCount: 1,
      punchCount: 2,
    });

    const live = await hr.query(api.timeClock.getLiveStatus, { date });
    expect(live.summary).toMatchObject({ total: 3, onSite: 1, lunch: 1, absent: 1 });
    expect(live.people.find((person) => person.name === "Bruno")).toMatchObject({
      status: "lunch",
      projectName: "Obra B",
      locationExact: true,
    });
    const board = live.worksites.find((w) => w.projectId === projectA);
    expect(board?.people.map((person) => person.name)).toEqual(["Ana"]);
  });

  test("quem perdeu a permissão continua aparecendo nos dias em que marcou", async () => {
    const { t, hr, ana } = await seed();
    const entry = await ana.mutation(api.timeClockPunch.register, {
      clientPunchId: "ana-1",
      capturedAt: Date.now(),
      latitude: OBRA_A.latitude,
      longitude: OBRA_A.longitude,
    });
    const anaId = await userIdOf(t, "ana");
    await hr.mutation(api.timeClock.setClocksIn, { userId: anaId, enabled: false });
    const day = await hr.query(api.timeClock.getDay, { date: entry.date });
    expect(day.people.find((person) => person.userId === anaId)?.present).toBe(true);
  });

  test("getMonthStats agrega homem-dia por pessoa e obra a partir dos resumos", async () => {
    const { t, hr, projectA } = await seed();
    const anaId = await userIdOf(t, "ana");
    const brunoId = await userIdOf(t, "bruno");
    await t.run(async (ctx) => {
      const base = {
        firstPunchAt: 0,
        lastPunchAt: 0,
        lastKind: "saida" as const,
        punchCount: 4,
        updatedAt: 0,
      };
      await ctx.db.insert("clockDays", {
        ...base,
        date: "2026-01-14",
        userId: anaId,
        personName: "Ana",
        projectId: projectA,
        projectName: "Obra A",
      });
      await ctx.db.insert("clockDays", {
        ...base,
        date: "2026-01-15",
        userId: anaId,
        personName: "Ana",
        projectId: projectA,
        projectName: "Obra A",
      });
      await ctx.db.insert("clockDays", {
        ...base,
        date: "2026-01-15",
        userId: brunoId,
        personName: "Bruno",
      });
      await ctx.db.insert("clockDays", {
        ...base,
        date: "2026-02-01",
        userId: brunoId,
        personName: "Bruno",
      });
    });
    const stats = await hr.query(api.timeClock.getMonthStats, { year: 2026, month: 1 });
    expect(stats).toMatchObject({
      from: "2026-01-01",
      to: "2026-01-31",
      totalManDays: 3,
      uniquePeople: 2,
      uniqueWorksites: 1,
    });
    expect(stats.byWorksite.find((row) => row.projectId === projectA)).toMatchObject({
      projectName: "Obra A",
      totalManDays: 2,
      uniquePeople: 1,
    });
    expect(stats.byPerson.find((row) => row.userId === brunoId)?.worksites).toEqual([
      { projectId: null, projectName: null, days: 1 },
    ]);
  });
});

describe("timeClock: foto da marcação", () => {
  test("a rota HTTP confere rh.ponto.read a cada pedido e não expõe URL do storage", async () => {
    const { t, hr, ana } = await seed();
    const photoId = await t.run((ctx) =>
      ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }))
    );
    const receipt = await ana.mutation(api.timeClockPunch.register, {
      clientPunchId: "ana-photo",
      capturedAt: Date.now(),
      latitude: OBRA_A.latitude,
      longitude: OBRA_A.longitude,
      photoStorageId: photoId as Id<"_storage">,
      photoCapturedAt: Date.now(),
    });
    const path = `/time-clock/photo/${receipt.punchId}`;

    const ok = await hr.fetch(path, { method: "GET" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toBe("image/jpeg");
    expect(ok.headers.get("Cache-Control")).toContain("no-store");
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

    expect((await ana.fetch(path, { method: "GET" })).status).toBe(403);
    expect((await t.fetch(path, { method: "GET" })).status).toBe(401);
    expect((await hr.fetch("/time-clock/photo/nope", { method: "GET" })).status).toBe(404);
  });
});

describe("timeClock: configurações", () => {
  test("RH define e remove a cerca de uma obra", async () => {
    const { hr, projectA } = await seed();
    await hr.mutation(api.timeClock.setProjectGeofence, {
      projectId: projectA,
      geofence: { latitude: -23.5, longitude: -46.6, radiusMeters: 150.4 },
    });
    let worksites = await hr.query(api.timeClock.listWorksites, {});
    expect(worksites.find((w) => w.projectId === projectA)?.geofence).toEqual({
      latitude: -23.5,
      longitude: -46.6,
      radiusMeters: 150,
    });
    await expect(
      hr.mutation(api.timeClock.setProjectGeofence, {
        projectId: projectA,
        geofence: { latitude: -23.5, longitude: -46.6, radiusMeters: 5 },
      })
    ).rejects.toThrow(/Raio inválido/);
    await hr.mutation(api.timeClock.setProjectGeofence, { projectId: projectA, geofence: null });
    worksites = await hr.query(api.timeClock.listWorksites, {});
    expect(worksites.find((w) => w.projectId === projectA)?.geofence).toBeNull();
  });

  test("RH libera e retira o ponto de um usuário sem mexer nos outros acessos", async () => {
    const { t, hr } = await seed();
    const diegoId = await userIdOf(t, "diego");
    const adminId = await userIdOf(t, "admin");
    let people = await hr.query(api.timeClock.listClockPeople, {});
    expect(people.find((p) => p.userId === diegoId)?.clocksIn).toBe(false);
    // Administração não bate ponto só por ter acesso total.
    expect(people.find((p) => p.userId === adminId)?.clocksIn).toBe(false);

    await hr.mutation(api.timeClock.setClocksIn, { userId: diegoId, enabled: true });
    people = await hr.query(api.timeClock.listClockPeople, {});
    expect(people.find((p) => p.userId === diegoId)?.clocksIn).toBe(true);
    const diego = await t.run((ctx) => ctx.db.get("users", diegoId));
    expect(diego?.roles).toEqual(["engenharia"]);
    expect(diego?.permissionGrants).toEqual(["ponto.registrar"]);

    await hr.mutation(api.timeClock.setClocksIn, { userId: diegoId, enabled: false });
    const after = await t.run((ctx) => ctx.db.get("users", diegoId));
    expect(after?.permissionGrants).toEqual([]);
    expect(after?.permissionDenials).toEqual([]);
  });

  test("quem não é do RH não lê nem configura o ponto", async () => {
    const { t, ana, projectA } = await seed();
    const engineer = t.withIdentity({ subject: "diego" });
    const date = toBrtDateKey(Date.now());
    for (const client of [ana, engineer]) {
      await expect(client.query(api.timeClock.getDay, { date })).rejects.toThrow();
      await expect(client.query(api.timeClock.getLiveStatus, { date })).rejects.toThrow();
      await expect(client.query(api.timeClock.listClockPeople, {})).rejects.toThrow();
      await expect(
        client.mutation(api.timeClock.setProjectGeofence, { projectId: projectA, geofence: null })
      ).rejects.toThrow();
      await expect(
        client.mutation(api.timeClock.setClocksIn, {
          userId: await userIdOf(t, "ana"),
          enabled: false,
        })
      ).rejects.toThrow();
    }
  });
});
