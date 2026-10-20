import { describe, expect, it } from "vitest";
import type { EventDefinition } from "../../domain/event";
import type { GameState } from "../../domain/gameState";
import type { Scenario } from "../../domain/scenario";
import { loadScenario } from "../../scenarios";
import { FIXED_TIME } from "../../tests/fixtures";
import { createGameState } from "../game/gameActions";
import { applyEffect, fireEvent } from "./applyEventEffects";
import { eventRoll } from "./eventRandom";
import { evaluateEventTriggers, triggerMatches } from "./evaluateEventTriggers";
import { processEvents } from "./processEvents";

const base = loadScenario("standard");
const newGame = (seed = 1): GameState =>
  createGameState(base, { gameId: "g", teamName: "T", randomSeed: seed, now: FIXED_TIME });

const event = (overrides: Partial<EventDefinition> & Pick<EventDefinition, "id">): EventDefinition => ({
  name: overrides.id,
  category: "INTERNAL",
  trigger: { type: "PERIOD_START", period: 1 },
  probability: 1,
  message: {
    sender: "Warehouse",
    severity: "INFO",
    messageType: "INFORMATION",
    title: { en: "t" },
    body: { en: "b" },
  },
  effects: [],
  acknowledgementRequired: false,
  decisionRequired: false,
  ...overrides,
});

const always = () => 0;
const ctx = (game: GameState, period = 1, phase: "PERIOD_START" | "PERIOD_END" = "PERIOD_START") => ({
  phase,
  period,
  game,
  roll: always,
});

describe("event triggers", () => {
  it("matches time-based triggers", () => {
    const game = newGame();
    expect(triggerMatches({ type: "PERIOD_START", period: 3 }, ctx(game, 3))).toBe(true);
    expect(triggerMatches({ type: "PERIOD_START", period: 3 }, ctx(game, 2))).toBe(false);
    expect(triggerMatches({ type: "PERIOD_END", period: 3 }, ctx(game, 3, "PERIOD_END"))).toBe(true);
    expect(triggerMatches({ type: "PERIOD_END", period: 3 }, ctx(game, 3))).toBe(false);
    expect(triggerMatches({ type: "PERIOD_RANGE", fromPeriod: 2, toPeriod: 4 }, ctx(game, 4))).toBe(true);
  });

  it("matches state-based triggers", () => {
    const game = newGame();
    expect(triggerMatches({ type: "INVENTORY_BELOW", itemId: "RM2", threshold: 200 }, ctx(game))).toBe(true);
    expect(triggerMatches({ type: "INVENTORY_BELOW", itemId: "RM2", threshold: 100 }, ctx(game))).toBe(false);
    const decided: GameState = {
      ...game,
      decisions: [
        { id: "D1", period: 1, iteration: 1, timestamp: FIXED_TIME, category: "OVERTIME", entityType: "WORK_CENTER", entityId: "WC200@3" },
      ],
    };
    expect(triggerMatches({ type: "DECISION_TAKEN", category: "OVERTIME" }, ctx(decided))).toBe(true);
    expect(triggerMatches({ type: "DECISION_TAKEN", category: "OVERTIME", entityId: "WC100@3" }, ctx(decided))).toBe(false);
    // No simulated week yet: service level triggers stay quiet.
    expect(triggerMatches({ type: "SERVICE_LEVEL_BELOW", threshold: 0.9 }, ctx(game))).toBe(false);
  });

  it("fires each event once and respects prerequisites", () => {
    const first = event({ id: "FIRST" });
    const second = event({ id: "SECOND", prerequisites: ["FIRST"] });
    const game = newGame();
    expect(evaluateEventTriggers([first, second], ctx(game)).map((e) => e.id)).toEqual(["FIRST"]);
    const fired = fireEvent(game, first, 1);
    expect(evaluateEventTriggers([first, second], ctx(fired)).map((e) => e.id)).toEqual(["SECOND"]);
  });

  it("uses a seeded roll so random events are reproducible", () => {
    const seeded = eventRoll("seeded", "s", 42, 0);
    const same = eventRoll("seeded", "s", 42, 0);
    const other = eventRoll("seeded", "s", 43, 0);
    expect(seeded("E", 3)).toBe(same("E", 3));
    expect(seeded("E", 3)).not.toBe(other("E", 3));
    // In fixed mode every team gets the same roll, whatever its seed.
    expect(eventRoll("fixed", "s", 1, 0)("E", 3)).toBe(eventRoll("fixed", "s", 2, 0)("E", 3));
    // Random mode depends on fresh entropy.
    expect(eventRoll("random", "s", 1, 0.1)("E", 3)).not.toBe(eventRoll("random", "s", 1, 0.2)("E", 3));
  });

  it("applies probability through the roll", () => {
    const maybe = event({ id: "MAYBE", trigger: { type: "RANDOM", fromPeriod: 1, toPeriod: 5 }, probability: 0.5 });
    const game = newGame();
    expect(evaluateEventTriggers([maybe], { ...ctx(game), roll: () => 0.4 })).toHaveLength(1);
    expect(evaluateEventTriggers([maybe], { ...ctx(game), roll: () => 0.6 })).toHaveLength(0);
  });
});

describe("event effects", () => {
  it("delays a purchase order", () => {
    const game = applyEffect(newGame(), { type: "DELAY_PURCHASE_ORDER", purchaseOrderId: "PUR-RM2-002", periods: 2 }, 3, "E");
    expect(game.releasedOrders.find((o) => o.id === "PUR-RM2-002")).toMatchObject({ duePeriod: 6, originalDuePeriod: 4 });
  });

  it("changes capacity for a period range", () => {
    const game = applyEffect(
      newGame(),
      { type: "CHANGE_CAPACITY", workCenterId: "WC200", factor: 0.6, fromPeriod: 4, toPeriod: 5 },
      4,
      "E",
    );
    expect(game.workCenterCapacity.map((e) => [e.period, e.capacityFactor])).toEqual([
      [4, 0.6],
      [5, 0.6],
    ]);
    expect(game.activeEventEffects).toHaveLength(1);
  });

  it("adds and changes customer orders", () => {
    let game = applyEffect(
      newGame(),
      {
        type: "ADD_CUSTOMER_ORDER",
        orderId: "CO-NEW",
        customerName: "Customer Beta",
        itemId: "B",
        quantity: 30,
        duePeriod: 5,
        sellingPricePerUnit: 400,
        status: "PROPOSED",
      },
      2,
      "E",
    );
    expect(game.customerOrders.find((o) => o.id === "CO-NEW")?.status).toBe("PROPOSED");
    game = applyEffect(game, { type: "CHANGE_CUSTOMER_ORDER_QUANTITY", orderId: "CO-1005", quantity: 190 }, 2, "E");
    expect(game.customerOrders.find((o) => o.id === "CO-1005")?.quantity).toBe(190);
  });

  it("makes a supplier unavailable and available again later", () => {
    const scenario: Scenario = {
      ...base,
      events: [
        event({
          id: "NORTH-DOWN",
          trigger: { type: "PERIOD_START", period: 2 },
          effects: [{ type: "SUPPLIER_UNAVAILABLE", supplierId: "SUP-NORTH", fromPeriod: 2, toPeriod: 3 }],
        }),
      ],
    };
    let game = processEvents(newGame(), scenario, "PERIOD_START", 2);
    expect(game.suppliers.find((s) => s.id === "SUP-NORTH")?.active).toBe(false);
    game = processEvents(game, scenario, "PERIOD_START", 3);
    expect(game.suppliers.find((s) => s.id === "SUP-NORTH")?.active).toBe(false);
    game = processEvents(game, scenario, "PERIOD_START", 4);
    expect(game.suppliers.find((s) => s.id === "SUP-NORTH")?.active).toBe(true);
  });

  it("scraps inventory without going negative", () => {
    const game = applyEffect(newGame(), { type: "SCRAP_INVENTORY", itemId: "RM4", quantity: 1000 }, 1, "E");
    expect(game.inventory.find((b) => b.itemId === "RM4")?.quantityOnHand).toBe(0);
  });

  it("schedules delayed effects and follow-up events", () => {
    const scenario: Scenario = {
      ...base,
      events: [
        event({
          id: "START",
          trigger: { type: "PERIOD_START", period: 1 },
          delayedEffects: [{ afterPeriods: 2, effects: [{ type: "SCRAP_INVENTORY", itemId: "RM4", quantity: 20 }] }],
          followUpEventIds: ["FOLLOW"],
        }),
        event({ id: "FOLLOW", trigger: { type: "PERIOD_START", period: 99 } }),
      ],
    };
    let game = processEvents(newGame(), scenario, "PERIOD_START", 1);
    expect(game.eventHistory.map((e) => e.eventId)).toEqual(["START"]);
    game = processEvents(game, scenario, "PERIOD_START", 2);
    expect(game.eventHistory.map((e) => e.eventId)).toEqual(["START", "FOLLOW"]);
    expect(game.inventory.find((b) => b.itemId === "RM4")?.quantityOnHand).toBe(120);
    game = processEvents(game, scenario, "PERIOD_START", 3);
    expect(game.inventory.find((b) => b.itemId === "RM4")?.quantityOnHand).toBe(100);
  });

  it("sends a message with the related objects to the inbox", () => {
    const game = processEvents(newGame(), base, "PERIOD_START", 3);
    expect(game.inboxMessages).toEqual([
      expect.objectContaining({
        id: "MSG-SUPPLIER-RM2-DELAY-3",
        sender: "Supplier North",
        severity: "CRITICAL",
        status: "UNREAD",
        relatedEntityIds: ["PUR-RM2-002"],
      }),
    ]);
  });
});
