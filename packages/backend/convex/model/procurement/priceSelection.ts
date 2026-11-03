import type { Doc } from "../../_generated/dataModel";

type PriceEventLike = Pick<
  Doc<"priceEvents">,
  "occurredAt" | "validUntil" | "reviewStatus"
> & { needsReview?: boolean };

/** Events dismissed in review never feed a price. */
export function isUsablePriceEvent(event: PriceEventLike): boolean {
  return event.reviewStatus !== "ignored" && event.reviewStatus !== "duplicate";
}

export function isPriceEventValidAt(event: PriceEventLike, now: number): boolean {
  return event.validUntil === undefined || event.validUntil > now;
}

/**
 * Lower is better. Events still waiting for purchasing's review (estimates
 * typed in the takeoff, imports with missing data) rank below reviewed ones,
 * so an unverified number never displaces a real quote; within a tier, a
 * quote that is still valid beats an expired one.
 */
function priceEventTier(event: PriceEventLike, now: number): number {
  return (
    (event.needsReview ? 2 : 0) + (isPriceEventValidAt(event, now) ? 0 : 1)
  );
}

/**
 * The price that represents a material today: within the best available tier
 * (see priceEventTier), the most recent usable event. Returns null when the
 * material has no usable price.
 */
export function pickCurrentPriceEvent<E extends PriceEventLike>(
  events: E[],
  now: number
): E | null {
  let current: E | null = null;
  let currentTier = Number.POSITIVE_INFINITY;
  for (const event of events) {
    if (!isUsablePriceEvent(event)) continue;
    const tier = priceEventTier(event, now);
    if (
      !current ||
      tier < currentTier ||
      (tier === currentTier && event.occurredAt > current.occurredAt)
    ) {
      current = event;
      currentTier = tier;
    }
  }
  return current;
}

/** Cents are the storage unit; integrations receive reais. */
export function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}
