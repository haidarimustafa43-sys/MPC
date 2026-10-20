import { describe, expect, it } from "vitest";
import type { GameState } from "../../domain/gameState";
import type { Scenario } from "../../domain/scenario";
import { loadScenario } from "../../scenarios";
import { FIXED_TIME, takeInMessages } from "../../tests/fixtures";
import { compareVersionsDetailed } from "../planning/compareVersions";
import { calculateScore, DEFAULT_SCORING, realisedTotals } from "../scoring/calculateScore";
import { summarizeGame } from "../scoring/gameSummary";
import { startReleasedOrders } from "../simulation/completeProduction";
import { GameActionError } from "./errors";
import {
  commitPlan,
  createGameState,
  latestVersion,
  runPlanningVersion,
  setCapacityAdjustment,
  startPeriod,
  updateForecast,
} from "./gameActions";
import { respondToMessage } from "./inboxActions";
import { releaseAllDueOrders } from "./orderActions";
import { canPerform } from "./stateMachine";
import { reviewPeriod, simulatePeriod, startNextPeriod } from "./weekFlow";
import { applyWhatIf, discardWhatIf, startWhatIf } from "./whatIf";

const scenario = loadScenario("standard");
const T = FIXED_TIME;
const started = (): GameState =>
  takeInMessages(
    startPeriod(createGameState(scenario, { gameId: "g", teamName: "Team", randomSeed: 5, now: T }), scenario, T),
  );
const planAndCommit = (game: GameState): GameState => {
  let next = runPlanningVersion(game, scenario, T);
  next = releaseAllDueOrders(next, scenario, T);
  next = runPlanningVersion(next, scenario, T);
  return commitPlan(next, latestVersion(next)!.id, T);
};
const playWeek = (game: GameState): GameState =>
  takeInMessages(startNextPeriod(reviewPeriod(simulatePeriod(planAndCommit(game), scenario, T), T), scenario, T));

describe("what-if planning", () => {
  it("explores a customer request in a branch without touching the live game", () => {
    const live = runPlanningVersion(playWeek(runPlanningVersion(started(), scenario, T)), scenario, T);
    expect(live.currentPeriod).toBe(2);
    const request = "MSG-CUSTOMER-ALPHA-INCREASE-2";

    let branch = startWhatIf(live, T);
    expect(branch.whatIf).toEqual({ startedAt: T, basePlanVersionId: latestVersion(live)!.id });
    branch = respondToMessage(branch, scenario, request, "accept", T);
    branch = runPlanningVersion(branch, scenario, T);
    expect(latestVersion(branch)!.origin).toBe("WHAT_IF");

    // The live game is unchanged.
    expect(live.customerOrders.find((o) => o.id === "CO-1005")?.quantity).toBe(150);
    expect(live.inboxMessages.find((m) => m.id === request)?.status).not.toBe("RESPONDED");

    // Committing or simulating is not possible in the branch.
    expect(canPerform(branch, "COMMIT_PLAN").reasonKey).toBe("whatIf.notAllowed");
    expect(canPerform(branch, "SIMULATE_PERIOD").reasonKey).toBe("whatIf.notAllowed");

    const comparison = compareVersionsDetailed(latestVersion(live)!, latestVersion(branch)!);
    expect(comparison.kpis.find((d) => d.kpi === "revenue")?.change).toBe("BETTER");

    const discarded = discardWhatIf(live, branch, T, "Too risky");
    expect(discarded.customerOrders.find((o) => o.id === "CO-1005")?.quantity).toBe(150);
    expect(discarded.decisions.at(-1)).toMatchObject({ category: "DISCARD_WHAT_IF", reason: "Too risky" });
    expect(discarded.pendingDecisionIds).toEqual(live.pendingDecisionIds);

    const applied = applyWhatIf(live, branch, T);
    expect(applied.whatIf).toBeUndefined();
    expect(applied.customerOrders.find((o) => o.id === "CO-1005")?.quantity).toBe(190);
    expect(applied.decisions.at(-1)?.category).toBe("APPLY_WHAT_IF");
    expect(canPerform(applied, "COMMIT_PLAN").allowed).toBe(true);
  });

  it("cannot be started twice or before the week has started", () => {
    const branch = startWhatIf(started(), T);
    expect(() => startWhatIf(branch, T)).toThrow(GameActionError);
    const notStarted = createGameState(scenario, { gameId: "x", teamName: "T", randomSeed: 1, now: T });
    expect(() => startWhatIf(notStarted, T)).toThrow(GameActionError);
  });
});

describe("detailed plan comparison", () => {
  it("shows overload per work centre before and after", () => {
    let game = runPlanningVersion(started(), scenario, T);
    const v1 = latestVersion(game)!;
    game = setCapacityAdjustment(game, "WC200", 3, { overtimeHours: 2 }, T);
    game = runPlanningVersion(game, scenario, T);
    const comparison = compareVersionsDetailed(v1, latestVersion(game)!);
    expect(comparison.workCenters).toEqual([{ id: "WC200", before: 1, after: 0, change: "BETTER" }]);
    expect(comparison.violationsBefore).toBeGreaterThan(comparison.violationsAfter);
  });
});

describe("calculation traces", () => {
  it("pegs component gross requirements to parent orders", () => {
    const version = latestVersion(runPlanningVersion(started(), scenario, T))!;
    const c1 = version.mrpResult.records.find((r) => r.itemId === "C1")!;
    const trace = c1.traces["gross:3"];
    expect(trace.result).toBe(c1.grossRequirements[2]);
    expect(Object.keys(trace.inputs)).toEqual(expect.arrayContaining(["PL-A-4 (A)", "PL-B-4 (B)"]));
    const sum = Object.values(trace.inputs).reduce<number>((s, v) => s + Number(v), 0);
    expect(sum).toBe(trace.result);
  });

  it("explains MPS demand and ATP", () => {
    const version = latestVersion(runPlanningVersion(started(), scenario, T))!;
    const a = version.mpsResult.records.find((r) => r.itemId === "A")!;
    expect(a.traces["gross:1"]).toMatchObject({ explanationKey: "mps.demandInsideFence", result: 90 });
    expect(a.traces["gross:3"]).toMatchObject({ explanationKey: "mps.demandOutsideFence", result: 110 });
    expect(a.traces["atp:1"]).toMatchObject({ explanationKey: "mps.atp", result: a.atp[0] });
  });
});

describe("forecast changes", () => {
  it("allows changes outside the demand time fence and logs them", () => {
    let game = runPlanningVersion(started(), scenario, T);
    game = updateForecast(game, scenario, "A", 5, 150, T, "Promotion planned");
    expect(game.forecast.find((f) => f.itemId === "A" && f.period === 5)?.quantity).toBe(150);
    expect(game.decisions.at(-1)).toMatchObject({ category: "FORECAST_CHANGE", previousValue: 120, newValue: 150 });
    expect(game.gameStatus).toBe("PLANNING_DIRTY");
    game = runPlanningVersion(game, scenario, T);
    const a = latestVersion(game)!.mpsResult.records.find((r) => r.itemId === "A")!;
    expect(a.grossRequirements[4]).toBe(150);
  });

  it("refuses changes inside the time fence or when the scenario does not allow them", () => {
    const game = started();
    expect(() => updateForecast(game, scenario, "A", 2, 10, T)).toThrow(/forecast.insideFence/);
    const locked: Scenario = { ...scenario, settings: { ...scenario.settings, forecastEditable: false } };
    expect(() => updateForecast(game, locked, "A", 5, 10, T)).toThrow(/forecast.notEditable/);
  });
});

describe("partial production", () => {
  it("starts the part that has material when the scenario allows it", () => {
    const order = {
      id: "PRD-9",
      kind: "PRODUCTION" as const,
      itemId: "C2",
      quantity: 100,
      releasePeriod: 1,
      duePeriod: 2,
      status: "RELEASED" as const,
    };
    const stock = [
      { itemId: "RM2", warehouseId: "WH", quantityOnHand: 60, allocatedQuantity: 0 },
      { itemId: "C3", warehouseId: "WH", quantityOnHand: 500, allocatedQuantity: 0 },
    ];
    const strict = startReleasedOrders([order], stock, 1, scenario.bom, false);
    expect(strict.ids).toEqual([]);
    const partial = startReleasedOrders([order], stock, 1, scenario.bom, true);
    expect(partial.orders).toEqual([
      expect.objectContaining({ id: "PRD-9", quantity: 60, status: "IN_PROGRESS" }),
      expect.objectContaining({ id: "PRD-9-R1", quantity: 40, status: "RELEASED", releasePeriod: 2, duePeriod: 3 }),
    ]);
    expect(partial.inventory.find((b) => b.itemId === "RM2")?.quantityOnHand).toBe(0);
    expect(partial.failures[0].description).toContain("started with 60 of 100");
  });
});

describe("score and summary", () => {
  it("is transparent and zero before any week is simulated", () => {
    const score = calculateScore(started());
    expect(score.total).toBe(0);
    expect(score.maxTotal).toBe(100);
    expect(score.components.map((c) => c.key)).toEqual(["delivery", "financial", "planAdherence"]);
  });

  it("scores realised weeks from service level, result and plan adherence", () => {
    const game = playWeek(runPlanningVersion(started(), scenario, T));
    const totals = realisedTotals(game);
    const score = calculateScore(game, DEFAULT_SCORING);
    const [delivery, financial, adherence] = score.components;
    expect(delivery.points).toBeCloseTo(40 * totals.serviceLevel);
    expect(financial.ratio).toBeCloseTo(Math.min(1, totals.netContribution / 45000));
    expect(adherence.ratio).toBe(1);
    expect(score.total).toBeCloseTo(delivery.points + financial.points + adherence.points);

    const summary = summarizeGame(game, scenario.settings.scoring);
    expect(summary).toMatchObject({ teamName: "Team", finalPeriod: 2, weeksSimulated: 1, completed: false });
    expect(summary.versionsPerPeriod[1]).toBe(3);
    expect(summary.events.map((e) => e.eventId)).toEqual(["WELCOME", "CUSTOMER-ALPHA-INCREASE"]);
  });
});
