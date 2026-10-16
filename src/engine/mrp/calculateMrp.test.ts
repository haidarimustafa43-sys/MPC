import { describe, expect, it } from "vitest";
import { makeItem, planningInput } from "../../tests/fixtures";
import { calculateMps } from "../mps/calculateMps";
import { calculateMrp } from "./calculateMrp";

describe("multi-level MRP", () => {
  const input = planningInput({
    currentPeriod: 1,
    periods: [1, 2, 3, 4, 5],
    settings: { ...planningInput().settings, demandTimeFencePeriods: 0 },
    items: [
      makeItem({ id: "A", type: "END_ITEM", leadTimePeriods: 1 }),
      makeItem({ id: "C", type: "MANUFACTURED", leadTimePeriods: 1 }),
      makeItem({
        id: "RM",
        type: "PURCHASED",
        leadTimePeriods: 1,
        safetyStock: 5,
        lotSizingPolicy: { method: "FOQ", quantity: 50 },
      }),
    ],
    bom: [
      { parentItemId: "A", componentItemId: "C", quantityPer: 2 },
      { parentItemId: "C", componentItemId: "RM", quantityPer: 1 },
      { parentItemId: "A", componentItemId: "RM", quantityPer: 1 },
    ],
    forecast: [{ itemId: "A", period: 4, quantity: 10 }],
    inventory: [{ itemId: "RM", warehouseId: "WH", quantityOnHand: 30, allocatedQuantity: 0 }],
  });

  it("explodes parent releases into component gross requirements level by level", () => {
    const mps = calculateMps(input);
    const mrp = calculateMrp(input, mps);
    const byId = Object.fromEntries(mrp.records.map((record) => [record.itemId, record]));

    expect(mrp.lowLevelCodes).toEqual({ A: 0, C: 1, RM: 2 });
    expect(mrp.records.map((record) => record.itemId)).toEqual(["A", "C", "RM"]);
    // A: receipt 10 in period 4, released in period 3.
    expect(byId.A.plannedReleases).toEqual([0, 0, 10, 0, 0]);
    // C: 2 × 10 needed in period 3, released in period 2.
    expect(byId.C.grossRequirements).toEqual([0, 0, 20, 0, 0]);
    expect(byId.C.plannedReleases).toEqual([0, 20, 0, 0, 0]);
    // RM: 20 from C in period 2 and 10 from A in period 3.
    expect(byId.RM.grossRequirements).toEqual([0, 20, 10, 0, 0]);
    // 30 − 20 = 10 ≥ 5; 10 − 10 = 0 < 5 → FOQ 50 in period 3.
    expect(byId.RM.plannedReceipts).toEqual([0, 0, 50, 0, 0]);
    expect(byId.RM.plannedOrders[0]).toMatchObject({ kind: "PURCHASE", releasePeriod: 2 });
  });

  it("uses released orders as scheduled receipts", () => {
    const withReceipt = {
      ...input,
      releasedOrders: [
        {
          id: "PUR-1",
          kind: "PURCHASE" as const,
          itemId: "RM",
          quantity: 40,
          releasePeriod: 0,
          duePeriod: 3,
          status: "RELEASED" as const,
          supplierId: "S",
        },
      ],
    };
    const mrp = calculateMrp(withReceipt, calculateMps(withReceipt));
    const rm = mrp.records.find((record) => record.itemId === "RM");
    expect(rm?.scheduledReceipts).toEqual([0, 0, 40, 0, 0]);
    expect(rm?.plannedOrders).toHaveLength(0);
  });
});
