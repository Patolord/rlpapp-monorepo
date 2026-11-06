import { v, type Infer } from "convex/values";
import { type RemoveDesktopBudgetArgs } from "@rlpapp/shared/takeoff/desktopBudget";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { budgetError, invalid, isPreserved, type Same } from "./desktopBudget";

// ---------------------------------------------------------------------------
// Remoção do orçamento (o desktop desfaz um envio)
// ---------------------------------------------------------------------------

export const removeDesktopBudgetArgs = {
  /** Id do projeto no desktop (o `externalId` do orçamento no app). */
  externalId: v.string(),
};

const _removeArgsObject = v.object(removeDesktopBudgetArgs);

const _sameRemoveShape: Same<
  Infer<typeof _removeArgsObject>,
  RemoveDesktopBudgetArgs
> = true;

void _sameRemoveShape;

export const removeDesktopBudgetResult = v.object({
  takeoffId: v.id("takeoffs"),
  name: v.string(),
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  /** Linhas apagadas junto com o orçamento. */
  removedLines: v.number(),
});

export type RemoveDesktopBudgetResult = Infer<typeof removeDesktopBudgetResult>;

export const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * Apaga um orçamento publicado pelo desktop com todas as suas linhas, seja a
 * pedido do desktop (desfazer um envio) ou do app (`takeoffs.remove`). Só
 * enquanto a Compras ainda não trabalhou nele: uma linha cotada ou levada
 * adiante (`isPreserved`), uma linha adicionada no app ou uma cotação lançada
 * no takeoff é trabalho de outra pessoa que a remoção descartaria —
 * `BUDGET_IN_USE`.
 */
export async function deleteDesktopTakeoff(
  ctx: MutationCtx,
  takeoff: Doc<"takeoffs">
): Promise<RemoveDesktopBudgetResult> {
  const items = await ctx.db
    .query("takeoffItems")
    .withIndex("by_takeoff", (q) => q.eq("takeoffId", takeoff._id))
    .collect();
  let worked = 0;
  let manual = 0;
  for (const item of items) {
    if (!item.externalLineId) manual++;
    else if (await isPreserved(ctx, item)) worked++;
  }
  const takeoffQuote = await ctx.db
    .query("priceEvents")
    .withIndex("by_takeoff", (q) => q.eq("takeoffId", takeoff._id))
    .first();
  if (worked > 0 || manual > 0 || takeoffQuote) {
    const reasons: string[] = [];
    if (worked > 0) {
      reasons.push(
        plural(worked, "linha já cotada ou comprada", "linhas já cotadas ou compradas")
      );
    }
    if (manual > 0) {
      reasons.push(plural(manual, "linha adicionada no app", "linhas adicionadas no app"));
    }
    if (worked === 0 && manual === 0) reasons.push("cotações registradas");
    throw budgetError(
      "BUDGET_IN_USE",
      `A Compras já trabalhou neste orçamento (${reasons.join(", ")}): ` +
        "ele não pode ser removido. Combine com a Compras o que fazer com ele."
    );
  }

  for (const item of items) {
    await ctx.db.delete("takeoffItems", item._id);
  }
  await ctx.db.delete("takeoffs", takeoff._id);

  const project = takeoff.projectId
    ? await ctx.db.get("projects", takeoff.projectId)
    : null;
  return {
    takeoffId: takeoff._id,
    name: takeoff.name,
    projectId: project?._id ?? null,
    projectName: project?.name ?? null,
    removedLines: items.length,
  };
}

/**
 * O desktop desfaz um envio: apaga o orçamento com este `externalId` (enviado
 * à obra errada, aprovação que caiu, teste). Sem orçamento com este id:
 * `BUDGET_NOT_FOUND` (já removido, ou nunca chegou). Recusas em
 * `deleteDesktopTakeoff`.
 */
export async function removeDesktopBudget(
  ctx: MutationCtx,
  args: { externalId: string }
): Promise<RemoveDesktopBudgetResult> {
  const externalId = args.externalId.trim();
  if (!externalId) throw invalid("Informe o id do projeto do desktop");
  const takeoff = await ctx.db
    .query("takeoffs")
    .withIndex("by_source_external", (q) =>
      q.eq("source", "desktop").eq("externalId", externalId)
    )
    .unique();
  if (!takeoff) {
    throw budgetError(
      "BUDGET_NOT_FOUND",
      "Este orçamento não está (mais) no app da empresa"
    );
  }
  return await deleteDesktopTakeoff(ctx, takeoff);
}

/**
 * O app remove um orçamento publicado pelo desktop, pelo id do takeoff. Só os
 * do desktop: um takeoff manual tem as suas linhas apagadas uma a uma. O
 * arquivo no desktop continua achando que foi enviado; o próximo envio cria
 * outro orçamento, e "Remover do app" lá só tira o vínculo. Recusas em
 * `deleteDesktopTakeoff`.
 */
export async function removeDesktopTakeoff(
  ctx: MutationCtx,
  takeoffId: Id<"takeoffs">
): Promise<RemoveDesktopBudgetResult> {
  const takeoff = await ctx.db.get("takeoffs", takeoffId);
  if (!takeoff) {
    throw budgetError("BUDGET_NOT_FOUND", "Orçamento não encontrado");
  }
  if (takeoff.source !== "desktop") {
    throw invalid(
      "Só orçamentos publicados pelo app desktop podem ser removidos por aqui"
    );
  }
  return await deleteDesktopTakeoff(ctx, takeoff);
}
