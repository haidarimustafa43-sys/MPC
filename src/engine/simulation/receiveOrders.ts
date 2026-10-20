import type { InventoryBalance } from "../../domain/inventory";
import type { Order, PurchaseOrder } from "../../domain/order";
import type { Supplier } from "../../domain/supplier";
import type { PlanningItem } from "../planningInput";
import { addStock } from "../inventory/stock";

export interface ReceiptOutcome {
  orders: Order[];
  inventory: InventoryBalance[];
  receivedIds: string[];
  materialCost: number;
}

/**
 * Receives purchase orders whose (possibly delayed) due period has come.
 * Material cost is booked at receipt: quantity × standard cost × the supplier's
 * cost modifier for the item.
 */
export const receivePurchaseOrders = (
  orders: readonly Order[],
  inventory: readonly InventoryBalance[],
  period: number,
  items: readonly PlanningItem[],
  suppliers: readonly Supplier[],
): ReceiptOutcome => {
  let stock = [...inventory];
  const receivedIds: string[] = [];
  let materialCost = 0;
  const next = orders.map((order): Order => {
    if (order.kind !== "PURCHASE" || order.status !== "RELEASED" || order.duePeriod > period) return order;
    const item = items.find((candidate) => candidate.id === order.itemId);
    const modifier = suppliers.find((s) => s.id === order.supplierId)?.unitCostModifiers?.[order.itemId] ?? 1;
    stock = addStock(stock, order.itemId, item?.defaultWarehouseId ?? "WH", order.quantity);
    materialCost += order.quantity * (item?.standardCost ?? 0) * modifier;
    receivedIds.push(order.id);
    const received: PurchaseOrder = { ...order, status: "RECEIVED", receivedPeriod: period };
    return received;
  });
  return { orders: next, inventory: stock, receivedIds, materialCost };
};
