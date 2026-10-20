import type { KpiResult } from "../../domain/kpi";
import type { PlanningVersion } from "../../domain/planningVersion";

export type KpiDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";

/** How each KPI is judged. Comparison shows direction per KPI, never one "winner". */
export const KPI_DIRECTIONS: Record<keyof KpiResult, KpiDirection> = {
  revenue: "HIGHER_IS_BETTER",
  materialCost: "LOWER_IS_BETTER",
  orderCost: "LOWER_IS_BETTER",
  holdingCost: "LOWER_IS_BETTER",
  overtimeCost: "LOWER_IS_BETTER",
  expediteCost: "LOWER_IS_BETTER",
  externalCapacityCost: "LOWER_IS_BETTER",
  lateOrderCost: "LOWER_IS_BETTER",
  netContribution: "HIGHER_IS_BETTER",
  serviceLevel: "HIGHER_IS_BETTER",
  lateCustomerOrders: "LOWER_IS_BETTER",
  ordersAtRisk: "LOWER_IS_BETTER",
  averageInventoryValue: "LOWER_IS_BETTER",
  capacityOverloads: "LOWER_IS_BETTER",
  overloadHours: "LOWER_IS_BETTER",
  shortageUnits: "LOWER_IS_BETTER",
  replanCount: "LOWER_IS_BETTER",
};

export interface KpiDelta {
  kpi: keyof KpiResult;
  before: number;
  after: number;
  change: "BETTER" | "WORSE" | "SAME";
}

export const compareKpis = (before: KpiResult, after: KpiResult): KpiDelta[] =>
  (Object.keys(KPI_DIRECTIONS) as (keyof KpiResult)[])
    .filter((kpi) => kpi !== "replanCount")
    .map((kpi) => {
      const difference = after[kpi] - before[kpi];
      const change =
        Math.abs(difference) < 1e-9
          ? "SAME"
          : (difference > 0) === (KPI_DIRECTIONS[kpi] === "HIGHER_IS_BETTER")
            ? "BETTER"
            : "WORSE";
      return { kpi, before: before[kpi], after: after[kpi], change };
    });

export const compareVersions = (a: PlanningVersion, b: PlanningVersion): KpiDelta[] =>
  compareKpis(a.projectedKpis, b.projectedKpis);

export interface QuantityDelta {
  id: string;
  before: number;
  after: number;
  change: "BETTER" | "WORSE" | "SAME";
}

const lowerIsBetter = (id: string, before: number, after: number): QuantityDelta => ({
  id,
  before,
  after,
  change: Math.abs(after - before) < 1e-9 ? "SAME" : after < before ? "BETTER" : "WORSE",
});

/** Overload hours per work centre over the whole horizon. */
export const overloadByWorkCenter = (version: PlanningVersion): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const bucket of version.crpResult.buckets) {
    result[bucket.workCenterId] = (result[bucket.workCenterId] ?? 0) + Math.max(0, -bucket.balanceHours);
  }
  return result;
};

/** Largest projected shortage (negative balance) per item over the horizon. */
export const shortageByItem = (version: PlanningVersion): Record<string, number> =>
  Object.fromEntries(
    version.mrpResult.records.map((record) => [record.itemId, Math.max(0, -Math.min(0, ...record.projectedAvailable))]),
  );

export interface DetailedComparison {
  kpis: KpiDelta[];
  /** Only work centres / items where either version has a problem. */
  workCenters: QuantityDelta[];
  items: QuantityDelta[];
  violationsBefore: number;
  violationsAfter: number;
}

/**
 * "Plan V1 → Plan V2": KPIs plus the concrete problems behind them, e.g.
 * WC200 overload 14 h → 4 h, RM2 shortage 80 → 0.
 */
export const compareVersionsDetailed = (a: PlanningVersion, b: PlanningVersion): DetailedComparison => {
  const overloadA = overloadByWorkCenter(a);
  const overloadB = overloadByWorkCenter(b);
  const shortageA = shortageByItem(a);
  const shortageB = shortageByItem(b);
  const workCenterIds = [...new Set([...Object.keys(overloadA), ...Object.keys(overloadB)])].sort();
  const itemIds = [...new Set([...Object.keys(shortageA), ...Object.keys(shortageB)])].sort();
  const relevant = (delta: QuantityDelta) => delta.before > 1e-9 || delta.after > 1e-9;
  const counted = (v: PlanningVersion) => v.violations.filter((x) => x.severity !== "INFO").length;
  return {
    kpis: compareVersions(a, b),
    workCenters: workCenterIds
      .map((id) => lowerIsBetter(id, overloadA[id] ?? 0, overloadB[id] ?? 0))
      .filter(relevant),
    items: itemIds.map((id) => lowerIsBetter(id, shortageA[id] ?? 0, shortageB[id] ?? 0)).filter(relevant),
    violationsBefore: counted(a),
    violationsAfter: counted(b),
  };
};
