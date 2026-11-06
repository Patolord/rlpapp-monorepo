import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

type TestConvex = ReturnType<typeof setup>;

async function seedProject(t: TestConvex) {
  return t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      name: "Obra IA",
      floors: [],
      createdAt: Date.now(),
    });
    await ctx.db.insert("qrCodes", {
      token: "QR123",
      status: "active",
      createdAt: Date.now(),
    });
    return projectId;
  });
}

describe("aiIntents.applyIntents", () => {
  test("cria hierarquia, sistema, equipamento e vincula QR, com resumo na ordem", async () => {
    const t = setup();
    const eng = await withUser(t, { clerkId: "eng-ia", roles: ["engenheiro"] });
    const projectId = await seedProject(t);

    const result = await eng.mutation(api.aiIntents.applyIntents, {
      projectId,
      intents: [
        { type: "update_project", client: " Cliente X " },
        { type: "create_tower", name: "Torre A" },
        { type: "create_tower", name: "torre a" },
        { type: "create_tower", name: "   " },
        { type: "create_floors", towerName: "Torre A", from: 2, to: 0 },
        { type: "create_floors", towerName: "Torre A", from: 1, to: 1 },
        { type: "create_floors", towerName: "Torre B", from: 1, to: 2 },
        {
          type: "create_environment",
          towerName: "Torre A",
          floorNumber: 1,
          name: "Sala",
          envType: "sala",
          col: 2,
          colSpan: 0,
        },
        {
          type: "create_environment",
          towerName: "Torre A",
          floorNumber: 1,
          name: "sala",
        },
        {
          type: "create_environment",
          towerName: "Torre A",
          floorNumber: 9,
          name: "Cozinha",
        },
        {
          type: "resize_environment",
          towerName: "Torre A",
          floorNumber: 1,
          name: "Sala",
          colSpan: 3,
          rowSpan: 2,
        },
        { type: "create_system", name: "VRF 1", systemType: "VRF" },
        { type: "create_system", name: "vrf 1" },
        { type: "create_system", name: "VRF 1", obs: "Nova obs" },
        {
          type: "assign_qr",
          token: "qr123",
          towerName: "Torre A",
          floorNumber: 1,
          environmentName: "Sala",
        },
        {
          type: "add_equipment",
          towerName: "Torre A",
          floorNumber: 1,
          environmentName: "Sala",
          system: "vrf 1",
          kind: "evaporadora",
          modelo: " M1 ",
          capacidade: "9000",
        },
        {
          type: "assign_qr",
          token: "qr123",
          towerName: "Torre A",
          floorNumber: 1,
          environmentName: "Sala",
          kind: "evaporadora",
        },
        {
          type: "assign_qr",
          token: "QR123",
          towerName: "Torre A",
          floorNumber: 1,
          environmentName: "Sala",
        },
        {
          type: "assign_qr",
          token: "NOPE",
          towerName: "Torre A",
          floorNumber: 1,
          environmentName: "Sala",
        },
        {
          type: "update_equipment",
          towerName: "Torre A",
          floorNumber: 1,
          environmentName: "Sala",
          capacidade: "12000",
        },
        {
          type: "update_equipment",
          towerName: "Torre A",
          floorNumber: 1,
          environmentName: "Sala",
        },
        {
          type: "set_floor_deadline",
          towerName: "Torre A",
          floorNumber: 1,
          deadline: Date.UTC(2026, 11, 15, 12),
        },
        {
          type: "create_checklist_template",
          name: "Partida",
          items: [
            { label: " Vácuo ", required: true },
            { label: "  ", required: false },
          ],
        },
        {
          type: "rename_environment",
          towerName: "Torre A",
          floorNumber: 1,
          oldName: "Sala",
          newName: " Sala de Estar ",
        },
        { type: "duplicate_tower", towerName: "Torre A", newName: "Torre B" },
      ],
    });

    expect(result.summary).toEqual([
      "Dados da obra atualizados",
      'Torre "Torre A" criada',
      'Torre "torre a" já existe',
      '3 andar(es) criados na torre "Torre A"',
      '0 andar(es) criados na torre "Torre A"',
      'Torre "Torre B" não encontrada',
      'Ambiente "Sala" criado',
      'Ambiente "sala" já existe',
      'Andar 9 não encontrado na torre "Torre A"',
      'Ambiente "Sala" redimensionado (largura 3, 2 andar(es))',
      'Sistema "VRF 1" criado',
      'Sistema "VRF 1" já existe',
      'Sistema "VRF 1" atualizado',
      'Nenhum equipamento encontrado em "Sala" para o QR "qr123"',
      'Equipamento "vrf 1" adicionado em Sala',
      'QR "QR123" vinculado a VRF 1 (Evap.) em Sala',
      'QR code "QR123" já está vinculado',
      'QR code "NOPE" não encontrado',
      '1 equipamento(s) atualizado(s) em "Sala"',
      "Nenhuma alteração especificada",
      `Prazo de 1 equipamento(s) do 1º andar alterado para ${new Date(
        Date.UTC(2026, 11, 15, 12)
      ).toLocaleDateString("pt-BR")}`,
      'Checklist "Partida" criado',
      'Ambiente "Sala" renomeado para " Sala de Estar "',
      'Torre "Torre A" duplicada (3 andar(es))',
    ]);
    expect(result.applied).toBe(14);

    const state = await t.run(async (ctx) => {
      const project = await ctx.db.get("projects", projectId);
      const towers = await ctx.db
        .query("towers")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
      const floors = await ctx.db
        .query("floors")
        .withIndex("by_tower", (q) => q.eq("towerId", towers[0]._id))
        .collect();
      const envs = await ctx.db
        .query("environments")
        .withIndex("by_floor", (q) => q.eq("floorId", floors[1]._id))
        .collect();
      const systems = await ctx.db
        .query("systems")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
      const equipment = await ctx.db
        .query("projectEquipment")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
      const qr = await ctx.db
        .query("qrCodes")
        .withIndex("by_token", (q) => q.eq("token", "QR123"))
        .unique();
      const checklists = await ctx.db.query("checklistTemplates").collect();
      const history = await ctx.db.query("equipmentHistory").collect();
      const audit = await ctx.db.query("auditLogs").collect();
      return {
        project,
        towers,
        floors,
        envs,
        systems,
        equipment,
        qr,
        checklists,
        history,
        audit,
      };
    });

    expect(state.project?.client).toBe("Cliente X");
    expect(state.towers.map((tw) => [tw.name, tw.order])).toEqual([
      ["Torre A", 0],
      ["Torre B", 1],
    ]);
    expect(state.floors.map((f) => [f.number, f.label])).toEqual([
      [0, "Térreo"],
      [1, "1º Andar"],
      [2, "2º Andar"],
    ]);
    expect(state.envs).toHaveLength(1);
    expect(state.envs[0]).toMatchObject({
      name: "Sala de Estar",
      type: "sala",
      order: 0,
      col: 2,
      colSpan: 3,
      rowSpan: 2,
    });
    expect(state.systems).toHaveLength(1);
    expect(state.systems[0]).toMatchObject({
      name: "VRF 1",
      type: "VRF",
      obs: "Nova obs",
    });
    // Original + cópia da torre duplicada.
    expect(state.equipment).toHaveLength(2);
    const original = state.equipment.find((e) => e.towerId === state.towers[0]._id);
    expect(original).toMatchObject({
      system: "VRF 1",
      systemId: state.systems[0]._id,
      ambiente: "Sala",
      kind: "evaporadora",
      modelo: "M1",
      capacidade: "12000",
      status: "installing",
      deadline: Date.UTC(2026, 11, 15, 12),
    });
    expect(original?.linkedEquipmentId).toBeDefined();
    expect(state.qr?.equipmentId).toBe(original?.linkedEquipmentId);
    expect(state.qr?.projectId).toBe(projectId);
    expect(state.checklists).toHaveLength(1);
    expect(state.checklists[0].items).toEqual([
      { label: "Vácuo", required: true },
    ]);
    expect(state.history.map((h) => [h.action, h.newValue])).toEqual([
      ["qr_assigned", "QR123"],
    ]);
    expect(
      state.audit.filter((a) => a.action === "ai_apply").map((a) => a.details)
    ).toEqual(["14 intent(s) aplicados"]);
  });

  test("obra inexistente é rejeitada", async () => {
    const t = setup();
    const eng = await withUser(t, { clerkId: "eng-ia2", roles: ["engenheiro"] });
    const projectId = await seedProject(t);
    await t.run(async (ctx) => ctx.db.delete("projects", projectId));
    await expect(
      eng.mutation(api.aiIntents.applyIntents, { projectId, intents: [] })
    ).rejects.toThrow("Obra não encontrada");
  });
});
