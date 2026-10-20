import { describe, expect, it } from "vitest";
import type { CustomerOrder } from "../../domain/demand";
import type { InventoryBalance } from "../../domain/inventory";
import type { Order } from "../../domain/order";
import type { RoutingOperation } from "../../domain/routing";
import { makeItem } from "../../tests/fixtures";
import { completeFinishedOrders, performWork, startReleasedOrders } from "./completeProduction";
import { fulfillCustomerOrders } from "./fulfillCustomerOrders";
import { receivePurchaseOrders } from "./receiveOrders";

const stock = (entries: Record<string, number>): InventoryBalance[] =>
  Object.entries(entries).map(([itemId, quantityOnHand]) => ({
    itemId,
    warehouseId: "WH",
    quantityOnHand,
    allocatedQuantity: 0,
  }));
const qty = (inventory: readonly InventoryBalance[], itemId: string) =>
  inventory.filter((b) => b.itemId === itemId).reduce((s, b) => s + b.quantityOnHand, 0);

const routings: RoutingOperation[] = [
  { itemId: "A", sequence: 10, workCenterId: "WC1", setupHours: 2, runHoursPerUnit: 0.5 },
];
const production = (overrides: Partial<Extract<Order, { kind: "PRODUCTION" }>> = {}): Order => ({
  id: "PRD-1",
  kind: "PRODUCTION",
  itemId: "A",
  quantity: 20,
  releasePeriod: 1,
  duePeriod: 2,
  status: "RELEASED",
  ...overrides,
});

describe("receiving purchase orders", () => {
  it("receives due orders, books material cost with the supplier modifier", () => {
    const orders: Order[] = [
      { id: "P1", kind: "PURCHASE", itemId: "RM", quantity: 100, releasePeriod: 1, duePeriod: 2, status: "RELEASED", supplierId: "S" },
      { id: "P2", kind: "PURCHASE", itemId: "RM", quantity: 50, releasePeriod: 1, duePeriod: 3, status: "RELEASED", supplierId: "S" },
    ];
    const result = receivePurchaseOrders(
      orders,
      stock({ RM: 10 }),
      2,
      [makeItem({ id: "RM", type: "PURCHASED", standardCost: 4, defaultWarehouseId: "WH" })],
      [{ id: "S", name: "S", suppliedItemIds: ["RM"], normalLeadTimePeriods: 1, unitCostModifiers: { RM: 1.5 }, active: true }],
    );
    expect(result.receivedIds).toEqual(["P1"]);
    expect(qty(result.inventory, "RM")).toBe(110);
    expect(result.materialCost).toBe(600);
    expect(result.orders.find((o) => o.id === "P2")?.status).toBe("RELEASED");
  });
});

describe("production", () => {
  const bom = [{ parentItemId: "A", componentItemId: "RM", quantityPer: 2 }];

  it("issues components when everything is available", () => {
    const result = startReleasedOrders([production()], stock({ RM: 50 }), 1, bom);
    expect(result.ids).toEqual(["PRD-1"]);
    expect(qty(result.inventory, "RM")).toBe(10);
    expect(result.orders[0]).toMatchObject({ status: "IN_PROGRESS", startedPeriod: 1 });
  });

  it("does not start an order with missing material and delays it", () => {
    const result = startReleasedOrders([production()], stock({ RM: 30 }), 1, bom);
    expect(result.ids).toEqual([]);
    expect(qty(result.inventory, "RM")).toBe(30);
    expect(result.failures[0]).toMatchObject({ kind: "MATERIAL_SHORTAGE", itemId: "RM", quantity: 10 });
    expect(result.orders[0]).toMatchObject({ status: "RELEASED", releasePeriod: 2, duePeriod: 3 });
  });

  it("works within capacity and slips an operation that does not fit", () => {
    const orders = [
      production({ id: "PRD-1", status: "IN_PROGRESS", completedOperations: 0 }),
      production({ id: "PRD-2", status: "IN_PROGRESS", completedOperations: 0, duePeriod: 3 }),
    ];
    // Each order needs 2 + 20 × 0.5 = 12 h; only 20 h available.
    const result = performWork(orders, 1, routings, { WC1: 20 });
    expect(result.hoursUsed.WC1).toBe(12);
    expect(result.failures).toEqual([
      expect.objectContaining({ kind: "CAPACITY_SHORTAGE", orderId: "PRD-2", workCenterId: "WC1", hours: 4 }),
    ]);
    expect(result.orders.find((o) => o.id === "PRD-1")).toMatchObject({ completedOperations: 1, duePeriod: 2 });
    expect(result.orders.find((o) => o.id === "PRD-2")).toMatchObject({ completedOperations: 0, duePeriod: 4 });
  });

  it("puts finished orders into stock in their due period", () => {
    const finished = [production({ status: "IN_PROGRESS", completedOperations: 1 })];
    const items = [makeItem({ id: "A", defaultWarehouseId: "WH" })];
    expect(completeFinishedOrders(finished, [], 1, routings, items).ids).toEqual([]);
    const done = completeFinishedOrders(finished, [], 2, routings, items);
    expect(done.ids).toEqual(["PRD-1"]);
    expect(qty(done.inventory, "A")).toBe(20);
    expect(done.orders[0]).toMatchObject({ status: "COMPLETED", completedPeriod: 2 });
  });
});

describe("customer deliveries", () => {
  const order = (id: string, quantity: number, duePeriod: number): CustomerOrder => ({
    id,
    customerName: "Customer Alpha",
    itemId: "A",
    quantity,
    duePeriod,
    sellingPricePerUnit: 100,
    status: "ACCEPTED",
  });

  it("delivers the oldest due orders first and marks shortfalls late", () => {
    const result = fulfillCustomerOrders(
      [order("CO-1", 30, 1), order("CO-2", 40, 2), order("CO-3", 50, 3)],
      stock({ A: 50 }),
      2,
    );
    expect(result.deliveries.map((d) => [d.customerOrderId, d.quantity, d.onTime])).toEqual([
      ["CO-1", 30, false],
      ["CO-2", 20, false],
    ]);
    expect(result.customerOrders.map((o) => o.status)).toEqual(["FULFILLED", "LATE", "ACCEPTED"]);
    expect(result.dueLines).toBe(1);
    expect(result.onTimeLines).toBe(0);
    expect(result.backlogUnits).toBe(20);
    expect(qty(result.inventory, "A")).toBe(0);
  });

  it("counts complete deliveries in the due period as on time", () => {
    const result = fulfillCustomerOrders([order("CO-1", 30, 2)], stock({ A: 30 }), 2);
    expect(result.deliveries[0]).toMatchObject({ onTime: true, revenue: 3000 });
    expect(result.onTimeLines).toBe(1);
  });
});
