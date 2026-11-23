import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  dueReminderKinds,
  sendDueTimeClockReminders,
} from "../convex/model/hr/timeClockReminders";
import { setup, withUser } from "./helpers";

// Segunda-feira, 23/11/2026, em Brasília (UTC-3).
const brt = (hour: number, minute = 0, day = 23) => Date.UTC(2026, 10, day, hour + 3, minute);

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
  // Diego não bate ponto: nunca recebe lembrete.
  await withUser(t, { clerkId: "diego", name: "Diego", roles: ["engenharia"] });
  await hr.mutation(api.timeClock.updateTimeClockSettings, {
    duplicateWindowMinutes: 0,
    locationRequired: false,
    entryReminderTime: "08:00",
    exitReminderTime: "18:00",
  });
  return { t, hr, ana, bruno };
}

async function reminders(t: ReturnType<typeof setup>, kind: string) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query("notifications").collect();
    const result: { name: string; readAt?: number; body: string; target: string }[] = [];
    for (const row of rows.filter((n) => n.kind === kind)) {
      const user = await ctx.db.get("users", row.userId as Id<"users">);
      result.push({ name: user?.name ?? "?", readAt: row.readAt, body: row.body, target: row.target });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  });
}

let punchSeq = 0;
async function punch(user: Awaited<ReturnType<typeof seed>>["ana"]) {
  punchSeq += 1;
  return await user.mutation(api.timeClockPunch.register, {
    clientPunchId: `p-${punchSeq}`,
    capturedAt: Date.now(),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("lembretes do ponto: regra", () => {
  const settings = {
    entryReminderTime: "08:00",
    exitReminderTime: "18:00",
    reminderWeekdays: [1, 2, 3, 4, 5],
  };
  const none = { entrada: null, saida: null };

  test("sai no horário e até 1 h depois, uma vez por dia", () => {
    expect(dueReminderKinds(settings, none, brt(7, 55))).toEqual([]);
    expect(dueReminderKinds(settings, none, brt(8, 0))).toEqual(["entrada"]);
    expect(dueReminderKinds(settings, none, brt(8, 59))).toEqual(["entrada"]);
    expect(dueReminderKinds(settings, none, brt(9, 0))).toEqual([]);
    expect(dueReminderKinds(settings, { entrada: "2026-11-23", saida: null }, brt(8, 5))).toEqual([]);
    expect(dueReminderKinds(settings, { entrada: "2026-11-22", saida: null }, brt(8, 5))).toEqual([
      "entrada",
    ]);
    expect(dueReminderKinds(settings, none, brt(18, 5))).toEqual(["saida"]);
  });

  test("respeita os dias da semana e o lembrete desligado", () => {
    // 22/11/2026 é domingo.
    expect(dueReminderKinds(settings, none, brt(8, 5, 22))).toEqual([]);
    expect(
      dueReminderKinds({ ...settings, reminderWeekdays: [0] }, none, brt(8, 5, 22))
    ).toEqual(["entrada"]);
    expect(dueReminderKinds({ ...settings, entryReminderTime: null }, none, brt(8, 5))).toEqual([]);
  });
});

describe("lembretes do ponto: envio", () => {
  test("entrada avisa só quem bate ponto e não marcou; não repete no dia", async () => {
    const { t, ana } = await seed();
    vi.setSystemTime(brt(7, 40));
    await punch(ana);

    vi.setSystemTime(brt(8, 5));
    const sent = await t.run(async (ctx) => await sendDueTimeClockReminders(ctx, Date.now()));
    expect(sent).toEqual({ entrada: 1, saida: 0 });
    const rows = await reminders(t, "N18");
    expect(rows.map((r) => r.name)).toEqual(["Bruno"]);
    expect(rows[0]!.target).toBe("ponto");

    vi.setSystemTime(brt(8, 10));
    const again = await t.run(async (ctx) => await sendDueTimeClockReminders(ctx, Date.now()));
    expect(again).toEqual({ entrada: 0, saida: 0 });
    expect(await reminders(t, "N18")).toHaveLength(1);
  });

  test("marcar o ponto tira o lembrete do sino", async () => {
    const { t, bruno } = await seed();
    vi.setSystemTime(brt(8, 5));
    await t.run(async (ctx) => await sendDueTimeClockReminders(ctx, Date.now()));
    expect((await reminders(t, "N18"))[0]!.readAt).toBeUndefined();

    vi.setSystemTime(brt(8, 20));
    await punch(bruno);
    expect((await reminders(t, "N18")).find((r) => r.name === "Bruno")!.readAt).toBeDefined();
  });

  test("saída avisa quem deixou o dia aberto, com a última marcação", async () => {
    const { t, ana, bruno } = await seed();
    vi.setSystemTime(brt(7, 30));
    await punch(ana);
    // Bruno fecha o dia: entrada, almoço, volta e saída.
    for (const [hour, minute] of [
      [7, 30],
      [12, 0],
      [13, 0],
      [17, 30],
    ] as const) {
      vi.setSystemTime(brt(hour, minute));
      await punch(bruno);
    }

    vi.setSystemTime(brt(18, 5));
    const sent = await t.run(async (ctx) => await sendDueTimeClockReminders(ctx, Date.now()));
    expect(sent).toEqual({ entrada: 0, saida: 1 });
    const rows = await reminders(t, "N19");
    expect(rows.map((r) => r.name)).toEqual(["Ana"]);
    expect(rows[0]!.body).toContain("a entrada, às 07:30");
  });

  test("valida os horários nas configurações", async () => {
    const { hr } = await seed();
    await expect(
      hr.mutation(api.timeClock.updateTimeClockSettings, { entryReminderTime: "8h" })
    ).rejects.toThrow(/formato/);
    await expect(
      hr.mutation(api.timeClock.updateTimeClockSettings, { exitReminderTime: "22:00" })
    ).rejects.toThrow(/entre 06:00 e 20:59/);
    await expect(
      hr.mutation(api.timeClock.updateTimeClockSettings, { exitReminderTime: "07:00" })
    ).rejects.toThrow(/depois do de entrada/);

    await hr.mutation(api.timeClock.updateTimeClockSettings, {
      entryReminderTime: null,
      reminderWeekdays: [6, 1, 1, 9],
    });
    const settings = await hr.query(api.timeClock.getTimeClockSettings, {});
    expect(settings.entryReminderTime).toBeNull();
    expect(settings.exitReminderTime).toBe("18:00");
    expect(settings.reminderWeekdays).toEqual([1, 6]);
  });
});
