import type { GameState } from "../../domain/gameState";
import type { Scenario } from "../../domain/scenario";
import { processEvents } from "../events/processEvents";
import { simulateWeek } from "../simulation/simulateWeek";
import { startPeriod } from "./gameActions";
import { statusAfterPeriod, transition } from "./stateMachine";

/** Simulates the committed plan for the current week and runs period-end events. */
export const simulatePeriod = (game: GameState, scenario: Scenario, now: string, entropy = 0): GameState => {
  transition(game, "SIMULATE_PERIOD");
  const { game: simulated } = simulateWeek(scenario, game);
  const withEvents = processEvents(simulated, scenario, "PERIOD_END", game.currentPeriod, entropy);
  return { ...withEvents, gameStatus: "PERIOD_SIMULATED", updatedAt: now };
};

export const reviewPeriod = (game: GameState, now: string): GameState => ({
  ...game,
  gameStatus: transition(game, "REVIEW_PERIOD"),
  updatedAt: now,
});

/**
 * Closes the reviewed week. After the last week the game is completed;
 * otherwise the next week starts immediately (its events are delivered).
 */
export const startNextPeriod = (game: GameState, scenario: Scenario, now: string, entropy = 0): GameState => {
  transition(game, "NEXT_PERIOD");
  if (statusAfterPeriod(game.currentPeriod, scenario.settings.gameLengthPeriods) === "GAME_COMPLETED") {
    return { ...game, gameStatus: "GAME_COMPLETED", updatedAt: now };
  }
  const nextPeriod = game.currentPeriod + 1;
  const next: GameState = {
    ...game,
    currentPeriod: nextPeriod,
    gameStatus: "PERIOD_START",
    committedPlanVersionId: null,
    pendingDecisionIds: [],
    activeEventEffects: game.activeEventEffects.filter((effect) => effect.toPeriod >= nextPeriod),
    workCenterCapacity: game.workCenterCapacity.filter((entry) => entry.period >= nextPeriod),
  };
  return startPeriod(next, scenario, now, entropy);
};

export const latestPeriodResult = (game: GameState) => game.completedPeriods.at(-1);
