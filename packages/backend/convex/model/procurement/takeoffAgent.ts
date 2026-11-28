import { ConvexError, v } from "convex/values";
import {
  agentMonthKey,
  DEFAULT_TAKEOFF_AGENT_EFFORT,
  DEFAULT_TAKEOFF_AGENT_MODEL,
  DEFAULT_TAKEOFF_AGENT_SETTINGS,
  estimateAgentCallCostMicroUsd,
  formatUsdFromCents,
  isTakeoffAgentEffort,
  isTakeoffAgentModelId,
  isValidAgentMonthKey,
  MAX_AGENT_BUDGET_USD_CENTS,
  MAX_AGENT_INSTRUCTIONS_EXTRA_LEN,
  MAX_AGENT_PROMPT_VERSION_LEN,
  MAX_AGENT_TOKENS_PER_TURN,
  MAX_AGENT_TURNS_PER_RUN,
  MIN_AGENT_TOKENS_PER_TURN,
  MIN_AGENT_TURNS_PER_RUN,
  type TakeoffAgentEffort,
  type TakeoffAgentSettings,
  usdCentsToMicroUsd,
} from "@rlpapp/shared/takeoff/agentModels";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { getUserByIdentity } from "../../lib/auth";
import { hasPermission } from "../../lib/rbac";
import {
  takeoffAgentCallStatus,
  takeoffAgentEffort,
  takeoffAgentReviewStats,
  takeoffAgentRunStatus,
} from "../../schema/procurement";
import { MAX_IN_FLIGHT_CALLS_PER_RUN } from "./takeoffAgentPolicy";
import { getTakeoffSetting, saveTakeoffSetting } from "./takeoffSettings";

/**
 * Built-in AI agent settings, usage ledger, monthly budget enforcement and
 * dashboard summaries for RLP Takeoff.
 */

const MAX_MONTHLY_RUNS_SCAN = 2000;
const MAX_DASHBOARD_RECENT_RUNS = 50;
const MAX_TAKEOFF_NAME_LEN = 160;
const MAX_ERROR_MESSAGE_LEN = 400;
/**
 * Small budget buffer reserved per concurrent in-flight turn (US$ 0.25) so two
 * simultaneous turns cannot both pass a nearly-empty budget check.
 */
const IN_FLIGHT_RESERVATION_MICRO_USD = 250_000;

export const takeoffAgentSettingsValidator = v.object({
  enabled: v.boolean(),
  model: v.string(),
  effort: takeoffAgentEffort,
  monthlyCompanyBudgetUsdCents: v.number(),
  monthlyUserBudgetUsdCents: v.number(),
  maxTurnsPerRun: v.number(),
  maxTokensPerTurn: v.number(),
  promptVersion: v.string(),
  instructionsExtra: v.optional(v.string()),
});

export const takeoffAgentClientStatusValidator = v.object({
  hasPermission: v.boolean(),
  enabled: v.boolean(),
  model: v.string(),
  effort: takeoffAgentEffort,
  maxTurnsPerRun: v.number(),
  maxTokensPerTurn: v.number(),
  promptVersion: v.string(),
  instructionsExtra: v.optional(v.string()),
  month: v.string(),
  companyUsedMicroUsd: v.number(),
  companyBudgetUsdCents: v.number(),
  userUsedMicroUsd: v.number(),
  userBudgetUsdCents: v.number(),
});

export const takeoffAgentRunSummaryValidator = v.object({
  id: v.id("takeoffAgentRuns"),
  userId: v.id("users"),
  userName: v.string(),
  month: v.string(),
  takeoffExternalId: v.union(v.string(), v.null()),
  takeoffName: v.union(v.string(), v.null()),
  model: v.string(),
  effort: takeoffAgentEffort,
  promptVersion: v.string(),
  status: takeoffAgentRunStatus,
  turns: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  cacheReadTokens: v.number(),
  cacheCreationTokens: v.number(),
  costMicroUsd: v.number(),
  reviewStats: v.union(takeoffAgentReviewStats, v.null()),
  errorMessage: v.union(v.string(), v.null()),
  startedAt: v.number(),
  endedAt: v.union(v.number(), v.null()),
});

export const takeoffAgentUserSummaryValidator = v.object({
  userId: v.id("users"),
  userName: v.string(),
  runs: v.number(),
  turns: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  cacheReadTokens: v.number(),
  costMicroUsd: v.number(),
  acceptedCount: v.number(),
  editedCount: v.number(),
  rejectedCount: v.number(),
});

export const takeoffAgentDashboardValidator = v.object({
  month: v.string(),
  settings: takeoffAgentSettingsValidator,
  meta: v.union(
    v.object({ updatedAt: v.number(), updatedBy: v.union(v.string(), v.null()) }),
    v.null()
  ),
  totals: v.object({
    runs: v.number(),
    turns: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.number(),
    cacheCreationTokens: v.number(),
    costMicroUsd: v.number(),
    acceptedCount: v.number(),
    editedCount: v.number(),
    rejectedCount: v.number(),
  }),
  byUser: v.array(takeoffAgentUserSummaryValidator),
  recentRuns: v.array(takeoffAgentRunSummaryValidator),
});

export async function getTakeoffAgentSettings(
  ctx: QueryCtx
): Promise<TakeoffAgentSettings> {
  const doc = await getTakeoffSetting(ctx, "agent");
  if (!doc) return { ...DEFAULT_TAKEOFF_AGENT_SETTINGS };
  return {
    enabled: doc.enabled,
    model: isTakeoffAgentModelId(doc.model)
      ? doc.model
      : DEFAULT_TAKEOFF_AGENT_MODEL,
    effort: isTakeoffAgentEffort(doc.effort)
      ? doc.effort
      : DEFAULT_TAKEOFF_AGENT_EFFORT,
    monthlyCompanyBudgetUsdCents: doc.monthlyCompanyBudgetUsdCents,
    monthlyUserBudgetUsdCents: doc.monthlyUserBudgetUsdCents,
    maxTurnsPerRun: doc.maxTurnsPerRun,
    maxTokensPerTurn: doc.maxTokensPerTurn,
    promptVersion: doc.promptVersion || DEFAULT_TAKEOFF_AGENT_SETTINGS.promptVersion,
    ...(doc.instructionsExtra ? { instructionsExtra: doc.instructionsExtra } : {}),
  };
}

export function sanitizeTakeoffAgentSettings(input: {
  enabled: boolean;
  model: string;
  effort: TakeoffAgentEffort;
  monthlyCompanyBudgetUsdCents: number;
  monthlyUserBudgetUsdCents: number;
  maxTurnsPerRun: number;
  maxTokensPerTurn: number;
  promptVersion: string;
  instructionsExtra?: string;
}): TakeoffAgentSettings {
  const model = input.model.trim();
  if (!isTakeoffAgentModelId(model)) {
    throw new ConvexError({
      code: "INVALID_SETTINGS",
      message: `Modelo desconhecido: ${model}`,
    });
  }
  if (!isTakeoffAgentEffort(input.effort)) {
    throw new ConvexError({
      code: "INVALID_SETTINGS",
      message: `Esforço inválido: ${String(input.effort)}`,
    });
  }

  const checkInt = (value: number, min: number, max: number, label: string): number => {
    if (!Number.isFinite(value)) {
      throw new ConvexError({
        code: "INVALID_SETTINGS",
        message: `${label}: informe um número válido`,
      });
    }
    const rounded = Math.round(value);
    if (rounded < min || rounded > max) {
      throw new ConvexError({
        code: "INVALID_SETTINGS",
        message: `${label}: deve ficar entre ${min} e ${max}`,
      });
    }
    return rounded;
  };

  const monthlyCompanyBudgetUsdCents = checkInt(
    input.monthlyCompanyBudgetUsdCents,
    0,
    MAX_AGENT_BUDGET_USD_CENTS,
    "Orçamento mensal da empresa"
  );
  const monthlyUserBudgetUsdCents = checkInt(
    input.monthlyUserBudgetUsdCents,
    0,
    MAX_AGENT_BUDGET_USD_CENTS,
    "Orçamento mensal por usuário"
  );
  const maxTurnsPerRun = checkInt(
    input.maxTurnsPerRun,
    MIN_AGENT_TURNS_PER_RUN,
    MAX_AGENT_TURNS_PER_RUN,
    "Máximo de turnos por execução"
  );
  const maxTokensPerTurn = checkInt(
    input.maxTokensPerTurn,
    MIN_AGENT_TOKENS_PER_TURN,
    MAX_AGENT_TOKENS_PER_TURN,
    "Máximo de tokens por turno"
  );

  const promptVersion = input.promptVersion.trim() || "v1";
  if (promptVersion.length > MAX_AGENT_PROMPT_VERSION_LEN) {
    throw new ConvexError({
      code: "INVALID_SETTINGS",
      message: `Versão do prompt com mais de ${MAX_AGENT_PROMPT_VERSION_LEN} caracteres`,
    });
  }

  const instructionsExtra = input.instructionsExtra?.trim() || undefined;
  if (
    instructionsExtra &&
    instructionsExtra.length > MAX_AGENT_INSTRUCTIONS_EXTRA_LEN
  ) {
    throw new ConvexError({
      code: "INVALID_SETTINGS",
      message: `Instruções adicionais com mais de ${MAX_AGENT_INSTRUCTIONS_EXTRA_LEN} caracteres`,
    });
  }

  return {
    enabled: Boolean(input.enabled),
    model,
    effort: input.effort,
    monthlyCompanyBudgetUsdCents,
    monthlyUserBudgetUsdCents,
    maxTurnsPerRun,
    maxTokensPerTurn,
    promptVersion,
    ...(instructionsExtra ? { instructionsExtra } : {}),
  };
}

export async function saveTakeoffAgentSettings(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Parameters<typeof sanitizeTakeoffAgentSettings>[0]
): Promise<void> {
  const clean = sanitizeTakeoffAgentSettings(input);
  await saveTakeoffSetting(
    ctx,
    user,
    "agent",
    clean,
    "IA integrada do App Takeoff",
    `${clean.enabled ? "ativada" : "desativada"} · ${clean.model} (${clean.effort})`
  );
}

async function listMonthlyRuns(
  ctx: QueryCtx,
  month: string
): Promise<Doc<"takeoffAgentRuns">[]> {
  return await ctx.db
    .query("takeoffAgentRuns")
    .withIndex("by_month_startedAt", (q) => q.eq("month", month))
    .order("desc")
    .take(MAX_MONTHLY_RUNS_SCAN);
}

async function listUserMonthlyRuns(
  ctx: QueryCtx,
  userId: Id<"users">,
  month: string
): Promise<Doc<"takeoffAgentRuns">[]> {
  return await ctx.db
    .query("takeoffAgentRuns")
    .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", month))
    .take(MAX_MONTHLY_RUNS_SCAN);
}

function sumUsage(runs: readonly Doc<"takeoffAgentRuns">[]): {
  costMicroUsd: number;
  inFlightCalls: number;
} {
  let costMicroUsd = 0;
  let inFlightCalls = 0;
  for (const r of runs) {
    costMicroUsd += r.costMicroUsd;
    inFlightCalls += Math.max(0, r.inFlightCalls);
  }
  return { costMicroUsd, inFlightCalls };
}

export async function getTakeoffAgentClientStatus(
  ctx: QueryCtx,
  user: Doc<"users">,
  now: number
) {
  const settings = await getTakeoffAgentSettings(ctx);
  const month = agentMonthKey(now);
  const [companyRuns, userRuns] = await Promise.all([
    listMonthlyRuns(ctx, month),
    listUserMonthlyRuns(ctx, user._id, month),
  ]);
  const company = sumUsage(companyRuns);
  const mine = sumUsage(userRuns);

  return {
    hasPermission: hasPermission(user, "takeoff.agente"),
    enabled: settings.enabled,
    model: settings.model,
    effort: settings.effort,
    maxTurnsPerRun: settings.maxTurnsPerRun,
    maxTokensPerTurn: settings.maxTokensPerTurn,
    promptVersion: settings.promptVersion,
    ...(settings.instructionsExtra
      ? { instructionsExtra: settings.instructionsExtra }
      : {}),
    month,
    companyUsedMicroUsd: company.costMicroUsd,
    companyBudgetUsdCents: settings.monthlyCompanyBudgetUsdCents,
    userUsedMicroUsd: mine.costMicroUsd,
    userBudgetUsdCents: settings.monthlyUserBudgetUsdCents,
  };
}

function clipOpt(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

export async function startTakeoffAgentRun(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: {
    takeoffExternalId?: string;
    takeoffName?: string;
  }
) {
  const settings = await getTakeoffAgentSettings(ctx);
  if (!settings.enabled) {
    throw new ConvexError({
      code: "AGENT_DISABLED",
      message: "A IA integrada do App Takeoff está desativada nas configurações da empresa.",
    });
  }
  const now = Date.now();
  const month = agentMonthKey(now);
  const [companyRuns, userRuns] = await Promise.all([
    listMonthlyRuns(ctx, month),
    listUserMonthlyRuns(ctx, user._id, month),
  ]);
  const company = sumUsage(companyRuns);
  const mine = sumUsage(userRuns);

  if (
    settings.monthlyCompanyBudgetUsdCents > 0 &&
    company.costMicroUsd >= usdCentsToMicroUsd(settings.monthlyCompanyBudgetUsdCents)
  ) {
    throw new ConvexError({
      code: "BUDGET_EXHAUSTED",
      message: `Orçamento mensal da empresa esgotado (${formatUsdFromCents(settings.monthlyCompanyBudgetUsdCents)}).`,
    });
  }
  if (
    settings.monthlyUserBudgetUsdCents > 0 &&
    mine.costMicroUsd >= usdCentsToMicroUsd(settings.monthlyUserBudgetUsdCents)
  ) {
    throw new ConvexError({
      code: "BUDGET_EXHAUSTED",
      message: `Seu orçamento mensal da IA foi atingido (${formatUsdFromCents(settings.monthlyUserBudgetUsdCents)}).`,
    });
  }

  const runId = await ctx.db.insert("takeoffAgentRuns", {
    userId: user._id,
    month,
    takeoffExternalId: clipOpt(args.takeoffExternalId, 120),
    takeoffName: clipOpt(args.takeoffName, MAX_TAKEOFF_NAME_LEN),
    model: settings.model,
    effort: settings.effort,
    promptVersion: settings.promptVersion,
    status: "running",
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costMicroUsd: 0,
    inFlightCalls: 0,
    startedAt: now,
    updatedAt: now,
  });

  return {
    runId,
    model: settings.model,
    effort: settings.effort,
    maxTurnsPerRun: settings.maxTurnsPerRun,
    maxTokensPerTurn: settings.maxTokensPerTurn,
    promptVersion: settings.promptVersion,
    ...(settings.instructionsExtra
      ? { instructionsExtra: settings.instructionsExtra }
      : {}),
  };
}

export async function finishTakeoffAgentRun(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: {
    runId: Id<"takeoffAgentRuns">;
    status: "completed" | "aborted" | "error";
    errorMessage?: string;
  }
): Promise<void> {
  const run = await ctx.db.get("takeoffAgentRuns", args.runId);
  if (!run || run.userId !== user._id) {
    throw new ConvexError({
      code: "RUN_NOT_FOUND",
      message: "Execução do agente não encontrada.",
    });
  }
  const now = Date.now();
  await ctx.db.patch("takeoffAgentRuns", run._id, {
    status: args.status,
    errorMessage: clipOpt(args.errorMessage, MAX_ERROR_MESSAGE_LEN),
    updatedAt: now,
    endedAt: run.endedAt ?? now,
  });
}

export async function reportTakeoffAgentReviewStats(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: {
    runId: Id<"takeoffAgentRuns">;
    pending: number;
    accepted: number;
    edited: number;
    rejected: number;
  }
): Promise<void> {
  const run = await ctx.db.get("takeoffAgentRuns", args.runId);
  if (!run || run.userId !== user._id) {
    throw new ConvexError({
      code: "RUN_NOT_FOUND",
      message: "Execução do agente não encontrada.",
    });
  }
  const clamp = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  const now = Date.now();
  await ctx.db.patch("takeoffAgentRuns", run._id, {
    reviewStats: {
      pending: clamp(args.pending),
      accepted: clamp(args.accepted),
      edited: clamp(args.edited),
      rejected: clamp(args.rejected),
      updatedAt: now,
    },
    updatedAt: now,
  });
}

export const authorizeTurnResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    runId: v.id("takeoffAgentRuns"),
    userId: v.id("users"),
    month: v.string(),
    turn: v.number(),
    settings: takeoffAgentSettingsValidator,
  }),
  v.object({
    ok: v.literal(false),
    status: v.number(),
    code: v.string(),
    message: v.string(),
  })
);

/**
 * Called by `gateway/takeoffAgentProxy.ts` before forwarding each turn to
 * Anthropic. Runs under the caller's JWT identity so Convex verifies auth,
 * RBAC, kill switch, monthly budgets and turn/concurrency caps atomically.
 */
export async function authorizeTakeoffAgentTurn(
  ctx: MutationCtx,
  args: {
    runId?: string;
    takeoffExternalId?: string;
    takeoffName?: string;
  }
) {
  let user: Doc<"users"> | null;
  try {
    user = await getUserByIdentity(ctx);
  } catch (err) {
    if (err instanceof ConvexError) {
      const data = err.data as { code?: string; message?: string } | null;
      if (data?.code === "FORBIDDEN") {
        return {
          ok: false as const,
          status: 403,
          code: "FORBIDDEN",
          message:
            typeof data.message === "string" ? data.message : "Acesso negado.",
        };
      }
    }
    return {
      ok: false as const,
      status: 401,
      code: "UNAUTHENTICATED",
      message:
        "Sessão inválida ou expirada. Entre novamente com a conta da empresa.",
    };
  }
  if (!user) {
    return {
      ok: false as const,
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Sessão inválida ou expirada. Entre novamente com a conta da empresa.",
    };
  }
  if (!user.isActive) {
    return {
      ok: false as const,
      status: 403,
      code: "FORBIDDEN",
      message: "Usuário desativado.",
    };
  }
  if (!hasPermission(user, "takeoff.agente")) {
    return {
      ok: false as const,
      status: 403,
      code: "FORBIDDEN",
      message: "Seu usuário não tem acesso à IA integrada do App Takeoff.",
    };
  }

  const settings = await getTakeoffAgentSettings(ctx);
  if (!settings.enabled) {
    return {
      ok: false as const,
      status: 403,
      code: "AGENT_DISABLED",
      message: "A IA integrada do App Takeoff está desativada nas configurações da empresa.",
    };
  }

  const now = Date.now();
  const month = agentMonthKey(now);

  // Resolve or auto-create a run row when the client sends `x-takeoff-run-id`.
  let run: Doc<"takeoffAgentRuns"> | null = null;
  if (args.runId) {
    const normalized = ctx.db.normalizeId("takeoffAgentRuns", args.runId);
    if (!normalized) {
      return {
        ok: false as const,
        status: 400,
        code: "INVALID_RUN_ID",
        message: "Identificador de execução inválido.",
      };
    }
    run = await ctx.db.get("takeoffAgentRuns", normalized);
    if (!run || run.userId !== user._id) {
      return {
        ok: false as const,
        status: 404,
        code: "RUN_NOT_FOUND",
        message: "Execução do agente não encontrada para este usuário.",
      };
    }
    if (run.status !== "running") {
      return {
        ok: false as const,
        status: 409,
        code: "RUN_CLOSED",
        message: "Esta execução do agente já foi encerrada.",
      };
    }
    if (run.turns >= settings.maxTurnsPerRun) {
      return {
        ok: false as const,
        status: 429,
        code: "TURN_LIMIT_REACHED",
        message: `Limite de ${settings.maxTurnsPerRun} turnos por execução atingido.`,
      };
    }
    if (run.inFlightCalls >= MAX_IN_FLIGHT_CALLS_PER_RUN) {
      return {
        ok: false as const,
        status: 429,
        code: "TOO_MANY_IN_FLIGHT",
        message: "Já existem chamadas da IA em andamento para esta execução.",
      };
    }
  }

  const [companyRuns, userRuns] = await Promise.all([
    listMonthlyRuns(ctx, month),
    listUserMonthlyRuns(ctx, user._id, month),
  ]);
  const company = sumUsage(companyRuns);
  const mine = sumUsage(userRuns);
  const companyEffective =
    company.costMicroUsd + company.inFlightCalls * IN_FLIGHT_RESERVATION_MICRO_USD;
  const userEffective =
    mine.costMicroUsd + mine.inFlightCalls * IN_FLIGHT_RESERVATION_MICRO_USD;

  if (
    settings.monthlyCompanyBudgetUsdCents > 0 &&
    companyEffective >= usdCentsToMicroUsd(settings.monthlyCompanyBudgetUsdCents)
  ) {
    return {
      ok: false as const,
      status: 429,
      code: "COMPANY_BUDGET_EXHAUSTED",
      message: `Orçamento mensal da empresa esgotado (${formatUsdFromCents(settings.monthlyCompanyBudgetUsdCents)}).`,
    };
  }

  if (
    settings.monthlyUserBudgetUsdCents > 0 &&
    userEffective >= usdCentsToMicroUsd(settings.monthlyUserBudgetUsdCents)
  ) {
    return {
      ok: false as const,
      status: 429,
      code: "USER_BUDGET_EXHAUSTED",
      message: `Seu orçamento mensal da IA foi atingido (${formatUsdFromCents(settings.monthlyUserBudgetUsdCents)}).`,
    };
  }

  let runId: Id<"takeoffAgentRuns">;
  let turn: number;
  if (run) {
    runId = run._id;
    turn = run.turns + run.inFlightCalls + 1;
    await ctx.db.patch("takeoffAgentRuns", run._id, {
      inFlightCalls: run.inFlightCalls + 1,
      updatedAt: now,
    });
  } else {
    turn = 1;
    runId = await ctx.db.insert("takeoffAgentRuns", {
      userId: user._id,
      month,
      takeoffExternalId: clipOpt(args.takeoffExternalId, 120),
      takeoffName: clipOpt(args.takeoffName, MAX_TAKEOFF_NAME_LEN),
      model: settings.model,
      effort: settings.effort,
      promptVersion: settings.promptVersion,
      status: "running",
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costMicroUsd: 0,
      inFlightCalls: 1,
      startedAt: now,
      updatedAt: now,
    });
  }

  return {
    ok: true as const,
    runId,
    userId: user._id,
    month,
    turn,
    settings,
  };
}

export const recordCallArgsValidator = v.object({
  runId: v.id("takeoffAgentRuns"),
  userId: v.id("users"),
  month: v.string(),
  turn: v.number(),
  model: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  cacheReadTokens: v.number(),
  cacheCreationTokens: v.number(),
  requestBytes: v.number(),
  imageCount: v.number(),
  toolsCalled: v.array(v.string()),
  durationMs: v.number(),
  status: takeoffAgentCallStatus,
  stopReason: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
});

export async function recordTakeoffAgentCall(
  ctx: MutationCtx,
  args: {
    runId: Id<"takeoffAgentRuns">;
    userId: Id<"users">;
    month: string;
    turn: number;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    requestBytes: number;
    imageCount: number;
    toolsCalled: string[];
    durationMs: number;
    status: "ok" | "aborted" | "error";
    stopReason?: string;
    errorMessage?: string;
  }
): Promise<number> {
  const now = Date.now();
  const costMicroUsd = estimateAgentCallCostMicroUsd(args.model, {
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    cacheReadTokens: args.cacheReadTokens,
    cacheCreationTokens: args.cacheCreationTokens,
  });

  await ctx.db.insert("takeoffAgentCalls", {
    runId: args.runId,
    userId: args.userId,
    month: args.month,
    turn: args.turn,
    model: args.model,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    cacheReadTokens: args.cacheReadTokens,
    cacheCreationTokens: args.cacheCreationTokens,
    costMicroUsd,
    requestBytes: Math.max(0, Math.floor(args.requestBytes)),
    imageCount: Math.max(0, Math.floor(args.imageCount)),
    toolsCalled: args.toolsCalled.slice(0, 50),
    durationMs: Math.max(0, Math.floor(args.durationMs)),
    status: args.status,
    stopReason: clipOpt(args.stopReason, 80),
    errorMessage: clipOpt(args.errorMessage, MAX_ERROR_MESSAGE_LEN),
    createdAt: now,
  });

  const run = await ctx.db.get("takeoffAgentRuns", args.runId);
  if (run) {
    await ctx.db.patch("takeoffAgentRuns", run._id, {
      turns: run.turns + 1,
      inputTokens: run.inputTokens + args.inputTokens,
      outputTokens: run.outputTokens + args.outputTokens,
      cacheReadTokens: run.cacheReadTokens + args.cacheReadTokens,
      cacheCreationTokens: run.cacheCreationTokens + args.cacheCreationTokens,
      costMicroUsd: run.costMicroUsd + costMicroUsd,
      inFlightCalls: Math.max(0, run.inFlightCalls - 1),
      updatedAt: now,
    });
  }

  return costMicroUsd;
}

export async function getTakeoffAgentDashboard(
  ctx: QueryCtx,
  monthArg: string | undefined,
  now: number
) {
  const month =
    monthArg && isValidAgentMonthKey(monthArg) ? monthArg : agentMonthKey(now);
  const [settingsDoc, settings, runs] = await Promise.all([
    getTakeoffSetting(ctx, "agent"),
    getTakeoffAgentSettings(ctx),
    listMonthlyRuns(ctx, month),
  ]);

  const userNames = new Map<Id<"users">, string>();
  const resolveUserName = async (userId: Id<"users">): Promise<string> => {
    const cached = userNames.get(userId);
    if (cached !== undefined) return cached;
    const u = await ctx.db.get("users", userId);
    const name = u?.name ?? "Usuário removido";
    userNames.set(userId, name);
    return name;
  };

  let meta: { updatedAt: number; updatedBy: string | null } | null = null;
  if (settingsDoc) {
    const updatedBy = settingsDoc.updatedByUserId
      ? await resolveUserName(settingsDoc.updatedByUserId)
      : null;
    meta = { updatedAt: settingsDoc.updatedAt, updatedBy };
  }

  const totals = {
    runs: runs.length,
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costMicroUsd: 0,
    acceptedCount: 0,
    editedCount: 0,
    rejectedCount: 0,
  };

  const userBuckets = new Map<
    Id<"users">,
    {
      userId: Id<"users">;
      userName: string;
      runs: number;
      turns: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      costMicroUsd: number;
      acceptedCount: number;
      editedCount: number;
      rejectedCount: number;
    }
  >();

  for (const run of runs) {
    const userName = await resolveUserName(run.userId);
    totals.turns += run.turns;
    totals.inputTokens += run.inputTokens;
    totals.outputTokens += run.outputTokens;
    totals.cacheReadTokens += run.cacheReadTokens;
    totals.cacheCreationTokens += run.cacheCreationTokens;
    totals.costMicroUsd += run.costMicroUsd;
    const acc = run.reviewStats?.accepted ?? 0;
    const ed = run.reviewStats?.edited ?? 0;
    const rej = run.reviewStats?.rejected ?? 0;
    totals.acceptedCount += acc;
    totals.editedCount += ed;
    totals.rejectedCount += rej;

    let bucket = userBuckets.get(run.userId);
    if (!bucket) {
      bucket = {
        userId: run.userId,
        userName,
        runs: 0,
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        costMicroUsd: 0,
        acceptedCount: 0,
        editedCount: 0,
        rejectedCount: 0,
      };
      userBuckets.set(run.userId, bucket);
    }
    bucket.runs += 1;
    bucket.turns += run.turns;
    bucket.inputTokens += run.inputTokens;
    bucket.outputTokens += run.outputTokens;
    bucket.cacheReadTokens += run.cacheReadTokens;
    bucket.costMicroUsd += run.costMicroUsd;
    bucket.acceptedCount += acc;
    bucket.editedCount += ed;
    bucket.rejectedCount += rej;
  }

  const byUser = [...userBuckets.values()].sort(
    (a, b) => b.costMicroUsd - a.costMicroUsd || a.userName.localeCompare(b.userName, "pt-BR")
  );

  const recentRuns = await Promise.all(
    runs.slice(0, MAX_DASHBOARD_RECENT_RUNS).map(async (run) => ({
      id: run._id,
      userId: run.userId,
      userName: await resolveUserName(run.userId),
      month: run.month,
      takeoffExternalId: run.takeoffExternalId ?? null,
      takeoffName: run.takeoffName ?? null,
      model: run.model,
      effort: run.effort,
      promptVersion: run.promptVersion,
      status: run.status,
      turns: run.turns,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      cacheReadTokens: run.cacheReadTokens,
      cacheCreationTokens: run.cacheCreationTokens,
      costMicroUsd: run.costMicroUsd,
      reviewStats: run.reviewStats ?? null,
      errorMessage: run.errorMessage ?? null,
      startedAt: run.startedAt,
      endedAt: run.endedAt ?? null,
    }))
  );

  return {
    month,
    settings,
    meta,
    totals,
    byUser,
    recentRuns,
  };
}
