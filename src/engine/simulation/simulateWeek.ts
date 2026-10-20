import type { ConstraintViolation } from "../../domain/constraint";
import type { FailureCause, GameState, PeriodFailure, PeriodResult } from "../../domain/gameState";
import type { PlanningVersion } from "../../domain/planningVersion";
import type { Scenario } from "../../domain/scenario";
import { capacityAvailability } from "../capacity/capacityAvailability";
import { buildPlanningInput } from "../game/gameActions";
import { plannedOrdersDueForRelease } from "../game/orderActions";
import { onHand } from "../inventory/stock";
import { emptyKpis } from "../scoring/calculateKpis";
import { completeFinishedOrders, performWork, startReleasedOrders } from "./completeProduction";
import { fulfillCustomerOrders } from "./fulfillCustomerOrders";
import { receivePurchaseOrders } from "./receiveOrders";

export interface SimulationOutcome {
  game: GameState;
  result: PeriodResult;
}

/**
 * A failure counts as an unresolved planning problem when the committed plan
 * already warned about it; otherwise it was not visible in the plan.
 */
const causeOf = (failure: Omit<PeriodFailure, "cause">, violations: readonly ConstraintViolation[]): FailureCause => {
  const known = violations.some((v) => {
    switch (failure.kind) {
      case "MATERIAL_SHORTAGE":
        return (v.type === "MISSING_MATERIAL" || v.type === "INVENTORY_BELOW_ZERO") && v.itemId === failure.itemId;
      case "CAPACITY_SHORTAGE":
        return v.type === "WORK_CENTER_OVERLOAD" && v.workCenterId === failure.workCenterId;
      case "LATE_DELIVERY":
        return (
          ((v.type === "CUSTOMER_ORDER_AT_RISK" || v.type === "CUSTOMER_ORDER_LATE") &&
            v.relatedOrderIds?.includes(failure.orderId ?? "")) ||
          (v.type === "INVENTORY_BELOW_ZERO" && v.itemId === failure.itemId)
        );
      case "ORDER_NOT_RELEASED":
        return true;
    }
  });
  return known ? "UNRESOLVED_PLAN_PROBLEM" : "UNPLANNED";
};

const committedVersion = (game: GameState): PlanningVersion | undefined =>
  game.planningVersions.find((v) => v.id === game.committedPlanVersionId);

/**
 * Simulates the real outcome of one week for the committed plan:
 * 1. receive purchase orders that are due,
 * 2. put finished production orders into stock,
 * 3. issue components to released orders (an order without all material waits),
 * 4. perform operations within available capacity (overloaded orders slip),
 * 5. put orders finished this week into stock,
 * 6. deliver customer orders from stock,
 * 7. book costs and revenue and build an immutable period result.
 * Planned orders that were not released do not happen.
 */
export const simulateWeek = (scenario: Scenario, game: GameState): SimulationOutcome => {
  const period = game.currentPeriod;
  const input = buildPlanningInput(scenario, game);
  const version = committedVersion(game);
  const violations = version?.violations ?? [];

  const notReleased = plannedOrdersDueForRelease(game).map(
    (order): Omit<PeriodFailure, "cause"> => ({
      kind: "ORDER_NOT_RELEASED",
      orderId: order.id,
      itemId: order.itemId,
      quantity: order.quantity,
      description: `Planned order ${order.id} (${order.quantity} × ${order.itemId}) was due for release but was not released.`,
    }),
  );

  const receipts = receivePurchaseOrders(game.releasedOrders, game.inventory, period, input.items, game.suppliers);
  const finishedEarlier = completeFinishedOrders(receipts.orders, receipts.inventory, period, scenario.routings, input.items);
  const started = startReleasedOrders(
    finishedEarlier.orders,
    finishedEarlier.inventory,
    period,
    scenario.bom,
    scenario.settings.allowPartialProduction,
  );

  const available = Object.fromEntries(
    scenario.workCenters.map((wc) => [wc.id, capacityAvailability(wc, period, game.workCenterCapacity).availableHours]),
  );
  const work = performWork(started.orders, period, scenario.routings, available);
  const finishedNow = completeFinishedOrders(work.orders, started.inventory, period, scenario.routings, input.items);
  const fulfilment = fulfillCustomerOrders(game.customerOrders, finishedNow.inventory, period);

  const lateFailures = fulfilment.customerOrders
    .filter((order) => order.status === "LATE" && order.duePeriod === period)
    .map(
      (order): Omit<PeriodFailure, "cause"> => ({
        kind: "LATE_DELIVERY",
        orderId: order.id,
        itemId: order.itemId,
        quantity: order.quantity - (order.deliveredQuantity ?? 0),
        description: `${order.customerName} order ${order.id}: ${order.quantity - (order.deliveredQuantity ?? 0)} × ${order.itemId} could not be delivered on time.`,
      }),
    );
  const failures: PeriodFailure[] = [...notReleased, ...started.failures, ...work.failures, ...lateFailures].map(
    (failure) => ({ ...failure, cause: causeOf(failure, violations) }),
  );

  const inventory = fulfilment.inventory;
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const holdingCost = inventory.reduce(
    (sum, b) => sum + b.quantityOnHand * (itemById.get(b.itemId)?.holdingCostPerUnitPeriod ?? 0),
    0,
  );
  const inventoryValue = inventory.reduce(
    (sum, b) => sum + b.quantityOnHand * (itemById.get(b.itemId)?.standardCost ?? 0),
    0,
  );
  let overtimeCost = 0;
  let externalCapacityCost = 0;
  for (const wc of scenario.workCenters) {
    const capacity = capacityAvailability(wc, period, game.workCenterCapacity);
    overtimeCost += capacity.overtimeHours * (wc.overtimeCostPerHour ?? 0);
    externalCapacityCost += capacity.externalHours * (scenario.settings.externalCapacity?.costPerHour ?? 0);
  }
  const booked = (category: string) =>
    game.financialHistory
      .filter((entry) => entry.period === period && entry.category === category)
      .reduce((sum, entry) => sum + entry.amount, 0);
  const revenue = fulfilment.deliveries.reduce((sum, d) => sum + d.revenue, 0);
  const lateOrderCost = fulfilment.backlogUnits * scenario.settings.lateCostPerUnitPeriod;
  const orderCost = booked("ORDER_COST");
  const expediteCost = booked("EXPEDITE_COST");
  const materialCost = receipts.materialCost;

  const kpis = {
    ...emptyKpis(),
    revenue,
    materialCost,
    orderCost,
    holdingCost,
    overtimeCost,
    expediteCost,
    externalCapacityCost,
    lateOrderCost,
    netContribution:
      revenue - materialCost - orderCost - holdingCost - overtimeCost - expediteCost - externalCapacityCost - lateOrderCost,
    serviceLevel: fulfilment.dueLines === 0 ? 1 : fulfilment.onTimeLines / fulfilment.dueLines,
    lateCustomerOrders: fulfilment.lateOrderIds.length,
    ordersAtRisk: 0,
    averageInventoryValue: inventoryValue,
    capacityOverloads: work.overloadedWorkCenters.length,
    overloadHours: work.overloadHours,
    shortageUnits: started.shortageUnits + fulfilment.backlogUnits,
    replanCount: game.planningVersions.filter((v) => v.period === period).length,
  };

  const plannedVersusActual = (version?.mrpResult.records ?? []).map((record) => {
    const index = record.periods.indexOf(period);
    return {
      itemId: record.itemId,
      plannedBalance: index >= 0 ? record.projectedAvailable[index] : 0,
      actualBalance: onHand(inventory, record.itemId),
    };
  });

  const result: PeriodResult = {
    period,
    committedPlanVersionId: game.committedPlanVersionId ?? "",
    kpis,
    receivedOrderIds: receipts.receivedIds,
    startedOrderIds: started.ids,
    completedOrderIds: [...finishedEarlier.ids, ...finishedNow.ids],
    deliveries: fulfilment.deliveries,
    failures,
    eventIds: game.eventHistory.filter((entry) => entry.period === period).map((entry) => entry.eventId),
    dueLines: fulfilment.dueLines,
    onTimeLines: fulfilment.onTimeLines,
    plannedVersusActual,
    endInventory: inventory,
  };

  const bookings = [
    { category: "REVENUE", amount: revenue },
    { category: "MATERIAL_COST", amount: materialCost },
    { category: "HOLDING_COST", amount: holdingCost },
    { category: "OVERTIME_COST", amount: overtimeCost },
    { category: "EXTERNAL_CAPACITY_COST", amount: externalCapacityCost },
    { category: "LATE_ORDER_COST", amount: lateOrderCost },
  ].filter((entry) => entry.amount !== 0);

  return {
    game: {
      ...game,
      inventory,
      releasedOrders: finishedNow.orders,
      customerOrders: fulfilment.customerOrders,
      completedPeriods: [...game.completedPeriods, result],
      kpiHistory: [...game.kpiHistory, { period, kpis }],
      financialHistory: [...game.financialHistory, ...bookings.map((entry) => ({ ...entry, period }))],
    },
    result,
  };
};
