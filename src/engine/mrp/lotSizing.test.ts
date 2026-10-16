import { describe, expect, it } from "vitest";
import type { LotSizingContext } from "./lotSizing";
import {
  calculateLotSize,
  economicOrderQuantity,
  fixedOrderQuantity,
  fixedPeriodRequirement,
  lotForLot,
  orderMultiple,
  periodOrderQuantity,
} from "./lotSizing";

const ctx = (overrides: Partial<LotSizingContext> = {}): LotSizingContext => ({
  netRequirement: 70,
  periodIndex: 0,
  grossRequirements: [100, 50, 80, 40],
  scheduledReceipts: [0, 0, 0, 0],
  orderCost: 100,
  holdingCostPerUnitPeriod: 1,
  ...overrides,
});

describe("lot sizing", () => {
  it("LFL orders exactly the net requirement", () => {
    expect(lotForLot(ctx()).quantity).toBe(70);
  });

  it("FOQ orders one fixed lot when it covers the requirement", () => {
    expect(fixedOrderQuantity(ctx(), 200).quantity).toBe(200);
  });

  it("FOQ combines several lots when one is not enough", () => {
    const result = fixedOrderQuantity(ctx({ netRequirement: 450 }), 200);
    expect(result.quantity).toBe(600);
    expect(result.trace.intermediateValues?.lots).toBe(3);
  });

  it("FPR covers the net requirement plus the following periods", () => {
    // 70 now + 50 + 80 in the next two periods
    expect(fixedPeriodRequirement(ctx(), 3).quantity).toBe(200);
  });

  it("FPR subtracts scheduled receipts in the covered periods", () => {
    const result = fixedPeriodRequirement(ctx({ scheduledReceipts: [0, 30, 0, 0] }), 2);
    expect(result.quantity).toBe(90);
  });

  it("FPR never orders less than the net requirement", () => {
    const result = fixedPeriodRequirement(ctx({ scheduledReceipts: [0, 500, 0, 0] }), 2);
    expect(result.quantity).toBe(70);
  });

  it("FPR stops at the end of the horizon", () => {
    expect(fixedPeriodRequirement(ctx({ periodIndex: 3, netRequirement: 40 }), 4).quantity).toBe(40);
  });

  it("MULTIPLE rounds up to the order multiple", () => {
    expect(orderMultiple(ctx(), 25).quantity).toBe(75);
    expect(orderMultiple(ctx({ netRequirement: 75 }), 25).quantity).toBe(75);
  });

  it("MULTIPLE respects a minimum quantity", () => {
    expect(orderMultiple(ctx({ netRequirement: 10 }), 25, 60).quantity).toBe(75);
  });

  it("EOQ follows sqrt(2DS/H)", () => {
    expect(economicOrderQuantity(100, 50, 1)).toBeCloseTo(100);
    expect(economicOrderQuantity(0, 50, 1)).toBeNull();
    expect(economicOrderQuantity(100, 50, 0)).toBeNull();
  });

  it("EOQ policy orders max(net, ceil(EOQ))", () => {
    // D = average(100, 50, 80, 40) = 67.5; EOQ = sqrt(2 * 67.5 * 100 / 1) ≈ 116.2
    expect(calculateLotSize({ method: "EOQ" }, ctx()).quantity).toBe(117);
    expect(calculateLotSize({ method: "EOQ" }, ctx({ netRequirement: 300 })).quantity).toBe(300);
  });

  it("POQ derives the number of periods from EOQ / D", () => {
    // EOQ / D = 116.2 / 67.5 ≈ 1.72 → 2 periods → 70 + 50
    const result = periodOrderQuantity(ctx());
    expect(result.trace.inputs.coveredPeriods).toBe(2);
    expect(result.quantity).toBe(120);
  });

  it("EOQ and POQ fall back to LFL without cost data", () => {
    const noCost = ctx({ orderCost: 0 });
    expect(calculateLotSize({ method: "EOQ" }, noCost)).toMatchObject({
      quantity: 70,
      trace: { explanationKey: "lot.EOQ_FALLBACK" },
    });
    expect(calculateLotSize({ method: "POQ" }, noCost).trace.explanationKey).toBe("lot.POQ_FALLBACK");
  });
});
