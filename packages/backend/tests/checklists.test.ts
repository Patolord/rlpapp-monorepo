import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

// Itens novos entram depois do último, mesmo com buracos deixados por exclusões.
test("checklist: adicionar e aplicar modelo após excluir item não repetem a ordem", async () => {
  const t = setup();
  const asEngineer = await withUser(t, { clerkId: "eng", role: "engenheiro" });
  const equipmentId = await t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", { name: "Obra", floors: [], createdAt: 1 });
    return await ctx.db.insert("projectEquipment", {
      projectId,
      system: "VRF 1",
      ambiente: "Sala",
      kind: "evaporadora",
      modelo: "X",
      capacidade: "9k",
      status: "installing",
    });
  });

  for (const label of ["Vácuo", "Pressão", "Carga"]) {
    await asEngineer.mutation(api.checklists.addItem, { equipmentId, label });
  }
  const [, pressure] = await asEngineer.query(api.checklists.listForEquipment, { equipmentId });
  await asEngineer.mutation(api.checklists.removeItem, { itemId: pressure!._id });
  await asEngineer.mutation(api.checklists.addItem, { equipmentId, label: "Comunicação" });
  const templateId = await asEngineer.mutation(api.checklists.createTemplate, {
    name: "Final",
    items: [{ label: "Fotos", required: true }],
  });
  await asEngineer.mutation(api.checklists.applyTemplate, { equipmentId, templateId });

  const items = await asEngineer.query(api.checklists.listForEquipment, { equipmentId });
  expect(items.map((i) => i.label)).toEqual(["Vácuo", "Carga", "Comunicação", "Fotos"]);
  expect(new Set(items.map((i) => i.order)).size).toBe(items.length);
});
