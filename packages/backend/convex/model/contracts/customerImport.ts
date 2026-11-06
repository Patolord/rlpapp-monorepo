import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import {
  emptyBulkImportResult,
  requireTrimmedName,
  type BulkImportResult,
} from "../procurement/bulkImport";
import {
  optionalTaxIdDigits,
  normalizeCustomerName,
  normalizeTaxId,
  validateTaxIdForPersonType,
} from "./customers";
import type { bulkCustomerItemValidator } from "./customerValidators";

/** Importação de clientes em lote (CSV), com um contato opcional por linha. */

export type BulkCustomerItem = Infer<typeof bulkCustomerItemValidator>;

const MAX_CUSTOMERS_PER_IMPORT = 200;

export async function bulkCreateCustomers(
  ctx: MutationCtx,
  user: Doc<"users">,
  items: BulkCustomerItem[]
): Promise<BulkImportResult> {
  if (items.length > MAX_CUSTOMERS_PER_IMPORT) {
    throw new Error("Máximo de 200 clientes por importação");
  }
  const result = emptyBulkImportResult();
  const now = Date.now();
  const importedNames = new Set<string>();
  const importedTaxIds = new Set<string>();
  let firstCreatedId: Id<"customers"> | null = null;

  for (let i = 0; i < items.length; i++) {
    const row = i + 1;
    const item = items[i]!;
    const nameCheck = requireTrimmedName(item.name, row, "Nome");
    if (!nameCheck.ok) {
      result.errors.push(nameCheck.error);
      continue;
    }

    const nameNormalized = normalizeCustomerName(nameCheck.name);
    const taxId = item.taxId ? optionalTaxIdDigits(item.taxId) : undefined;
    try {
      validateTaxIdForPersonType(taxId, item.personType);
    } catch (error) {
      result.errors.push({
        row,
        message: error instanceof Error ? error.message : "CPF/CNPJ inválido",
      });
      continue;
    }
    const taxIdNormalized = taxId ? normalizeTaxId(taxId) : undefined;
    const existingByName = importedNames.has(nameNormalized)
      ? true
      : Boolean(
          await ctx.db
            .query("customers")
            .withIndex("by_name_normalized", (q) =>
              q.eq("nameNormalized", nameNormalized)
            )
            .first()
        );
    const existingByTaxId =
      taxIdNormalized &&
      (importedTaxIds.has(taxIdNormalized) ||
        Boolean(
          await ctx.db
            .query("customers")
            .withIndex("by_tax_id_normalized", (q) =>
              q.eq("taxIdNormalized", taxIdNormalized)
            )
            .first()
        ));

    if (existingByName || existingByTaxId) {
      result.skipped++;
      continue;
    }

    const customerId = await ctx.db.insert("customers", {
      name: nameCheck.name,
      nameNormalized,
      personType: item.personType,
      legalName: item.legalName?.trim() || undefined,
      taxId,
      taxIdNormalized,
      email: item.email?.trim() || undefined,
      phone: item.phone?.trim() || undefined,
      address: item.address?.trim() || undefined,
      notes: item.notes?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
      createdByUserId: user._id,
      updatedByUserId: user._id,
    });

    if (item.contact?.name.trim()) {
      await ctx.db.insert("customerContacts", {
        customerId,
        name: item.contact.name.trim(),
        email: item.contact.email?.trim() || undefined,
        phone: item.contact.phone?.trim() || undefined,
        role: item.contact.role?.trim() || undefined,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    importedNames.add(nameNormalized);
    if (taxIdNormalized) importedTaxIds.add(taxIdNormalized);
    firstCreatedId ??= customerId;
    result.created++;
  }

  if (firstCreatedId) {
    await logAudit(ctx, user, {
      action: "create",
      tableName: "customers",
      recordId: firstCreatedId,
      details: `Importação CSV: ${result.created} criados, ${result.skipped} ignorados`,
    });
  }

  return result;
}
