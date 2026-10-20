import type { GameState } from "../../domain/gameState";
import type { KpiResult } from "../../domain/kpi";
import type { ScoringSettings } from "../../domain/scenario";

export const DEFAULT_SCORING: ScoringSettings = {
  deliveryWeight: 40,
  financialWeight: 40,
  planAdherenceWeight: 20,
  referenceNetContributionPerPeriod: 45000,
};

export interface ScoreComponent {
  key: "delivery" | "financial" | "planAdherence";
  points: number;
  maxPoints: number;
  /** The measured value the points are based on (0–1). */
  ratio: number;
  formula: string;
}

export interface ScoreResult {
  total: number;
  maxTotal: number;
  components: ScoreComponent[];
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Sum of realised KPIs over all simulated weeks (ratios are recomputed separately). */
export const realisedTotals = (game: GameState): KpiResult => {
  const keys = [
    "revenue",
    "materialCost",
    "orderCost",
    "holdingCost",
    "overtimeCost",
    "expediteCost",
    "externalCapacityCost",
    "lateOrderCost",
    "netContribution",
    "capacityOverloads",
    "overloadHours",
    "shortageUnits",
    "replanCount",
  ] as const;
  const sums = Object.fromEntries(
    keys.map((key) => [key, game.kpiHistory.reduce((sum, entry) => sum + entry.kpis[key], 0)]),
  ) as Record<(typeof keys)[number], number>;
  const due = game.completedPeriods.reduce((sum, r) => sum + r.dueLines, 0);
  const onTime = game.completedPeriods.reduce((sum, r) => sum + r.onTimeLines, 0);
  const weeks = Math.max(1, game.kpiHistory.length);
  return {
    ...sums,
    serviceLevel: due === 0 ? 1 : onTime / due,
    lateCustomerOrders: game.customerOrders.filter((order) => order.status === "LATE").length,
    ordersAtRisk: 0,
    averageInventoryValue: game.kpiHistory.reduce((sum, e) => sum + e.kpis.averageInventoryValue, 0) / weeks,
  };
};

/**
 * Illustrative total score with transparent parts. It is meant to start a
 * discussion about trade-offs, never to grade: the weights are scenario data.
 * - delivery: realised service level (order lines on time and complete);
 * - financial: realised net contribution relative to a reference per week;
 * - plan adherence: share of weeks without a failure that the committed plan
 *   already showed (i.e. known problems that were left unresolved).
 */
export const calculateScore = (game: GameState, settings: ScoringSettings = DEFAULT_SCORING): ScoreResult => {
  const weeks = game.completedPeriods.length;
  const totals = realisedTotals(game);
  const reference = settings.referenceNetContributionPerPeriod * Math.max(1, weeks);
  const financialRatio = weeks === 0 ? 0 : clamp01(totals.netContribution / reference);
  const adherentWeeks = game.completedPeriods.filter(
    (result) => !result.failures.some((failure) => failure.cause === "UNRESOLVED_PLAN_PROBLEM"),
  ).length;
  const adherenceRatio = weeks === 0 ? 0 : adherentWeeks / weeks;
  const deliveryRatio = weeks === 0 ? 0 : totals.serviceLevel;
  const components: ScoreComponent[] = [
    {
      key: "delivery",
      ratio: deliveryRatio,
      maxPoints: settings.deliveryWeight,
      points: settings.deliveryWeight * deliveryRatio,
      formula: `${settings.deliveryWeight} × service level`,
    },
    {
      key: "financial",
      ratio: financialRatio,
      maxPoints: settings.financialWeight,
      points: settings.financialWeight * financialRatio,
      formula: `${settings.financialWeight} × min(1, net contribution / (${settings.referenceNetContributionPerPeriod} × weeks))`,
    },
    {
      key: "planAdherence",
      ratio: adherenceRatio,
      maxPoints: settings.planAdherenceWeight,
      points: settings.planAdherenceWeight * adherenceRatio,
      formula: `${settings.planAdherenceWeight} × weeks without unresolved known problems / weeks`,
    },
  ];
  return {
    total: components.reduce((sum, c) => sum + c.points, 0),
    maxTotal: components.reduce((sum, c) => sum + c.maxPoints, 0),
    components,
  };
};
