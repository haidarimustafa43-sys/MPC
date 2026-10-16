import { describe, expect, it } from "vitest";
import type { GameState } from "../../domain/gameState";
import { loadScenario } from "../../scenarios";
import { FIXED_TIME } from "../../tests/fixtures";
import { compareVersions } from "../planning/compareVersions";
import {
  buildPlanningInput,
  commitPlan,
  createGameState,
  latestVersion,
  resetWorkingPlan,
  runPlanningVersion,
  setCapacityAdjustment,
  startPeriod,
  updatePlanningParameters,
} from "./gameActions";

const scenario = loadScenario("standard");
const startedGame = (): GameState =>
  startPeriod(
    createGameState(scenario, { gameId: "g1", teamName: "Team 1", randomSeed: 7, now: FIXED_TIME }),
    FIXED_TIME,
  );

/** Simulates the RM2 supplier delay by hand; the event engine arrives in phase 3. */
const delayPurchaseOrder = (game: GameState, orderId: string, periods: number): GameState => ({
  ...game,
  releasedOrders: game.releasedOrders.map((order) =>
    order.id === orderId ? { ...order, duePeriod: order.duePeriod + periods } : order,
  ),
});

describe("planning flow on the standard scenario", () => {
  it("week 1: finds the minor capacity problem and lets the student replan it", () => {
    let game = runPlanningVersion(startedGame(), scenario, FIXED_TIME);
    const v1 = latestVersion(game);
    expect(v1?.id).toBe("PV-1-1");
    const overload = v1?.violations.find((v) => v.type === "WORK_CENTER_OVERLOAD");
    expect(overload).toMatchObject({ workCenterId: "WC200", period: 3 });

    game = setCapacityAdjustment(game, "WC200", 3, { overtimeHours: 2 }, FIXED_TIME, "Cover the peak");
    expect(game.decisions.at(-1)).toMatchObject({
      category: "OVERTIME",
      entityId: "WC200@3",
      previousValue: 0,
      newValue: 2,
      reason: "Cover the peak",
    });
    game = runPlanningVersion(game, scenario, FIXED_TIME);
    const v2 = latestVersion(game);
    expect(v2?.id).toBe("PV-1-2");
    expect(v2?.decisionIds).toEqual([game.decisions.at(-1)?.id]);
    expect(v2?.violations.some((v) => v.type === "WORK_CENTER_OVERLOAD")).toBe(false);

    const deltas = compareVersions(v1!, v2!);
    expect(deltas.find((d) => d.kpi === "overloadHours")).toMatchObject({ before: 1, after: 0, change: "BETTER" });
    expect(deltas.find((d) => d.kpi === "overtimeCost")).toMatchObject({ after: 1000, change: "WORSE" });

    // Versions are immutable snapshots: V1 still shows the original situation.
    expect(game.planningVersions[0].inputSnapshot.workCenterCapacity).toEqual([]);

    game = commitPlan(game, "PV-1-2", FIXED_TIME);
    expect(game.gameStatus).toBe("PLAN_COMMITTED");
  });

  it("a supplier delay creates a material shortage that a faster supplier can solve", () => {
    // Situation of week 3 without simulation: delivery PUR-RM2-002 moves from period 4 to 6
    // and RM2 stock is low.
    let game: GameState = {
      ...startedGame(),
      inventory: startedGame().inventory.map((b) => (b.itemId === "RM2" ? { ...b, quantityOnHand: 0 } : b)),
      releasedOrders: startedGame().releasedOrders.filter((o) => o.id !== "PUR-RM2-001"),
    };
    game = delayPurchaseOrder(game, "PUR-RM2-002", 2);
    game = runPlanningVersion(game, scenario, FIXED_TIME);
    const before = latestVersion(game)!;
    const shortage = before.violations.find((v) => v.type === "MISSING_MATERIAL" && v.itemId === "RM2");
    expect(shortage).toBeDefined();
    const rm2Before = before.mrpResult.records.find((r) => r.itemId === "RM2")!;
    expect(rm2Before.leadTimePeriods).toBe(2);
    expect(rm2Before.scheduledReceipts[5]).toBe(200); // period 6

    game = updatePlanningParameters(game, "RM2", { supplierId: "SUP-CENTRAL" }, FIXED_TIME, "Shorter lead time");
    expect(game.decisions.at(-1)).toMatchObject({ category: "SUPPLIER_SELECTION", newValue: "SUP-CENTRAL" });
    game = runPlanningVersion(game, scenario, FIXED_TIME);
    const after = latestVersion(game)!;
    const rm2After = after.mrpResult.records.find((r) => r.itemId === "RM2")!;
    expect(rm2After.leadTimePeriods).toBe(1);
    expect(rm2After.plannedOrders.every((o) => o.supplierId === "SUP-CENTRAL")).toBe(true);
    const shortageAfter = -Math.min(0, ...rm2After.projectedAvailable);
    const shortageBefore = -Math.min(0, ...rm2Before.projectedAvailable);
    expect(shortageAfter).toBeLessThan(shortageBefore);
    // The faster supplier is more expensive: the trade-off is visible in the KPIs.
    expect(after.projectedKpis.materialCost).toBeGreaterThan(0);
  });

  it("can reset the working plan to the latest calculated version", () => {
    let game = runPlanningVersion(startedGame(), scenario, FIXED_TIME);
    game = updatePlanningParameters(game, "A", { safetyStock: 80 }, FIXED_TIME);
    expect(game.planningParameters.A.safetyStock).toBe(80);
    game = resetWorkingPlan(game, FIXED_TIME);
    expect(game.planningParameters.A.safetyStock).toBe(20);
    expect(game.decisions.at(-1)?.category).toBe("RESET_WORKING_PLAN");
  });

  it("is deterministic", () => {
    const input = buildPlanningInput(scenario, startedGame());
    const a = runPlanningVersion(startedGame(), scenario, FIXED_TIME);
    const b = runPlanningVersion(startedGame(), scenario, FIXED_TIME);
    expect(a.planningVersions).toEqual(b.planningVersions);
    expect(input.periods).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("logs one decision per changed field and ignores unchanged values", () => {
    let game = runPlanningVersion(startedGame(), scenario, FIXED_TIME);
    const unchanged = updatePlanningParameters(game, "A", { safetyStock: 20 }, FIXED_TIME);
    expect(unchanged).toBe(game);
    game = updatePlanningParameters(
      game,
      "C1",
      { safetyStock: 10, lotSizingPolicy: { method: "FOQ", quantity: 200 } },
      FIXED_TIME,
    );
    expect(game.decisions.map((d) => d.field)).toEqual(["safetyStock", "lotSizingPolicy"]);
    expect(game.pendingDecisionIds).toHaveLength(2);
  });
});
