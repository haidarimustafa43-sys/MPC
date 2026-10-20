import type { CustomerOrder } from "../../domain/demand";
import { isOpenDemand, remainingQuantity } from "../../domain/demand";
import type { PeriodDelivery } from "../../domain/gameState";
import type { InventoryBalance } from "../../domain/inventory";
import { onHand, removeStock } from "../inventory/stock";

export interface FulfilmentOutcome {
  customerOrders: CustomerOrder[];
  inventory: InventoryBalance[];
  deliveries: PeriodDelivery[];
  dueLines: number;
  onTimeLines: number;
  lateOrderIds: string[];
  /** Units still owed on orders due up to this period. */
  backlogUnits: number;
}

/**
 * Delivers open customer orders that are due (oldest first) from finished
 * goods stock. Partial deliveries are allowed. Anything still owed at the end of
 * its due period makes the order LATE.
 */
export const fulfillCustomerOrders = (
  orders: readonly CustomerOrder[],
  inventory: readonly InventoryBalance[],
  period: number,
): FulfilmentOutcome => {
  let stock = [...inventory];
  const deliveries: PeriodDelivery[] = [];
  const updates = new Map<string, CustomerOrder>();
  const due = orders
    .filter((order) => isOpenDemand(order) && order.duePeriod <= period)
    .sort((a, b) => a.duePeriod - b.duePeriod || a.id.localeCompare(b.id));

  for (const order of due) {
    const quantity = Math.min(remainingQuantity(order), onHand(stock, order.itemId));
    const delivered = (order.deliveredQuantity ?? 0) + quantity;
    if (quantity > 0) {
      stock = removeStock(stock, order.itemId, quantity).inventory;
      deliveries.push({
        customerOrderId: order.id,
        itemId: order.itemId,
        quantity,
        onTime: order.duePeriod === period && delivered >= order.quantity,
        revenue: quantity * order.sellingPricePerUnit,
      });
    }
    const complete = delivered >= order.quantity;
    updates.set(order.id, {
      ...order,
      deliveredQuantity: delivered,
      status: complete ? "FULFILLED" : "LATE",
    });
  }

  const next = orders.map((order) => updates.get(order.id) ?? order);
  const dueThisPeriod = next.filter(
    (order) => order.duePeriod === period && order.status !== "REJECTED" && order.status !== "PROPOSED",
  );
  return {
    customerOrders: next,
    inventory: stock,
    deliveries,
    dueLines: dueThisPeriod.length,
    onTimeLines: dueThisPeriod.filter(
      (order) => order.status === "FULFILLED" && deliveries.some((d) => d.customerOrderId === order.id && d.onTime),
    ).length,
    lateOrderIds: next.filter((order) => order.status === "LATE").map((order) => order.id),
    backlogUnits: next
      .filter((order) => order.status === "LATE")
      .reduce((sum, order) => sum + remainingQuantity(order), 0),
  };
};
