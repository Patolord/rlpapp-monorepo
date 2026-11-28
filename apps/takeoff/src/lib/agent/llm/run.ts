/**
 * Built-in AI agent loop running in the desktop webview via Vercel AI SDK v7.
 *
 * Tools execute directly against `AgentContext` (local PDFs, canvas crops,
 * Zustand store) while model calls stream through the company's Convex proxy
 * (`/takeoff/agent/messages`), authenticated with the signed-in user's short
 * ES256 JWT.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { type LanguageModel, type ModelMessage, stepCountIs, streamText } from "ai";
import { CONVEX_SITE_URL } from "../../account/config";
import { getJwt } from "../../account/session";
import type { AgentContext } from "../context";
import { AGENT_INSTRUCTIONS } from "../instructions";
import { trimHistoryImages } from "./images";
import { buildAiSdkTools, type ToolActivityHooks } from "./tools";
import type { TranscriptMessage } from "./transcript";

export interface RunTakeoffAgentOptions {
  /** Conversation history prior to this user prompt (text-only stubs). */
  history: readonly TranscriptMessage[];
  /** New prompt typed by the estimator. */
  prompt: string;
  /** Local takeoff context (real `appContext` or `fakeApp().ctx` in tests). */
  ctx: AgentContext;
  /** Model id enforced by company settings (informational; proxy also forces it). */
  modelId: string;
  /** Maximum model turns for this run. */
  maxTurns: number;
  /** Maximum output tokens per turn. */
  maxTokensPerTurn: number;
  /** Optional extra company instructions appended to `AGENT_INSTRUCTIONS`. */
  instructionsExtra?: string;
  /** Convex `takeoffAgentRuns` id attached via `x-takeoff-run-id`. */
  runId?: string;
  /** Optional model override for tests (`MockLanguageModelV4`). */
  modelOverride?: LanguageModel;
  /** Optional abort signal wired to the Stop button. */
  abortSignal?: AbortSignal;
  /** Live callbacks for streaming UI updates. */
  onTextDelta?: (delta: string) => void;
  onToolStart?: ToolActivityHooks["onToolStart"];
  onToolFinish?: ToolActivityHooks["onToolFinish"];
  onStepFinish?: (info: { stepNumber: number; inputTokens: number; outputTokens: number }) => void;
}

export interface RunTakeoffAgentResult {
  text: string;
  steps: number;
  aborted: boolean;
}

/** Build the effective system prompt combining bundled instructions and optional company additions. */
export function buildAgentSystemPrompt(instructionsExtra?: string): string {
  const extra = instructionsExtra?.trim();
  if (!extra) return AGENT_INSTRUCTIONS;
  return `${AGENT_INSTRUCTIONS}\n\nInstruções adicionais da empresa:\n${extra}`;
}

/** Convert persisted text transcript turns into AI SDK `ModelMessage[]`. */
export function transcriptToModelMessages(
  history: readonly TranscriptMessage[],
  prompt: string,
): ModelMessage[] {
  const messages: ModelMessage[] = [];
  for (const item of history) {
    const text = item.text.trim();
    if (!text) continue;
    messages.push({ role: item.role, content: text });
  }
  messages.push({ role: "user", content: prompt.trim() });
  return messages;
}

/**
 * Create an `@ai-sdk/anthropic` model pointing at the Convex streaming proxy.
 * Uses `authToken` so `@ai-sdk/anthropic` sends `Authorization: Bearer <JWT>`
 * and refreshes short-lived JWTs automatically before every turn.
 */
export function createProxyAnthropicModel(
  modelId: string,
  runId?: string,
  fetchToken: () => Promise<string> = () => getJwt(),
): LanguageModel {
  const provider = createAnthropic({
    baseURL: `${CONVEX_SITE_URL.replace(/\/+$/, "")}/takeoff/agent`,
    authToken: fetchToken,
    headers: runId ? { "x-takeoff-run-id": runId } : undefined,
  });
  return provider(modelId);
}

/**
 * Execute one user message through the multi-step tool loop until the model
 * finishes, hits `maxTurns`, or the user aborts.
 */
export async function runTakeoffAgentTurn(
  options: RunTakeoffAgentOptions,
): Promise<RunTakeoffAgentResult> {
  const model = options.modelOverride ?? createProxyAnthropicModel(options.modelId, options.runId);

  const tools = buildAiSdkTools(options.ctx, {
    onToolStart: options.onToolStart,
    onToolFinish: options.onToolFinish,
  });

  const systemText = buildAgentSystemPrompt(options.instructionsExtra);
  const messages = transcriptToModelMessages(options.history, options.prompt);

  let stepCount = 0;
  let fullText = "";

  const result = streamText({
    model,
    system: {
      role: "system",
      content: systemText,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    messages,
    tools,
    maxOutputTokens: options.maxTokensPerTurn,
    stopWhen: stepCountIs(Math.max(1, options.maxTurns)),
    abortSignal: options.abortSignal,
    prepareStep: ({ messages: stepMessages }) => {
      const { messages: trimmed } = trimHistoryImages(stepMessages);
      return { messages: trimmed };
    },
    onStepFinish: ({ usage }) => {
      stepCount += 1;
      options.onStepFinish?.({
        stepNumber: stepCount,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      });
    },
  });

  try {
    for await (const delta of result.textStream) {
      if (delta) {
        fullText += delta;
        options.onTextDelta?.(delta);
      }
    }
  } catch (err) {
    if (options.abortSignal?.aborted || (err instanceof Error && err.name === "AbortError")) {
      return { text: fullText, steps: stepCount, aborted: true };
    }
    throw err;
  }

  if (options.abortSignal?.aborted) {
    return { text: fullText, steps: stepCount, aborted: true };
  }

  return {
    text: fullText,
    steps: stepCount,
    aborted: false,
  };
}
