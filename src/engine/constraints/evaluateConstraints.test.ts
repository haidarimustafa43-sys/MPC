import { describe, expect, it } from "vitest";
import { makeItem, planningInput } from "../../tests/fixtures";
import { runPlanning } from "../planning/runPlanning";

const baseInput = () =>
  planningInput({
    periods: [1, 2, 3, 4],
    settings: { ...planningInput().settings, demandTimeFencePeriods: 4 },
    items: [
      makeItem({ id: "A", type: "END_ITEM", leadTimePeriods: 1 }),
      { ...makeItem({ id: "RM", type: "PURCHASED", leadTimePeriods: 3 }), supplierId: "S1" },
    ],
    bom: [{ parentItemId: "A", componentItemId: "RM", quantityPer: 1 }],
    routings: [{ itemId: "A", sequence: 10, workCenterId: "WC1", setupHours: 1, runHoursPerUnit: 1 }],
    workCenters: [{ id: "WC1", name: "WC1", normalCapacityHoursByPeriod: [20] }],
    suppliers: [
      { id: "S1", name: "Supplier North", suppliedItemIds: ["RM"], normalLeadTimePeriods: 3, active: true },
    ],
    customerOrders: [
      {
        id: "CO-1",
        customerName: "Customer Alpha",
        itemId: "A",
        quantity: 30,
        duePeriod: 3,
        sellingPricePerUnit: 100,
        status: "ACCEPTED",
      },
    ],
  });

describe("constraint engine", () => {
  it("reports overload, missing material and customer risk without changing the plan", () => {
    const result = runPlanning(baseInput());
    const types = result.violations.map((v) => v.type);
    // A: 30 needed in period 3 → released in period 2 → 31 h on WC1 (20 h available).
    expect(types).toContain("WORK_CENTER_OVERLOAD");
    const overload = result.violations.find((v) => v.type === "WORK_CENTER_OVERLOAD");
    expect(overload).toMatchObject({ workCenterId: "WC1", period: 2, severity: "CRITICAL" });
    expect(overload?.description).toContain("11 hours");
    expect(overload?.relatedOrderIds).toEqual(["PL-A-3"]);
    // RM is needed in period 2 but cannot arrive before period 4.
    expect(result.violations.find((v) => v.type === "MISSING_MATERIAL")).toMatchObject({
      itemId: "RM",
      period: 2,
      relatedOrderIds: ["PL-A-3"],
    });
    // The planned order is still there: the engine does not resolve the problem.
    expect(result.mrp.records.find((r) => r.itemId === "A")?.plannedOrders).toHaveLength(1);
  });

  it("does not tell the student what to do", () => {
    const result = runPlanning(baseInput());
    for (const violation of result.violations) {
      expect(violation.description).not.toMatch(/\b(move|should|must)\b/i);
    }
  });

  it("flags customer orders at risk when projected availability is negative", () => {
    const input = baseInput();
    // Lead time 3 for the end item makes period 3 unreachable.
    input.items[0] = { ...input.items[0], leadTimePeriods: 3 };
    const result = runPlanning(input);
    expect(result.violations.map((v) => v.type)).toEqual(
      expect.arrayContaining(["INVENTORY_BELOW_ZERO", "CUSTOMER_ORDER_AT_RISK"]),
    );
    expect(result.kpis.ordersAtRisk).toBe(1);
    expect(result.kpis.serviceLevel).toBe(0);
  });

  it("flags an unavailable supplier", () => {
    const input = baseInput();
    input.suppliers = [{ ...input.suppliers[0], active: false }];
    expect(runPlanning(input).violations.map((v) => v.type)).toContain("SUPPLIER_UNAVAILABLE");
  });

  it("blocks planning on an invalid BOM and reports missing routings", () => {
    const input = baseInput();
    input.bom = [...input.bom, { parentItemId: "RM", componentItemId: "A", quantityPer: 1 }];
    input.routings = [];
    const result = runPlanning(input);
    expect(result.violations.find((v) => v.type === "INVALID_BOM")?.severity).toBe("BLOCKING");
    expect(result.violations.map((v) => v.type)).toContain("MISSING_ROUTING");
    expect(result.mrp.records).toHaveLength(0);
  });

  it("sorts violations by severity", () => {
    const severities = runPlanning(baseInput()).violations.map((v) => v.severity);
    const rank = { BLOCKING: 0, CRITICAL: 1, WARNING: 2, INFO: 3 };
    expect([...severities].sort((a, b) => rank[a] - rank[b])).toEqual(severities);
  });
});
