import type { CalculationTrace } from "../../domain/common";
import type { LotSizingPolicy } from "../../domain/lotSizing";

export interface LotSizingContext {
  /** Net requirement in the triggering period (> 0). */
  netRequirement: number;
  /** Index of the triggering period in the arrays below. */
  periodIndex: number;
  grossRequirements: readonly number[];
  scheduledReceipts: readonly number[];
  orderCost: number;
  holdingCostPerUnitPeriod: number;
}

export interface LotSizingResult {
  quantity: number;
  trace: CalculationTrace;
}

const round = (value: number): number => Math.round(value * 100) / 100;

export const lotForLot = (ctx: LotSizingContext): LotSizingResult => ({
  quantity: ctx.netRequirement,
  trace: {
    formula: "Q = net requirement",
    inputs: { method: "LFL", netRequirement: ctx.netRequirement },
    result: ctx.netRequirement,
    explanationKey: "lot.LFL",
  },
});

export const fixedOrderQuantity = (ctx: LotSizingContext, lotQuantity: number): LotSizingResult => {
  // Several fixed lots are combined when one lot cannot cover the requirement.
  const lots = Math.max(1, Math.ceil(ctx.netRequirement / lotQuantity));
  const quantity = lots * lotQuantity;
  return {
    quantity,
    trace: {
      formula: "Q = ceil(net / FOQ) × FOQ",
      inputs: { method: "FOQ", netRequirement: ctx.netRequirement, lotQuantity },
      intermediateValues: { lots },
      result: quantity,
      explanationKey: "lot.FOQ",
    },
  };
};

export const orderMultiple = (
  ctx: LotSizingContext,
  multiple: number,
  minimum = 0,
): LotSizingResult => {
  const base = Math.max(ctx.netRequirement, minimum);
  const quantity = Math.ceil(base / multiple) * multiple;
  return {
    quantity,
    trace: {
      formula: "Q = ceil(max(net, minimum) / multiple) × multiple",
      inputs: { method: "MULTIPLE", netRequirement: ctx.netRequirement, multiple, minimum },
      result: quantity,
      explanationKey: "lot.MULTIPLE",
    },
  };
};

/**
 * Covers the net requirement plus the requirements of the following
 * (periods - 1) periods. Scheduled receipts in those periods reduce what has
 * to be ordered, so the lot never buys material that is already on its way.
 */
export const fixedPeriodRequirement = (
  ctx: LotSizingContext,
  periods: number,
  method: "FPR" | "POQ" = "FPR",
  extraInputs: Record<string, number> = {},
): LotSizingResult => {
  const coveredPeriods = Math.max(1, Math.round(periods));
  const lastIndex = Math.min(ctx.grossRequirements.length - 1, ctx.periodIndex + coveredPeriods - 1);
  let additional = 0;
  for (let i = ctx.periodIndex + 1; i <= lastIndex; i++) {
    additional += ctx.grossRequirements[i] - ctx.scheduledReceipts[i];
  }
  const quantity = Math.max(ctx.netRequirement, ctx.netRequirement + additional);
  return {
    quantity,
    trace: {
      formula: "Q = net + Σ(gross − scheduled) for the following covered periods",
      inputs: {
        method,
        netRequirement: ctx.netRequirement,
        coveredPeriods,
        ...extraInputs,
      },
      intermediateValues: { additionalRequirements: additional },
      result: quantity,
      explanationKey: `lot.${method}`,
    },
  };
};

/**
 * Average gross requirement per period over the remaining horizon. Used as
 * demand rate D for EOQ and POQ. Periods without demand are included, since
 * the rate should describe the whole horizon.
 */
export const averageDemand = (ctx: LotSizingContext): number => {
  const remaining = ctx.grossRequirements.slice(ctx.periodIndex);
  if (remaining.length === 0) return 0;
  return remaining.reduce((sum, value) => sum + value, 0) / remaining.length;
};

/** Classic EOQ = sqrt(2·D·S / H) with D per period and H per unit and period. */
export const economicOrderQuantity = (
  demandPerPeriod: number,
  orderCost: number,
  holdingCostPerUnitPeriod: number,
): number | null => {
  if (demandPerPeriod <= 0 || orderCost <= 0 || holdingCostPerUnitPeriod <= 0) return null;
  return Math.sqrt((2 * demandPerPeriod * orderCost) / holdingCostPerUnitPeriod);
};

export const eoqLot = (ctx: LotSizingContext): LotSizingResult => {
  const demand = averageDemand(ctx);
  const eoq = economicOrderQuantity(demand, ctx.orderCost, ctx.holdingCostPerUnitPeriod);
  if (eoq === null) {
    // Without cost data EOQ is undefined; fall back to LFL and say so in the trace.
    const fallback = lotForLot(ctx);
    return { ...fallback, trace: { ...fallback.trace, explanationKey: "lot.EOQ_FALLBACK" } };
  }
  const quantity = Math.max(ctx.netRequirement, Math.ceil(eoq));
  return {
    quantity,
    trace: {
      formula: "Q = max(net, ceil(√(2·D·S / H)))",
      inputs: {
        method: "EOQ",
        netRequirement: ctx.netRequirement,
        D: round(demand),
        S: ctx.orderCost,
        H: ctx.holdingCostPerUnitPeriod,
      },
      intermediateValues: { eoq: round(eoq) },
      result: quantity,
      explanationKey: "lot.EOQ",
    },
  };
};

/** POQ: number of periods = round(EOQ / D), at least one; then like FPR. */
export const periodOrderQuantity = (ctx: LotSizingContext): LotSizingResult => {
  const demand = averageDemand(ctx);
  const eoq = economicOrderQuantity(demand, ctx.orderCost, ctx.holdingCostPerUnitPeriod);
  if (eoq === null) {
    const fallback = lotForLot(ctx);
    return { ...fallback, trace: { ...fallback.trace, explanationKey: "lot.POQ_FALLBACK" } };
  }
  const periods = Math.max(1, Math.round(eoq / demand));
  return fixedPeriodRequirement(ctx, periods, "POQ", { D: round(demand), EOQ: round(eoq) });
};

export const calculateLotSize = (
  policy: LotSizingPolicy,
  ctx: LotSizingContext,
): LotSizingResult => {
  switch (policy.method) {
    case "LFL":
      return lotForLot(ctx);
    case "FOQ":
      return fixedOrderQuantity(ctx, policy.quantity);
    case "POQ":
      return periodOrderQuantity(ctx);
    case "EOQ":
      return eoqLot(ctx);
    case "FPR":
      return fixedPeriodRequirement(ctx, policy.periods);
    case "MULTIPLE":
      return orderMultiple(ctx, policy.multiple, policy.minimum);
  }
};

export const describePolicy = (policy: LotSizingPolicy): string => {
  switch (policy.method) {
    case "LFL":
    case "POQ":
    case "EOQ":
      return policy.method;
    case "FOQ":
      return `FOQ ${policy.quantity}`;
    case "FPR":
      return `FPR ${policy.periods}p`;
    case "MULTIPLE":
      return policy.minimum
        ? `MULTIPLE ${policy.multiple} (min ${policy.minimum})`
        : `MULTIPLE ${policy.multiple}`;
  }
};
