import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { normalizeText } from "../compras/procurement";

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
