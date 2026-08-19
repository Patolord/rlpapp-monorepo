import { v } from "convex/values";
import {
  defaultDuctEstimateInput,
  defaultDuctPrices,
  isFilledDuctLine,
  MAX_DUCT_LINES,
  mergeDuctPrices,
  type DuctLineInput,
} from "@rlpapp/shared/engenharia/nbr16401";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { logAudit } from "./lib/audit";
import {
  ductLine,
  ductNorma,
  ductPrices,
} from "./schema";

const listItemValidator = v.object({
  _id: v.id("ductEstimates"),
  _creationTime: v.number(),
  projectId: v.id("projects"),
  name: v.string(),
  system: v.string(),
  budgetNumber: v.string(),
  updatedAt: v.number(),
  lineCount: v.number(),
});

const estimateValidator = v.object({
  _id: v.id("ductEstimates"),
  _creationTime: v.number(),
  projectId: v.id("projects"),
  name: v.string(),
  system: v.string(),
  budgetNumber: v.string(),
  norma: ductNorma,
  laborRatePerKg: v.number(),
  insulationAllowancePct: v.number(),
  supportAllowancePct: v.number(),
  insulationThicknessMm: v.number(),
  flangeSpacingM: v.number(),
  recladThicknessMm: v.number(),
  splitersQty: v.number(),
  captorsQty: v.number(),
  prices: ductPrices,
  lines: v.array(ductLine),
  createdAt: v.number(),
  updatedAt: v.number(),
  createdByUserId: v.union(v.id("users"), v.null()),
});

function assertFiniteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} inválido`);
  }
}

function sanitizeLines(lines: DuctLineInput[]): DuctLineInput[] {
  if (lines.length > MAX_DUCT_LINES) {
    throw new Error(`Máximo de ${MAX_DUCT_LINES} trechos por levantamento`);
  }
  const out: DuctLineInput[] = [];
  for (const line of lines) {
    assertFiniteNonNegative(line.largerSideCm, "Lado maior");
    assertFiniteNonNegative(line.smallerSideCm, "Lado menor");
    assertFiniteNonNegative(line.lengthM, "Comprimento");
    const next: DuctLineInput = {
      tag: line.tag?.trim() || undefined,
      largerSideCm: line.largerSideCm,
      smallerSideCm: line.smallerSideCm,
      lengthM: line.lengthM,
      externalInsulation: line.externalInsulation,
      internalInsulation: line.internalInsulation,
      flange: line.flange,
      reclad: line.reclad,
      paintReclad: line.paintReclad,
    };
    if (isFilledDuctLine(next)) out.push(next);
  }
  return out;
}

export const list = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(listItemValidator),
  handler: async (ctx, args) => {
    const estimates = await ctx.db
      .query("ductEstimates")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    estimates.sort((a, b) => b.updatedAt - a.updatedAt);
    return estimates.map((estimate) => ({
      _id: estimate._id,
      _creationTime: estimate._creationTime,
      projectId: estimate.projectId,
      name: estimate.name,
      system: estimate.system,
      budgetNumber: estimate.budgetNumber,
      updatedAt: estimate.updatedAt,
      lineCount: estimate.lines.length,
    }));
  },
});

export const get = engineeringQuery({
  args: { estimateId: v.id("ductEstimates") },
  returns: v.union(estimateValidator, v.null()),
  handler: async (ctx, args) => {
    const estimate = await ctx.db.get("ductEstimates", args.estimateId);
    if (!estimate) return null;
    return {
      ...estimate,
      createdByUserId: estimate.createdByUserId ?? null,
    };
  },
});

export const create = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
  },
  returns: v.id("ductEstimates"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do levantamento");

    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");

    const defaults = defaultDuctEstimateInput();
    const now = Date.now();
    const estimateId = await ctx.db.insert("ductEstimates", {
      projectId: args.projectId,
      name,
      system: "",
      budgetNumber: "",
      norma: defaults.norma,
      laborRatePerKg: defaults.laborRatePerKg,
      insulationAllowancePct: defaults.insulationAllowancePct,
      supportAllowancePct: defaults.supportAllowancePct,
      insulationThicknessMm: defaults.insulationThicknessMm,
      flangeSpacingM: defaults.flangeSpacingM,
      recladThicknessMm: defaults.recladThicknessMm,
      splitersQty: defaults.splitersQty,
      captorsQty: defaults.captorsQty,
      prices: defaultDuctPrices(),
      lines: [],
      createdAt: now,
      updatedAt: now,
      createdByUserId: ctx.user._id,
    });

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "ductEstimates",
      recordId: estimateId,
      details: name,
    });

    return estimateId;
  },
});

export const save = engineeringMutation({
  args: {
    estimateId: v.id("ductEstimates"),
    system: v.string(),
    budgetNumber: v.string(),
    norma: ductNorma,
    laborRatePerKg: v.number(),
    insulationAllowancePct: v.number(),
    supportAllowancePct: v.number(),
    insulationThicknessMm: v.number(),
    flangeSpacingM: v.number(),
    recladThicknessMm: v.number(),
    splitersQty: v.number(),
    captorsQty: v.number(),
    prices: ductPrices,
    lines: v.array(ductLine),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const estimate = await ctx.db.get("ductEstimates", args.estimateId);
    if (!estimate) throw new Error("Levantamento não encontrado");

    assertFiniteNonNegative(args.laborRatePerKg, "Valor de mão de obra");
    assertFiniteNonNegative(args.insulationAllowancePct, "Folga de isolamento");
    assertFiniteNonNegative(args.supportAllowancePct, "Folga de suportes");
    assertFiniteNonNegative(args.insulationThicknessMm, "Espessura de isolamento");
    assertFiniteNonNegative(args.flangeSpacingM, "Espaçamento de flange");
    assertFiniteNonNegative(args.recladThicknessMm, "Espessura de rechapeamento");
    assertFiniteNonNegative(args.splitersQty, "Quantidade de spliters");
    assertFiniteNonNegative(args.captorsQty, "Quantidade de captores");

    const prices = mergeDuctPrices(args.prices);
    for (const [key, value] of Object.entries(prices)) {
      assertFiniteNonNegative(value, `Preço ${key}`);
    }

    await ctx.db.patch("ductEstimates", args.estimateId, {
      system: args.system.trim(),
      budgetNumber: args.budgetNumber.trim(),
      norma: args.norma,
      laborRatePerKg: args.laborRatePerKg,
      insulationAllowancePct: args.insulationAllowancePct,
      supportAllowancePct: args.supportAllowancePct,
      insulationThicknessMm: args.insulationThicknessMm,
      flangeSpacingM: args.flangeSpacingM,
      recladThicknessMm: args.recladThicknessMm,
      splitersQty: args.splitersQty,
      captorsQty: args.captorsQty,
      prices,
      lines: sanitizeLines(args.lines),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const rename = engineeringMutation({
  args: {
    estimateId: v.id("ductEstimates"),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do levantamento");
    const estimate = await ctx.db.get("ductEstimates", args.estimateId);
    if (!estimate) throw new Error("Levantamento não encontrado");
    await ctx.db.patch("ductEstimates", args.estimateId, {
      name,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const remove = engineeringMutation({
  args: { estimateId: v.id("ductEstimates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const estimate = await ctx.db.get("ductEstimates", args.estimateId);
    if (!estimate) throw new Error("Levantamento não encontrado");
    await ctx.db.delete("ductEstimates", args.estimateId);
    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "ductEstimates",
      recordId: args.estimateId,
      details: estimate.name,
    });
    return null;
  },
});
