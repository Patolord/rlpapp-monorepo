import { describe, expect, test } from "vitest";
import {
  agentMonthKey,
  DEFAULT_TAKEOFF_AGENT_MODEL,
  estimateAgentCallCostMicroUsd,
  findTakeoffAgentModel,
  formatUsdFromCents,
  formatUsdFromMicroUsd,
  isTakeoffAgentEffort,
  isTakeoffAgentModelId,
  isValidAgentMonthKey,
  usdCentsToMicroUsd,
} from "../src/takeoff/agentModels";

describe("agentModels", () => {
  test("validates known models and effort levels", () => {
    expect(isTakeoffAgentModelId(DEFAULT_TAKEOFF_AGENT_MODEL)).toBe(true);
    expect(isTakeoffAgentModelId("claude-sonnet-5-5")).toBe(true);
    expect(isTakeoffAgentModelId("gpt-5")).toBe(false);
    expect(findTakeoffAgentModel("claude-sonnet-5-5")?.outputUsdPerMillion).toBe(15);

    expect(isTakeoffAgentEffort("low")).toBe(true);
    expect(isTakeoffAgentEffort("medium")).toBe(true);
    expect(isTakeoffAgentEffort("high")).toBe(true);
    expect(isTakeoffAgentEffort("extreme")).toBe(false);
  });

  test("calculates exact micro-USD costs including cache reads and writes", () => {
    // 100k input ($0.50) + 10k output ($0.25) + 500k cache read ($0.25) + 100k cache write ($0.625) = $1.625
    const cost = estimateAgentCallCostMicroUsd("claude-opus-5-5", {
      inputTokens: 100_000,
      outputTokens: 10_000,
      cacheReadTokens: 500_000,
      cacheCreationTokens: 100_000,
    });
    expect(cost).toBe(1_625_000);

    // Sonnet is 3 / 15 / 0.3 / 3.75
    const sonnetCost = estimateAgentCallCostMicroUsd("claude-sonnet-5-5", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(sonnetCost).toBe(3_000_000);

    // Negative values clamp to 0
    expect(
      estimateAgentCallCostMicroUsd("claude-haiku-5-5", {
        inputTokens: -10,
        outputTokens: 1_000,
      })
    ).toBe(5_000);
  });

  test("converts USD cents to micro-USD and formats pt-BR labels", () => {
    expect(usdCentsToMicroUsd(2500)).toBe(25_000_000);
    expect(formatUsdFromCents(2500)).toBe("US$ 25,00");
    expect(formatUsdFromMicroUsd(1_240_000)).toBe("US$ 1,24");
    expect(formatUsdFromMicroUsd(4_500)).toBe("US$ 0,0045");
  });

  test("derives calendar month in Brasília time (UTC-3)", () => {
    // 2026-12-01 01:30 UTC is 2026-11-30 22:30 BRT -> still 2026-11
    expect(agentMonthKey(Date.UTC(2026, 11, 1, 1, 30))).toBe("2026-11");
    // 2026-12-01 03:00 UTC is 2026-12-01 00:00 BRT -> 2026-12
    expect(agentMonthKey(Date.UTC(2026, 11, 1, 3, 0))).toBe("2026-12");

    expect(isValidAgentMonthKey("2026-11")).toBe(true);
    expect(isValidAgentMonthKey("2026-13")).toBe(false);
    expect(isValidAgentMonthKey("2026-1")).toBe(false);
  });
});
