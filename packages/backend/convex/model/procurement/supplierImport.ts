import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { emptyBulkImportResult, requireTrimmedName } from "./bulkImport";
import { normalizeText } from "./pricing";
import { prepareSupplierFields, type SupplierFieldsInput } from "./suppliers";

/** Importação em lote de fornecedores (CSV), com o primeiro contato de cada um. */

export type BulkSupplierItemInput = SupplierFieldsInput & {
  name: string;
  contact?: {
    name: string;
    email?: string;
    whatsapp?: string;
    role?: string;
  };
};

export async function bulkCreateSuppliers(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { items: BulkSupplierItemInput[] }
) {
  if (input.items.length > 200) {
    throw new Error("Máximo de 200 fornecedores por importação");
  }

  const result = emptyBulkImportResult();
  const now = Date.now();
  const existing = await ctx.db.query("suppliers").collect();
  const existingNames = new Set(existing.map((s) => normalizeText(s.name)));
  const existingTaxIds = new Set(
    existing.flatMap((s) => (s.taxIdNormalized ? [s.taxIdNormalized] : []))
  );

  let firstCreatedId: string | null = null;

  for (let i = 0; i < input.items.length; i++) {
    const row = i + 1;
    const item = input.items[i]!;
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

    let fields: ReturnType<typeof prepareSupplierFields>;
    try {
      fields = prepareSupplierFields(item);
    } catch (error) {
      result.errors.push({
        row,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (fields.taxIdNormalized && existingTaxIds.has(fields.taxIdNormalized)) {
      result.skipped++;
      continue;
    }

    const supplierId = await ctx.db.insert("suppliers", {
      name: nameCheck.name,
      ...fields,
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
    if (fields.taxIdNormalized) existingTaxIds.add(fields.taxIdNormalized);
    if (!firstCreatedId) firstCreatedId = supplierId;
    result.created++;
  }

  if (result.created > 0 && firstCreatedId) {
    await logAudit(ctx, user, {
      action: "create",
      tableName: "suppliers",
      recordId: firstCreatedId,
      details: `Importação CSV: ${result.created} criados, ${result.skipped} ignorados`,
    });
  }

  return result;
}
