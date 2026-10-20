import type { CustomerOrder } from "../../domain/demand";
import type { GameState, InboxMessage } from "../../domain/gameState";
import type { Scenario } from "../../domain/scenario";
import { eventRoll } from "./eventRandom";

/*
 * Customer orders arrive week by week instead of all being known at the
 * start. Each week, for every end item, one order is placed for the period
 * `leadPeriods` ahead, sized around the forecast. This makes the forecast
 * matter: a plan that ignores it cannot cover orders whose cumulative lead
 * time is longer than the order notice.
 */

const roundTo5 = (value: number): number => Math.max(0, Math.round(value / 5) * 5);

export const intakeOrdersFor = (
  game: GameState,
  scenario: Scenario,
  period: number,
  entropy = 0,
): CustomerOrder[] => {
  const intake = scenario.settings.orderIntake;
  if (!intake) return [];
  const duePeriod = period + intake.leadPeriods;
  if (duePeriod > scenario.settings.gameLengthPeriods) return [];
  const roll = eventRoll(scenario.settings.eventMode, scenario.id, game.randomSeed, entropy);
  const endItems = scenario.items.filter((item) => item.active && item.type === "END_ITEM");
  return endItems.flatMap((item, index) => {
    const alreadyOrdered = game.customerOrders.some(
      (order) => order.itemId === item.id && order.duePeriod === duePeriod,
    );
    // The scenario's own orders take precedence; intake only fills the weeks without one.
    if (alreadyOrdered) return [];
    // Forecast as given by the scenario, not as edited by the student: demand does not follow the plan.
    const forecast = scenario.forecasts
      .filter((entry) => entry.itemId === item.id && entry.period === duePeriod)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    const factor = 1 - intake.variation + 2 * intake.variation * roll(`ORDER-INTAKE-${item.id}`, period);
    const quantity = roundTo5(forecast * factor);
    if (quantity <= 0) return [];
    return [
      {
        id: `CO-${period}-${item.id}`,
        customerName: intake.customers.at((period + index) % intake.customers.length) ?? "Customer",
        itemId: item.id,
        quantity,
        duePeriod,
        sellingPricePerUnit: item.sellingPrice ?? item.standardCost,
        status: "ACCEPTED",
        acceptedAtPeriod: period,
      },
    ];
  });
};

const intakeMessage = (orders: readonly CustomerOrder[], period: number): InboxMessage => {
  const lines = orders.map((o) => `${o.customerName}: ${o.quantity} × ${o.itemId}`);
  const due = orders[0].duePeriod;
  return {
    id: `MSG-ORDER-INTAKE-${period}`,
    period,
    sender: "Sales",
    messageType: "INFORMATION",
    severity: "INFO",
    title: { en: `New customer orders for week ${due}`, sv: `Nya kundorder till vecka ${due}` },
    body: {
      en: `The following orders were received, due in week ${due}: ${lines.join("; ")}.`,
      sv: `Följande order har kommit in med leverans vecka ${due}: ${lines.join("; ")}.`,
    },
    status: "UNREAD",
    acknowledgementRequired: false,
    decisionRequired: false,
    relatedEntityIds: orders.map((o) => o.id),
  };
};

/** Adds this week's incoming customer orders and an inbox message listing them. */
export const receiveCustomerOrders = (
  game: GameState,
  scenario: Scenario,
  period: number,
  entropy = 0,
): GameState => {
  const orders = intakeOrdersFor(game, scenario, period, entropy);
  if (orders.length === 0) return game;
  return {
    ...game,
    customerOrders: [...game.customerOrders, ...orders],
    inboxMessages: [...game.inboxMessages, intakeMessage(orders, period)],
  };
};
