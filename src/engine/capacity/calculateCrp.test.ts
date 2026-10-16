import { describe, expect, it } from "vitest";
import type { WorkCenter } from "../../domain/workCenter";
import { makeItem, planningInput } from "../../tests/fixtures";
import { calculateMps } from "../mps/calculateMps";
import { capacityAvailability } from "./capacityAvailability";
import type { LoadableOrder } from "./calculateCrp";
import { calculateCrp, operationLoad, operationPeriod } from "./calculateCrp";
import { billOfResources, calculateRccp } from "./calculateRccp";

const wc: WorkCenter = {
  id: "WC1",
  name: "Assembly",
  normalCapacityHoursByPeriod: [40, 40, 30],
  overtimeCapacityLimitHours: 8,
  overtimeCostPerHour: 500,
};

const order = (overrides: Partial<LoadableOrder> = {}): LoadableOrder => ({
  orderId: "PL-A-2",
  itemId: "A",
  orderType: "PLANNED",
  started: false,
  quantity: 100,
  releasePeriod: 1,
  duePeriod: 2,
  ...overrides,
});

describe("capacity load", () => {
  it("is setup time per order plus quantity × run time", () => {
    expect(operationLoad({ itemId: "A", sequence: 10, workCenterId: "WC1", setupHours: 2, runHoursPerUnit: 0.15 }, 100))
      .toEqual({ setupHours: 2, runHours: 15, totalHours: 17 });
  });

  it("accounts for yield", () => {
    const load = operationLoad(
      { itemId: "A", sequence: 10, workCenterId: "WC1", setupHours: 0, runHoursPerUnit: 1, yieldRate: 0.8 },
      80,
    );
    expect(load.runHours).toBeCloseTo(100);
  });

  it("spreads operations over the lead time", () => {
    const o = order({ releasePeriod: 2, duePeriod: 4 });
    expect([0, 1, 2].map((index) => operationPeriod(o, index, 3))).toEqual([2, 2, 3]);
    expect(operationPeriod(order({ releasePeriod: 3, duePeriod: 3 }), 1, 2)).toBe(3);
  });
});

describe("capacity availability", () => {
  it("adds capped overtime and external hours and applies the capacity factor", () => {
    const result = capacityAvailability(wc, 2, [
      { workCenterId: "WC1", period: 2, capacityFactor: 0.6, overtimeHours: 20, externalHours: 5 },
    ]);
    expect(result.overtimeHours).toBe(8); // capped by the limit
    expect(result.availableHours).toBe(40 * 0.6 + 8 + 5);
  });

  it("repeats the last defined capacity beyond the array", () => {
    expect(capacityAvailability(wc, 9, []).normalCapacityHours).toBe(30);
  });
});

describe("CRP", () => {
  const input = planningInput({
    periods: [1, 2, 3],
    workCenters: [wc],
    routings: [
      { itemId: "A", sequence: 10, workCenterId: "WC1", setupHours: 4, runHoursPerUnit: 0.4 },
    ],
  });

  it("aggregates load per work centre and period and lists contributing orders", () => {
    const crp = calculateCrp(input, [order(), order({ orderId: "PL-A-3", releasePeriod: 1, quantity: 20 })]);
    const bucket = crp.buckets.find((b) => b.period === 1);
    expect(bucket?.loadHours).toBe(4 + 40 + 4 + 8);
    expect(bucket?.balanceHours).toBe(40 - 56);
    expect(bucket?.utilization).toBeCloseTo(1.4);
    expect(bucket?.contributions.map((c) => c.orderId)).toEqual(["PL-A-2", "PL-A-3"]);
  });

  it("overtime removes an overload", () => {
    const withOvertime = {
      ...input,
      capacityAdjustments: [{ workCenterId: "WC1", period: 1, capacityFactor: 1, overtimeHours: 8, externalHours: 0 }],
    };
    const bucket = calculateCrp(withOvertime, [order({ quantity: 110 })]).buckets[0];
    expect(bucket.loadHours).toBe(48);
    expect(bucket.availableHours).toBe(48);
    expect(bucket.balanceHours).toBe(0);
  });

  it("loads released but unstarted work in the current period and skips completed operations", () => {
    const late = calculateCrp({ ...input, currentPeriod: 2, periods: [2, 3] }, [
      order({ orderId: "PRD-1", orderType: "RELEASED", releasePeriod: 1, started: false }),
      order({ orderId: "PRD-2", orderType: "RELEASED", releasePeriod: 1, started: true }),
    ]);
    expect(late.buckets[0].contributions.map((c) => c.orderId)).toEqual(["PRD-1"]);
  });
});

describe("RCCP", () => {
  it("uses a bill of resources across the BOM", () => {
    const input = planningInput({
      periods: [1, 2],
      items: [makeItem({ id: "A", type: "END_ITEM" }), makeItem({ id: "C" })],
      bom: [{ parentItemId: "A", componentItemId: "C", quantityPer: 2 }],
      workCenters: [wc],
      routings: [
        { itemId: "A", sequence: 10, workCenterId: "WC1", setupHours: 5, runHoursPerUnit: 0.5 },
        { itemId: "C", sequence: 10, workCenterId: "WC1", setupHours: 5, runHoursPerUnit: 0.25 },
      ],
      forecast: [{ itemId: "A", period: 2, quantity: 10 }],
      settings: { ...planningInput().settings, demandTimeFencePeriods: 0 },
    });
    expect(billOfResources(input, "A")).toEqual({ WC1: 1 });
    const rccp = calculateRccp(input, calculateMps(input));
    expect(rccp.buckets.map((b) => b.loadHours)).toEqual([0, 10]);
  });
});
