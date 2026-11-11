import { activeAdmins, notify } from "../notifications/notify";
import { logAudit } from "../../lib/audit";
import { resolveCustomerLabel } from "../engineering/projects";
import {
  assertContractEligibleForMeasurement,
  isContractEligibleForMeasurement,
} from "./rules";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

// Medições de contratos de venda ao cliente: listagens por obra, criação,
// edição em rascunho, fluxo de status (rascunho → aprovada → paga) e a visão
// consolidada de todas as obras.

function sumCents(medicoes: Doc<"medicoes">[]): {
  medidoCents: number;
  aprovadoCents: number;
  pagoCents: number;
} {
  let medidoCents = 0;
  let aprovadoCents = 0;
  let pagoCents = 0;
  for (const m of medicoes) {
    medidoCents += m.amountCents;
    if (m.status === "aprovada") aprovadoCents += m.amountCents;
    if (m.status === "paga") pagoCents += m.amountCents;
  }
  return { medidoCents, aprovadoCents, pagoCents };
}

async function getMedicoesByContract(
  ctx: QueryCtx,
  contractId: Id<"contracts">
): Promise<Doc<"medicoes">[]> {
  return await ctx.db
    .query("medicoes")
    .withIndex("by_contract", (q) => q.eq("contractId", contractId))
    .collect();
}

/** Lista contratos elegíveis para medições nesta obra, com os totais medidos. */
export async function listMeasurableContracts(
  ctx: QueryCtx,
  projectId: Id<"projects">
) {
  const contracts = await ctx.db
    .query("contracts")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  const eligible = contracts.filter(isContractEligibleForMeasurement);

  return await Promise.all(
    eligible.map(async (contract) => {
      const medicoes = await getMedicoesByContract(ctx, contract._id);
      const { medidoCents, aprovadoCents, pagoCents } = sumCents(medicoes);
      return {
        _id: contract._id,
        projectId: projectId,
        title: contract.title,
        valueCents: contract.valueCents,
        notes: contract.notes ?? null,
        signedAt: contract.signedAt ?? null,
        createdAt: contract.createdAt,
        medicaoCount: medicoes.length,
        medidoCents,
        aprovadoCents,
        pagoCents,
        saldoCents: contract.valueCents - medidoCents,
      };
    })
  );
}

/** Medições da obra, da mais recente (maior sequência) para a mais antiga. */
export async function listProjectMedicoes(
  ctx: QueryCtx,
  projectId: Id<"projects">
) {
  const medicoes = await ctx.db
    .query("medicoes")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  const contractTitles = new Map<Id<"contracts">, string>();
  const userNames = new Map<Id<"users">, string | null>();

  const result = await Promise.all(
    medicoes.map(async (m) => {
      if (!contractTitles.has(m.contractId)) {
        const contract = await ctx.db.get("contracts", m.contractId);
        contractTitles.set(m.contractId, contract?.title ?? "Contrato");
      }
      if (!userNames.has(m.createdBy)) {
        const user = await ctx.db.get("users", m.createdBy);
        userNames.set(m.createdBy, user?.name ?? null);
      }
      return {
        _id: m._id,
        projectId: m.projectId,
        contractId: m.contractId,
        contractTitle: contractTitles.get(m.contractId) ?? "Contrato",
        sequence: m.sequence,
        description: m.description ?? null,
        basis: m.basis,
        percent: m.percent ?? null,
        amountCents: m.amountCents,
        status: m.status,
        referenceDate: m.referenceDate,
        approvedAt: m.approvedAt ?? null,
        paidAt: m.paidAt ?? null,
        createdByName: userNames.get(m.createdBy) ?? null,
        createdAt: m.createdAt,
      };
    })
  );

  result.sort((a, b) => b.sequence - a.sequence);
  return result;
}

export type CreateMedicaoInput = {
  contractId: Id<"contracts">;
  description?: string;
  basis: Doc<"medicoes">["basis"];
  percent?: number;
  amountCents?: number;
  referenceDate: number;
};

export async function createContractMedicao(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CreateMedicaoInput
): Promise<Id<"medicoes">> {
  const contract = await ctx.db.get("contracts", input.contractId);
  if (!contract) throw new Error("Contrato não encontrado");
  assertContractEligibleForMeasurement(contract);
  const projectId = contract.projectId!;

  let amountCents: number;
  let percent: number | undefined;

  if (input.basis === "valor_fixo") {
    if (input.amountCents === undefined || input.amountCents <= 0) {
      throw new Error("Informe o valor da medição");
    }
    amountCents = Math.round(input.amountCents);
    percent = undefined;
  } else {
    // percentual ou progresso_equipamentos: valor derivado do % do contrato.
    if (input.percent === undefined || input.percent <= 0) {
      throw new Error("Informe o percentual da medição");
    }
    percent = input.percent;
    amountCents = Math.round((contract.valueCents * input.percent) / 100);
  }

  const existing = await getMedicoesByContract(ctx, input.contractId);
  const sequence =
    existing.reduce((max, m) => Math.max(max, m.sequence), 0) + 1;

  const medicaoId = await ctx.db.insert("medicoes", {
    projectId,
    contractId: input.contractId,
    sequence,
    description: input.description?.trim() || undefined,
    basis: input.basis,
    percent,
    amountCents,
    status: "rascunho",
    referenceDate: input.referenceDate,
    createdBy: user._id,
    createdAt: Date.now(),
  });

  await logAudit(ctx, user, {
    action: "create",
    tableName: "medicoes",
    recordId: medicaoId,
    details: `Medição nº ${sequence} do contrato "${contract.title}"`,
  });

  return medicaoId;
}

export type UpdateMedicaoInput = {
  medicaoId: Id<"medicoes">;
  description?: string;
  basis?: Doc<"medicoes">["basis"];
  percent?: number;
  amountCents?: number;
  referenceDate?: number;
};

/** Edita uma medição em rascunho, recalculando o valor pelo % do contrato. */
export async function updateDraftMedicao(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: UpdateMedicaoInput
): Promise<void> {
  const medicao = await ctx.db.get("medicoes", input.medicaoId);
  if (!medicao) throw new Error("Medição não encontrada");
  if (medicao.status !== "rascunho") {
    throw new Error("Apenas medições em rascunho podem ser editadas");
  }
  const contract = await ctx.db.get("contracts", medicao.contractId);
  if (!contract) throw new Error("Contrato não encontrado");

  const basis = input.basis ?? medicao.basis;
  const patch: Partial<Doc<"medicoes">> = { basis };

  if (basis === "valor_fixo") {
    const amountCents = input.amountCents ?? medicao.amountCents;
    if (amountCents <= 0) throw new Error("Informe o valor da medição");
    patch.amountCents = Math.round(amountCents);
    patch.percent = undefined;
  } else {
    const percent = input.percent ?? medicao.percent;
    if (percent === undefined || percent <= 0) {
      throw new Error("Informe o percentual da medição");
    }
    patch.percent = percent;
    patch.amountCents = Math.round((contract.valueCents * percent) / 100);
  }

  if (input.description !== undefined) {
    patch.description = input.description.trim() || undefined;
  }
  if (input.referenceDate !== undefined) {
    patch.referenceDate = input.referenceDate;
  }

  await ctx.db.patch("medicoes", input.medicaoId, patch);

  await logAudit(ctx, user, {
    action: "update",
    tableName: "medicoes",
    recordId: input.medicaoId,
  });
}

const STATUS_ORDER: Record<Doc<"medicoes">["status"], number> = {
  rascunho: 0,
  aprovada: 1,
  paga: 2,
};

/**
 * Muda o status de uma medição, um passo por vez (avançar ou corrigir),
 * mantendo as datas de aprovação e pagamento coerentes.
 */
export async function changeMedicaoStatus(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { medicaoId: Id<"medicoes">; status: Doc<"medicoes">["status"] }
): Promise<void> {
  const medicao = await ctx.db.get("medicoes", input.medicaoId);
  if (!medicao) throw new Error("Medição não encontrada");
  if (medicao.status === input.status) return;

  const from = STATUS_ORDER[medicao.status];
  const to = STATUS_ORDER[input.status];
  // Permite avançar/retroceder apenas um passo por vez (correções incluídas).
  if (Math.abs(to - from) !== 1) {
    throw new Error(
      `Transição inválida: ${medicao.status} → ${input.status}`
    );
  }

  const now = Date.now();
  const patch: Partial<Doc<"medicoes">> = { status: input.status };
  if (input.status === "aprovada" && to > from) patch.approvedAt = now;
  if (input.status === "paga") patch.paidAt = now;
  if (input.status === "rascunho") patch.approvedAt = undefined;
  if (input.status === "aprovada" && to < from) patch.paidAt = undefined;

  await ctx.db.patch("medicoes", input.medicaoId, patch);

  await logAudit(ctx, user, {
    action: "status_change",
    tableName: "medicoes",
    recordId: input.medicaoId,
    details: `Medição nº ${medicao.sequence}: ${medicao.status} → ${input.status}`,
  });

  // N16: só no sino da diretoria, sem push.
  if (to > from && (input.status === "aprovada" || input.status === "paga")) {
    const project = await ctx.db.get("projects", medicao.projectId);
    const projectName = project?.name ?? "obra";
    const verb = input.status === "aprovada" ? "aprovada" : "marcada como paga";
    await notify(
      ctx,
      await activeAdmins(ctx),
      {
        kind: "N16",
        category: "medicoes",
        title: `Medição ${verb}`,
        body: `Medição ${medicao.sequence} da obra ${projectName} ${verb} por ${user.name}.`,
        target: "medicao",
        params: { medicaoId: input.medicaoId, projectId: medicao.projectId },
        projectId: medicao.projectId,
        push: false,
      },
      { actorId: user._id }
    );
  }
}

/** Totais de contratos e medições por obra (visão global). */
export async function getMedicoesOverview(ctx: QueryCtx) {
  const projects = await ctx.db.query("projects").order("desc").collect();
  const customerLabelCache = new Map<string, string | null>();

  return await Promise.all(
    projects.map(async (project) => {
      const contracts = await ctx.db
        .query("contracts")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      const eligible = contracts.filter(isContractEligibleForMeasurement);
      const medicoes = await ctx.db
        .query("medicoes")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();

      const contractTotalCents = eligible.reduce(
        (sum, c) => sum + c.valueCents,
        0
      );
      const { medidoCents, aprovadoCents, pagoCents } = sumCents(medicoes);

      return {
        projectId: project._id,
        projectName: project.name,
        projectSlug: project.slug ?? project._id,
        legacyNumber: project.legacyNumber ?? null,
        client: await resolveCustomerLabel(ctx, project, customerLabelCache),
        status: project.status ?? null,
        contractCount: eligible.length,
        contractTotalCents,
        medidoCents,
        aprovadoCents,
        pagoCents,
        saldoCents: contractTotalCents - medidoCents,
      };
    })
  );
}

/** Itens planejados da obra instalados (status "operational"), em % com uma casa. */
export async function getProjectInstallProgress(
  ctx: QueryCtx,
  projectId: Id<"projects">
) {
  const items = await ctx.db
    .query("projectEquipment")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const installedItems = items.filter((i) => i.status === "operational").length;
  const percent =
    items.length > 0 ? Math.round((installedItems / items.length) * 1000) / 10 : 0;
  return { totalItems: items.length, installedItems, percent };
}
