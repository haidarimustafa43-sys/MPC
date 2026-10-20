import type { GameState } from "../../domain/gameState";
import type { Scenario } from "../../domain/scenario";
import { applyEffects, fireEvent } from "./applyEventEffects";
import { eventRoll } from "./eventRandom";
import type { TriggerPhase } from "./evaluateEventTriggers";
import { evaluateEventTriggers, hasFired } from "./evaluateEventTriggers";

/**
 * Runs the event engine for one phase of a period:
 * 1. at period start, effects and follow-ups scheduled for this period;
 * 2. events whose trigger matches now.
 * `entropy` only matters for scenarios in "random" event mode.
 */
export const processEvents = (
  game: GameState,
  scenario: Scenario,
  phase: TriggerPhase,
  period: number,
  entropy = 0,
): GameState => {
  let next = game;
  if (phase === "PERIOD_START") {
    const due = next.scheduledEffects.filter((entry) => entry.period <= period);
    next = { ...next, scheduledEffects: next.scheduledEffects.filter((entry) => entry.period > period) };
    for (const entry of due) {
      next = applyEffects(next, entry.effects, period, entry.eventId);
      for (const followUpId of entry.followUpEventIds ?? []) {
        const event = scenario.events.find((candidate) => candidate.id === followUpId);
        if (event && !hasFired(next, event.id)) next = fireEvent(next, event, period);
      }
    }
  }
  const roll = eventRoll(scenario.settings.eventMode, scenario.id, game.randomSeed, entropy);
  for (const event of evaluateEventTriggers(scenario.events, { phase, period, game: next, roll })) {
    next = fireEvent(next, event, period);
  }
  return next;
};
