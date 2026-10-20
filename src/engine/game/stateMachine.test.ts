import { describe, expect, it } from "vitest";
import type { GameState } from "../../domain/gameState";
import { loadScenario } from "../../scenarios";
import { FIXED_TIME, takeInMessages } from "../../tests/fixtures";
import {
  commitPlan,
  createGameState,
  runPlanningVersion,
  startPeriod,
  updatePlanningParameters,
} from "./gameActions";
import { canPerform, InvalidTransitionError, transition } from "./stateMachine";

const scenario = loadScenario("standard");
const newGame = (): GameState =>
  createGameState(scenario, { gameId: "g1", teamName: "Team 1", randomSeed: 42, now: FIXED_TIME });

describe("weekly state machine", () => {
  it("starts in PERIOD_START and moves to ANALYSIS when the week starts", () => {
    const game = newGame();
    expect(game.gameStatus).toBe("PERIOD_START");
    expect(takeInMessages(startPeriod(game, scenario, FIXED_TIME)).gameStatus).toBe("ANALYSIS");
  });

  it("goes to EVENTS_PENDING when unread messages arrive at the start of the week", () => {
    const game: GameState = {
      ...newGame(),
      inboxMessages: [
        {
          id: "M1",
          period: 1,
          sender: "Supplier North",
          messageType: "CRITICAL_DISRUPTION",
          severity: "CRITICAL",
          title: { en: "t" },
          body: { en: "b" },
          status: "UNREAD",
          acknowledgementRequired: true,
          decisionRequired: false,
        },
      ],
    };
    const started = { ...game, gameStatus: transition(game, "START_PERIOD") };
    expect(started.gameStatus).toBe("EVENTS_PENDING");
    expect(canPerform(started, "EVENTS_HANDLED")).toEqual({ allowed: false, reasonKey: "guard.openMessages" });
    expect(canPerform(started, "RUN_PLANNING").allowed).toBe(false);
  });

  it("rejects invalid transitions", () => {
    const game = newGame();
    expect(() => transition(game, "COMMIT_PLAN")).toThrow(InvalidTransitionError);
    expect(() => transition(game, "SIMULATE_PERIOD")).toThrow(InvalidTransitionError);
    expect(() => updatePlanningParameters(game, "A", { safetyStock: 50 }, FIXED_TIME)).toThrow(
      InvalidTransitionError,
    );
  });

  it("follows ANALYSIS → PLAN_CALCULATED → PLANNING_DIRTY → PLAN_CALCULATED → PLAN_COMMITTED", () => {
    let game = takeInMessages(startPeriod(newGame(), scenario, FIXED_TIME));
    expect(canPerform(game, "COMMIT_PLAN").reasonKey).toBe("guard.invalidState.COMMIT_PLAN");

    game = runPlanningVersion(game, scenario, FIXED_TIME);
    expect(game.gameStatus).toBe("PLAN_CALCULATED");

    game = updatePlanningParameters(game, "C1", { lotSizingPolicy: { method: "LFL" } }, FIXED_TIME, "Smaller lots");
    expect(game.gameStatus).toBe("PLANNING_DIRTY");
    expect(canPerform(game, "COMMIT_PLAN").allowed).toBe(false);

    game = runPlanningVersion(game, scenario, FIXED_TIME);
    expect(game.gameStatus).toBe("PLAN_CALCULATED");
    // An older version no longer reflects the current decisions.
    expect(canPerform(game, "COMMIT_PLAN", "PV-1-1").reasonKey).toBe("guard.notLatestVersion");

    game = commitPlan(game, "PV-1-2", FIXED_TIME);
    expect(game.gameStatus).toBe("PLAN_COMMITTED");
    expect(game.committedPlanVersionId).toBe("PV-1-2");
  });

  it("only allows simulation with a committed plan that matches the latest change", () => {
    let game = runPlanningVersion(takeInMessages(startPeriod(newGame(), scenario, FIXED_TIME)), scenario, FIXED_TIME);
    game = commitPlan(game, "PV-1-1", FIXED_TIME);
    expect(canPerform(game, "SIMULATE_PERIOD").allowed).toBe(true);

    const changed = updatePlanningParameters(game, "A", { safetyStock: 40 }, FIXED_TIME);
    expect(changed.gameStatus).toBe("PLANNING_DIRTY");
    expect(canPerform(changed, "SIMULATE_PERIOD").allowed).toBe(false);

    const recalculated = runPlanningVersion(changed, scenario, FIXED_TIME);
    expect(canPerform({ ...recalculated, gameStatus: "PLAN_COMMITTED" }, "SIMULATE_PERIOD").reasonKey).toBe(
      "guard.notCommitted",
    );
  });

  it("blocks simulation while a required decision is unanswered", () => {
    let game = runPlanningVersion(takeInMessages(startPeriod(newGame(), scenario, FIXED_TIME)), scenario, FIXED_TIME);
    game = commitPlan(game, "PV-1-1", FIXED_TIME);
    const withRequest: GameState = {
      ...game,
      inboxMessages: [
        {
          id: "M2",
          period: 1,
          sender: "Customer Alpha",
          messageType: "CUSTOMER_REQUEST",
          severity: "WARNING",
          title: { en: "t" },
          body: { en: "b" },
          status: "READ",
          acknowledgementRequired: false,
          decisionRequired: true,
        },
      ],
    };
    expect(canPerform(withRequest, "SIMULATE_PERIOD").reasonKey).toBe("guard.openMessages");
  });
});
