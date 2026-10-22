import type { Doc } from "../../_generated/dataModel";

type PriceEventLike = Pick<
  Doc<"priceEvents">,
  "occurredAt" | "validUntil" | "reviewStatus"
>;

/** Events dismissed in review never feed a price. */
export function isUsablePriceEvent(event: PriceEventLike): boolean {
  return event.reviewStatus !== "ignored" && event.reviewStatus !== "duplicate";
}

export function isPriceEventValidAt(event: PriceEventLike, now: number): boolean {
  return event.validUntil === undefined || event.validUntil > now;
}

/**
 * The price that represents a material today: the most recent usable event,
 * preferring quotes that are still valid; an expired quote only wins when no
 * valid one exists. Returns null when the material has no usable price.
 */
export function pickCurrentPriceEvent<E extends PriceEventLike>(
  events: E[],
  now: number
): E | null {
  const usable = events.filter(isUsablePriceEvent);
  const valid = usable.filter((event) => isPriceEventValidAt(event, now));
  const pool = valid.length > 0 ? valid : usable;
  let current: E | null = null;
  for (const event of pool) {
    if (!current || event.occurredAt > current.occurredAt) current = event;
  }
  return current;
}

/** Cents are the storage unit; integrations receive reais. */
export function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}
