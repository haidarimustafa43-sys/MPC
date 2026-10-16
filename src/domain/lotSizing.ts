/**
 * Lot-sizing policies as a discriminated union so every method carries exactly
 * the parameters it needs.
 *
 * - LFL: order exactly the net requirement.
 * - FOQ: order a fixed quantity (several lots if one is not enough).
 * - POQ: periods of supply derived from EOQ / average demand (rounded, >= 1).
 * - EOQ: order max(net requirement, EOQ).
 * - FPR: cover a fixed number of periods of requirements.
 * - MULTIPLE: round up to a multiple, optionally with a minimum quantity.
 */
export type LotSizingPolicy =
  | { method: "LFL" }
  | { method: "FOQ"; quantity: number }
  | { method: "POQ" }
  | { method: "EOQ" }
  | { method: "FPR"; periods: number }
  | { method: "MULTIPLE"; multiple: number; minimum?: number };

export type LotSizingMethod = LotSizingPolicy["method"];

export const LOT_SIZING_METHODS: readonly LotSizingMethod[] = [
  "LFL",
  "FOQ",
  "POQ",
  "EOQ",
  "FPR",
  "MULTIPLE",
];
