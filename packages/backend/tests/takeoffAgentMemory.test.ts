import { describe, expect, test } from "vitest";
import {
  MAX_MEMORY_ENTRIES,
  MAX_MEMORY_SYMBOLS,
} from "@rlpapp/shared/takeoff/agentMemory";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

async function seedUsers() {
  const t = setup();
  const ana = await withUser(t, { clerkId: "ana", name: "Ana", roles: ["takeoff"] });
  const bruno = await withUser(t, { clerkId: "bruno", name: "Bruno", roles: ["takeoff"] });
  const hr = await withUser(t, { clerkId: "hr", name: "RH", roles: ["rh"] });
  return { t, ana, bruno, hr };
}

const note = { kind: "nota" as const, text: "O dreno aparece na planta mas não é escopo" };
const term = { kind: "termo" as const, text: "VE-01", target: "Exaustor", scope: "Tegra" };
const symbol = { kind: "simbolo" as const, text: "Cassete", target: "Cassete 4 vias", image: "iVBORw0KGgo=" };

describe("takeoffAgentMemory", () => {
  test("what one user teaches, every user of the app reads", async () => {
    const { ana, bruno } = await seedUsers();
    const added = await ana.mutation(api.takeoffAgentMemory.add, {
      ...note,
      text: `  ${note.text}  `,
      source: "Obra A",
    });
    expect(added).toMatchObject({ status: "ativa", added: true });
    await ana.mutation(api.takeoffAgentMemory.add, symbol);

    const seen = await bruno.query(api.takeoffAgentMemory.list, {});
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({
      id: added.id,
      kind: "nota",
      text: note.text,
      scope: "",
      target: null,
      image: null,
      status: "ativa",
      origin: "usuario",
      source: "Obra A",
      createdBy: "Ana",
    });
    expect(seen[1]).toMatchObject({ kind: "simbolo", image: symbol.image, target: "Cassete 4 vias" });
  });

  test("an agent's proposal waits until a person approves it", async () => {
    const { ana, bruno } = await seedUsers();
    const proposed = await ana.mutation(api.takeoffAgentMemory.add, { ...term, proposed: true });
    expect(proposed).toMatchObject({ status: "proposta", added: true });
    expect((await bruno.query(api.takeoffAgentMemory.list, {}))[0]).toMatchObject({
      status: "proposta",
      origin: "agente",
      scope: "Tegra",
    });

    await bruno.mutation(api.takeoffAgentMemory.approve, { id: proposed.id });
    expect((await ana.query(api.takeoffAgentMemory.list, {}))[0].status).toBe("ativa");
    // approving again changes nothing
    await bruno.mutation(api.takeoffAgentMemory.approve, { id: proposed.id });
  });

  test("the same lesson is not stored twice, and a person adding a proposed one approves it", async () => {
    const { ana, bruno } = await seedUsers();
    const first = await ana.mutation(api.takeoffAgentMemory.add, { ...term, proposed: true });
    const again = await ana.mutation(api.takeoffAgentMemory.add, {
      kind: "termo",
      text: "ve-01 ",
      target: "exaustor",
      scope: "tegra",
      proposed: true,
    });
    expect(again).toEqual({ id: first.id, status: "proposta", added: false });

    const byPerson = await bruno.mutation(api.takeoffAgentMemory.add, term);
    expect(byPerson).toEqual({ id: first.id, status: "ativa", added: false });
    expect(await ana.query(api.takeoffAgentMemory.list, {})).toHaveLength(1);

    // another scope is another lesson; two crops of the same item are two examples
    await ana.mutation(api.takeoffAgentMemory.add, { ...term, scope: "" });
    await ana.mutation(api.takeoffAgentMemory.add, symbol);
    await ana.mutation(api.takeoffAgentMemory.add, symbol);
    expect(await ana.query(api.takeoffAgentMemory.list, {})).toHaveLength(4);
  });

  test("removes an entry for everyone; removing one already gone is fine", async () => {
    const { ana, bruno } = await seedUsers();
    const { id } = await ana.mutation(api.takeoffAgentMemory.add, note);
    await bruno.mutation(api.takeoffAgentMemory.remove, { id });
    expect(await ana.query(api.takeoffAgentMemory.list, {})).toEqual([]);
    await bruno.mutation(api.takeoffAgentMemory.remove, { id });
    await expect(ana.mutation(api.takeoffAgentMemory.approve, { id })).rejects.toThrow(
      /não existe mais/,
    );
  });

  test("refuses entries that teach nothing, with the reason", async () => {
    const { ana } = await seedUsers();
    await expect(
      ana.mutation(api.takeoffAgentMemory.add, { kind: "nota", text: "   " }),
    ).rejects.toThrow(/vazio/);
    await expect(
      ana.mutation(api.takeoffAgentMemory.add, { kind: "termo", text: "VE-01" }),
    ).rejects.toThrow(/item que o termo representa/);
    await expect(
      ana.mutation(api.takeoffAgentMemory.add, { kind: "simbolo", text: "Cassete" }),
    ).rejects.toThrow(/recorte/);
    expect(await ana.query(api.takeoffAgentMemory.list, {})).toEqual([]);
  });

  test("is capped, in total and in symbols", async () => {
    const { t, ana } = await seedUsers();
    const userId = await t.run(async (ctx) => (await ctx.db.query("users").first())!._id);
    const fill = async (count: number, kind: "nota" | "simbolo") =>
      await t.run(async (ctx) => {
        for (let i = 0; i < count; i++) {
          await ctx.db.insert("takeoffAgentMemory", {
            kind,
            scope: "",
            text: `${kind} ${i}`,
            image: kind === "simbolo" ? "AAAA" : undefined,
            status: "ativa",
            origin: "usuario",
            createdAt: i,
            createdByUserId: userId,
          });
        }
      });

    await fill(MAX_MEMORY_SYMBOLS, "simbolo");
    await expect(ana.mutation(api.takeoffAgentMemory.add, symbol)).rejects.toThrow(/símbolos/);
    // a note still fits
    await ana.mutation(api.takeoffAgentMemory.add, note);

    await fill(MAX_MEMORY_ENTRIES - MAX_MEMORY_SYMBOLS - 1, "nota");
    await expect(
      ana.mutation(api.takeoffAgentMemory.add, { kind: "nota", text: "mais uma" }),
    ).rejects.toThrow(/entradas/);
    expect(await ana.query(api.takeoffAgentMemory.list, {})).toHaveLength(MAX_MEMORY_ENTRIES);
  });

  test("is only for users of the app", async () => {
    const { t, ana, hr } = await seedUsers();
    const { id } = await ana.mutation(api.takeoffAgentMemory.add, note);
    await expect(hr.query(api.takeoffAgentMemory.list, {})).rejects.toThrow();
    await expect(hr.mutation(api.takeoffAgentMemory.add, note)).rejects.toThrow();
    await expect(hr.mutation(api.takeoffAgentMemory.approve, { id })).rejects.toThrow();
    await expect(hr.mutation(api.takeoffAgentMemory.remove, { id })).rejects.toThrow();
    await expect(t.query(api.takeoffAgentMemory.list, {})).rejects.toThrow();
    expect(await ana.query(api.takeoffAgentMemory.list, {})).toHaveLength(1);
  });

  test("records who taught, approved and removed in the audit log", async () => {
    const { t, ana, bruno } = await seedUsers();
    const { id } = await ana.mutation(api.takeoffAgentMemory.add, { ...note, proposed: true });
    await bruno.mutation(api.takeoffAgentMemory.approve, { id });
    await bruno.mutation(api.takeoffAgentMemory.remove, { id });
    const logs = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(logs.map((l) => [l.action, l.tableName, l.details ?? null])).toEqual([
      ["create", "takeoffAgentMemory", "Proposta pelo agente de IA"],
      ["update", "takeoffAgentMemory", "Proposta da IA aprovada"],
      ["delete", "takeoffAgentMemory", null],
    ]);
  });
});
