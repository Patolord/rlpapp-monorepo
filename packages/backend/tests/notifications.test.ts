import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { quietUntil } from "../convex/push";
import { setup } from "./helpers";

async function seed() {
  const t = setup();
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const user = (name: string, clerkId: string, extra: Record<string, unknown>) =>
      ctx.db.insert("users", { name, clerkId, isActive: true, createdAt: now, role: "operator", ...extra });
    const engineerId = await user("Elaine", "n-eng", { role: "engenheiro", department: "engenharia" });
    const otherEngineerId = await user("Outro Eng", "n-eng2", { role: "engenheiro", department: "engenharia" });
    const stockId = await user("Bruno Estoque", "n-stock", { department: "estoque" });
    const buyerId = await user("Ana Compras", "n-buy", { department: "compras" });
    const techId = await user("Carlos Mendes", "n-tech", { role: "qr_operator" });
    const newTechId = await user("Novo Técnico", "n-tech2", { role: "qr_operator" });
    await user("Inativo Estoque", "n-stock-off", { department: "estoque", isActive: false });
    const projectId = await ctx.db.insert("projects", {
      name: "Edifício Aurora",
      slug: "edificio-aurora",
      responsibleId: engineerId,
      technicianIds: [techId],
      floors: [],
      createdAt: now,
    });
    const familyId = await ctx.db.insert("materialFamilies", {
      name: "Cobre",
      nameNormalized: "cobre",
      category: "tubo",
      baseUnit: "m",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const materialId = await ctx.db.insert("materials", {
      name: "Tubo de Cobre 1/4",
      familyId,
      identityKey: "n-copper",
      category: "tubo",
      unit: "m",
      active: true,
      status: "active",
      createdAt: now,
    });
    return { engineerId, otherEngineerId, stockId, buyerId, techId, newTechId, projectId, materialId };
  });
  return {
    t,
    ids,
    engineer: t.withIdentity({ subject: "n-eng" }),
    otherEngineer: t.withIdentity({ subject: "n-eng2" }),
    stock: t.withIdentity({ subject: "n-stock" }),
    buyer: t.withIdentity({ subject: "n-buy" }),
    tech: t.withIdentity({ subject: "n-tech" }),
    newTech: t.withIdentity({ subject: "n-tech2" }),
  };
}

describe("notificações", () => {
  test("pedido novo avisa só o engenheiro responsável (N1) e o sino conta", async () => {
    const { ids, engineer, otherEngineer, tech } = await seed();
    await tech.mutation(api.inventoryRequests.createRequest, {
      projectId: ids.projectId,
      items: [{ materialId: ids.materialId, quantity: 3, reason: "replenishment" }],
    });

    const mine = await engineer.query(api.notifications.listMine, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      kind: "N1",
      category: "pedidos",
      title: "Pedido de material · Edifício Aurora",
      body: "Carlos Mendes pediu 1 item. Toque para aprovar ou recusar.",
      target: "pedido",
      projectId: ids.projectId,
      readAt: null,
      pushStatus: "skipped",
    });
    expect(await engineer.query(api.notifications.unreadCount, {})).toBe(1);
    expect(await otherEngineer.query(api.notifications.unreadCount, {})).toBe(0);
    // Quem fez a ação não é avisado.
    expect(await tech.query(api.notifications.unreadCount, {})).toBe(0);

    await engineer.mutation(api.notifications.markRead, { notificationId: mine[0]!._id });
    expect(await engineer.query(api.notifications.unreadCount, {})).toBe(0);
    await expect(
      tech.mutation(api.notifications.markRead, { notificationId: mine[0]!._id })
    ).rejects.toThrow("Aviso não encontrado");
  });

  test("aprovar avisa quem pediu (N2a) e o estoque ativo (N2b); recusar avisa N3", async () => {
    const { ids, engineer, tech, stock, buyer } = await seed();
    const first = await tech.mutation(api.inventoryRequests.createRequest, {
      projectId: ids.projectId,
      items: [{ materialId: ids.materialId, quantity: 3, reason: "replenishment" }],
    });
    await engineer.mutation(api.inventoryRequests.reviewRequest, {
      requestId: first,
      decision: "approve",
      reason: "ok",
    });
    const techInbox = await tech.query(api.notifications.listMine, {});
    expect(techInbox.map((n) => n.kind)).toEqual(["N2a"]);
    expect(techInbox[0]!.target).toBe("estoque_obra");
    const stockInbox = await stock.query(api.notifications.listMine, {});
    expect(stockInbox.map((n) => n.kind)).toEqual(["N2b"]);
    expect(stockInbox[0]!.body).toContain("aprovado por Elaine");
    expect(await buyer.query(api.notifications.unreadCount, {})).toBe(0);

    const second = await tech.mutation(api.inventoryRequests.createRequest, {
      projectId: ids.projectId,
      items: [{ materialId: ids.materialId, quantity: 1, reason: "replenishment" }],
    });
    await engineer.mutation(api.inventoryRequests.reviewRequest, {
      requestId: second,
      decision: "reject",
      reason: "Material já está na obra",
    });
    const latest = await tech.query(api.notifications.listMine, { onlyUnread: true });
    expect(latest[0]).toMatchObject({ kind: "N3", body: 'Motivo: "Material já está na obra"' });

    expect(await tech.mutation(api.notifications.markAllRead, {})).toBe(2);
    expect(await tech.query(api.notifications.unreadCount, {})).toBe(0);
  });

  test("técnico incluído na obra recebe N7; quem já estava não", async () => {
    const { ids, engineer, tech, newTech } = await seed();
    await engineer.mutation(api.projects.setTechnicians, {
      projectId: ids.projectId,
      technicianIds: [ids.techId, ids.newTechId],
    });
    const inbox = await newTech.query(api.notifications.listMine, {});
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ kind: "N7", target: "obra", body: "Você foi incluído na obra Edifício Aurora." });
    expect(await tech.query(api.notifications.unreadCount, {})).toBe(0);
  });

  test("preferências: padrão com horário silencioso e atualização", async () => {
    const { buyer } = await seed();
    expect(await buyer.query(api.notifications.getPreferences, {})).toEqual({ pushOff: [], quietHours: true });
    await buyer.mutation(api.notifications.updatePreferences, {
      pushOff: ["compras_estoque", "compras_estoque"],
      quietHours: false,
    });
    expect(await buyer.query(api.notifications.getPreferences, {})).toEqual({
      pushOff: ["compras_estoque"],
      quietHours: false,
    });
  });

  test("token de push: valida, passa para quem entrou e enfileira o envio", async () => {
    const { t, ids, engineer, otherEngineer, tech } = await seed();
    await expect(
      engineer.mutation(api.notifications.registerPushToken, { token: "abc", platform: "ios" })
    ).rejects.toThrow("Token de push inválido");

    const token = "ExponentPushToken[xyz]";
    await otherEngineer.mutation(api.notifications.registerPushToken, { token, platform: "android" });
    await engineer.mutation(api.notifications.registerPushToken, { token, platform: "android" });
    const tokens = await t.run((ctx) => ctx.db.query("pushTokens").collect());
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.userId).toBe(ids.engineerId);

    await tech.mutation(api.inventoryRequests.createRequest, {
      projectId: ids.projectId,
      items: [{ materialId: ids.materialId, quantity: 2, reason: "replenishment" }],
    });
    const [n] = await engineer.query(api.notifications.listMine, {});
    expect(n!.pushStatus).toBe("queued");

    await engineer.mutation(api.notifications.unregisterPushToken, { token });
    const after = await t.run((ctx) => ctx.db.query("pushTokens").collect());
    expect(after[0]!.disabledAt).toBeTypeOf("number");
  });

  test("planDelivery respeita categoria desligada e horário silencioso", async () => {
    const { t, ids, engineer, tech } = await seed();
    await engineer.mutation(api.notifications.registerPushToken, {
      token: "ExponentPushToken[eng]",
      platform: "ios",
    });
    await tech.mutation(api.inventoryRequests.createRequest, {
      projectId: ids.projectId,
      items: [{ materialId: ids.materialId, quantity: 2, reason: "replenishment" }],
    });
    const [n] = await engineer.query(api.notifications.listMine, {});

    const noon = Date.UTC(2026, 10, 9, 15, 0); // 12:00 em Brasília
    const night = Date.UTC(2026, 10, 9, 2, 0); // 23:00 em Brasília
    let plan = await t.query(internal.push.planDelivery, { ids: [n!._id], now: noon });
    expect(plan.deliver).toHaveLength(1);
    expect(plan.deliver[0]!.tokens.map((x) => x.token)).toEqual(["ExponentPushToken[eng]"]);
    expect(plan.deliver[0]!.badge).toBe(1);

    plan = await t.query(internal.push.planDelivery, { ids: [n!._id], now: night });
    expect(plan.deferred).toEqual([n!._id]);
    expect(plan.deferUntil).toBe(Date.UTC(2026, 10, 9, 9, 0));

    await engineer.mutation(api.notifications.updatePreferences, { pushOff: ["pedidos"], quietHours: true });
    plan = await t.query(internal.push.planDelivery, { ids: [n!._id], now: noon });
    expect(plan.deliver).toHaveLength(0);
    expect(plan.skipped[0]!.reason).toBe("Desligado nas preferências");
  });

  test("quietUntil: 21h–6h de Brasília", () => {
    expect(quietUntil(Date.UTC(2026, 10, 9, 0, 30))).toBe(Date.UTC(2026, 10, 9, 9, 0));
    expect(quietUntil(Date.UTC(2026, 10, 9, 8, 59))).toBe(Date.UTC(2026, 10, 9, 9, 0));
    expect(quietUntil(Date.UTC(2026, 10, 9, 9, 0))).toBeNull();
    expect(quietUntil(Date.UTC(2026, 10, 9, 23, 59))).toBeNull();
  });
});
