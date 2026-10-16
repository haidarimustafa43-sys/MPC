import { describe, expect, it } from "vitest";
import type { CustomerOrder } from "../../domain/demand";
import { makeItem, planningInput } from "../../tests/fixtures";
import { calculateAtp } from "./calculateAtp";
import { calculateMps, totalDemand } from "./calculateMps";

const order = (id: string, quantity: number, duePeriod: number): CustomerOrder => ({
  id,
  customerName: "Customer Alpha",
  itemId: "A",
  quantity,
  duePeriod,
  sellingPricePerUnit: 100,
  status: "ACCEPTED",
});

describe("forecast consumption", () => {
  it("uses only customer orders inside the demand time fence and max(forecast, orders) outside", () => {
    const demand = totalDemand([1, 2, 3, 4], 1, 2, [100, 100, 100, 100], [80, 120, 60, 130]);
    expect(demand).toEqual([80, 120, 100, 130]);
  });
});

describe("ATP", () => {
  it("calculates discrete ATP per supply period", () => {
    // on hand 50; MPS 100 in p3 and p5; orders 30, 10, 60, 20, 40
    const atp = calculateAtp(50, [0, 0, 100, 0, 100], [30, 10, 60, 20, 40]);
    expect(atp).toEqual([10, null, 20, null, 60]);
  });

  it("nets a negative ATP against the previous supply period", () => {
    const atp = calculateAtp(100, [0, 50, 0], [20, 90, 0]);
    // Period 2 would be 50 − 90 = −40, taken from period 1: 80 − 40 = 40.
    expect(atp).toEqual([40, 0, null]);
  });

  it("does not let forecast consume ATP", () => {
    expect(calculateAtp(10, [0, 0], [0, 0])).toEqual([10, null]);
  });
});

describe("MPS", () => {
  it("builds an MPS record with demand, receipts, releases and ATP", () => {
    const input = planningInput({
      periods: [1, 2, 3, 4],
      items: [makeItem({ id: "A", type: "END_ITEM", safetyStock: 10, leadTimePeriods: 1 })],
      inventory: [{ itemId: "A", warehouseId: "WH", quantityOnHand: 60, allocatedQuantity: 0 }],
      forecast: [1, 2, 3, 4].map((period) => ({ itemId: "A", period, quantity: 50 })),
      customerOrders: [order("CO-1", 40, 1), order("CO-2", 30, 2), order("CO-3", 70, 4)],
    });
    const [record] = calculateMps(input).records;
    expect(record.grossRequirements).toEqual([40, 30, 50, 70]);
    expect(record.plannedReceipts).toEqual([0, 20, 50, 70]);
    expect(record.plannedReleases).toEqual([20, 50, 70, 0]);
    expect(record.projectedAvailable).toEqual([20, 10, 10, 10]);
    // Raw ATP 20, −10, 50, 0; the −10 in period 2 is covered by period 1.
    expect(record.atp).toEqual([10, 0, 50, 0]);
  });

  it("lumps past-due customer orders into the first period", () => {
    const input = planningInput({
      currentPeriod: 3,
      periods: [3, 4],
      items: [makeItem({ id: "A", type: "END_ITEM" })],
      customerOrders: [order("CO-OLD", 25, 1)],
    });
    expect(calculateMps(input).records[0].customerOrders).toEqual([25, 0]);
  });
});
