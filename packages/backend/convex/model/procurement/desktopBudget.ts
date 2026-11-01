import { v, type Infer } from "convex/values";
import {
  DESKTOP_BUDGET_MAX_LINES,
  type PublishDesktopBudgetArgs,
} from "@rlpapp/shared/takeoff/desktopBudget";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { takeoffBudgetMeta } from "../../schema";

/**
 * Publicação de orçamentos do app desktop de takeoff (apps/takeoff).
 *
 * Um projeto do desktop vira um takeoff (`source: "desktop"`, `externalId`);
 * cada item numa aba e numa seção vira uma linha com `externalLineId`
 * estável. Republicar atualiza o mesmo takeoff: insere linhas novas, atualiza
 * as existentes e apaga as que saíram — exceto as que a Compras já tocou
 * (cotação registrada ou status avançado), que ficam e são reportadas.
 */

export const desktopBudgetLineValidator = v.object({
  externalLineId: v.string(),
  rawDescription: v.string(),
  quantity: v.number(),
  unit: v.optional(v.string()),
  /** Id do material no catálogo; ids desconhecidos ficam sem vínculo. */
  materialId: v.optional(v.string()),
  estimatedUnitPriceCents: v.optional(v.number()),
  laborUnitPriceCents: v.optional(v.number()),
  section: v.optional(v.string()),
  sheet: v.optional(v.string()),
});

export const publishDesktopBudgetArgs = {
  externalId: v.string(),
  projectId: v.optional(v.id("projects")),
  name: v.string(),
  meta: takeoffBudgetMeta,
  lines: v.array(desktopBudgetLineValidator),
};

const _publishArgsObject = v.object(publishDesktopBudgetArgs);
type ValidatorArgs = Infer<typeof _publishArgsObject>;
type SharedArgs = PublishDesktopBudgetArgs<Id<"projects">>;

// O tipo de @rlpapp/shared (usado pelo desktop) e o validador precisam
// descrever o mesmo objeto: falha de compilação aqui se divergirem.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _sameShape: Same<ValidatorArgs, SharedArgs> = true;
void _sameShape;

export const keptLineReason = v.union(
  v.literal("removed_in_desktop"),
  v.literal("changed_in_desktop")
);

export const publishDesktopBudgetResult = v.object({
  takeoffId: v.id("takeoffs"),
  /** true quando o takeoff foi criado nesta publicação. */
  created: v.boolean(),
  inserted: v.number(),
  updated: v.number(),
  unchanged: v.number(),
  removed: v.number(),
  /** Linhas preservadas porque a Compras já trabalhou nelas. */
  kept: v.array(
    v.object({
      externalLineId: v.string(),
      itemId: v.id("takeoffItems"),
      rawDescription: v.string(),
      status: v.union(v.string(), v.null()),
      reason: keptLineReason,
    })
  ),
  /** materialIds enviados que não existem no catálogo (linhas sem vínculo). */
  unknownMaterialIds: v.array(v.string()),
});

export type PublishDesktopBudgetResult = Infer<
  typeof publishDesktopBudgetResult
>;

/** Status em que a Compras já levou a linha adiante: o desktop não mexe. */
const FROZEN_STATUSES = new Set<Doc<"takeoffItems">["status"]>([
  "sent_to_supplier",
  "quoted",
  "selected",
  "purchased",
]);

export function isFrozenTakeoffItem(item: Doc<"takeoffItems">): boolean {
  return FROZEN_STATUSES.has(item.status);
}

const MAX_TEXT = 500;

function cleanText(value: string | undefined, max = MAX_TEXT) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function cleanCents(value: number | undefined, field: string) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Valor inválido em ${field}`);
  }
  return Math.round(value);
}

type NormalizedLine = {
  externalLineId: string;
  rawDescription: string;
  quantity: number;
  unit?: string;
  materialId?: Id<"materials">;
  estimatedUnitPriceCents?: number;
  laborUnitPriceCents?: number;
  section?: string;
  sheet?: string;
  sortOrder: number;
};

/** Segue fusões de materiais até o material vigente (ou undefined). */
async function resolveMaterialId(
  ctx: MutationCtx,
  raw: string,
  cache: Map<string, Id<"materials"> | null>
): Promise<Id<"materials"> | undefined> {
  const cached = cache.get(raw);
  if (cached !== undefined) return cached ?? undefined;
  let id = ctx.db.normalizeId("materials", raw);
  let resolved: Id<"materials"> | null = null;
  for (let hop = 0; id && hop < 5; hop++) {
    const material: Doc<"materials"> | null = await ctx.db.get(
      "materials",
      id
    );
    if (!material) break;
    if (material.mergedIntoId && material.mergedIntoId !== id) {
      id = material.mergedIntoId;
      continue;
    }
    resolved = material._id;
    break;
  }
  cache.set(raw, resolved);
  return resolved ?? undefined;
}

async function normalizeLines(
  ctx: MutationCtx,
  lines: ValidatorArgs["lines"]
): Promise<{ lines: NormalizedLine[]; unknownMaterialIds: string[] }> {
  if (lines.length > DESKTOP_BUDGET_MAX_LINES) {
    throw new Error(
      `Orçamento com ${lines.length} linhas; o limite por publicação é ${DESKTOP_BUDGET_MAX_LINES}`
    );
  }
  const seen = new Set<string>();
  const materialCache = new Map<string, Id<"materials"> | null>();
  const unknown = new Set<string>();
  const out: NormalizedLine[] = [];
  for (const [index, line] of lines.entries()) {
    const externalLineId = line.externalLineId.trim();
    if (!externalLineId) throw new Error(`Linha ${index + 1} sem id`);
    if (seen.has(externalLineId)) {
      throw new Error(`Linha repetida: ${externalLineId}`);
    }
    seen.add(externalLineId);
    const rawDescription = cleanText(line.rawDescription);
    if (!rawDescription) {
      throw new Error(`Linha ${index + 1} sem descrição`);
    }
    if (!Number.isFinite(line.quantity) || line.quantity < 0) {
      throw new Error(`Quantidade inválida em "${rawDescription}"`);
    }
    let materialId: Id<"materials"> | undefined;
    const rawMaterialId = line.materialId?.trim();
    if (rawMaterialId) {
      materialId = await resolveMaterialId(ctx, rawMaterialId, materialCache);
      if (!materialId) unknown.add(rawMaterialId);
    }
    out.push({
      externalLineId,
      rawDescription,
      quantity: line.quantity,
      unit: cleanText(line.unit, 40),
      materialId,
      estimatedUnitPriceCents: cleanCents(
        line.estimatedUnitPriceCents,
        "preço de material"
      ),
      laborUnitPriceCents: cleanCents(
        line.laborUnitPriceCents,
        "preço de mão de obra"
      ),
      section: cleanText(line.section, 200),
      sheet: cleanText(line.sheet, 200),
      sortOrder: index,
    });
  }
  return { lines: out, unknownMaterialIds: [...unknown] };
}

function cleanMeta(meta: ValidatorArgs["meta"]): ValidatorArgs["meta"] {
  return {
    proposalNumber: cleanText(meta.proposalNumber, 100),
    estimator: cleanText(meta.estimator, 200),
    client: cleanText(meta.client, 200),
    site: cleanText(meta.site, 200),
    system: cleanText(meta.system, 200),
    currency: cleanText(meta.currency, 10),
    sheets: meta.sheets.map((sheet) => ({
      ...sheet,
      name: cleanText(sheet.name, 200) ?? "Orçamento",
    })),
  };
}

/** Campos que o desktop controla numa linha. */
function desktopFields(
  line: NormalizedLine,
  existing: Doc<"takeoffItems"> | null,
  hasQuotes: boolean
) {
  // Material vinculado pela Compras (promoção ou cotação) fica, a menos que o
  // desktop indique outro material válido e ainda não haja cotação.
  const materialId =
    hasQuotes && existing?.materialId
      ? existing.materialId
      : (line.materialId ?? existing?.materialId);
  return {
    rawDescription: line.rawDescription,
    quantity: line.quantity,
    unit: line.unit,
    materialId,
    estimatedUnitPriceCents: line.estimatedUnitPriceCents,
    laborUnitPriceCents: line.laborUnitPriceCents,
    section: line.section,
    sheet: line.sheet,
    sortOrder: line.sortOrder,
  };
}

/** Mesmo conteúdo (ignora a posição na planilha). */
function sameContent(
  item: Doc<"takeoffItems">,
  fields: ReturnType<typeof desktopFields>
): boolean {
  return (
    item.rawDescription === fields.rawDescription &&
    item.quantity === fields.quantity &&
    item.unit === fields.unit &&
    item.materialId === fields.materialId &&
    item.estimatedUnitPriceCents === fields.estimatedUnitPriceCents &&
    item.laborUnitPriceCents === fields.laborUnitPriceCents &&
    item.section === fields.section &&
    item.sheet === fields.sheet
  );
}

function sameFields(
  item: Doc<"takeoffItems">,
  fields: ReturnType<typeof desktopFields>
): boolean {
  return sameContent(item, fields) && item.sortOrder === fields.sortOrder;
}

async function hasQuotes(
  ctx: MutationCtx,
  itemId: Id<"takeoffItems">
): Promise<boolean> {
  const quote = await ctx.db
    .query("priceEvents")
    .withIndex("by_takeoff_item", (q) => q.eq("takeoffItemId", itemId))
    .first();
  return quote !== null;
}

export async function publishDesktopBudget(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: ValidatorArgs
): Promise<PublishDesktopBudgetResult> {
  const externalId = args.externalId.trim();
  if (!externalId) throw new Error("Informe o id do projeto do desktop");
  if (externalId.length > 200) throw new Error("Id do projeto muito longo");
  const name = cleanText(args.name, 200);
  if (!name) throw new Error("Informe o nome do orçamento");
  if (args.projectId) {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
  }

  const { lines, unknownMaterialIds } = await normalizeLines(ctx, args.lines);
  const meta = cleanMeta(args.meta);
  const now = Date.now();

  const existing = await ctx.db
    .query("takeoffs")
    .withIndex("by_source_external", (q) =>
      q.eq("source", "desktop").eq("externalId", externalId)
    )
    .unique();

  let takeoffId: Id<"takeoffs">;
  let projectId: Id<"projects"> | undefined;
  if (existing) {
    takeoffId = existing._id;
    projectId = args.projectId ?? existing.projectId;
    await ctx.db.patch("takeoffs", takeoffId, {
      name,
      projectId,
      budget: meta,
      publishedAt: now,
      publishedByUserId: user._id,
      updatedAt: now,
    });
  } else {
    projectId = args.projectId;
    takeoffId = await ctx.db.insert("takeoffs", {
      projectId,
      name,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      createdByUserId: user._id,
      source: "desktop",
      externalId,
      budget: meta,
      publishedAt: now,
      publishedByUserId: user._id,
    });
  }

  const currentItems = existing
    ? await ctx.db
        .query("takeoffItems")
        .withIndex("by_takeoff", (q) => q.eq("takeoffId", takeoffId))
        .collect()
    : [];
  const byExternalId = new Map<string, Doc<"takeoffItems">>();
  for (const item of currentItems) {
    if (item.externalLineId) byExternalId.set(item.externalLineId, item);
  }

  const result: PublishDesktopBudgetResult = {
    takeoffId,
    created: !existing,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    removed: 0,
    kept: [],
    unknownMaterialIds,
  };

  for (const line of lines) {
    const item = byExternalId.get(line.externalLineId) ?? null;
    byExternalId.delete(line.externalLineId);
    if (!item) {
      const fields = desktopFields(line, null, false);
      await ctx.db.insert("takeoffItems", {
        takeoffId,
        projectId,
        ...fields,
        externalLineId: line.externalLineId,
        status: fields.materialId ? "matched" : "draft",
        createdAt: now,
        updatedAt: now,
      });
      result.inserted++;
      continue;
    }

    const quoted = await hasQuotes(ctx, item._id);
    const fields = desktopFields(line, item, quoted);
    const sameProject = item.projectId === projectId;
    if (isFrozenTakeoffItem(item)) {
      // Só a posição na planilha acompanha o desktop; o resto é da Compras.
      const reorder =
        item.sortOrder !== line.sortOrder ||
        item.externalRemovedAt !== undefined ||
        !sameProject;
      if (reorder) {
        await ctx.db.patch("takeoffItems", item._id, {
          sortOrder: line.sortOrder,
          externalRemovedAt: undefined,
          projectId,
        });
      }
      if (!sameContent(item, fields)) {
        result.kept.push({
          externalLineId: line.externalLineId,
          itemId: item._id,
          rawDescription: item.rawDescription,
          status: item.status ?? null,
          reason: "changed_in_desktop",
        });
      } else {
        result.unchanged++;
      }
      continue;
    }

    if (
      sameFields(item, fields) &&
      item.externalRemovedAt === undefined &&
      sameProject
    ) {
      result.unchanged++;
      continue;
    }
    const status =
      fields.materialId && (item.status ?? "draft") === "draft"
        ? "matched"
        : item.status;
    await ctx.db.patch("takeoffItems", item._id, {
      ...fields,
      projectId,
      status,
      externalRemovedAt: undefined,
      updatedAt: now,
    });
    result.updated++;
  }

  // O que sobrou veio do desktop e não está mais no orçamento.
  for (const item of byExternalId.values()) {
    if (isFrozenTakeoffItem(item) || (await hasQuotes(ctx, item._id))) {
      if (item.externalRemovedAt === undefined) {
        await ctx.db.patch("takeoffItems", item._id, {
          externalRemovedAt: now,
        });
      }
      result.kept.push({
        externalLineId: item.externalLineId!,
        itemId: item._id,
        rawDescription: item.rawDescription,
        status: item.status ?? null,
        reason: "removed_in_desktop",
      });
      continue;
    }
    await ctx.db.delete("takeoffItems", item._id);
    result.removed++;
  }

  // Linhas manuais (sem externalLineId) acompanham a obra do takeoff.
  if (existing && existing.projectId !== projectId) {
    for (const item of currentItems) {
      if (!item.externalLineId && item.projectId !== projectId) {
        await ctx.db.patch("takeoffItems", item._id, { projectId });
      }
    }
  }

  return result;
}

