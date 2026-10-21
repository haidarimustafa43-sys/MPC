import { describe, expect, it } from "vitest";
import type { GameState } from "../../domain/gameState";
import { teamComparisonCsv } from "../../importExport/csv";
import { loadScenario } from "../../scenarios";
import { FIXED_TIME, takeInMessages } from "../../tests/fixtures";
import {
  commitPlan,
  createGameState,
  latestVersion,
  runPlanningVersion,
  setCapacityAdjustment,
  startPeriod,
  updatePlanningParameters,
} from "../game/gameActions";
import { respondToMessage } from "../game/inboxActions";
import { releaseAllDueOrders } from "../game/orderActions";
import { discardWhatIf, startWhatIf } from "../game/whatIf";
import { reviewPeriod, simulatePeriod, startNextPeriod } from "../game/weekFlow";
import { summarizeGame } from "./gameSummary";
import { analyzeTeam } from "./teamAnalysis";

const scenario = loadScenario("standard");
const T = FIXED_TIME;

/** Three weeks: a reasoned parameter change, a what-if with a conclusion, and no reaction to the RM2 delay. */
const playThreeWeeks = (): GameState => {
  let g = takeInMessages(
    startPeriod(createGameState(scenario, { gameId: "a", teamName: "Team A", randomSeed: 1, now: T }), scenario, T),
  );
  for (let week = 1; week <= 3; week++) {
    if (week === 1) g = updatePlanningParameters(g, "RM4", { safetyStock: 80 }, T, "Orders arrive inside the lead time");
    if (week === 2) {
      const request = g.inboxMessages.find((m) => m.decisionRequired && m.status !== "RESPONDED")!;
      g = runPlanningVersion(g, scenario, T);
      const branch = runPlanningVersion(respondToMessage(startWhatIf(g, T), scenario, request.id, "accept", T), scenario, T);
      g = discardWhatIf(g, branch, T, "Accepting overloads WC300 in period 3");
      g = respondToMessage(g, scenario, request.id, "reject", T);
    }
    g = runPlanningVersion(g, scenario, T);
    g = releaseAllDueOrders(g, scenario, T);
    g = runPlanningVersion(g, scenario, T);
    g = simulatePeriod(commitPlan(g, latestVersion(g)!.id, T), scenario, T);
    if (week < 3) g = takeInMessages(startNextPeriod(reviewPeriod(g, T), scenario, T));
  }
  return g;
};

describe("capacity decisions", () => {
  it("logs overtime and external capacity separately when both change at once", () => {
    const g = takeInMessages(
      startPeriod(createGameState(scenario, { gameId: "c", teamName: "C", randomSeed: 1, now: T }), scenario, T),
    );
    const changed = setCapacityAdjustment(g, "WC200", 5, { overtimeHours: 8, externalHours: 1 }, T);
    expect(changed.decisions.slice(-2).map((d) => [d.category, d.previousValue, d.newValue])).toEqual([
      ["OVERTIME", 0, 8],
      ["EXTERNAL_CAPACITY", 0, 1],
    ]);
    const unchangedExternal = setCapacityAdjustment(changed, "WC200", 5, { overtimeHours: 6, externalHours: 1 }, T);
    expect(unchangedExternal.decisions.length).toBe(changed.decisions.length + 1);
  });
});

describe("team analysis", () => {
  const game = playThreeWeeks();
  const analysis = analyzeTeam(game);

  it("follows the game week by week with a cumulative result", () => {
    expect(analysis.weekly.map((w) => w.period)).toEqual([1, 2, 3]);
    const sum = game.kpiHistory.reduce((total, entry) => total + entry.kpis.netContribution, 0);
    expect(analysis.weekly.at(-1)!.cumulativeNet).toBeCloseTo(sum);
  });

  it("splits the costs and the failures", () => {
    const failures = game.completedPeriods.flatMap((r) => r.failures);
    expect(analysis.failures.list).toHaveLength(failures.length);
    expect(analysis.failures.known + analysis.failures.unplanned).toBe(failures.length);
    expect(analysis.costs.materialCost).toBeGreaterThan(0);
  });

  it("describes the working method, including what-if conclusions", () => {
    expect(analysis.process.whatIfCount).toBe(1);
    expect(analysis.process.whatIfConclusions).toEqual([{ period: 2, text: "Accepting overloads WC300 in period 3" }]);
    expect(analysis.process.parameterChanges).toBe(1);
    expect(analysis.process.reasonShare).toBeGreaterThan(0);
    expect(analysis.process.planningRuns).toBe(game.planningVersions.length);
  });

  it("lists the decisions made in the week of each event", () => {
    const delay = analysis.eventReactions.find((r) => r.eventId === "SUPPLIER-RM2-DELAY")!;
    expect(delay.period).toBe(3);
    expect(delay.decisions).toEqual({});
    expect(delay.releases).toBeGreaterThan(0);
    const request = analysis.eventReactions.find((r) => r.eventId === "CUSTOMER-ALPHA-INCREASE")!;
    expect(request.decisions).toMatchObject({ DISCARD_WHAT_IF: 1, MESSAGE_RESPONSE: 1 });
  });

  it("exports one CSV row per team", () => {
    const csv = teamComparisonCsv([{ summary: summarizeGame(game, scenario.settings.scoring), analysis }]);
    const [header, row] = csv.split("\r\n");
    expect(header.split(",")).toContain("failuresKnownInPlan");
    expect(row.startsWith("Team A,standard v")).toBe(true);
    expect(row).toContain("w2: Accepting overloads WC300 in period 3");
  });
});
