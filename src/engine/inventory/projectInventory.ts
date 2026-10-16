import type { CustomerOrder } from "../../domain/demand";
import { isOpenDemand, remainingQuantity } from "../../domain/demand";
import type { Order } from "../../domain/order";
import { isOpenReleasedOrder } from "../../domain/order";

export interface TimePhasedQuantities {
  values: number[];
  /** Ids of orders that were due before the first period and are lumped into it. */
  pastDueIds: string[];
}

/**
 * Buckets dated quantities into the horizon. Anything dated before the first
 * period is "past due" and is placed in the first period, because it still
 * has to be handled now.
 */
const bucket = (
  periods: readonly number[],
  entries: readonly { id: string; period: number; quantity: number }[],
): TimePhasedQuantities => {
  const values = new Array<number>(periods.length).fill(0);
  const pastDueIds: string[] = [];
  const first = periods[0];
  const last = periods[periods.length - 1];
  for (const entry of entries) {
    if (entry.period > last) continue;
    if (entry.period < first) pastDueIds.push(entry.id);
    values[Math.max(0, entry.period - first)] += entry.quantity;
  }
  return { values, pastDueIds };
};

export const scheduledReceiptsFor = (
  itemId: string,
  orders: readonly Order[],
  periods: readonly number[],
): TimePhasedQuantities =>
  bucket(
    periods,
    orders
      .filter((order) => order.itemId === itemId && isOpenReleasedOrder(order))
      .map((order) => ({ id: order.id, period: order.duePeriod, quantity: order.quantity })),
  );

export const customerDemandFor = (
  itemId: string,
  orders: readonly CustomerOrder[],
  periods: readonly number[],
): TimePhasedQuantities =>
  bucket(
    periods,
    orders
      .filter((order) => order.itemId === itemId && isOpenDemand(order))
      .map((order) => ({ id: order.id, period: order.duePeriod, quantity: remainingQuantity(order) })),
  );

/** Sum of a projected balance array multiplied by a unit value, ignoring negative balances. */
export const inventoryValue = (balances: readonly number[], unitValue: number): number =>
  balances.reduce((sum, balance) => sum + Math.max(0, balance) * unitValue, 0);
