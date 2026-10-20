import { describe, expect, it } from "vitest";
import type { GameState } from "../../domain/gameState";
import { loadScenario } from "../../scenarios";
import { migrateGameState } from "../../storage/migrations";
import { FIXED_TIME, takeInMessages } from "../../tests/fixtures";
import { compareVersions } from "../planning/compareVersions";
import { GameActionError } from "./errors";
import {
  commitPlan,
  createGameState,
  latestVersion,
  runPlanningVersion,
  startPeriod,
  updatePlanningParameters,
} from "./gameActions";
import { acknowledgeMessage, markMessageRead, respondToMessage } from "./inboxActions";
import {
  cancelFirmPlannedOrder,
  currentPlannedOrders,
  decideCustomerOrder,
  expeditePurchaseOrder,
  firmPlannedOrder,
  plannedOrdersDueForRelease,
  releaseAllDueOrders,
  releasePlannedOrder,
} from "./orderActions";
import { canPerform } from "./stateMachine";
import { reviewPeriod, simulatePeriod, startNextPeriod } from "./weekFlow";

const scenario = loadScenario("standard");
const T = FIXED_TIME;
const newGame = () => createGameState(scenario, { gameId: "g", teamName: "Team", randomSeed: 3, now: T });
const planned = (game: GameState) => runPlanningVersion(takeInMessages(startPeriod(game, scenario, T)), scenario, T);

/** A disciplined planner: run, release what is due, rerun, commit. */
const planAndCommit = (game: GameState): GameState => {
  let next = runPlanningVersion(game, scenario, T);
  next = releaseAllDueOrders(next, scenario, T);
  next = runPlanningVersion(next, scenario, T);
  return commitPlan(next, latestVersion(next)!.id, T);
};
const finishWeek = (game: GameState): GameState =>
  takeInMessages(startNextPeriod(reviewPeriod(simulatePeriod(planAndCommit(game), scenario, T), T), scenario, T));

describe("inbox", () => {
  it("delivers the welcome message at the start and leaves EVENTS_PENDING once it is acknowledged", () => {
    const started = startPeriod(newGame(), scenario, T);
    expect(started.gameStatus).toBe("EVENTS_PENDING");
    const message = started.inboxMessages[0];
    expect(message).toMatchObject({ id: "MSG-WELCOME-1", status: "UNREAD", acknowledgementRequired: true });
    const read = markMessageRead(started, message.id);
    expect(read.gameStatus).toBe("EVENTS_PENDING");
    const acknowledged = acknowledgeMessage(read, message.id);
    expect(acknowledged.gameStatus).toBe("ANALYSIS");
    expect(acknowledged.inboxMessages[0].status).toBe("ACKNOWLEDGED");
  });

  it("lets a customer request stay open for review and applies the chosen answer", () => {
    let game = finishWeek(planned(newGame()));
    expect(game.currentPeriod).toBe(2);
    const request = game.inboxMessages.find((m) => m.id === "MSG-CUSTOMER-ALPHA-INCREASE-2")!;
    expect(request.decisionRequired).toBe(true);
    // Reading is enough to start analysing, but not to simulate.
    expect(game.gameStatus).toBe("ANALYSIS");
    game = respondToMessage(game, scenario, request.id, "review", T);
    expect(game.inboxMessages.find((m) => m.id === request.id)?.status).toBe("READ");
    game = planAndCommit(game);
    expect(canPerform(game, "SIMULATE_PERIOD").reasonKey).toBe("guard.openMessages");

    game = respondToMessage(game, scenario, request.id, "accept", T, "Profitable and capacity is available");
    expect(game.customerOrders.find((o) => o.id === "CO-1005")?.quantity).toBe(190);
    expect(game.decisions.at(-1)).toMatchObject({ category: "MESSAGE_RESPONSE", newValue: "accept" });
    expect(game.gameStatus).toBe("PLANNING_DIRTY");
    expect(() => respondToMessage(game, scenario, request.id, "reject", T)).toThrow(GameActionError);
  });
});

describe("order decisions", () => {
  it("releases a due planned order and books its order cost", () => {
    let game = planned(newGame());
    const due = plannedOrdersDueForRelease(game);
    expect(due.map((o) => o.id)).toEqual(expect.arrayContaining(["PL-RM1-3"]));
    game = releasePlannedOrder(game, scenario, "PL-RM1-3", T);
    const released = game.releasedOrders.at(-1)!;
    expect(released).toMatchObject({ kind: "PURCHASE", itemId: "RM1", releasePeriod: 1, duePeriod: 3, status: "RELEASED" });
    expect(game.financialHistory.at(-1)).toMatchObject({ category: "ORDER_COST", amount: 120 });
    expect(plannedOrdersDueForRelease(game).map((o) => o.id)).not.toContain("PL-RM1-3");
    expect(() => releasePlannedOrder(game, scenario, "PL-RM1-3", T)).toThrow(GameActionError);
  });

  it("refuses to release an order that is not due yet", () => {
    const game = planned(newGame());
    expect(() => releasePlannedOrder(game, scenario, "PL-A-5", T)).toThrow(/orders.notDueYet/);
  });

  it("moves a planned order later as a firm order; MRP does not refill the gap", () => {
    let game = planned(newGame());
    game = firmPlannedOrder(game, scenario, "PL-C1-4", { receiptPeriod: 5 }, T, "Relieve WC200 in period 3");
    const firm = game.plannedOrders[0];
    expect(firm).toMatchObject({ itemId: "C1", receiptPeriod: 5, releasePeriod: 4, firm: true });
    expect(currentPlannedOrders(game).some((o) => o.id === "PL-C1-4")).toBe(false);
    game = runPlanningVersion(game, scenario, T);
    const c1 = latestVersion(game)!.mrpResult.records.find((r) => r.itemId === "C1")!;
    expect(c1.firmPeriods).toEqual([5]);
    expect(c1.plannedOrders.filter((o) => o.receiptPeriod === 4)).toHaveLength(0);
    // C1 is now short in period 4 and the plan says so.
    expect(c1.projectedAvailable[3]).toBeLessThan(0);
    expect(latestVersion(game)!.violations.some((v) => v.type === "MISSING_MATERIAL" && v.itemId === "C1")).toBe(true);

    game = cancelFirmPlannedOrder(game, firm.id, T);
    expect(game.plannedOrders).toHaveLength(0);
  });

  it("does not allow a firm order whose release would be in the past", () => {
    const game = planned(newGame());
    expect(() => firmPlannedOrder(game, scenario, "PL-A-3", { receiptPeriod: 1 }, T)).toThrow(/orders.releaseInPast/);
  });

  it("expedites a purchase order once, at a cost", () => {
    let game = planned(newGame());
    game = expeditePurchaseOrder(game, scenario, "PUR-RM2-002", T);
    expect(game.releasedOrders.find((o) => o.id === "PUR-RM2-002")).toMatchObject({ duePeriod: 3, expedited: true });
    expect(game.financialHistory.at(-1)).toMatchObject({ category: "EXPEDITE_COST", amount: 1200 });
    expect(() => expeditePurchaseOrder(game, scenario, "PUR-RM2-002", T)).toThrow(/alreadyExpedited/);
  });

  it("accepts or rejects proposed customer orders", () => {
    let game = planned(newGame());
    game = {
      ...game,
      customerOrders: [
        ...game.customerOrders,
        { id: "CO-9", customerName: "Customer Beta", itemId: "B", quantity: 10, duePeriod: 5, sellingPricePerUnit: 400, status: "PROPOSED" },
      ],
    };
    game = decideCustomerOrder(game, "CO-9", false, T);
    expect(game.customerOrders.find((o) => o.id === "CO-9")?.status).toBe("REJECTED");
  });
});

describe("week simulation", () => {
  it("simulates week 1: receipts, completions, deliveries, KPIs and a period result", () => {
    const committed = planAndCommit(planned(newGame()));
    const game = simulatePeriod(committed, scenario, T);
    expect(game.gameStatus).toBe("PERIOD_SIMULATED");
    const result = game.completedPeriods[0];
    expect(result.receivedOrderIds).toEqual(["PUR-RM3-001"]);
    expect(result.completedOrderIds).toEqual(expect.arrayContaining(["PRD-A-001", "PRD-B-001", "PRD-C2-001"]));
    expect(result.deliveries.map((d) => d.customerOrderId)).toEqual(["CO-1001", "CO-1002"]);
    expect(result.kpis.serviceLevel).toBe(1);
    expect(result.kpis.revenue).toBe(90 * 320 + 50 * 390);
    expect(result.failures).toEqual([]);
    // 120 + 100 produced − 90 delivered
    expect(game.inventory.find((b) => b.itemId === "A")?.quantityOnHand).toBe(130);
    expect(game.customerOrders.find((o) => o.id === "CO-1001")?.status).toBe("FULFILLED");
    expect(game.kpiHistory).toHaveLength(1);
  });

  it("reports planned orders that were not released", () => {
    const lazy = commitPlan(planned(newGame()), "PV-1-1", T);
    const result = simulatePeriod(lazy, scenario, T).completedPeriods[0];
    expect(result.failures.some((f) => f.kind === "ORDER_NOT_RELEASED" && f.orderId === "PL-RM1-3")).toBe(true);
  });

  it("only moves on after the review and completes the game after the last week", () => {
    const simulated = simulatePeriod(planAndCommit(planned(newGame())), scenario, T);
    expect(() => startNextPeriod(simulated, scenario, T)).toThrow();
    const last = { ...reviewPeriod(simulated, T), currentPeriod: scenario.settings.gameLengthPeriods };
    expect(startNextPeriod(last, scenario, T).gameStatus).toBe("GAME_COMPLETED");
  });
});

describe("integration: supplier delay → shortage → replan → commit → simulate", () => {
  it("plays weeks 1–3 of the standard scenario", () => {
    // 1–2. Start the scenario and play weeks 1 and 2 (accepting Customer Alpha's request).
    let game = finishWeek(planned(newGame()));
    game = respondToMessage(game, scenario, "MSG-CUSTOMER-ALPHA-INCREASE-2", "accept", T);
    game = finishWeek(game);
    expect(game.currentPeriod).toBe(3);

    // 3. Week 3 starts with the RM2 delay: critical message, delivery moved, plan not recalculated.
    const delay = game.inboxMessages.find((m) => m.eventId === "SUPPLIER-RM2-DELAY")!;
    expect(delay).toMatchObject({ severity: "CRITICAL", sender: "Supplier North", period: 3 });
    expect(game.releasedOrders.find((o) => o.id === "PUR-RM2-002")).toMatchObject({ duePeriod: 6, originalDuePeriod: 4 });
    expect(latestVersion(game)).toBeUndefined();

    // 4. The message was acknowledged (takeInMessages) — the week is in analysis.
    expect(game.inboxMessages.find((m) => m.id === delay.id)?.status).toBe("ACKNOWLEDGED");
    expect(game.gameStatus).toBe("ANALYSIS");

    // 5–6. Run planning and discover the material shortage.
    game = runPlanningVersion(game, scenario, T);
    const before = latestVersion(game)!;
    const shortage = before.violations.find((v) => v.type === "MISSING_MATERIAL" && v.itemId === "RM2");
    expect(shortage).toMatchObject({ severity: "CRITICAL", period: 4 });

    // 7. Change supplier for RM2 (one period shorter lead time, higher price).
    game = updatePlanningParameters(game, "RM2", { supplierId: "SUP-CENTRAL" }, T, "Bridge the delay");
    expect(canPerform(game, "COMMIT_PLAN").reasonKey).toBe("guard.planStale");

    // 8. Replan, release what is now due and replan again.
    game = runPlanningVersion(game, scenario, T);
    game = releaseAllDueOrders(game, scenario, T);
    game = runPlanningVersion(game, scenario, T);
    const after = latestVersion(game)!;
    expect(after.violations.some((v) => v.type === "MISSING_MATERIAL" && v.itemId === "RM2")).toBe(false);
    const delta = compareVersions(before, after).find((d) => d.kpi === "shortageUnits")!;
    expect(delta.change).toBe("BETTER");
    const centralOrder = game.releasedOrders.find(
      (o) => o.kind === "PURCHASE" && o.itemId === "RM2" && o.releasePeriod === 3,
    );
    expect(centralOrder).toMatchObject({ supplierId: "SUP-CENTRAL", duePeriod: 4 });

    // 9. Commit.
    game = commitPlan(game, after.id, T);

    // 10. Simulate the week.
    game = simulatePeriod(game, scenario, T);
    const result = game.completedPeriods.at(-1)!;
    expect(result.period).toBe(3);
    expect(result.eventIds).toContain("SUPPLIER-RM2-DELAY");

    // 11. New inventory and order situation.
    expect(game.releasedOrders.find((o) => o.id === "PUR-RM2-002")?.status).toBe("RELEASED");
    expect(game.releasedOrders.find((o) => o.id === centralOrder!.id)?.status).toBe("RELEASED");
    expect(result.endInventory.find((b) => b.itemId === "RM2")!.quantityOnHand).toBeGreaterThanOrEqual(0);
    expect(game.inventory).toEqual(result.endInventory);
    expect(game.decisions.some((d) => d.category === "SUPPLIER_SELECTION")).toBe(true);
    expect(game.planningVersions.filter((v) => v.period === 3)).toHaveLength(3);
  });

  it("week 4: the WC200 breakdown shows as an overload in the plan", () => {
    let game = finishWeek(planned(newGame()));
    game = respondToMessage(game, scenario, "MSG-CUSTOMER-ALPHA-INCREASE-2", "accept", T);
    game = finishWeek(finishWeek(game));
    expect(game.currentPeriod).toBe(4);
    game = runPlanningVersion(game, scenario, T);
    const overload = latestVersion(game)!.violations.find(
      (v) => v.type === "WORK_CENTER_OVERLOAD" && v.workCenterId === "WC200" && v.period === 6,
    );
    expect(overload?.description).toContain("11 hours");
  });
});

describe("save migration", () => {
  it("upgrades a version 1 save", () => {
    const current = planned(newGame());
    const { scheduledEffects: _removed, ...rest } = current;
    const v1 = {
      ...rest,
      saveFileVersion: 1,
      planningVersions: current.planningVersions.map((version) => ({
        ...version,
        inputSnapshot: { ...version.inputSnapshot, firmPlannedOrders: undefined },
      })),
    };
    const migrated = migrateGameState(JSON.parse(JSON.stringify(v1)));
    expect(migrated.saveFileVersion).toBe(2);
    expect(migrated.scheduledEffects).toEqual([]);
    expect(migrated.planningVersions[0].mrpResult.records[0].firmPeriods).toEqual([]);
  });
});
