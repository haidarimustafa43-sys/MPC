import { useCallback } from "react";
import type { ConstraintViolation } from "../domain/constraint";
import type { GameState } from "../domain/gameState";
import type { PlanningVersion } from "../domain/planningVersion";
import { evaluateGameConstraints } from "../engine/constraints/evaluateConstraints";
import { latestVersion } from "../engine/game/gameActions";
import { translate, type Params } from "../i18n";
import { useGameStore } from "./gameStore";

export const useT = () => {
  const language = useGameStore((state) => state.language);
  return useCallback((key: string, params?: Params) => translate(language, key, params), [language]);
};

export const selectLatestVersion = (game: GameState | null): PlanningVersion | undefined =>
  game ? latestVersion(game) : undefined;

export const isPlanStale = (game: GameState | null): boolean => !!game && game.pendingDecisionIds.length > 0;

/** Plan violations of the latest version plus workflow problems from the game state. */
export const currentViolations = (game: GameState | null): ConstraintViolation[] => {
  if (!game) return [];
  return [...evaluateGameConstraints(game), ...(latestVersion(game)?.violations ?? [])];
};

/** Translated one-line text of a violation, falling back to the engine's English description. */
export const violationText = (
  violation: ConstraintViolation,
  t: (key: string, params?: Params) => string,
): string => {
  const key = `constraint.${violation.type}`;
  const text = t(key, violation.params);
  return text === key ? violation.description : text;
};
