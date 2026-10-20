import type { GameState, GameStatus } from "../../domain/gameState";

export type GameAction =
  | "START_GAME"
  | "START_PERIOD"
  | "EVENTS_HANDLED"
  | "CHANGE_PLAN"
  | "RUN_PLANNING"
  | "COMMIT_PLAN"
  | "SIMULATE_PERIOD"
  | "REVIEW_PERIOD"
  | "NEXT_PERIOD";

/** Allowed source states per action. Everything else is an invalid transition. */
const TRANSITIONS: Record<GameAction, readonly GameStatus[]> = {
  START_GAME: ["NOT_STARTED"],
  START_PERIOD: ["PERIOD_START"],
  EVENTS_HANDLED: ["EVENTS_PENDING"],
  CHANGE_PLAN: ["ANALYSIS", "PLANNING_DIRTY", "PLAN_CALCULATED", "PLAN_COMMITTED"],
  RUN_PLANNING: ["ANALYSIS", "PLANNING_DIRTY", "PLAN_CALCULATED", "PLAN_COMMITTED"],
  COMMIT_PLAN: ["PLAN_CALCULATED", "PLAN_COMMITTED"],
  SIMULATE_PERIOD: ["PLAN_COMMITTED"],
  REVIEW_PERIOD: ["PERIOD_SIMULATED"],
  NEXT_PERIOD: ["PERIOD_REVIEW"],
};

/** A what-if branch is for exploring only: nothing that fixes or plays out a plan. */
const WHAT_IF_BLOCKED: readonly GameAction[] = [
  "START_PERIOD",
  "COMMIT_PLAN",
  "SIMULATE_PERIOD",
  "REVIEW_PERIOD",
  "NEXT_PERIOD",
];

export interface TransitionCheck {
  allowed: boolean;
  /** i18n key explaining why the action is not possible. */
  reasonKey?: string;
}

const latestVersionThisPeriod = (game: GameState) =>
  game.planningVersions.filter((version) => version.period === game.currentPeriod).at(-1);

const isUnacknowledged = (message: GameState["inboxMessages"][number]): boolean =>
  message.acknowledgementRequired && message.status !== "ACKNOWLEDGED" && message.status !== "RESPONDED";

/**
 * New information must be taken in before analysis: every message of this
 * period read, and every message that needs it acknowledged.
 */
export const hasUnhandledMessages = (game: GameState): boolean =>
  game.inboxMessages.some(
    (message) => isUnacknowledged(message) || (message.period === game.currentPeriod && message.status === "UNREAD"),
  );

/**
 * A decision request may stay open while the student explores the plan, but
 * the week cannot be simulated before it is answered.
 */
export const hasOpenBlockingMessage = (game: GameState): boolean =>
  game.inboxMessages.some(
    (message) => (message.decisionRequired && message.status !== "RESPONDED") || isUnacknowledged(message),
  );

/**
 * Checks whether an action is valid in the current state. Guards encode the
 * pedagogical rules: no simulation without a committed plan that matches the
 * latest changes, and no commit of a stale or blocked plan.
 */
export const canPerform = (
  game: GameState,
  action: GameAction,
  versionId?: string,
): TransitionCheck => {
  if (game.whatIf && WHAT_IF_BLOCKED.includes(action)) {
    return { allowed: false, reasonKey: "whatIf.notAllowed" };
  }
  if (game.gameStatus === "PLANNING_DIRTY" && (action === "COMMIT_PLAN" || action === "SIMULATE_PERIOD")) {
    return { allowed: false, reasonKey: "guard.planStale" };
  }
  if (!TRANSITIONS[action].includes(game.gameStatus)) {
    return { allowed: false, reasonKey: `guard.invalidState.${action}` };
  }
  if (action === "EVENTS_HANDLED" && hasUnhandledMessages(game)) {
    return { allowed: false, reasonKey: "guard.openMessages" };
  }
  if (action === "COMMIT_PLAN") {
    if (game.pendingDecisionIds.length > 0) return { allowed: false, reasonKey: "guard.planStale" };
    const version = versionId
      ? game.planningVersions.find((candidate) => candidate.id === versionId)
      : latestVersionThisPeriod(game);
    if (!version || version.period !== game.currentPeriod) {
      return { allowed: false, reasonKey: "guard.noPlan" };
    }
    if (version.id !== latestVersionThisPeriod(game)?.id) {
      // Older versions reflect older inputs; committing them would silently undo decisions.
      return { allowed: false, reasonKey: "guard.notLatestVersion" };
    }
    if (version.violations.some((violation) => violation.severity === "BLOCKING")) {
      return { allowed: false, reasonKey: "guard.blockingViolations" };
    }
  }
  if (action === "SIMULATE_PERIOD") {
    if (hasOpenBlockingMessage(game)) return { allowed: false, reasonKey: "guard.openMessages" };
    if (game.pendingDecisionIds.length > 0) return { allowed: false, reasonKey: "guard.planStale" };
    const latest = latestVersionThisPeriod(game);
    if (!latest) return { allowed: false, reasonKey: "guard.noPlan" };
    if (game.committedPlanVersionId !== latest.id) {
      return { allowed: false, reasonKey: "guard.notCommitted" };
    }
  }
  return { allowed: true };
};

export const nextStatus = (game: GameState, action: GameAction): GameStatus => {
  switch (action) {
    case "START_GAME":
      return "PERIOD_START";
    case "START_PERIOD":
      return hasUnhandledMessages(game) ? "EVENTS_PENDING" : "ANALYSIS";
    case "EVENTS_HANDLED":
      return "ANALYSIS";
    case "CHANGE_PLAN":
      return "PLANNING_DIRTY";
    case "RUN_PLANNING":
      return "PLAN_CALCULATED";
    case "COMMIT_PLAN":
      return "PLAN_COMMITTED";
    case "SIMULATE_PERIOD":
      return "PERIOD_SIMULATED";
    case "REVIEW_PERIOD":
      return "PERIOD_REVIEW";
    case "NEXT_PERIOD":
      return "PERIOD_START";
  }
};

/** Status after NEXT_PERIOD, given the game length. */
export const statusAfterPeriod = (period: number, gameLengthPeriods: number): GameStatus =>
  period >= gameLengthPeriods ? "GAME_COMPLETED" : "PERIOD_START";

export class InvalidTransitionError extends Error {
  constructor(
    readonly action: GameAction,
    readonly status: GameStatus,
    readonly reasonKey: string,
  ) {
    super(`Action ${action} is not allowed in state ${status} (${reasonKey}).`);
    this.name = "InvalidTransitionError";
  }
}

/** Returns the new status or throws when the transition is not allowed. */
export const transition = (game: GameState, action: GameAction, versionId?: string): GameStatus => {
  const check = canPerform(game, action, versionId);
  if (!check.allowed) {
    throw new InvalidTransitionError(action, game.gameStatus, check.reasonKey ?? "guard.unknown");
  }
  return nextStatus(game, action);
};
