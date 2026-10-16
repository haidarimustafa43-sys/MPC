import { describe, expect, it } from "vitest";
import { horizonPeriods } from "../planningInput";
import { timePhaseInput } from "../../tests/fixtures";
import { timePhaseOrders } from "./timePhaseOrders";

describe("time-phased netting", () => {
  it("calculates the textbook net requirement with FOQ and lead-time offset", () => {
    // Need period 7: gross 250, scheduled 50, previous PAB 80, safety stock 40.
    const record = timePhaseOrders(
      timePhaseInput({
        periods: horizonPeriods(1, 8),
        startingOnHand: 80,
        grossRequirements: [0, 0, 0, 0, 0, 0, 250, 0],
        scheduledReceipts: [0, 0, 0, 0, 0, 0, 50, 0],
        safetyStock: 40,
        leadTimePeriods: 2,
        lotSizingPolicy: { method: "FOQ", quantity: 200 },
      }),
    );
    expect(record.netRequirements[6]).toBe(160); // 250 + 40 − 80 − 50
    expect(record.plannedReceipts[6]).toBe(200);
    expect(record.plannedReleases[4]).toBe(200); // period 5
    expect(record.projectedAvailable[6]).toBe(80); // 80 + 50 − 250 + 200
    expect(record.plannedOrders).toEqual([
      expect.objectContaining({ id: "PL-X-7", quantity: 200, releasePeriod: 5, receiptPeriod: 7 }),
    ]);
    expect(record.traces["net:7"]).toMatchObject({
      result: 160,
      inputs: { grossRequirements: 250, safetyStock: 40, projectedAvailablePrevious: 80, scheduledReceipts: 50 },
    });
  });

  it("keeps the projected balance at or above safety stock", () => {
    const record = timePhaseOrders(
      timePhaseInput({
        startingOnHand: 40,
        grossRequirements: [20, 20, 20, 20, 20, 20, 20, 20],
        safetyStock: 15,
      }),
    );
    expect(Math.min(...record.projectedAvailable)).toBeGreaterThanOrEqual(15);
    expect(record.netRequirements).toEqual([0, 15, 20, 20, 20, 20, 20, 20]);
    expect(record.risk.every((risk) => risk === "OK")).toBe(true);
  });

  it("offsets planned releases by the lead time and drops releases beyond the horizon start", () => {
    const record = timePhaseOrders(
      timePhaseInput({ grossRequirements: [0, 0, 0, 10, 0, 10, 0, 0], leadTimePeriods: 3 }),
    );
    expect(record.plannedReceipts).toEqual([0, 0, 0, 10, 0, 10, 0, 0]);
    expect(record.plannedReleases).toEqual([10, 0, 10, 0, 0, 0, 0, 0]);
  });

  it("cannot cover requirements inside the lead time and reports the shortage", () => {
    const record = timePhaseOrders(
      timePhaseInput({
        startingOnHand: 10,
        grossRequirements: [30, 0, 20, 0, 0, 0, 0, 0],
        leadTimePeriods: 2,
      }),
    );
    // Periods 1 and 2 lie inside the lead time: no receipt possible before period 3.
    expect(record.uncoveredPeriods).toEqual([1]);
    expect(record.projectedAvailable.slice(0, 2)).toEqual([-20, -20]);
    expect(record.risk[0]).toBe("SHORTAGE");
    // Period 3 covers the backlog of 20 plus its own 20.
    expect(record.plannedReceipts[2]).toBe(40);
    expect(record.netRequirements[2]).toBe(20);
    expect(record.projectedAvailable[2]).toBe(0);
  });

  it("plans receipts earlier with a safety lead time", () => {
    const record = timePhaseOrders(
      timePhaseInput({
        grossRequirements: [0, 0, 0, 0, 50, 0, 0, 0],
        leadTimePeriods: 1,
        safetyLeadTimePeriods: 1,
      }),
    );
    expect(record.plannedReceipts[3]).toBe(50); // period 4 instead of 5
    expect(record.plannedReleases[2]).toBe(50); // period 3
    expect(record.projectedAvailable.slice(3, 5)).toEqual([50, 0]);
    expect(record.plannedOrders[0]).toMatchObject({ neededPeriod: 5, receiptPeriod: 4, compressed: false });
  });

  it("compresses the safety lead time when the release would be in the past", () => {
    const record = timePhaseOrders(
      timePhaseInput({
        grossRequirements: [0, 50, 0, 0, 0, 0, 0, 0],
        leadTimePeriods: 1,
        safetyLeadTimePeriods: 1,
      }),
    );
    expect(record.plannedOrders[0]).toMatchObject({ receiptPeriod: 2, releasePeriod: 1, compressed: true });
  });

  it("uses scheduled receipts before planning new orders", () => {
    const record = timePhaseOrders(
      timePhaseInput({
        grossRequirements: [0, 40, 0, 0, 0, 0, 0, 0],
        scheduledReceipts: [0, 50, 0, 0, 0, 0, 0, 0],
      }),
    );
    expect(record.plannedOrders).toHaveLength(0);
    expect(record.projectedAvailable[1]).toBe(10);
  });
});
