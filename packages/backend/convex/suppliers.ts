import { v } from "convex/values";
import { engineeringOrPurchasingQuery, purchasingMutation } from "./lib/rbac";
import { logAudit, diffFields } from "./lib/audit";
import { normalizeText } from "./lib/compras/procurement";
import {
  bulkImportResultValidator,
  emptyBulkImportResult,
  requireTrimmedName,
} from "./lib/compras/bulkImport";

export const supplierValidator = v.object({
  _id: v.id("suppliers"),
  _creationTime: v.number(),
  name: v.string(),
  categories: v.union(v.array(v.string()), v.null()),
  notes: v.union(v.string(), v.null()),
  active: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

export const contactValidator = v.object({
  _id: v.id("supplierContacts"),
  supplierId: v.id("suppliers"),
  name: v.string(),
  email: v.union(v.string(), v.null()),
  whatsapp: v.union(v.string(), v.null()),
  role: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

function toSupplierRow(s: {
  _id: import("./_generated/dataModel").Id<"suppliers">;
  _creationTime: number;
  name: string;
  categories?: string[];
  notes?: string;
  active: boolean;
  createdAt: number;
  updatedAt?: number;
}) {
  return {
    _id: s._id,
    _creationTime: s._creationTime,
    name: s.name,
    categories: s.categories ?? null,
    notes: s.notes ?? null,
    active: s.active,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt ?? null,
  };
}

export const list = engineeringOrPurchasingQuery({
  args: {
    search: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(supplierValidator),
  handler: async (ctx, args) => {
    let suppliers = await ctx.db.query("suppliers").order("desc").collect();
    if (args.activeOnly) {
      suppliers = suppliers.filter((s) => s.active);
    }
    if (args.search?.trim()) {
      const term = normalizeText(args.search);
      suppliers = suppliers.filter((s) => normalizeText(s.name).includes(term));
    }
    return suppliers.map(toSupplierRow);
  },
});

export const get = engineeringOrPurchasingQuery({
  args: { supplierId: v.id("suppliers") },
  returns: v.union(
    v.object({
      supplier: supplierValidator,
      contacts: v.array(contactValidator),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const supplier = await ctx.db.get("suppliers", args.supplierId);
    if (!supplier) return null;
    const contacts = await ctx.db
      .query("supplierContacts")
      .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
      .collect();
    return {
      supplier: toSupplierRow(supplier),
      contacts: contacts.map((c) => ({
        _id: c._id,
        supplierId: c.supplierId,
        name: c.name,
        email: c.email ?? null,
        whatsapp: c.whatsapp ?? null,
        role: c.role ?? null,
        createdAt: c.createdAt,
      })),
    };
  },
});

export const create = purchasingMutation({
  args: {
    name: v.string(),
    categories: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  },
  returns: v.id("suppliers"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do fornecedor");
    const now = Date.now();
    const supplierId = await ctx.db.insert("suppliers", {
      name,
      categories: args.categories?.map((c) => c.trim()).filter(Boolean),
      notes: args.notes?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "suppliers",
      recordId: supplierId,
      details: name,
    });
    return supplierId;
  },
});

const bulkSupplierContactValidator = v.object({
  name: v.string(),
  email: v.optional(v.string()),
  whatsapp: v.optional(v.string()),
  role: v.optional(v.string()),
});

const bulkSupplierItemValidator = v.object({
  name: v.string(),
  categories: v.optional(v.array(v.string())),
  notes: v.optional(v.string()),
  contact: v.optional(bulkSupplierContactValidator),
});

export const bulkCreate = purchasingMutation({
  args: {
    items: v.array(bulkSupplierItemValidator),
  },
  returns: bulkImportResultValidator,
  handler: async (ctx, args) => {
    if (args.items.length > 200) {
      throw new Error("Máximo de 200 fornecedores por importação");
    }

    const result = emptyBulkImportResult();
    const now = Date.now();
    const existing = await ctx.db.query("suppliers").collect();
    const existingNames = new Set(existing.map((s) => normalizeText(s.name)));

    let firstCreatedId: string | null = null;

    for (let i = 0; i < args.items.length; i++) {
      const row = i + 1;
      const item = args.items[i]!;
      const nameCheck = requireTrimmedName(item.name, row, "Nome");
      if (!nameCheck.ok) {
        result.errors.push(nameCheck.error);
        continue;
      }

      const normalizedName = normalizeText(nameCheck.name);
      if (existingNames.has(normalizedName)) {
        result.skipped++;
        continue;
      }

      const supplierId = await ctx.db.insert("suppliers", {
        name: nameCheck.name,
        categories: item.categories?.map((c) => c.trim()).filter(Boolean),
        notes: item.notes?.trim() || undefined,
        active: true,
        createdAt: now,
        updatedAt: now,
      });

      if (item.contact?.name?.trim()) {
        await ctx.db.insert("supplierContacts", {
          supplierId,
          name: item.contact.name.trim(),
          email: item.contact.email?.trim() || undefined,
          whatsapp: item.contact.whatsapp?.trim() || undefined,
          role: item.contact.role?.trim() || undefined,
          createdAt: now,
        });
      }

      existingNames.add(normalizedName);
      if (!firstCreatedId) firstCreatedId = supplierId;
      result.created++;
    }

    if (result.created > 0 && firstCreatedId) {
      await logAudit(ctx, ctx.user, {
        action: "create",
        tableName: "suppliers",
        recordId: firstCreatedId,
        details: `Importação CSV: ${result.created} criados, ${result.skipped} ignorados`,
      });
    }

    return result;
  },
});

export const update = purchasingMutation({
  args: {
    supplierId: v.id("suppliers"),
    name: v.optional(v.string()),
    categories: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const supplier = await ctx.db.get("suppliers", args.supplierId);
    if (!supplier) throw new Error("Fornecedor não encontrado");

    const before = {
      name: supplier.name,
      categories: supplier.categories,
      notes: supplier.notes,
      active: supplier.active,
    };

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Informe o nome do fornecedor");
      updates.name = name;
    }
    if (args.categories !== undefined) {
      updates.categories = args.categories.map((c) => c.trim()).filter(Boolean);
    }
    if (args.notes !== undefined) updates.notes = args.notes.trim() || undefined;
    if (args.active !== undefined) updates.active = args.active;

    await ctx.db.patch("suppliers", args.supplierId, updates);
    const afterDoc = await ctx.db.get("suppliers", args.supplierId);
    const after = afterDoc
      ? {
          name: afterDoc.name,
          categories: afterDoc.categories,
          notes: afterDoc.notes,
          active: afterDoc.active,
        }
      : before;
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "suppliers",
      recordId: args.supplierId,
      entityLabel: after.name,
      changes: diffFields(before, after, [
        "name",
        "categories",
        "notes",
        "active",
      ]),
      snapshotBefore: before,
      snapshotAfter: after,
    });
    return null;
  },
});

export const addContact = purchasingMutation({
  args: {
    supplierId: v.id("suppliers"),
    name: v.string(),
    email: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  returns: v.id("supplierContacts"),
  handler: async (ctx, args) => {
    const supplier = await ctx.db.get("suppliers", args.supplierId);
    if (!supplier) throw new Error("Fornecedor não encontrado");
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do contato");

    return await ctx.db.insert("supplierContacts", {
      supplierId: args.supplierId,
      name,
      email: args.email?.trim() || undefined,
      whatsapp: args.whatsapp?.trim() || undefined,
      role: args.role?.trim() || undefined,
      createdAt: Date.now(),
    });
  },
});

export const removeContact = purchasingMutation({
  args: { contactId: v.id("supplierContacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contact = await ctx.db.get("supplierContacts", args.contactId);
    if (!contact) throw new Error("Contato não encontrado");

    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "supplierContacts",
      recordId: args.contactId,
      entityLabel: contact.name,
      snapshotBefore: {
        name: contact.name,
        supplierId: contact.supplierId,
      },
    });

    await ctx.db.delete("supplierContacts", args.contactId);
    return null;
  },
});
