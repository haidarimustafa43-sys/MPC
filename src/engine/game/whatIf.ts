import type { GameState } from "../../domain/gameState";
import { GameActionError } from "./errors";
import { latestVersion, logDecision } from "./gameActions";
import { canPerform } from "./stateMachine";

/*
 * What-if planning: a temporary copy of the game in which the student can try
 * decisions (e.g. accept a customer order) and run MPS/MRP/CRP. The live game
 * is not touched until the branch is explicitly applied.
 */

export const isWhatIf = (game: GameState): boolean => game.whatIf !== undefined;

export const startWhatIf = (live: GameState, now: string): GameState => {
  if (isWhatIf(live)) throw new GameActionError("whatIf.alreadyActive");
  const check = canPerform(live, "CHANGE_PLAN");
  if (!check.allowed) throw new GameActionError(check.reasonKey ?? "guard.unknown");
  return {
    ...structuredClone(live),
    whatIf: { startedAt: now, basePlanVersionId: latestVersion(live)?.id ?? null },
  };
};

/**
 * Makes the branch the live game. Its decisions and planning versions become
 * part of the history; the versions keep their WHAT_IF origin.
 */
export const applyWhatIf = (live: GameState, branch: GameState, now: string, reason?: string): GameState => {
  if (!isWhatIf(branch)) throw new GameActionError("whatIf.notActive");
  if (branch.gameId !== live.gameId) throw new GameActionError("whatIf.notActive");
  const { whatIf: _branchMarker, ...applied } = branch;
  return logDecision(applied, {
    timestamp: now,
    category: "APPLY_WHAT_IF",
    entityType: "WHAT_IF",
    newValue: {
      decisions: branch.decisions.length - live.decisions.length,
      versions: branch.planningVersions.length - live.planningVersions.length,
    },
    reason,
  });
};

/** Drops the branch; the live game only records that a what-if was explored. */
export const discardWhatIf = (live: GameState, branch: GameState, now: string, reason?: string): GameState =>
  logDecision(live, {
    timestamp: now,
    category: "DISCARD_WHAT_IF",
    entityType: "WHAT_IF",
    newValue: {
      decisions: branch.decisions.length - live.decisions.length,
      versions: branch.planningVersions.length - live.planningVersions.length,
    },
    reason,
  });
