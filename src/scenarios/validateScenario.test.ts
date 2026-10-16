import { describe, expect, it } from "vitest";
import { loadScenario, ScenarioError } from ".";
import { validateScenario } from "./validateScenario";

describe("scenario loading and validation", () => {
  const scenario = loadScenario("standard");

  it("loads the standard scenario and meets the minimum content requirements", () => {
    expect(scenario.items.filter((i) => i.type === "END_ITEM").map((i) => i.id)).toEqual(["A", "B"]);
    expect(scenario.items.filter((i) => i.type === "PURCHASED").length).toBeGreaterThanOrEqual(3);
    expect(scenario.workCenters.length).toBeGreaterThanOrEqual(3);
    expect(new Set(scenario.forecasts.map((f) => f.period)).size).toBeGreaterThanOrEqual(12);
    const rm2Suppliers = scenario.suppliers.filter((s) => s.suppliedItemIds.includes("RM2"));
    expect(rm2Suppliers.map((s) => s.name)).toEqual(["Supplier North", "Supplier Central"]);
    expect(scenario.events.length).toBeGreaterThanOrEqual(3);
  });

  it("throws a readable error for an unknown scenario", () => {
    expect(() => loadScenario("missing")).toThrow(ScenarioError);
  });

  it("reports schema errors with their path", () => {
    const broken = structuredClone(scenario) as unknown as Record<string, unknown>;
    (broken.items as Record<string, unknown>[])[0].lotSizingPolicy = { method: "FOQ" };
    const result = validateScenario(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("items.0.lotSizingPolicy.quantity");
  });

  it("reports broken references and cyclic BOMs", () => {
    const broken = structuredClone(scenario);
    broken.routings.push({ itemId: "A", sequence: 99, workCenterId: "WC999", setupHours: 1, runHoursPerUnit: 1 });
    broken.bom.push({ parentItemId: "C3", componentItemId: "C2", quantityPer: 1 });
    const result = validateScenario(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("Routing of A refers to unknown work centre WC999.");
      expect(result.errors.some((error) => error.startsWith("Cyclic BOM"))).toBe(true);
    }
  });
});
