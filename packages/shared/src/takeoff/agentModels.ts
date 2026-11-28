/**
 * Model catalog, token pricing, settings defaults and month helpers for the
 * built-in AI agent of RLP Takeoff. Shared between the Convex proxy/ledger,
 * the web dashboard (App Takeoff → IA) and the desktop app so everyone agrees
 * on model ids, effort options and cost estimates.
 *
 * Costs are stored in integer micro-USD (1 USD = 1_000_000 micro-USD) so even
 * cheap cache-read turns accumulate accurately without floating-point drift.
 */

export const MICRO_USD_PER_USD = 1_000_000;
export const MICRO_USD_PER_CENT = 10_000;

export const TAKEOFF_AGENT_EFFORTS = ["low", "medium", "high"] as const;
export type TakeoffAgentEffort = (typeof TAKEOFF_AGENT_EFFORTS)[number];

export const TAKEOFF_AGENT_EFFORT_LABELS: Record<TakeoffAgentEffort, string> = {
  low: "Baixo (mais rápido)",
  medium: "Médio (equilibrado)",
  high: "Alto (mais preciso)",
};

export interface TakeoffAgentModelSpec {
  id: string;
  label: string;
  description: string;
  /** USD per 1M uncached input tokens. */
  inputUsdPerMillion: number;
  /** USD per 1M output tokens. */
  outputUsdPerMillion: number;
  /** USD per 1M prompt-cache read tokens. */
  cacheReadUsdPerMillion: number;
  /** USD per 1M prompt-cache creation tokens (5 min TTL). */
  cacheCreationUsdPerMillion: number;
  supportsEffort: boolean;
}

export const TAKEOFF_AGENT_MODELS = [
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    description: "Melhor precisão visual e raciocínio para plantas complexas.",
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 25,
    cacheReadUsdPerMillion: 0.5,
    cacheCreationUsdPerMillion: 6.25,
    supportsEffort: true,
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    description: "Equilíbrio entre velocidade, qualidade e custo.",
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    cacheReadUsdPerMillion: 0.3,
    cacheCreationUsdPerMillion: 3.75,
    supportsEffort: true,
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    description: "Mais econômico para tarefas simples e revisões rápidas.",
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 5,
    cacheReadUsdPerMillion: 0.1,
    cacheCreationUsdPerMillion: 1.25,
    supportsEffort: true,
  },
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    description: "Geração anterior Opus, compatível com esforço adaptativo.",
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 25,
    cacheReadUsdPerMillion: 0.5,
    cacheCreationUsdPerMillion: 6.25,
    supportsEffort: true,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    description: "Geração anterior Sonnet, menor custo por levantamento.",
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    cacheReadUsdPerMillion: 0.3,
    cacheCreationUsdPerMillion: 3.75,
    supportsEffort: true,
  },
] as const satisfies readonly TakeoffAgentModelSpec[];

export type TakeoffAgentModelId = (typeof TAKEOFF_AGENT_MODELS)[number]["id"];

export const DEFAULT_TAKEOFF_AGENT_MODEL: TakeoffAgentModelId = "claude-opus-5-5";
export const DEFAULT_TAKEOFF_AGENT_EFFORT: TakeoffAgentEffort = "high";

export const MIN_AGENT_TURNS_PER_RUN = 1;
export const MAX_AGENT_TURNS_PER_RUN = 200;
export const MIN_AGENT_TOKENS_PER_TURN = 1024;
export const MAX_AGENT_TOKENS_PER_TURN = 32768;
export const MAX_AGENT_BUDGET_USD_CENTS = 10_000_000; // US$ 100,000.00
export const MAX_AGENT_PROMPT_VERSION_LEN = 40;
export const MAX_AGENT_INSTRUCTIONS_EXTRA_LEN = 8000;

export interface TakeoffAgentSettings {
  /** Kill switch: when false, the proxy refuses every call. */
  enabled: boolean;
  model: TakeoffAgentModelId;
  effort: TakeoffAgentEffort;
  /** Company monthly budget in USD cents (0 = unlimited). */
  monthlyCompanyBudgetUsdCents: number;
  /** Per-user monthly budget in USD cents (0 = unlimited). */
  monthlyUserBudgetUsdCents: number;
  /** Maximum model turns allowed in a single run. */
  maxTurnsPerRun: number;
  /** Maximum output tokens requested per turn. */
  maxTokensPerTurn: number;
  /** Version tag recorded on every run for prompt/instruction tracking. */
  promptVersion: string;
  /** Optional extra company-wide guidance appended to AGENT_INSTRUCTIONS. */
  instructionsExtra?: string;
}

export const DEFAULT_TAKEOFF_AGENT_SETTINGS: TakeoffAgentSettings = {
  enabled: false,
  model: DEFAULT_TAKEOFF_AGENT_MODEL,
  effort: DEFAULT_TAKEOFF_AGENT_EFFORT,
  monthlyCompanyBudgetUsdCents: 10_000, // US$ 100.00 / mês
  monthlyUserBudgetUsdCents: 2_500, // US$ 25.00 / usuário / mês
  maxTurnsPerRun: 60,
  maxTokensPerTurn: 8_192,
  promptVersion: "v1",
};

export function isTakeoffAgentModelId(id: string): id is TakeoffAgentModelId {
  return TAKEOFF_AGENT_MODELS.some((m) => m.id === id);
}

export function isTakeoffAgentEffort(value: string): value is TakeoffAgentEffort {
  return (TAKEOFF_AGENT_EFFORTS as readonly string[]).includes(value);
}

export function findTakeoffAgentModel(id: string): TakeoffAgentModelSpec | undefined {
  return TAKEOFF_AGENT_MODELS.find((m) => m.id === id);
}

export interface AgentTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

/**
 * Estimate the cost of one Anthropic Messages API turn in integer micro-USD.
 * Unknown models fall back to the default model's pricing so we never silently
 * log $0 when a newer model id is rolled out.
 */
export function estimateAgentCallCostMicroUsd(
  modelId: string,
  usage: AgentTokenUsage
): number {
  const spec =
    findTakeoffAgentModel(modelId) ??
    findTakeoffAgentModel(DEFAULT_TAKEOFF_AGENT_MODEL)!;
  const input = Math.max(0, usage.inputTokens || 0);
  const output = Math.max(0, usage.outputTokens || 0);
  const cacheRead = Math.max(0, usage.cacheReadTokens || 0);
  const cacheCreation = Math.max(0, usage.cacheCreationTokens || 0);

  // Price per 1M tokens in USD == price per 1 token in micro-USD.
  const microUsd =
    input * spec.inputUsdPerMillion +
    output * spec.outputUsdPerMillion +
    cacheRead * spec.cacheReadUsdPerMillion +
    cacheCreation * spec.cacheCreationUsdPerMillion;

  return Math.round(microUsd);
}

export function usdCentsToMicroUsd(cents: number): number {
  return Math.round(cents) * MICRO_USD_PER_CENT;
}

/** Format an integer micro-USD amount in pt-BR ("US$ 1,24" or "US$ 0,004"). */
export function formatUsdFromMicroUsd(microUsd: number): string {
  const usd = microUsd / MICRO_USD_PER_USD;
  const abs = Math.abs(usd);
  const digits = abs > 0 && abs < 0.01 ? 4 : 2;
  return `US$ ${usd.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatUsdFromCents(cents: number): string {
  return formatUsdFromMicroUsd(usdCentsToMicroUsd(cents));
}

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Calendar month key ("YYYY-MM") in Brasília time (UTC-3, no DST). */
export function agentMonthKey(timestampMs: number): string {
  const brt = new Date(timestampMs - BRT_OFFSET_MS);
  const y = brt.getUTCFullYear();
  const m = String(brt.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function isValidAgentMonthKey(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}
