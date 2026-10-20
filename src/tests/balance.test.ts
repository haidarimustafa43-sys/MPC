import { describe, expect, it } from "vitest";
import type { GameState } from "../domain/gameState";
import {
  commitPlan,
  createGameState,
  latestVersion,
  runPlanningVersion,
  setCapacityAdjustment,
  startPeriod,
  updateForecast,
  updatePlanningParameters,
} from "../engine/game/gameActions";
import { respondToMessage } from "../engine/game/inboxActions";
import { releaseAllDueOrders } from "../engine/game/orderActions";
import { reviewPeriod, simulatePeriod, startNextPeriod } from "../engine/game/weekFlow";
import { calculateScore, realisedTotals } from "../engine/scoring/calculateScore";
import { loadScenario } from "../scenarios";
import { FIXED_TIME, takeInMessages } from "./fixtures";

/*
 * Game balance of the standard scenario: good planning must pay off, and
 * shortcuts (doing nothing, ignoring the forecast) must not. If a scenario or
 * engine change breaks this, the game would teach the wrong lesson.
 */

const scenario = loadScenario("standard");
const T = FIXED_TIME;
type Step = (g: GameState) => GameState;

const coverOverloads: Step = (game) => {
  let g = runPlanningVersion(game, scenario, T);
  for (const b of latestVersion(g)!.crpResult.buckets) {
    if (b.period > g.currentPeriod + 1 || b.balanceHours >= 0) continue;
    const wc = scenario.workCenters.find((w) => w.id === b.workCenterId)!;
    const need = Math.ceil(-b.balanceHours);
    const overtime = Math.min(need, (wc.overtimeCapacityLimitHours ?? 0) - b.overtimeHours);
    if (overtime > 0) g = setCapacityAdjustment(g, wc.id, b.period, { overtimeHours: b.overtimeHours + overtime }, T);
    const rest = need - Math.max(0, overtime);
    if (rest > 0) g = setCapacityAdjustment(g, wc.id, b.period, { externalHours: Math.min(15, b.externalHours + rest) }, T);
  }
  return g;
};

const play = (adjust: Step = (g) => g, release = true) => {
  let g = takeInMessages(
    startPeriod(createGameState(scenario, { gameId: "b", teamName: "B", randomSeed: 1, now: T }), scenario, T),
  );
  for (let week = 1; week <= scenario.settings.gameLengthPeriods; week++) {
    const request = g.inboxMessages.find((m) => m.decisionRequired && m.status !== "RESPONDED");
    if (request) g = respondToMessage(g, scenario, request.id, "accept", T);
    g = runPlanningVersion(adjust(g), scenario, T);
    if (release) g = releaseAllDueOrders(g, scenario, T);
    g = runPlanningVersion(g, scenario, T);
    g = simulatePeriod(commitPlan(g, latestVersion(g)!.id, T), scenario, T);
    if (week < scenario.settings.gameLengthPeriods) g = takeInMessages(startNextPeriod(reviewPeriod(g, T), scenario, T));
  }
  return { score: calculateScore(g, scenario.settings.scoring).total, totals: realisedTotals(g) };
};

const atWeek = (week: number, step: Step): Step => (g) => (g.currentPeriod === week ? step(g) : g);
const setRm2Supplier = (supplierId: string): Step => (g) => updatePlanningParameters(g, "RM2", { supplierId }, T);

describe("game balance of the standard scenario", () => {
  const best = play((g) =>
    coverOverloads(
      atWeek(5, setRm2Supplier("SUP-NORTH"))(
        atWeek(3, setRm2Supplier("SUP-CENTRAL"))(
          atWeek(1, (s) => updatePlanningParameters(s, "RM4", { safetyStock: 80 }, T))(g),
        ),
      ),
    ),
  );
  const passive = play();

  it("rewards reacting to the events", () => {
    expect(best.totals.serviceLevel).toBe(1);
    expect(best.score).toBeGreaterThan(90);
    expect(best.score).toBeLessThan(100);
    expect(passive.totals.serviceLevel).toBeLessThan(0.8);
    expect(best.score - passive.score).toBeGreaterThan(25);
  });

  it("does not reward ignoring the forecast or never releasing orders", () => {
    const zeroForecast = play((g) => {
      let next = g;
      for (const f of next.forecast.filter((e) => e.period >= next.currentPeriod + 2 && e.quantity > 0)) {
        next = updateForecast(next, scenario, f.itemId, f.period, 0, T);
      }
      return next;
    });
    expect(zeroForecast.score).toBeLessThan(best.score - 25);
    expect(play(undefined, false).score).toBeLessThan(20);
  });
});
