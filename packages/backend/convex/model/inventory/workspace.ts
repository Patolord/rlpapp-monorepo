import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import {
  hasPermission,
  hasRole,
  isAdmin,
  type Permission,
} from "../../lib/rbac";
import { createMaterialInternal } from "../procurement/materials";
import {
  canFulfillMaterialRequests,
  canReviewMaterialRequests,
} from "./requests";
import { canViewCentralInventory } from "./stockPolicy";

/**
 * O que a tela de estoque precisa para montar abas e formulários: as ações
 * liberadas ao usuário, os seletores de material e de obra e o cadastro
 * rápido de material durante uma entrada.
 */

export type InventoryAccess = {
  canViewCentral: boolean;
  canWriteCentral: boolean;
  canCreateEntry: boolean;
  canCreateProjectMovement: boolean;
  canConfigureRules: boolean;
  canQuickCreateMaterial: boolean;
  isEngineer: boolean;
  canReviewMaterialRequests: boolean;
  canFulfillMaterialRequests: boolean;
};

export type InventoryMaterialOption = {
  _id: Id<"materials">;
  name: string;
  variantLabel: string | null;
  sku: string | null;
  category: string | null;
  unit: string | null;
  technicalAttributes: { key: string; value: string }[];
};

export type QuickCreateInventoryMaterialInput = {
  name: string;
  variantLabel?: string;
  unit?: string;
  category?: string;
};

export function getInventoryAccess(user: Doc<"users">): InventoryAccess {
  const can = (permission: Permission) => hasPermission(user, permission);
  const canWriteCentral = can("estoque.write");
  const canCreateEntry = can("estoque.entrada");
  return {
    canViewCentral: canViewCentralInventory(user),
    canWriteCentral,
    canCreateEntry,
    canCreateProjectMovement: can("estoque.obras.write"),
    canConfigureRules: can("estoque.rules"),
    canQuickCreateMaterial: canCreateEntry || can("materiais.write"),
    // Engenheiro (não admin): vê a aba de aprovações de exceções, que só
    // ele decide (canDecideInventoryException).
    isEngineer: hasRole(user, "engenheiro") && !isAdmin(user),
    canReviewMaterialRequests: canReviewMaterialRequests(user),
    canFulfillMaterialRequests: canFulfillMaterialRequests(user),
  };
}

export async function listInventoryMaterialOptions(
  ctx: QueryCtx,
  rawSearch: string | undefined
): Promise<InventoryMaterialOption[]> {
  const search = rawSearch?.trim().toLocaleLowerCase("pt-BR");
  const materials = await ctx.db
    .query("materials")
    .withIndex("by_active", (q) => q.eq("active", true))
    .take(500);
  return materials
    .filter(
      (material) =>
        !search ||
        material.name.toLocaleLowerCase("pt-BR").includes(search) ||
        material.variantLabel?.toLocaleLowerCase("pt-BR").includes(search) ||
        material.category?.toLocaleLowerCase("pt-BR").includes(search) ||
        material.sku?.toLocaleLowerCase("pt-BR").includes(search)
    )
    .map((material) => ({
      _id: material._id,
      name: material.name,
      variantLabel: material.variantLabel ?? null,
      sku: material.sku ?? null,
      category: material.category ?? null,
      unit: material.unit ?? null,
      technicalAttributes: material.technicalAttributes ?? [],
    }));
}

export async function quickCreateInventoryMaterial(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: QuickCreateInventoryMaterialInput
): Promise<{
  materialId: Id<"materials">;
  name: string;
  variantLabel: string | null;
  sku: string;
  unit: string | null;
}> {
  const created = await createMaterialInternal(ctx, user, {
    name: input.name,
    variantLabel: input.variantLabel,
    unit: input.unit,
    category: input.category,
    trackInventory: true,
  });
  return {
    materialId: created.materialId,
    name: created.name,
    variantLabel: created.variantLabel ?? null,
    sku: created.sku,
    unit: created.unit ?? null,
  };
}

export async function listInventoryProjects(ctx: QueryCtx): Promise<
  {
    _id: Id<"projects">;
    name: string;
    responsibleId: Id<"users"> | null;
  }[]
> {
  const projects = await ctx.db.query("projects").order("desc").take(200);
  return projects.map((project) => ({
    _id: project._id,
    name: project.name,
    responsibleId: project.responsibleId ?? null,
  }));
}
