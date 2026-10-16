import { describe, expect, it } from "vitest";
import type { BomLine } from "../../domain/bom";
import { makeItem } from "../../tests/fixtures";
import {
  componentQuantity,
  computeLowLevelCodes,
  explodeQuantity,
  explodeReleases,
  findBomCycles,
  validateBom,
} from "./explodeBom";

const bom: BomLine[] = [
  { parentItemId: "A", componentItemId: "C1", quantityPer: 2 },
  { parentItemId: "A", componentItemId: "C2", quantityPer: 1 },
  { parentItemId: "C2", componentItemId: "C1", quantityPer: 3 },
  { parentItemId: "C1", componentItemId: "RM", quantityPer: 0.5, scrapRate: 0.1 },
];
const items = [
  makeItem({ id: "A", type: "END_ITEM" }),
  makeItem({ id: "C1", type: "MANUFACTURED" }),
  makeItem({ id: "C2", type: "MANUFACTURED" }),
  makeItem({ id: "RM", type: "PURCHASED" }),
];

describe("BOM explosion", () => {
  it("explodes several levels with quantity per and scrap", () => {
    const totals = explodeQuantity(bom, "A", 10);
    expect(totals.C2).toBe(10);
    // C1: 10 × 2 directly + 10 × 1 × 3 via C2 = 50
    expect(totals.C1).toBe(50);
    // RM: 50 × 0.5 × 1.1 = 27.5
    expect(totals.RM).toBeCloseTo(27.5);
  });

  it("rounds component requirements up per order", () => {
    expect(componentQuantity(bom[3], 10)).toBe(6); // 10 × 0.5 × 1.1 = 5.5 → 6
    expect(componentQuantity(bom[0], 10)).toBe(20);
  });

  it("creates component demand in the parent's release period", () => {
    const demand = explodeReleases(bom, [
      { orderId: "PL-A-5", parentItemId: "A", releasePeriod: 4, quantity: 10 },
    ]);
    expect(demand).toEqual([
      { componentItemId: "C1", period: 4, quantity: 20, parentItemId: "A", sourceOrderId: "PL-A-5" },
      { componentItemId: "C2", period: 4, quantity: 10, parentItemId: "A", sourceOrderId: "PL-A-5" },
    ]);
  });

  it("respects BOM effectivity", () => {
    const limited: BomLine[] = [
      { parentItemId: "A", componentItemId: "OLD", quantityPer: 1, effectiveToPeriod: 3 },
      { parentItemId: "A", componentItemId: "NEW", quantityPer: 1, effectiveFromPeriod: 4 },
    ];
    const early = explodeReleases(limited, [{ orderId: "x", parentItemId: "A", releasePeriod: 2, quantity: 1 }]);
    const late = explodeReleases(limited, [{ orderId: "y", parentItemId: "A", releasePeriod: 5, quantity: 1 }]);
    expect(early.map((d) => d.componentItemId)).toEqual(["OLD"]);
    expect(late.map((d) => d.componentItemId)).toEqual(["NEW"]);
  });

  it("computes low-level codes from the deepest occurrence", () => {
    // C1 is on level 1 under A but on level 2 under C2, so its code is 2.
    expect(computeLowLevelCodes(items, bom)).toEqual({ A: 0, C2: 1, C1: 2, RM: 3 });
  });
});

describe("BOM validation", () => {
  it("accepts a valid BOM", () => {
    expect(validateBom(items, bom)).toEqual([]);
  });

  it("detects cycles", () => {
    const cyclic: BomLine[] = [
      ...bom,
      { parentItemId: "RM", componentItemId: "A", quantityPer: 1 },
    ];
    expect(findBomCycles(cyclic)).toContainEqual(["A", "C1", "RM", "A"]);
    const errors = validateBom(
      items.map((item) => (item.id === "RM" ? { ...item, type: "MANUFACTURED" as const } : item)),
      cyclic,
    );
    expect(errors.map((error) => error.code)).toContain("CYCLE");
  });

  it("detects self references, unknown items and purchased parents", () => {
    const broken: BomLine[] = [
      { parentItemId: "C1", componentItemId: "C1", quantityPer: 1 },
      { parentItemId: "A", componentItemId: "GHOST", quantityPer: 1 },
      { parentItemId: "RM", componentItemId: "C2", quantityPer: 1 },
    ];
    const codes = validateBom(items, broken).map((error) => error.code);
    expect(codes).toEqual(expect.arrayContaining(["CYCLE", "UNKNOWN_COMPONENT", "PURCHASED_PARENT"]));
  });

  it("terminates low-level coding even for a cyclic BOM", () => {
    const cyclic: BomLine[] = [
      { parentItemId: "A", componentItemId: "C1", quantityPer: 1 },
      { parentItemId: "C1", componentItemId: "C2", quantityPer: 1 },
      { parentItemId: "C2", componentItemId: "C1", quantityPer: 1 },
    ];
    expect(() => computeLowLevelCodes(items, cyclic)).not.toThrow();
  });
});
