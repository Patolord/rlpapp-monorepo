import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";

// Lista as entregas lançadas para uma obra.
export const list = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("materialDeliveries"),
      _creationTime: v.number(),
      modelo: v.string(),
      capacidade: v.union(v.string(), v.null()),
      qty: v.number(),
      date: v.number(),
      note: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const deliveries = await ctx.db
      .query("materialDeliveries")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
    return deliveries.map((d) => ({
      _id: d._id,
      _creationTime: d._creationTime,
      modelo: d.modelo,
      capacidade: d.capacidade ?? null,
      qty: d.qty,
      date: d.date,
      note: d.note ?? null,
    }));
  },
});

// Resumo por modelo: necessário (BOM) × entregue × saldo.
export const summary = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      modelo: v.string(),
      capacidade: v.union(v.string(), v.null()),
      needed: v.number(),
      installed: v.number(),
      delivered: v.number(),
      saldo: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("projectEquipment")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const deliveries = await ctx.db
      .query("materialDeliveries")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    type Row = {
      modelo: string;
      capacidade: string | null;
      needed: number;
      installed: number;
      delivered: number;
    };
    const byModel = new Map<string, Row>();

    function row(modelo: string, capacidade: string | null): Row {
      const key = modelo.toUpperCase();
      let r = byModel.get(key);
      if (!r) {
        r = { modelo, capacidade, needed: 0, installed: 0, delivered: 0 };
        byModel.set(key, r);
      }
      if (!r.capacidade && capacidade) r.capacidade = capacidade;
      return r;
    }

    for (const item of items) {
      const modelo = item.modelo.trim();
      if (!modelo) continue;
      const r = row(modelo, item.capacidade.trim() || null);
      r.needed += 1;
      if (item.status === "operational") r.installed += 1;
    }
    for (const d of deliveries) {
      const modelo = d.modelo.trim();
      if (!modelo) continue;
      const r = row(modelo, d.capacidade?.trim() || null);
      r.delivered += d.qty;
    }

    return Array.from(byModel.values())
      .map((r) => ({ ...r, saldo: r.needed - r.delivered }))
      .sort((a, b) => a.modelo.localeCompare(b.modelo));
  },
});

export const add = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    modelo: v.string(),
    capacidade: v.optional(v.string()),
    qty: v.number(),
    date: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.id("materialDeliveries"),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
    const modelo = args.modelo.trim();
    if (!modelo) throw new Error("Informe o modelo");
    const qty = Math.floor(args.qty);
    if (!Number.isFinite(qty) || qty === 0) {
      throw new Error("Quantidade inválida");
    }

    return await ctx.db.insert("materialDeliveries", {
      projectId: args.projectId,
      modelo,
      capacidade: args.capacidade?.trim() || undefined,
      qty,
      date: args.date,
      note: args.note?.trim() || undefined,
    });
  },
});

export const remove = engineeringMutation({
  args: { deliveryId: v.id("materialDeliveries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete("materialDeliveries", args.deliveryId);
    return null;
  },
});
