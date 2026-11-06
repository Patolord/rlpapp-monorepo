import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import type { inventoryCompatibilityRuleType } from "../../schema/inventory";
import { normalizeText } from "../procurement/pricing";

/**
 * Regras de compatibilidade entre materiais (cadastro e avaliação). Uma
 * transferência com incompatibilidade fica pendente de aprovação do
 * engenheiro da obra (`documents.ts`).
 */

export type CompatibilityRuleType = Infer<typeof inventoryCompatibilityRuleType>;

export type CreateCompatibilityRuleInput = {
  type: CompatibilityRuleType;
  name: string;
  materialAId?: Id<"materials">;
  materialBId?: Id<"materials">;
  categoryA?: string;
  categoryB?: string;
  attributeKey?: string;
  message: string;
};

export type SetCompatibilityRuleActiveInput = {
  ruleId: Id<"inventoryCompatibilityRules">;
  active: boolean;
};

export type CompatibilityIssue = {
  ruleId: Id<"inventoryCompatibilityRules">;
  materialAId: Id<"materials">;
  materialBId: Id<"materials">;
  message: string;
};

function selectorMatches(
  material: Doc<"materials">,
  materialId: Id<"materials"> | undefined,
  category: string | undefined
): boolean {
  if (materialId && material._id !== materialId) return false;
  if (
    category &&
    normalizeText(material.category ?? "") !== normalizeText(category)
  ) {
    return false;
  }
  return materialId !== undefined || category !== undefined;
}

function getAttribute(
  material: Doc<"materials">,
  attributeKey: string
): string | null {
  const key = normalizeText(attributeKey);
  const attribute = material.technicalAttributes?.find(
    (candidate) => normalizeText(candidate.key) === key
  );
  return attribute ? normalizeText(attribute.value) : null;
}

function matchesRulePair(
  rule: Doc<"inventoryCompatibilityRules">,
  first: Doc<"materials">,
  second: Doc<"materials">
): boolean {
  const direct =
    selectorMatches(first, rule.materialAId, rule.categoryA) &&
    selectorMatches(second, rule.materialBId, rule.categoryB);
  const reverse =
    selectorMatches(first, rule.materialBId, rule.categoryB) &&
    selectorMatches(second, rule.materialAId, rule.categoryA);
  return direct || reverse;
}

export async function evaluateCompatibility(
  ctx: QueryCtx | MutationCtx,
  materialIds: Id<"materials">[]
): Promise<CompatibilityIssue[]> {
  const uniqueIds = [...new Set(materialIds)];
  const materials = (
    await Promise.all(
      uniqueIds.map(async (materialId) => {
        return await ctx.db.get("materials", materialId);
      })
    )
  ).filter((material): material is Doc<"materials"> => material !== null);

  const rules = await ctx.db
    .query("inventoryCompatibilityRules")
    .withIndex("by_active", (q) => q.eq("active", true))
    .take(500);

  const issues: CompatibilityIssue[] = [];
  for (let firstIndex = 0; firstIndex < materials.length; firstIndex += 1) {
    const first = materials[firstIndex];
    if (!first) continue;

    for (
      let secondIndex = firstIndex + 1;
      secondIndex < materials.length;
      secondIndex += 1
    ) {
      const second = materials[secondIndex];
      if (!second) continue;

      for (const rule of rules) {
        if (!matchesRulePair(rule, first, second)) continue;

        if (rule.type === "attributes_must_match") {
          if (!rule.attributeKey) continue;
          const firstValue = getAttribute(first, rule.attributeKey);
          const secondValue = getAttribute(second, rule.attributeKey);
          if (!firstValue || !secondValue || firstValue === secondValue) {
            continue;
          }
        }

        issues.push({
          ruleId: rule._id,
          materialAId: first._id,
          materialBId: second._id,
          message: rule.message,
        });
        if (issues.length >= 100) return issues;
      }
    }
  }

  return issues;
}

export async function listCompatibilityRules(ctx: QueryCtx) {
  const rules = await ctx.db
    .query("inventoryCompatibilityRules")
    .order("desc")
    .take(500);
  return await Promise.all(
    rules.map(async (rule) => {
      const [materialA, materialB] = await Promise.all([
        rule.materialAId
          ? ctx.db.get("materials", rule.materialAId)
          : null,
        rule.materialBId
          ? ctx.db.get("materials", rule.materialBId)
          : null,
      ]);
      return {
        _id: rule._id,
        type: rule.type,
        name: rule.name,
        materialAId: rule.materialAId ?? null,
        materialAName: materialA?.name ?? null,
        materialBId: rule.materialBId ?? null,
        materialBName: materialB?.name ?? null,
        categoryA: rule.categoryA ?? null,
        categoryB: rule.categoryB ?? null,
        attributeKey: rule.attributeKey ?? null,
        message: rule.message,
        active: rule.active,
      };
    })
  );
}

export async function createCompatibilityRule(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CreateCompatibilityRuleInput
): Promise<Id<"inventoryCompatibilityRules">> {
  const name = input.name.trim();
  const message = input.message.trim();
  const categoryA = input.categoryA?.trim();
  const categoryB = input.categoryB?.trim();
  const attributeKey = input.attributeKey?.trim().toLocaleLowerCase("pt-BR");
  if (!name || !message) {
    throw new Error("Informe o nome e a mensagem da regra");
  }
  if ((!input.materialAId && !categoryA) || (!input.materialBId && !categoryB)) {
    throw new Error("Defina os dois lados da regra");
  }
  if (input.type === "attributes_must_match" && !attributeKey) {
    throw new Error("Informe o atributo que deve coincidir");
  }

  const now = Date.now();
  const ruleId = await ctx.db.insert("inventoryCompatibilityRules", {
    type: input.type,
    name,
    materialAId: input.materialAId,
    materialBId: input.materialBId,
    categoryA: categoryA || undefined,
    categoryB: categoryB || undefined,
    attributeKey:
      input.type === "attributes_must_match" ? attributeKey : undefined,
    message,
    active: true,
    createdByUserId: user._id,
    createdAt: now,
    updatedAt: now,
  });
  await logAudit(ctx, user, {
    action: "create",
    tableName: "inventoryCompatibilityRules",
    recordId: ruleId,
    details: name,
  });
  return ruleId;
}

export async function setCompatibilityRuleActive(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: SetCompatibilityRuleActiveInput
): Promise<void> {
  const rule = await ctx.db.get(
    "inventoryCompatibilityRules",
    input.ruleId
  );
  if (!rule) throw new Error("Regra não encontrada");
  await ctx.db.patch("inventoryCompatibilityRules", input.ruleId, {
    active: input.active,
    updatedAt: Date.now(),
  });
  await logAudit(ctx, user, {
    action: input.active ? "activate" : "deactivate",
    tableName: "inventoryCompatibilityRules",
    recordId: input.ruleId,
  });
}
