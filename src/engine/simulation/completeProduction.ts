import type { BomLine } from "../../domain/bom";
import type { PeriodFailure } from "../../domain/gameState";
import type { InventoryBalance } from "../../domain/inventory";
import type { Order, ProductionOrder } from "../../domain/order";
import type { RoutingOperation } from "../../domain/routing";
import type { LoadableOrder } from "../capacity/calculateCrp";
import { completedOperationsOf, operationLoad, operationPeriod, operationsFor } from "../capacity/calculateCrp";
import { addStock, onHand, removeStock } from "../inventory/stock";
import { componentQuantity, componentsOf, isEffective } from "../mrp/explodeBom";
import type { PlanningItem } from "../planningInput";

const byDueDate = (a: Order, b: Order): number => a.duePeriod - b.duePeriod || a.id.localeCompare(b.id);

const asLoadable = (order: ProductionOrder): LoadableOrder => ({
  orderId: order.id,
  itemId: order.itemId,
  orderType: "RELEASED",
  started: order.status === "IN_PROGRESS",
  completedOperations: order.completedOperations,
  quantity: order.quantity,
  releasePeriod: order.releasePeriod,
  duePeriod: order.duePeriod,
});

export interface ProductionOutcome {
  orders: Order[];
  inventory: InventoryBalance[];
  ids: string[];
  failures: Omit<PeriodFailure, "cause">[];
  shortageUnits: number;
}

/** Finished orders whose due period has come are put into stock. */
export const completeFinishedOrders = (
  orders: readonly Order[],
  inventory: readonly InventoryBalance[],
  period: number,
  routings: readonly RoutingOperation[],
  items: readonly PlanningItem[],
): ProductionOutcome => {
  let stock = [...inventory];
  const ids: string[] = [];
  const next = orders.map((order): Order => {
    if (order.kind !== "PRODUCTION" || order.status !== "IN_PROGRESS" || order.duePeriod > period) return order;
    const count = operationsFor(routings, order.itemId).length;
    if (completedOperationsOf(asLoadable(order), count, period) < count) return order;
    const item = items.find((candidate) => candidate.id === order.itemId);
    stock = addStock(stock, order.itemId, item?.defaultWarehouseId ?? "WH", order.quantity);
    ids.push(order.id);
    return { ...order, status: "COMPLETED", completedPeriod: period, completedOperations: count };
  });
  return { orders: next, inventory: stock, ids, failures: [], shortageUnits: 0 };
};

/**
 * Issues components to released orders whose release period has come.
 * An order starts only if every component is available in full; otherwise it
 * waits a period (release and due move one period later). If the scenario
 * allows partial production, the part that has material starts and the rest
 * becomes a new order one period later. Earlier due dates get material first.
 */
export const startReleasedOrders = (
  orders: readonly Order[],
  inventory: readonly InventoryBalance[],
  period: number,
  bom: readonly BomLine[],
  allowPartial = false,
): ProductionOutcome => {
  let stock = [...inventory];
  const remainders: ProductionOrder[] = [];
  const ids: string[] = [];
  const failures: ProductionOutcome["failures"] = [];
  let shortageUnits = 0;
  const startable = new Set(
    orders
      .filter((o): o is ProductionOrder => o.kind === "PRODUCTION" && o.status === "RELEASED" && o.releasePeriod <= period)
      .sort(byDueDate)
      .map((o) => o.id),
  );
  const updates = new Map<string, Order>();
  for (const order of orders.filter((o) => startable.has(o.id)).sort(byDueDate)) {
    if (order.kind !== "PRODUCTION") continue;
    const needs = componentsOf(bom, order.itemId)
      .filter((line) => isEffective(line, period))
      .map((line) => ({ itemId: line.componentItemId, quantity: componentQuantity(line, order.quantity) }));
    const missing = needs
      .map((need) => ({ ...need, missing: need.quantity - onHand(stock, need.itemId) }))
      .filter((need) => need.missing > 0);
    if (missing.length > 0) {
      const first = missing[0];
      shortageUnits += missing.reduce((sum, need) => sum + need.missing, 0);
      const startable = allowPartial ? largestStartableQuantity(order, stock, period, bom) : 0;
      if (startable > 0) {
        // Split: the part with material starts now, the rest waits a period.
        const lines = componentsOf(bom, order.itemId).filter((line) => isEffective(line, period));
        for (const line of lines) {
          stock = removeStock(stock, line.componentItemId, componentQuantity(line, startable)).inventory;
        }
        ids.push(order.id);
        updates.set(order.id, {
          ...order,
          quantity: startable,
          status: "IN_PROGRESS",
          startedPeriod: period,
          completedOperations: 0,
        });
        remainders.push({
          ...order,
          id: `${order.id}-R${period}`,
          quantity: order.quantity - startable,
          releasePeriod: period + 1,
          duePeriod: order.duePeriod + 1,
        });
        failures.push({
          kind: "MATERIAL_SHORTAGE",
          orderId: order.id,
          itemId: first.itemId,
          quantity: first.missing,
          description: `${order.id} started with ${startable} of ${order.quantity}; the rest waits for ${missing.map((m) => m.itemId).join(", ")}.`,
        });
        continue;
      }
      failures.push({
        kind: "MATERIAL_SHORTAGE",
        orderId: order.id,
        itemId: first.itemId,
        quantity: first.missing,
        description: `${order.id} could not start: ${missing.map((m) => `${m.missing} × ${m.itemId}`).join(", ")} missing.`,
      });
      updates.set(order.id, { ...order, releasePeriod: period + 1, duePeriod: order.duePeriod + 1 });
      continue;
    }
    for (const need of needs) stock = removeStock(stock, need.itemId, need.quantity).inventory;
    ids.push(order.id);
    updates.set(order.id, { ...order, status: "IN_PROGRESS", startedPeriod: period, completedOperations: 0 });
  }
  return {
    orders: [...orders.map((o) => updates.get(o.id) ?? o), ...remainders],
    inventory: stock,
    ids,
    failures,
    shortageUnits,
  };
};

/** Largest quantity of the order whose components are all on hand now. */
export const largestStartableQuantity = (
  order: ProductionOrder,
  inventory: readonly InventoryBalance[],
  period: number,
  bom: readonly BomLine[],
): number => {
  const lines = componentsOf(bom, order.itemId).filter((line) => isEffective(line, period));
  let quantity = order.quantity;
  for (const line of lines) {
    const available = onHand(inventory, line.componentItemId);
    while (quantity > 0 && componentQuantity(line, quantity) > available) quantity--;
  }
  return quantity;
};

export interface WorkOutcome {
  orders: Order[];
  failures: Omit<PeriodFailure, "cause">[];
  hoursUsed: Record<string, number>;
  overloadHours: number;
  overloadedWorkCenters: string[];
}

/**
 * Performs the operations scheduled up to this period, limited by available
 * capacity. Operations are not split: if an operation does not fit in the
 * remaining hours of its work centre, the order is delayed by one period.
 * Orders with earlier due dates are served first.
 */
export const performWork = (
  orders: readonly Order[],
  period: number,
  routings: readonly RoutingOperation[],
  availableHours: Readonly<Record<string, number>>,
): WorkOutcome => {
  const remaining: Record<string, number> = { ...availableHours };
  const hoursUsed: Record<string, number> = {};
  const failures: WorkOutcome["failures"] = [];
  const overloaded = new Set<string>();
  let overloadHours = 0;
  const updates = new Map<string, Order>();

  const inProgress = orders
    .filter((o): o is ProductionOrder => o.kind === "PRODUCTION" && o.status === "IN_PROGRESS")
    .sort(byDueDate);
  for (const order of inProgress) {
    const operations = operationsFor(routings, order.itemId);
    let done = completedOperationsOf(asLoadable(order), operations.length, period);
    let delayed = false;
    while (done < operations.length && operationPeriod(asLoadable(order), done, operations.length) <= period) {
      const operation = operations[done];
      const { totalHours } = operationLoad(operation, order.quantity);
      const free = remaining[operation.workCenterId] ?? 0;
      if (totalHours > free + 1e-9) {
        const shortBy = totalHours - free;
        overloadHours += shortBy;
        overloaded.add(operation.workCenterId);
        failures.push({
          kind: "CAPACITY_SHORTAGE",
          orderId: order.id,
          itemId: order.itemId,
          workCenterId: operation.workCenterId,
          hours: shortBy,
          description: `${order.id} operation ${operation.sequence} needs ${totalHours.toFixed(1)} h on ${operation.workCenterId}, only ${free.toFixed(1)} h left.`,
        });
        delayed = true;
        break;
      }
      remaining[operation.workCenterId] = free - totalHours;
      hoursUsed[operation.workCenterId] = (hoursUsed[operation.workCenterId] ?? 0) + totalHours;
      done++;
    }
    updates.set(order.id, {
      ...order,
      completedOperations: done,
      // An operation that does not fit is done one period later, so completion slips one period.
      duePeriod: delayed ? order.duePeriod + 1 : order.duePeriod,
    });
  }
  return {
    orders: orders.map((o) => updates.get(o.id) ?? o),
    failures,
    hoursUsed,
    overloadHours,
    overloadedWorkCenters: [...overloaded],
  };
};
