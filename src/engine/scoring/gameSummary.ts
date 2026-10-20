import type { DecisionRecord } from "../../domain/decision";
import type { GameState } from "../../domain/gameState";
import type { KpiResult } from "../../domain/kpi";
import type { ScoringSettings } from "../../domain/scenario";
import type { ScoreResult } from "./calculateScore";
import { calculateScore, realisedTotals } from "./calculateScore";

/** Decisions that change the plan materially (not just reading or logging). */
const MAJOR_CATEGORIES = new Set([
  "SUPPLIER_SELECTION",
  "MESSAGE_RESPONSE",
  "EXPRESS_DELIVERY",
  "ACCEPT_CUSTOMER_ORDER",
  "REJECT_CUSTOMER_ORDER",
  "OVERTIME",
  "EXTERNAL_CAPACITY",
  "FIRM_PLANNED_ORDER",
  "APPLY_WHAT_IF",
]);

export interface GameSummary {
  gameId: string;
  teamName: string;
  scenarioId: string;
  scenarioVersion: string;
  finalPeriod: number;
  completed: boolean;
  weeksSimulated: number;
  totals: KpiResult;
  score: ScoreResult;
  decisionCount: number;
  decisionsByCategory: Record<string, number>;
  majorDecisions: DecisionRecord[];
  events: { eventId: string; period: number; choiceId?: string }[];
  versionsPerPeriod: Record<number, number>;
  replanCount: number;
}

/** Everything an instructor needs to discuss one team's game, computed from its state only. */
export const summarizeGame = (game: GameState, scoring?: ScoringSettings): GameSummary => {
  const decisionsByCategory: Record<string, number> = {};
  for (const decision of game.decisions) {
    decisionsByCategory[decision.category] = (decisionsByCategory[decision.category] ?? 0) + 1;
  }
  const versionsPerPeriod: Record<number, number> = {};
  for (const version of game.planningVersions) {
    versionsPerPeriod[version.period] = (versionsPerPeriod[version.period] ?? 0) + 1;
  }
  return {
    gameId: game.gameId,
    teamName: game.teamName,
    scenarioId: game.scenarioId,
    scenarioVersion: game.scenarioVersion,
    finalPeriod: game.currentPeriod,
    completed: game.gameStatus === "GAME_COMPLETED",
    weeksSimulated: game.completedPeriods.length,
    totals: realisedTotals(game),
    score: calculateScore(game, scoring),
    decisionCount: game.decisions.length,
    decisionsByCategory,
    majorDecisions: game.decisions.filter((decision) => MAJOR_CATEGORIES.has(decision.category)),
    events: game.eventHistory,
    versionsPerPeriod,
    replanCount: game.planningVersions.length,
  };
};
