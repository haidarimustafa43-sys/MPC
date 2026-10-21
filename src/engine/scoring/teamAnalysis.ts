import type { GameState, PeriodFailure } from "../../domain/gameState";
import { realisedTotals } from "./calculateScore";

/*
 * Analyses of one team's exported game for the instructor review. Everything
 * is derived from the save file, so it can be computed for any game, finished
 * or not, without the scenario's facit.
 */

export const COST_KEYS = [
  "materialCost",
  "orderCost",
  "holdingCost",
  "overtimeCost",
  "externalCapacityCost",
  "expediteCost",
  "lateOrderCost",
] as const;
export type CostKey = (typeof COST_KEYS)[number];

export const FAILURE_KINDS: PeriodFailure["kind"][] = [
  "MATERIAL_SHORTAGE",
  "CAPACITY_SHORTAGE",
  "LATE_DELIVERY",
  "ORDER_NOT_RELEASED",
];

export interface WeekPoint {
  period: number;
  serviceLevel: number;
  netContribution: number;
  cumulativeNet: number;
  failures: number;
}

export interface EventReaction {
  eventId: string;
  period: number;
  choiceId?: string;
  /** Decisions of that week by category, without routine order releases. */
  decisions: Record<string, number>;
  releases: number;
}

export interface TeamAnalysis {
  costs: Record<CostKey, number>;
  weekly: WeekPoint[];
  failures: {
    byKind: Record<PeriodFailure["kind"], number>;
    /** The committed plan already showed the problem (counts against plan adherence). */
    known: number;
    unplanned: number;
    list: (PeriodFailure & { period: number })[];
  };
  process: {
    decisions: number;
    withReason: number;
    /** Share of the student's own decisions that carry a reason. */
    reasonShare: number;
    planningRuns: number;
    runsPerWeek: number;
    whatIfCount: number;
    whatIfConclusions: { period: number; text: string }[];
    orderMoves: number;
    supplierChanges: number;
    parameterChanges: number;
    capacityDecisions: number;
    releases: number;
  };
  eventReactions: EventReaction[];
}

const count = <T extends string>(keys: readonly T[], values: readonly T[]): Record<T, number> =>
  Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length])) as Record<T, number>;

export const analyzeTeam = (game: GameState): TeamAnalysis => {
  const totals = realisedTotals(game);
  const costs = Object.fromEntries(COST_KEYS.map((key) => [key, totals[key]])) as Record<CostKey, number>;

  let cumulative = 0;
  const weekly = game.completedPeriods.map((result): WeekPoint => {
    cumulative += result.kpis.netContribution;
    return {
      period: result.period,
      serviceLevel: result.dueLines === 0 ? 1 : result.onTimeLines / result.dueLines,
      netContribution: result.kpis.netContribution,
      cumulativeNet: cumulative,
      failures: result.failures.length,
    };
  });

  const list = game.completedPeriods.flatMap((result) => result.failures.map((f) => ({ ...f, period: result.period })));
  const decisions = game.decisions;
  // Reasons only make sense for the student's own choices, not for releasing or ending what-ifs.
  const own = decisions.filter((d) => !["RELEASE_ORDER", "RESET_WORKING_PLAN"].includes(d.category));
  const of = (...categories: string[]) => decisions.filter((d) => categories.includes(d.category)).length;
  const weeks = Math.max(1, new Set(game.planningVersions.map((v) => v.period)).size);

  const eventReactions = game.eventHistory.map((event): EventReaction => {
    const week = decisions.filter((d) => d.period === event.period);
    const routine = week.filter((d) => d.category === "RELEASE_ORDER");
    const byCategory: Record<string, number> = {};
    for (const d of week) if (d.category !== "RELEASE_ORDER") byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
    return { eventId: event.eventId, period: event.period, choiceId: event.choiceId, decisions: byCategory, releases: routine.length };
  });

  return {
    costs,
    weekly,
    failures: {
      byKind: count(FAILURE_KINDS, list.map((f) => f.kind)),
      known: list.filter((f) => f.cause === "UNRESOLVED_PLAN_PROBLEM").length,
      unplanned: list.filter((f) => f.cause === "UNPLANNED").length,
      list,
    },
    process: {
      decisions: decisions.length,
      withReason: own.filter((d) => d.reason?.trim()).length,
      reasonShare: own.length === 0 ? 0 : own.filter((d) => d.reason?.trim()).length / own.length,
      planningRuns: game.planningVersions.length,
      runsPerWeek: game.planningVersions.length / weeks,
      whatIfCount: of("DISCARD_WHAT_IF", "APPLY_WHAT_IF"),
      whatIfConclusions: decisions
        .filter((d) => (d.category === "DISCARD_WHAT_IF" || d.category === "APPLY_WHAT_IF") && d.reason?.trim())
        .map((d) => ({ period: d.period, text: d.reason!.trim() })),
      orderMoves: of("FIRM_PLANNED_ORDER", "CANCEL_FIRM_ORDER"),
      supplierChanges: of("SUPPLIER_SELECTION"),
      parameterChanges: of("PLANNING_PARAMETER", "FORECAST_CHANGE"),
      capacityDecisions: of("OVERTIME", "EXTERNAL_CAPACITY"),
      releases: of("RELEASE_ORDER"),
    },
    eventReactions,
  };
};
