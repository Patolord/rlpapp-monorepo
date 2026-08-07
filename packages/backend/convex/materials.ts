import { v } from "convex/values";
import { engineeringOrPurchasingQuery, purchasingMutation } from "./lib/rbac";
import { logAudit } from "./lib/audit";
import { materialStatus } from "./schema";
import { normalizeText } from "./lib/compras/procurement";

export const technicalAttributeValidator = v.object({
  key: v.string(),
  value: v.string(),
});

export const materialValidator = v.object({
  _id: v.id("materials"),
  _creationTime: v.number(),
  name: v.string(),
  category: v.union(v.string(), v.null()),
  unit: v.union(v.string(), v.null()),
  spec: v.union(v.string(), v.null()),
  brandPreference: v.union(v.string(), v.null()),
  technicalAttributes: v.union(
    v.array(technicalAttributeValidator),
    v.null()
  ),
  active: v.boolean(),
  status: v.union(materialStatus, v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

function toMaterialRow(m: {
  _id: import("./_generated/dataModel").Id<"materials">;
  _creationTime: number;
  name: string;
  category?: string;
  unit?: string;
  spec?: string;
  brandPreference?: string;
  technicalAttributes?: Array<{ key: string; value: string }>;
  active: boolean;
  status?: "draft" | "active" | "duplicate" | "archived";
  createdAt: number;
  updatedAt?: number;
}) {
  return {
    _id: m._id,
    _creationTime: m._creationTime,
    name: m.name,
    category: m.category ?? null,
    unit: m.unit ?? null,
    spec: m.spec ?? null,
    brandPreference: m.brandPreference ?? null,
    technicalAttributes: m.technicalAttributes ?? null,
    active: m.active,
    status: m.status ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt ?? null,
  };
}

function sanitizeTechnicalAttributes(
  attributes: Array<{ key: string; value: string }> | undefined
): Array<{ key: string; value: string }> | undefined {
  if (attributes === undefined) return undefined;
  if (attributes.length > 20) {
    throw new Error("Um material pode ter no máximo 20 atributos técnicos");
  }

  const result: Array<{ key: string; value: string }> = [];
  const keys = new Set<string>();
  for (const attribute of attributes) {
    const key = normalizeText(attribute.key);
    const value = attribute.value.trim();
    if (!key || !value) {
      throw new Error("Preencha a chave e o valor de todos os atributos técnicos");
    }
    if (keys.has(key)) {
      throw new Error(`Atributo técnico duplicado: ${key}`);
    }
    keys.add(key);
    result.push({ key, value });
  }
  return result;
}

export const list = engineeringOrPurchasingQuery({
  args: {
    search: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(materialValidator),
  handler: async (ctx, args) => {
    let materials = await ctx.db.query("materials").order("desc").collect();
    if (args.activeOnly) {
      materials = materials.filter((m) => m.active);
    }
    if (args.search?.trim()) {
      const term = normalizeText(args.search);
      materials = materials.filter(
        (m) =>
          normalizeText(m.name).includes(term) ||
          (m.category && normalizeText(m.category).includes(term))
      );
    }
    return materials.map(toMaterialRow);
  },
});

export const get = engineeringOrPurchasingQuery({
  args: { materialId: v.id("materials") },
  returns: v.union(materialValidator, v.null()),
  handler: async (ctx, args) => {
    const m = await ctx.db.get("materials", args.materialId);
    return m ? toMaterialRow(m) : null;
  },
});

export const suggest = engineeringOrPurchasingQuery({
  args: { term: v.string(), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("materials"),
      name: v.string(),
      unit: v.union(v.string(), v.null()),
      matchType: v.union(v.literal("alias"), v.literal("name")),
    })
  ),
  handler: async (ctx, args) => {
    const term = normalizeText(args.term);
    if (!term) return [];
    const limit = args.limit ?? 8;

    const aliasHits = await ctx.db
      .query("materialAliases")
      .withIndex("by_alias_normalized", (q) => q.eq("aliasNormalized", term))
      .take(limit);

    const results: Array<{
      _id: import("./_generated/dataModel").Id<"materials">;
      name: string;
      unit: string | null;
      matchType: "alias" | "name";
    }> = [];

    for (const alias of aliasHits) {
      const m = await ctx.db.get("materials", alias.materialId);
      if (m?.active) {
        results.push({
          _id: m._id,
          name: m.name,
          unit: m.unit ?? null,
          matchType: "alias",
        });
      }
    }

    const all = await ctx.db.query("materials").collect();
    for (const m of all) {
      if (!m.active) continue;
      if (results.some((r) => r._id === m._id)) continue;
      if (normalizeText(m.name).includes(term)) {
        results.push({
          _id: m._id,
          name: m.name,
          unit: m.unit ?? null,
          matchType: "name",
        });
      }
      if (results.length >= limit) break;
    }

    return results.slice(0, limit);
  },
});

export const create = purchasingMutation({
  args: {
    name: v.string(),
    category: v.optional(v.string()),
    unit: v.optional(v.string()),
    spec: v.optional(v.string()),
    brandPreference: v.optional(v.string()),
    technicalAttributes: v.optional(v.array(technicalAttributeValidator)),
    aliases: v.optional(v.array(v.string())),
  },
  returns: v.id("materials"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do material");

    const now = Date.now();
    const materialId = await ctx.db.insert("materials", {
      name,
      category: args.category?.trim() || undefined,
      unit: args.unit?.trim() || undefined,
      spec: args.spec?.trim() || undefined,
      brandPreference: args.brandPreference?.trim() || undefined,
      technicalAttributes: sanitizeTechnicalAttributes(args.technicalAttributes),
      active: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    for (const alias of args.aliases ?? []) {
      const trimmed = alias.trim();
      if (!trimmed) continue;
      await ctx.db.insert("materialAliases", {
        alias: trimmed,
        aliasNormalized: normalizeText(trimmed),
        materialId,
        createdAt: now,
      });
    }

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "materials",
      recordId: materialId,
      details: name,
    });

    return materialId;
  },
});

export const update = purchasingMutation({
  args: {
    materialId: v.id("materials"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    unit: v.optional(v.string()),
    spec: v.optional(v.string()),
    brandPreference: v.optional(v.string()),
    technicalAttributes: v.optional(v.array(technicalAttributeValidator)),
    active: v.optional(v.boolean()),
    status: v.optional(materialStatus),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const material = await ctx.db.get("materials", args.materialId);
    if (!material) throw new Error("Material não encontrado");

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Informe o nome do material");
      updates.name = name;
    }
    if (args.category !== undefined) updates.category = args.category.trim() || undefined;
    if (args.unit !== undefined) updates.unit = args.unit.trim() || undefined;
    if (args.spec !== undefined) updates.spec = args.spec.trim() || undefined;
    if (args.brandPreference !== undefined) {
      updates.brandPreference = args.brandPreference.trim() || undefined;
    }
    if (args.technicalAttributes !== undefined) {
      updates.technicalAttributes = sanitizeTechnicalAttributes(
        args.technicalAttributes
      );
    }
    if (args.active !== undefined) updates.active = args.active;
    if (args.status !== undefined) updates.status = args.status;

    await ctx.db.patch("materials", args.materialId, updates);
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "materials",
      recordId: args.materialId,
    });
    return null;
  },
});

export const addAlias = purchasingMutation({
  args: {
    materialId: v.id("materials"),
    alias: v.string(),
  },
  returns: v.id("materialAliases"),
  handler: async (ctx, args) => {
    const material = await ctx.db.get("materials", args.materialId);
    if (!material) throw new Error("Material não encontrado");
    const alias = args.alias.trim();
    if (!alias) throw new Error("Informe o alias");

    return await ctx.db.insert("materialAliases", {
      alias,
      aliasNormalized: normalizeText(alias),
      materialId: args.materialId,
      createdAt: Date.now(),
    });
  },
});

export const listAliases = engineeringOrPurchasingQuery({
  args: { materialId: v.id("materials") },
  returns: v.array(
    v.object({
      _id: v.id("materialAliases"),
      alias: v.string(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const aliases = await ctx.db
      .query("materialAliases")
      .withIndex("by_material", (q) => q.eq("materialId", args.materialId))
      .collect();
    return aliases.map((a) => ({
      _id: a._id,
      alias: a.alias,
      createdAt: a.createdAt,
    }));
  },
});
