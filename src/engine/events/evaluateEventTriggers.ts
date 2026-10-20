import type { EventDefinition, EventTrigger } from "../../domain/event";
import type { GameState } from "../../domain/gameState";
import { availableOnHand } from "../planningInput";

export type TriggerPhase = "PERIOD_START" | "PERIOD_END";

export interface TriggerContext {
  phase: TriggerPhase;
  period: number;
  game: GameState;
  roll: (eventId: string, period: number) => number;
}

export const hasFired = (game: GameState, eventId: string): boolean =>
  game.eventHistory.some((entry) => entry.eventId === eventId);

const prerequisitesMet = (event: EventDefinition, game: GameState): boolean =>
  (event.prerequisites ?? []).every((id) => hasFired(game, id));

/** Realised service level over all simulated periods (1 when nothing has been due yet). */
export const cumulativeServiceLevel = (game: GameState): number => {
  const due = game.completedPeriods.reduce((sum, result) => sum + result.dueLines, 0);
  const onTime = game.completedPeriods.reduce((sum, result) => sum + result.onTimeLines, 0);
  return due === 0 ? 1 : onTime / due;
};

/**
 * Utilisation of a work centre in the previous period according to the plan
 * that was committed for it. The realised hours are not tracked per bucket, so
 * the committed plan is the best available measure.
 */
const previousUtilization = (game: GameState, workCenterId: string, period: number): number => {
  const result = game.completedPeriods.find((entry) => entry.period === period - 1);
  const version = game.planningVersions.find((v) => v.id === result?.committedPlanVersionId);
  const bucket = version?.crpResult.buckets.find(
    (b) => b.workCenterId === workCenterId && b.period === period - 1,
  );
  return bucket?.utilization ?? 0;
};

export const triggerMatches = (trigger: EventTrigger, context: TriggerContext): boolean => {
  const { phase, period, game } = context;
  if (trigger.type === "PERIOD_END") return phase === "PERIOD_END" && period === trigger.period;
  if (phase !== "PERIOD_START") return false;
  switch (trigger.type) {
    case "PERIOD_START":
      return period === trigger.period;
    case "PERIOD_RANGE":
    case "RANDOM":
      return period >= trigger.fromPeriod && period <= trigger.toPeriod;
    case "INVENTORY_BELOW":
      return availableOnHand(game.inventory, trigger.itemId) < trigger.threshold;
    case "UTILIZATION_ABOVE":
      return previousUtilization(game, trigger.workCenterId, period) > trigger.threshold;
    case "SERVICE_LEVEL_BELOW":
      return game.completedPeriods.length > 0 && cumulativeServiceLevel(game) < trigger.threshold;
    case "DECISION_TAKEN":
      return game.decisions.some(
        (decision) =>
          decision.category === trigger.category &&
          (trigger.entityId === undefined || decision.entityId === trigger.entityId),
      );
  }
};

/**
 * Events that fire now. Every event fires at most once per game; probability
 * below 1 is decided by the seeded roll, so a game can be reproduced.
 */
export const evaluateEventTriggers = (
  events: readonly EventDefinition[],
  context: TriggerContext,
): EventDefinition[] =>
  events.filter(
    (event) =>
      !hasFired(context.game, event.id) &&
      prerequisitesMet(event, context.game) &&
      triggerMatches(event.trigger, context) &&
      (event.probability >= 1 || context.roll(event.id, context.period) < event.probability),
  );
