import type { EventDefinition, EventEffect } from "../../domain/event";
import type { GameState, InboxMessage } from "../../domain/gameState";
import type { WorkCenterCapacityAdjustment } from "../../domain/planningVersion";
import { removeStock } from "../inventory/stock";

/*
 * Effects change the planning conditions (orders, capacity, suppliers,
 * demand). They never change a plan or a result directly, so the same event
 * can hurt one team and not another depending on how they planned.
 */

const upsertCapacity = (
  entries: readonly WorkCenterCapacityAdjustment[],
  workCenterId: string,
  period: number,
  patch: Partial<WorkCenterCapacityAdjustment>,
): WorkCenterCapacityAdjustment[] => {
  const existing = entries.find((e) => e.workCenterId === workCenterId && e.period === period);
  const base = existing ?? { workCenterId, period, capacityFactor: 1, overtimeHours: 0, externalHours: 0 };
  return [...entries.filter((e) => e !== existing), { ...base, ...patch }];
};

const range = (from: number, to: number): number[] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);

export const applyEffect = (
  game: GameState,
  effect: EventEffect,
  period: number,
  eventId: string,
): GameState => {
  switch (effect.type) {
    case "DELAY_PURCHASE_ORDER":
      return {
        ...game,
        releasedOrders: game.releasedOrders.map((order) =>
          order.id === effect.purchaseOrderId && order.kind === "PURCHASE" && order.status === "RELEASED"
            ? {
                ...order,
                originalDuePeriod: order.originalDuePeriod ?? order.duePeriod,
                duePeriod: order.duePeriod + effect.periods,
              }
            : order,
        ),
      };
    case "CHANGE_CAPACITY": {
      let capacity = game.workCenterCapacity;
      for (const p of range(effect.fromPeriod, effect.toPeriod)) {
        capacity = upsertCapacity(capacity, effect.workCenterId, p, { capacityFactor: effect.factor });
      }
      return {
        ...game,
        workCenterCapacity: capacity,
        activeEventEffects: [
          ...game.activeEventEffects,
          {
            eventId,
            fromPeriod: effect.fromPeriod,
            toPeriod: effect.toPeriod,
            description: `${effect.workCenterId} capacity × ${effect.factor}`,
          },
        ],
      };
    }
    case "ADD_CUSTOMER_ORDER": {
      if (game.customerOrders.some((order) => order.id === effect.orderId)) return game;
      const status = effect.status ?? "ACCEPTED";
      return {
        ...game,
        customerOrders: [
          ...game.customerOrders,
          {
            id: effect.orderId,
            customerName: effect.customerName,
            itemId: effect.itemId,
            quantity: effect.quantity,
            duePeriod: effect.duePeriod,
            sellingPricePerUnit: effect.sellingPricePerUnit,
            status,
            acceptedAtPeriod: status === "ACCEPTED" ? period : undefined,
          },
        ],
      };
    }
    case "CHANGE_CUSTOMER_ORDER_QUANTITY":
      return {
        ...game,
        customerOrders: game.customerOrders.map((order) =>
          order.id === effect.orderId ? { ...order, quantity: effect.quantity } : order,
        ),
      };
    case "SUPPLIER_UNAVAILABLE": {
      if (effect.fromPeriod > period) {
        return {
          ...game,
          scheduledEffects: [...game.scheduledEffects, { period: effect.fromPeriod, eventId, effects: [effect] }],
        };
      }
      return {
        ...game,
        suppliers: game.suppliers.map((s) => (s.id === effect.supplierId ? { ...s, active: false } : s)),
        scheduledEffects: [
          ...game.scheduledEffects,
          {
            period: effect.toPeriod + 1,
            eventId,
            effects: [{ type: "SUPPLIER_AVAILABLE", supplierId: effect.supplierId }],
          },
        ],
        activeEventEffects: [
          ...game.activeEventEffects,
          {
            eventId,
            fromPeriod: period,
            toPeriod: effect.toPeriod,
            description: `${effect.supplierId} unavailable`,
          },
        ],
      };
    }
    case "SUPPLIER_AVAILABLE":
      return {
        ...game,
        suppliers: game.suppliers.map((s) => (s.id === effect.supplierId ? { ...s, active: true } : s)),
      };
    case "SCRAP_INVENTORY":
      return { ...game, inventory: removeStock(game.inventory, effect.itemId, effect.quantity).inventory };
  }
};

export const applyEffects = (
  game: GameState,
  effects: readonly EventEffect[],
  period: number,
  eventId: string,
): GameState => effects.reduce((state, effect) => applyEffect(state, effect, period, eventId), game);

/** Ids of orders, work centres, suppliers and items an effect refers to (for the inbox). */
export const relatedEntityIds = (effects: readonly EventEffect[]): string[] => [
  ...new Set(
    effects.flatMap((effect) => {
      switch (effect.type) {
        case "DELAY_PURCHASE_ORDER":
          return [effect.purchaseOrderId];
        case "CHANGE_CAPACITY":
          return [effect.workCenterId];
        case "ADD_CUSTOMER_ORDER":
        case "CHANGE_CUSTOMER_ORDER_QUANTITY":
          return [effect.orderId];
        case "SUPPLIER_UNAVAILABLE":
        case "SUPPLIER_AVAILABLE":
          return [effect.supplierId];
        case "SCRAP_INVENTORY":
          return [effect.itemId];
      }
    }),
  ),
];

export const messageFor = (event: EventDefinition, period: number): InboxMessage => ({
  id: `MSG-${event.id}-${period}`,
  eventId: event.id,
  period,
  sender: event.message.sender,
  messageType: event.message.messageType,
  severity: event.message.severity,
  title: event.message.title,
  body: event.message.body,
  status: "UNREAD",
  acknowledgementRequired: event.acknowledgementRequired,
  decisionRequired: event.decisionRequired,
  relatedEntityIds: relatedEntityIds([
    ...event.effects,
    ...(event.choices ?? []).flatMap((choice) => choice.effects),
  ]),
});

/**
 * Fires one event: stores it in the history, sends its message, applies its
 * immediate effects and schedules delayed effects and follow-up events.
 */
export const fireEvent = (game: GameState, event: EventDefinition, period: number): GameState => {
  let next: GameState = {
    ...game,
    eventHistory: [...game.eventHistory, { eventId: event.id, period }],
    inboxMessages:
      event.visibleToStudent === false ? game.inboxMessages : [...game.inboxMessages, messageFor(event, period)],
  };
  next = applyEffects(next, event.effects, period, event.id);
  const scheduled = [
    ...(event.delayedEffects ?? []).map((delayed) => ({
      period: period + delayed.afterPeriods,
      eventId: event.id,
      effects: delayed.effects,
    })),
    ...(event.followUpEventIds && event.followUpEventIds.length > 0
      ? [{ period: period + 1, eventId: event.id, effects: [], followUpEventIds: event.followUpEventIds }]
      : []),
  ];
  return scheduled.length > 0 ? { ...next, scheduledEffects: [...next.scheduledEffects, ...scheduled] } : next;
};
