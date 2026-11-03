import { ConvexError, v, type Infer } from "convex/values";
import {
  DESKTOP_BUDGET_CURRENCY,
  DESKTOP_BUDGET_MAX_LINES,
  type DesktopBudgetErrorCode,
  type DesktopBudgetErrorData,
  type PublishDesktopBudgetArgs,
  unsupportedCurrencyError,
} from "@rlpapp/shared/takeoff/desktopBudget";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { hasPermission } from "../../lib/rbac";
import { isProjectArchived } from "../../lib/projects/helpers";
import { projectStatus, takeoffBudgetMeta } from "../../schema";

/**
 * Publicação de orçamentos do app desktop de takeoff (apps/takeoff).
 *
 * Um projeto do desktop vira um takeoff (`source: "desktop"`, `externalId`);
 * cada item numa aba e numa seção vira uma linha com `externalLineId`
 * estável. Republicar atualiza o mesmo takeoff: insere linhas novas, atualiza
 * as existentes e apaga as que saíram — exceto as que a Compras já tocou
 * (cotação registrada ou status avançado), que o desktop não muda nem apaga:
 * ficam (acompanhando a obra do takeoff) e são reportadas.
 *
 * Só orçamentos aprovados pelo cliente chegam aqui: o desktop pede essa
 * confirmação antes de enviar, e `publishedAt` registra cada envio.
 *
 * Falhas esperadas são `ConvexError({ code, message })` (códigos em
 * `@rlpapp/shared/takeoff/desktopBudget`): em produção a mensagem de um
 * `Error` comum vira "Server Error" e o desktop não teria o que mostrar.
 */

function budgetError(code: DesktopBudgetErrorCode, message: string) {
  return new ConvexError<DesktopBudgetErrorData>({ code, message });
}

const invalid = (message: string) => budgetError("INVALID_BUDGET", message);

export const desktopBudgetLineValidator = v.object({
  externalLineId: v.string(),
  rawDescription: v.string(),
  quantity: v.number(),
  unit: v.optional(v.string()),
  /** Id do material no catálogo; ids desconhecidos ficam sem vínculo. */
  materialId: v.optional(v.string()),
  estimatedUnitPriceCents: v.optional(v.number()),
  laborUnitPriceCents: v.optional(v.number()),
  materialTotalCents: v.optional(v.number()),
  laborTotalCents: v.optional(v.number()),
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
    throw invalid(`Valor inválido em ${field}`);
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
  materialTotalCents?: number;
  laborTotalCents?: number;
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
    throw invalid(
      `Orçamento com ${lines.length} linhas; o limite por publicação é ${DESKTOP_BUDGET_MAX_LINES}`
    );
  }
  const seen = new Set<string>();
  const materialCache = new Map<string, Id<"materials"> | null>();
  const unknown = new Set<string>();
  const out: NormalizedLine[] = [];
  for (const [index, line] of lines.entries()) {
    const externalLineId = line.externalLineId.trim();
    if (!externalLineId) throw invalid(`Linha ${index + 1} sem id`);
    if (seen.has(externalLineId)) {
      throw invalid(`Linha repetida: ${externalLineId}`);
    }
    seen.add(externalLineId);
    const rawDescription = cleanText(line.rawDescription);
    if (!rawDescription) {
      throw invalid(`Linha ${index + 1} sem descrição`);
    }
    if (!Number.isFinite(line.quantity) || line.quantity < 0) {
      throw invalid(`Quantidade inválida em "${rawDescription}"`);
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
      materialTotalCents: cleanCents(
        line.materialTotalCents,
        "total de material"
      ),
      laborTotalCents: cleanCents(line.laborTotalCents, "total de mão de obra"),
      section: cleanText(line.section, 200),
      sheet: cleanText(line.sheet, 200),
      sortOrder: index,
    });
  }
  return { lines: out, unknownMaterialIds: [...unknown] };
}

function cleanFactor(value: number, field: string, sheet: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw invalid(`${field} inválido na aba "${sheet}"`);
  }
  return value;
}

function cleanMeta(meta: ValidatorArgs["meta"]): ValidatorArgs["meta"] {
  // Os preços são gravados e somados como reais: sem câmbio, outra moeda não entra.
  const currencyError = unsupportedCurrencyError(meta.currency);
  if (currencyError) throw budgetError("UNSUPPORTED_CURRENCY", currencyError);
  return {
    proposalNumber: cleanText(meta.proposalNumber, 100),
    estimator: cleanText(meta.estimator, 200),
    client: cleanText(meta.client, 200),
    site: cleanText(meta.site, 200),
    system: cleanText(meta.system, 200),
    currency: cleanText(meta.currency) ? DESKTOP_BUDGET_CURRENCY : undefined,
    sheets: meta.sheets.map((sheet) => {
      const name = cleanText(sheet.name, 200) ?? "Orçamento";
      const cents = (value: number, field: string) =>
        cleanCents(value, `${field} da aba "${name}"`)!;
      return {
        name,
        bdi: cleanFactor(sheet.bdi, "BDI", name),
        extrasPct: cleanFactor(sheet.extrasPct, "Percentual de extras", name),
        materialCents: cents(sheet.materialCents, "material"),
        laborCents: cents(sheet.laborCents, "mão de obra"),
        extrasEachCents: cents(sheet.extrasEachCents, "extras"),
        totalCents: cents(sheet.totalCents, "total geral"),
        proposalCents: cents(sheet.proposalCents, "preço com BDI"),
      };
    }),
  };
}

/** Campos que o desktop controla numa linha. */
function desktopFields(
  line: NormalizedLine,
  existing: Doc<"takeoffItems"> | null
) {
  // Material vinculado pela Compras (promoção) fica, a menos que o desktop
  // indique outro material válido. Linhas cotadas nem chegam aqui: são
  // preservadas inteiras (ver isPreserved).
  const materialId = line.materialId ?? existing?.materialId;
  return {
    rawDescription: line.rawDescription,
    quantity: line.quantity,
    unit: line.unit,
    materialId,
    estimatedUnitPriceCents: line.estimatedUnitPriceCents,
    laborUnitPriceCents: line.laborUnitPriceCents,
    materialTotalCents: line.materialTotalCents,
    laborTotalCents: line.laborTotalCents,
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
    item.materialTotalCents === fields.materialTotalCents &&
    item.laborTotalCents === fields.laborTotalCents &&
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

/**
 * Linha que a Compras já tocou: status avançado ou cotação registrada (cotar
 * não muda o status — a linha fica "matched"). O desktop não muda nem apaga.
 */
async function isPreserved(
  ctx: MutationCtx,
  item: Doc<"takeoffItems">
): Promise<boolean> {
  return isFrozenTakeoffItem(item) || (await hasQuotes(ctx, item._id));
}

export async function publishDesktopBudget(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: ValidatorArgs
): Promise<PublishDesktopBudgetResult> {
  const externalId = args.externalId.trim();
  if (!externalId) throw invalid("Informe o id do projeto do desktop");
  if (externalId.length > 200) throw invalid("Id do projeto muito longo");
  const name = cleanText(args.name, 200);
  if (!name) throw invalid("Informe o nome do orçamento");
  if (args.projectId) {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) {
      throw budgetError("PROJECT_NOT_FOUND", "Obra não encontrada no app");
    }
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
      const fields = desktopFields(line, null);
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

    const fields = desktopFields(line, item);
    const sameProject = item.projectId === projectId;
    if (await isPreserved(ctx, item)) {
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
    if (await isPreserved(ctx, item)) {
      // Fica, marcada como removida, e acompanha a obra do takeoff (consultas
      // por obra — pedidos de estoque, cotações — a procuram lá).
      const patch: {
        externalRemovedAt?: number;
        projectId?: Id<"projects">;
      } = {};
      if (item.externalRemovedAt === undefined) patch.externalRemovedAt = now;
      if (item.projectId !== projectId) patch.projectId = projectId;
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch("takeoffItems", item._id, patch);
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

  await moveLineQuotes(ctx, takeoffId, currentItems, projectId);

  return result;
}

/**
 * Cotações copiam a obra da linha ao serem registradas (priceEvents.add) e as
 * listas por obra leem esse campo: quando as linhas mudam de obra, as cotações
 * delas vão junto. Só as ligadas a linhas deste takeoff e ainda na obra antiga
 * da linha (uma cotação lançada de propósito em outra obra fica). Uma consulta
 * por takeoff, não por linha: as cotações ficam no limite de leituras.
 */
async function moveLineQuotes(
  ctx: MutationCtx,
  takeoffId: Id<"takeoffs">,
  itemsBefore: Doc<"takeoffItems">[],
  projectId: Id<"projects"> | undefined
) {
  // Linhas apagadas nesta publicação não tinham cotação (senão ficariam).
  const previousProject = new Map<Id<"takeoffItems">, Id<"projects"> | undefined>();
  for (const item of itemsBefore) {
    if (item.projectId !== projectId) previousProject.set(item._id, item.projectId);
  }
  if (previousProject.size === 0) return;
  const events = await ctx.db
    .query("priceEvents")
    .withIndex("by_takeoff", (q) => q.eq("takeoffId", takeoffId))
    .collect();
  for (const event of events) {
    if (!event.takeoffItemId || !previousProject.has(event.takeoffItemId)) {
      continue;
    }
    if (event.projectId !== previousProject.get(event.takeoffItemId)) continue;
    await ctx.db.patch("priceEvents", event._id, { projectId });
  }
}


// ---------------------------------------------------------------------------
// Opções do envio (seletor de obra do desktop)
// ---------------------------------------------------------------------------

/** Obras listadas no seletor do desktop (mais que isso: digite para filtrar no app). */
const MAX_PUBLISH_PROJECTS = 1000;

const publishProjectOption = v.object({
  _id: v.id("projects"),
  name: v.string(),
  /** Slug da URL da obra no app (ou o id, em obras antigas sem slug). */
  slug: v.string(),
  legacyNumber: v.union(v.number(), v.null()),
  status: v.union(projectStatus, v.null()),
  archived: v.boolean(),
});

export const desktopPublishOptionsArgs = {
  /** Id do projeto no desktop, para dizer se (e onde) ele já foi enviado. */
  externalId: v.optional(v.string()),
};

export const desktopPublishOptionsResult = v.object({
  /**
   * Se o usuário pode enviar (`engenharia.write`, a mesma permissão de
   * `publishFromDesktop`). Sem ela, `projects` vem vazio e `current` null: o
   * desktop explica o motivo em vez de mostrar um erro genérico.
   */
  canPublish: v.boolean(),
  /** Obras ativas por nome (mais a obra do envio anterior, mesmo arquivada). */
  projects: v.array(publishProjectOption),
  /** O orçamento já enviado com este `externalId`, se houver. */
  current: v.union(
    v.null(),
    v.object({
      takeoffId: v.id("takeoffs"),
      projectId: v.union(v.id("projects"), v.null()),
      projectName: v.union(v.string(), v.null()),
      projectSlug: v.union(v.string(), v.null()),
      publishedAt: v.union(v.number(), v.null()),
      publishedByName: v.union(v.string(), v.null()),
    })
  ),
});

export type DesktopPublishOptions = Infer<typeof desktopPublishOptionsResult>;

function projectOption(project: Doc<"projects">) {
  return {
    _id: project._id,
    name: project.name,
    slug: project.slug ?? project._id,
    legacyNumber: project.legacyNumber ?? null,
    status: project.status ?? null,
    archived: isProjectArchived(project),
  };
}

/**
 * O que o desktop precisa para enviar um orçamento aprovado: se o usuário
 * pode, as obras para escolher e o envio anterior do mesmo projeto.
 */
export async function desktopPublishOptions(
  ctx: QueryCtx,
  user: Doc<"users">,
  externalId: string | undefined
): Promise<DesktopPublishOptions> {
  if (!hasPermission(user, "engenharia.write")) {
    return { canPublish: false, projects: [], current: null };
  }
  const all = await ctx.db
    .query("projects")
    .withIndex("by_name")
    .take(MAX_PUBLISH_PROJECTS);
  const projects = all.filter((p) => !isProjectArchived(p)).map(projectOption);

  const key = externalId?.trim();
  const takeoff = key
    ? await ctx.db
        .query("takeoffs")
        .withIndex("by_source_external", (q) =>
          q.eq("source", "desktop").eq("externalId", key)
        )
        .unique()
    : null;
  if (!takeoff) return { canPublish: true, projects, current: null };

  const project = takeoff.projectId
    ? await ctx.db.get("projects", takeoff.projectId)
    : null;
  if (project && !projects.some((p) => p._id === project._id)) {
    projects.push(projectOption(project));
  }
  const publisher = takeoff.publishedByUserId
    ? await ctx.db.get("users", takeoff.publishedByUserId)
    : null;
  return {
    canPublish: true,
    projects,
    current: {
      takeoffId: takeoff._id,
      projectId: project?._id ?? null,
      projectName: project?.name ?? null,
      projectSlug: project ? (project.slug ?? project._id) : null,
      publishedAt: takeoff.publishedAt ?? null,
      publishedByName: publisher?.name ?? null,
    },
  };
}
