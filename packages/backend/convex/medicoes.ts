import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { medicaoBasis, medicaoStatus, projectStatus } from "./schema";
import { logAudit } from "./lib/audit";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const contractSummaryValidator = v.object({
  _id: v.id("contracts"),
  projectId: v.id("projects"),
  title: v.string(),
  valueCents: v.number(),
  notes: v.union(v.string(), v.null()),
  signedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  medicaoCount: v.number(),
  medidoCents: v.number(),
  aprovadoCents: v.number(),
  pagoCents: v.number(),
  saldoCents: v.number(),
});

const medicaoValidator = v.object({
  _id: v.id("medicoes"),
  projectId: v.id("projects"),
  contractId: v.id("contracts"),
  contractTitle: v.string(),
  sequence: v.number(),
  description: v.union(v.string(), v.null()),
  basis: medicaoBasis,
  percent: v.union(v.number(), v.null()),
  amountCents: v.number(),
  status: medicaoStatus,
  referenceDate: v.number(),
  approvedAt: v.union(v.number(), v.null()),
  paidAt: v.union(v.number(), v.null()),
  createdByName: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

// ---------------------------------------------------------------------------
// Contratos
// ---------------------------------------------------------------------------

export const listContracts = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(contractSummaryValidator),
  handler: async (ctx, args) => {
    const contracts = await ctx.db
      .query("contracts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return await Promise.all(
      contracts.map(async (contract) => {
        const medicoes = await getMedicoesByContract(ctx, contract._id);
        const { medidoCents, aprovadoCents, pagoCents } = sumCents(medicoes);
        return {
          _id: contract._id,
          projectId: contract.projectId,
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
  },
});

export const createContract = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    valueCents: v.number(),
    notes: v.optional(v.string()),
    signedAt: v.optional(v.number()),
  },
  returns: v.id("contracts"),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
    const title = args.title.trim();
    if (!title) throw new Error("Informe o título do contrato");
    if (args.valueCents <= 0) {
      throw new Error("O valor do contrato deve ser maior que zero");
    }

    const contractId = await ctx.db.insert("contracts", {
      projectId: args.projectId,
      title,
      valueCents: Math.round(args.valueCents),
      notes: args.notes,
      signedAt: args.signedAt,
      createdAt: Date.now(),
    });

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "contracts",
      recordId: contractId,
      details: `Contrato "${title}" criado na obra ${project.name}`,
    });

    return contractId;
  },
});

export const updateContract = engineeringMutation({
  args: {
    contractId: v.id("contracts"),
    title: v.optional(v.string()),
    valueCents: v.optional(v.number()),
    notes: v.optional(v.string()),
    signedAt: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contract = await ctx.db.get("contracts", args.contractId);
    if (!contract) throw new Error("Contrato não encontrado");

    const patch: Partial<Doc<"contracts">> = {};
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) throw new Error("Informe o título do contrato");
      patch.title = title;
    }
    if (args.valueCents !== undefined) {
      if (args.valueCents <= 0) {
        throw new Error("O valor do contrato deve ser maior que zero");
      }
      patch.valueCents = Math.round(args.valueCents);
    }
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.signedAt !== undefined) patch.signedAt = args.signedAt ?? undefined;

    await ctx.db.patch("contracts", args.contractId, patch);

    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "contracts",
      recordId: args.contractId,
    });

    return null;
  },
});

export const removeContract = engineeringMutation({
  args: { contractId: v.id("contracts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contract = await ctx.db.get("contracts", args.contractId);
    if (!contract) throw new Error("Contrato não encontrado");

    const medicao = await ctx.db
      .query("medicoes")
      .withIndex("by_contract", (q) => q.eq("contractId", args.contractId))
      .first();
    if (medicao) {
      throw new Error(
        "Não é possível excluir: o contrato possui medições. Exclua as medições primeiro."
      );
    }

    await ctx.db.delete("contracts", args.contractId);

    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "contracts",
      recordId: args.contractId,
      details: `Contrato "${contract.title}" excluído`,
    });

    return null;
  },
});

// ---------------------------------------------------------------------------
// Medições
// ---------------------------------------------------------------------------

export const listMedicoes = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(medicaoValidator),
  handler: async (ctx, args) => {
    const medicoes = await ctx.db
      .query("medicoes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
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
  },
});

/** Progresso de instalação da obra — sugestão de % para medições por progresso. */
export const getProgress = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.object({
    totalItems: v.number(),
    installedItems: v.number(),
    percent: v.number(),
  }),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("projectEquipment")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const installedItems = items.filter(
      (i) => i.status === "operational"
    ).length;
    const percent =
      items.length > 0
        ? Math.round((installedItems / items.length) * 1000) / 10
        : 0;
    return { totalItems: items.length, installedItems, percent };
  },
});

export const createMedicao = engineeringMutation({
  args: {
    contractId: v.id("contracts"),
    description: v.optional(v.string()),
    basis: medicaoBasis,
    percent: v.optional(v.number()),
    amountCents: v.optional(v.number()),
    referenceDate: v.number(),
  },
  returns: v.id("medicoes"),
  handler: async (ctx, args) => {
    const contract = await ctx.db.get("contracts", args.contractId);
    if (!contract) throw new Error("Contrato não encontrado");

    let amountCents: number;
    let percent: number | undefined;

    if (args.basis === "valor_fixo") {
      if (args.amountCents === undefined || args.amountCents <= 0) {
        throw new Error("Informe o valor da medição");
      }
      amountCents = Math.round(args.amountCents);
      percent = undefined;
    } else {
      // percentual ou progresso_equipamentos: valor derivado do % do contrato.
      if (args.percent === undefined || args.percent <= 0) {
        throw new Error("Informe o percentual da medição");
      }
      percent = args.percent;
      amountCents = Math.round((contract.valueCents * args.percent) / 100);
    }

    const existing = await getMedicoesByContract(ctx, args.contractId);
    const sequence =
      existing.reduce((max, m) => Math.max(max, m.sequence), 0) + 1;

    const medicaoId = await ctx.db.insert("medicoes", {
      projectId: contract.projectId,
      contractId: args.contractId,
      sequence,
      description: args.description?.trim() || undefined,
      basis: args.basis,
      percent,
      amountCents,
      status: "rascunho",
      referenceDate: args.referenceDate,
      createdBy: ctx.user._id,
      createdAt: Date.now(),
    });

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "medicoes",
      recordId: medicaoId,
      details: `Medição nº ${sequence} do contrato "${contract.title}"`,
    });

    return medicaoId;
  },
});

export const updateMedicao = engineeringMutation({
  args: {
    medicaoId: v.id("medicoes"),
    description: v.optional(v.string()),
    basis: v.optional(medicaoBasis),
    percent: v.optional(v.number()),
    amountCents: v.optional(v.number()),
    referenceDate: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const medicao = await ctx.db.get("medicoes", args.medicaoId);
    if (!medicao) throw new Error("Medição não encontrada");
    if (medicao.status !== "rascunho") {
      throw new Error("Apenas medições em rascunho podem ser editadas");
    }
    const contract = await ctx.db.get("contracts", medicao.contractId);
    if (!contract) throw new Error("Contrato não encontrado");

    const basis = args.basis ?? medicao.basis;
    const patch: Partial<Doc<"medicoes">> = { basis };

    if (basis === "valor_fixo") {
      const amountCents = args.amountCents ?? medicao.amountCents;
      if (amountCents <= 0) throw new Error("Informe o valor da medição");
      patch.amountCents = Math.round(amountCents);
      patch.percent = undefined;
    } else {
      const percent = args.percent ?? medicao.percent;
      if (percent === undefined || percent <= 0) {
        throw new Error("Informe o percentual da medição");
      }
      patch.percent = percent;
      patch.amountCents = Math.round((contract.valueCents * percent) / 100);
    }

    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (args.referenceDate !== undefined) {
      patch.referenceDate = args.referenceDate;
    }

    await ctx.db.patch("medicoes", args.medicaoId, patch);

    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "medicoes",
      recordId: args.medicaoId,
    });

    return null;
  },
});

const STATUS_ORDER: Record<Doc<"medicoes">["status"], number> = {
  rascunho: 0,
  aprovada: 1,
  paga: 2,
};

export const setMedicaoStatus = engineeringMutation({
  args: {
    medicaoId: v.id("medicoes"),
    status: medicaoStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const medicao = await ctx.db.get("medicoes", args.medicaoId);
    if (!medicao) throw new Error("Medição não encontrada");
    if (medicao.status === args.status) return null;

    const from = STATUS_ORDER[medicao.status];
    const to = STATUS_ORDER[args.status];
    // Permite avançar/retroceder apenas um passo por vez (correções incluídas).
    if (Math.abs(to - from) !== 1) {
      throw new Error(
        `Transição inválida: ${medicao.status} → ${args.status}`
      );
    }

    const now = Date.now();
    const patch: Partial<Doc<"medicoes">> = { status: args.status };
    if (args.status === "aprovada" && to > from) patch.approvedAt = now;
    if (args.status === "paga") patch.paidAt = now;
    if (args.status === "rascunho") patch.approvedAt = undefined;
    if (args.status === "aprovada" && to < from) patch.paidAt = undefined;

    await ctx.db.patch("medicoes", args.medicaoId, patch);

    await logAudit(ctx, ctx.user, {
      action: "status_change",
      tableName: "medicoes",
      recordId: args.medicaoId,
      details: `Medição nº ${medicao.sequence}: ${medicao.status} → ${args.status}`,
    });

    return null;
  },
});

export const removeMedicao = engineeringMutation({
  args: { medicaoId: v.id("medicoes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const medicao = await ctx.db.get("medicoes", args.medicaoId);
    if (!medicao) throw new Error("Medição não encontrada");
    if (medicao.status !== "rascunho") {
      throw new Error("Apenas medições em rascunho podem ser excluídas");
    }

    await ctx.db.delete("medicoes", args.medicaoId);

    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "medicoes",
      recordId: args.medicaoId,
      details: `Medição nº ${medicao.sequence} excluída`,
    });

    return null;
  },
});

// ---------------------------------------------------------------------------
// Visão global (todas as obras)
// ---------------------------------------------------------------------------

export const getOverview = engineeringQuery({
  args: {},
  returns: v.array(
    v.object({
      projectId: v.id("projects"),
      projectName: v.string(),
      client: v.union(v.string(), v.null()),
      status: v.union(projectStatus, v.null()),
      contractCount: v.number(),
      contractTotalCents: v.number(),
      medidoCents: v.number(),
      aprovadoCents: v.number(),
      pagoCents: v.number(),
      saldoCents: v.number(),
    })
  ),
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").order("desc").collect();

    return await Promise.all(
      projects.map(async (project) => {
        const contracts = await ctx.db
          .query("contracts")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        const medicoes = await ctx.db
          .query("medicoes")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();

        const contractTotalCents = contracts.reduce(
          (sum, c) => sum + c.valueCents,
          0
        );
        const { medidoCents, aprovadoCents, pagoCents } = sumCents(medicoes);

        return {
          projectId: project._id,
          projectName: project.name,
          client: project.client ?? null,
          status: project.status ?? null,
          contractCount: contracts.length,
          contractTotalCents,
          medidoCents,
          aprovadoCents,
          pagoCents,
          saldoCents: contractTotalCents - medidoCents,
        };
      })
    );
  },
});
