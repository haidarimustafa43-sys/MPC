import { describe, expect, it } from "vitest";
import type { Scenario } from "../../domain/scenario";
import { loadScenario } from "../../scenarios";
import { FIXED_TIME } from "../../tests/fixtures";
import { createGameState } from "../game/gameActions";
import { intakeOrdersFor, receiveCustomerOrders } from "./orderIntake";

const scenario = loadScenario("standard");
const newGame = (seed = 1) => createGameState(scenario, { gameId: "g", teamName: "T", randomSeed: seed, now: FIXED_TIME });

describe("weekly customer order intake", () => {
  it("places orders lead periods ahead, around the forecast, without replacing scenario orders", () => {
    const orders = intakeOrdersFor(newGame(), scenario, 1);
    // Week 1 → due in week 4; A already has CO-1005 due in week 4.
    expect(orders.map((o) => [o.itemId, o.duePeriod])).toEqual([["B", 4]]);
    const forecastB4 = scenario.forecasts.find((f) => f.itemId === "B" && f.period === 4)!.quantity;
    expect(orders[0].quantity).toBeGreaterThanOrEqual(forecastB4 * 0.8 - 5);
    expect(orders[0].quantity).toBeLessThanOrEqual(forecastB4 * 1.2 + 5);
    expect(orders[0].quantity % 5).toBe(0);
    expect(orders[0]).toMatchObject({ status: "ACCEPTED", sellingPricePerUnit: 390 });
  });

  it("is reproducible in fixed mode and stops at the end of the game", () => {
    expect(intakeOrdersFor(newGame(1), scenario, 2)).toEqual(intakeOrdersFor(newGame(99), scenario, 2));
    expect(intakeOrdersFor(newGame(), scenario, scenario.settings.gameLengthPeriods - 2)).toEqual([]);
  });

  it("follows the scenario forecast, not the student's edited one", () => {
    const game = { ...newGame(), forecast: newGame().forecast.map((f) => ({ ...f, quantity: 0 })) };
    expect(intakeOrdersFor(game, scenario, 2).length).toBeGreaterThan(0);
  });

  it("adds the orders and an information message", () => {
    const game = receiveCustomerOrders(newGame(), scenario, 1);
    expect(game.customerOrders.at(-1)?.id).toBe("CO-1-B");
    expect(game.inboxMessages.at(-1)).toMatchObject({ id: "MSG-ORDER-INTAKE-1", severity: "INFO", acknowledgementRequired: false });
  });

  it("does nothing for a scenario without order intake", () => {
    const plain: Scenario = { ...scenario, settings: { ...scenario.settings, orderIntake: undefined } };
    expect(intakeOrdersFor(newGame(), plain, 1)).toEqual([]);
  });
});
