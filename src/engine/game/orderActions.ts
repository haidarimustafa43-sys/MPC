import type { GameState } from "../../domain/gameState";
import type { Order } from "../../domain/order";
import type { PlannedOrder } from "../../domain/planningVersion";
import type { Scenario } from "../../domain/scenario";
import { GameActionError } from "./errors";
import { buildPlanningInput, latestVersion, recordDecision } from "./gameActions";
import { canPerform } from "./stateMachine";

/*
 * Order decisions of the student. Planned orders come from the latest planning
 * version; firm planned orders and released orders live in the game state.
 * Each decision is logged and makes the plan stale until planning is rerun.
 */

const requireChangeAllowed = (game: GameState): void => {
  const check = canPerform(game, "CHANGE_PLAN");
  if (!check.allowed) throw new GameActionError(check.reasonKey ?? "guard.unknown");
};

const effectiveItem = (scenario: Scenario, game: GameState, itemId: string) => {
  const item = buildPlanningInput(scenario, game).items.find((candidate) => candidate.id === itemId);
  if (!item) throw new GameActionError("orders.unknownItem", { item: itemId });
  return item;
};

/** A planned order of the latest version or a firm planned order of the game. */
export const findPlannedOrder = (game: GameState, orderId: string): PlannedOrder | undefined =>
  game.plannedOrders.find((order) => order.id === orderId) ??
  latestVersion(game)
    ?.mrpResult.records.flatMap((record) => record.plannedOrders)
    .find((order) => order.id === orderId);

const nextOrderNumber = (game: GameState): number =>
  game.releasedOrders.length + game.plannedOrders.length + game.decisions.length + 1;

const releasedThisWeek = (game: GameState): Set<string | undefined> =>
  new Set(game.decisions.filter((d) => d.category === "RELEASE_ORDER").map((d) => d.field));

/**
 * The planned orders the student currently works with: MRP orders of the
 * latest version (minus those released or turned into firm orders this week)
 * plus all firm planned orders.
 */
export const currentPlannedOrders = (game: GameState): PlannedOrder[] => {
  const released = releasedThisWeek(game);
  // A planned order that was turned into a firm order this week is represented by the firm order.
  const firmed = new Set(
    game.decisions
      .filter((d) => d.category === "FIRM_PLANNED_ORDER" && d.period === game.currentPeriod)
      .map((d) => (d.previousValue as { from?: string } | undefined)?.from),
  );
  const fromVersion = (latestVersion(game)?.mrpResult.records ?? []).flatMap((record) => record.plannedOrders);
  return [
    ...fromVersion.filter(
      (order) => !order.firm && !firmed.has(order.id) && !released.has(`${order.id}@${game.currentPeriod}`),
    ),
    ...game.plannedOrders,
  ];
};

/** Planned orders that are due for release now and have not been released yet. */
export const plannedOrdersDueForRelease = (game: GameState): PlannedOrder[] =>
  currentPlannedOrders(game).filter((order) => order.releasePeriod <= game.currentPeriod);

/**
 * Turns a planned order into a released production or purchase order. Only
 * orders whose release date has come can be released; to start earlier the
 * order must first be moved. The due period is never earlier than the lead time
 * allows from today.
 */
export const releasePlannedOrder = (
  game: GameState,
  scenario: Scenario,
  plannedOrderId: string,
  now: string,
  reason?: string,
): GameState => {
  requireChangeAllowed(game);
  const planned = findPlannedOrder(game, plannedOrderId);
  if (!planned) throw new GameActionError("orders.unknownOrder", { order: plannedOrderId });
  if (!plannedOrdersDueForRelease(game).some((order) => order.id === plannedOrderId)) {
    throw new GameActionError(
      planned.releasePeriod > game.currentPeriod ? "orders.notDueYet" : "orders.alreadyReleased",
      { order: plannedOrderId, period: planned.releasePeriod },
    );
  }
  const item = effectiveItem(scenario, game, planned.itemId);
  const duePeriod = Math.max(planned.receiptPeriod, game.currentPeriod + item.leadTimePeriods);
  const number = nextOrderNumber(game);
  let order: Order;
  if (planned.kind === "PURCHASE") {
    const supplierId = planned.supplierId ?? item.supplierId;
    const supplier = game.suppliers.find((candidate) => candidate.id === supplierId);
    if (!supplier || !supplier.active) {
      throw new GameActionError("orders.supplierUnavailable", { supplier: supplierId ?? "", item: item.id });
    }
    order = {
      id: `PUR-${item.id}-${game.currentPeriod}-${number}`,
      kind: "PURCHASE",
      itemId: item.id,
      quantity: planned.quantity,
      releasePeriod: game.currentPeriod,
      duePeriod,
      originalDuePeriod: duePeriod,
      status: "RELEASED",
      supplierId: supplier.id,
    };
  } else {
    order = {
      id: `PRD-${item.id}-${game.currentPeriod}-${number}`,
      kind: "PRODUCTION",
      itemId: item.id,
      quantity: planned.quantity,
      releasePeriod: game.currentPeriod,
      duePeriod,
      originalDuePeriod: duePeriod,
      status: "RELEASED",
      completedOperations: 0,
    };
  }
  return recordDecision(
    {
      ...game,
      releasedOrders: [...game.releasedOrders, order],
      plannedOrders: game.plannedOrders.filter((candidate) => candidate.id !== plannedOrderId),
      financialHistory: [
        ...game.financialHistory,
        { period: game.currentPeriod, category: "ORDER_COST", amount: item.orderCost, reference: order.id },
      ],
    },
    {
      timestamp: now,
      category: "RELEASE_ORDER",
      entityType: planned.kind === "PURCHASE" ? "PURCHASE_ORDER" : "PRODUCTION_ORDER",
      entityId: order.id,
      // The planned order id + period marks it as released in this week.
      field: `${plannedOrderId}@${game.currentPeriod}`,
      newValue: { quantity: order.quantity, duePeriod: order.duePeriod },
      reason,
    },
  );
};

export const releaseAllDueOrders = (
  game: GameState,
  scenario: Scenario,
  now: string,
  reason?: string,
): GameState =>
  plannedOrdersDueForRelease(game).reduce(
    (state, order) => releasePlannedOrder(state, scenario, order.id, now, reason),
    game,
  );

/**
 * Creates or changes a firm planned order: a fixed quantity and/or receipt
 * period. Moving an order earlier or later and changing its quantity are all
 * done this way. The release (receipt − lead time) may not lie in the past.
 */
export const firmPlannedOrder = (
  game: GameState,
  scenario: Scenario,
  plannedOrderId: string,
  changes: { quantity?: number; receiptPeriod?: number },
  now: string,
  reason?: string,
): GameState => {
  requireChangeAllowed(game);
  const source = findPlannedOrder(game, plannedOrderId);
  if (!source) throw new GameActionError("orders.unknownOrder", { order: plannedOrderId });
  const item = effectiveItem(scenario, game, source.itemId);
  const quantity = Math.round(changes.quantity ?? source.quantity);
  const receiptPeriod = Math.round(changes.receiptPeriod ?? source.receiptPeriod);
  if (!(quantity > 0)) throw new GameActionError("orders.invalidQuantity");
  const releasePeriod = receiptPeriod - item.leadTimePeriods;
  if (releasePeriod < game.currentPeriod) {
    throw new GameActionError("orders.releaseInPast", { period: releasePeriod });
  }
  const existingFirm = game.plannedOrders.find((order) => order.id === plannedOrderId);
  const firm: PlannedOrder = {
    ...source,
    id: existingFirm ? existingFirm.id : `FPO-${source.itemId}-${game.currentPeriod}-${nextOrderNumber(game)}`,
    quantity,
    receiptPeriod,
    releasePeriod,
    neededPeriod: source.neededPeriod,
    supplierId: source.kind === "PURCHASE" ? (source.supplierId ?? item.supplierId) : undefined,
    compressed: false,
    firm: true,
  };
  return recordDecision(
    { ...game, plannedOrders: [...game.plannedOrders.filter((order) => order.id !== firm.id), firm] },
    {
      timestamp: now,
      category: "FIRM_PLANNED_ORDER",
      entityType: "PLANNED_ORDER",
      entityId: firm.id,
      field: changes.receiptPeriod !== undefined && changes.quantity === undefined ? "receiptPeriod" : "order",
      previousValue: { quantity: source.quantity, receiptPeriod: source.receiptPeriod, from: source.id },
      newValue: { quantity, receiptPeriod },
      reason,
    },
  );
};

/** Cancels a firm planned order (an unreleased decision); MRP plans the item again. */
export const cancelFirmPlannedOrder = (game: GameState, orderId: string, now: string, reason?: string): GameState => {
  requireChangeAllowed(game);
  const firm = game.plannedOrders.find((order) => order.id === orderId);
  if (!firm) throw new GameActionError("orders.unknownOrder", { order: orderId });
  return recordDecision(
    { ...game, plannedOrders: game.plannedOrders.filter((order) => order.id !== orderId) },
    {
      timestamp: now,
      category: "CANCEL_FIRM_ORDER",
      entityType: "PLANNED_ORDER",
      entityId: orderId,
      previousValue: { quantity: firm.quantity, receiptPeriod: firm.receiptPeriod },
      reason,
    },
  );
};

/** Buys express delivery for an open purchase order, if the scenario offers it. */
export const expeditePurchaseOrder = (
  game: GameState,
  scenario: Scenario,
  orderId: string,
  now: string,
  reason?: string,
): GameState => {
  requireChangeAllowed(game);
  const express = scenario.settings.expressDelivery;
  if (!express) throw new GameActionError("orders.expressNotOffered");
  const order = game.releasedOrders.find((candidate) => candidate.id === orderId);
  if (!order || order.kind !== "PURCHASE" || order.status !== "RELEASED") {
    throw new GameActionError("orders.unknownOrder", { order: orderId });
  }
  if (order.expedited) throw new GameActionError("orders.alreadyExpedited", { order: orderId });
  const duePeriod = Math.max(game.currentPeriod, order.duePeriod - express.leadTimeReductionPeriods);
  const cost = order.quantity * express.costPerUnit;
  return recordDecision(
    {
      ...game,
      releasedOrders: game.releasedOrders.map((candidate) =>
        candidate.id === orderId ? { ...order, duePeriod, expedited: true } : candidate,
      ),
      financialHistory: [
        ...game.financialHistory,
        { period: game.currentPeriod, category: "EXPEDITE_COST", amount: cost, reference: orderId },
      ],
    },
    {
      timestamp: now,
      category: "EXPRESS_DELIVERY",
      entityType: "PURCHASE_ORDER",
      entityId: orderId,
      field: "duePeriod",
      previousValue: order.duePeriod,
      newValue: duePeriod,
      reason,
    },
  );
};

/** Accepts or rejects a proposed customer order. */
export const decideCustomerOrder = (
  game: GameState,
  orderId: string,
  accept: boolean,
  now: string,
  reason?: string,
): GameState => {
  requireChangeAllowed(game);
  const order = game.customerOrders.find((candidate) => candidate.id === orderId);
  if (!order || order.status !== "PROPOSED") throw new GameActionError("orders.unknownOrder", { order: orderId });
  return recordDecision(
    {
      ...game,
      customerOrders: game.customerOrders.map((candidate) =>
        candidate.id === orderId
          ? {
              ...candidate,
              status: accept ? "ACCEPTED" : "REJECTED",
              acceptedAtPeriod: accept ? game.currentPeriod : undefined,
            }
          : candidate,
      ),
    },
    {
      timestamp: now,
      category: accept ? "ACCEPT_CUSTOMER_ORDER" : "REJECT_CUSTOMER_ORDER",
      entityType: "CUSTOMER_ORDER",
      entityId: orderId,
      field: "status",
      previousValue: "PROPOSED",
      newValue: accept ? "ACCEPTED" : "REJECTED",
      reason,
    },
  );
};
