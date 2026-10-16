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
