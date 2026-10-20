import { describe, expect, it } from "vitest";
import { createGameState, runPlanningVersion, setCapacityAdjustment, startPeriod, updatePlanningParameters } from "../engine/game/gameActions";
import { releasePlannedOrder } from "../engine/game/orderActions";
import { translate } from "../i18n";
import { loadScenario } from "../scenarios";
import { FIXED_TIME, takeInMessages } from "../tests/fixtures";
import { describeDecision } from "./describeDecision";

const scenario = loadScenario("standard");
const T = FIXED_TIME;
const en = (key: string, params?: Record<string, string | number>) => translate("en", key, params);
const sv = (key: string, params?: Record<string, string | number>) => translate("sv", key, params);

const decisions = () => {
  let g = takeInMessages(startPeriod(createGameState(scenario, { gameId: "d", teamName: "D", randomSeed: 1, now: T }), scenario, T));
  g = runPlanningVersion(g, scenario, T);
  g = releasePlannedOrder(g, scenario, "PL-RM1-3", T);
  g = updatePlanningParameters(g, "RM4", { safetyStock: 80 }, T);
  g = updatePlanningParameters(g, "C1", { lotSizingPolicy: { method: "LFL" } }, T);
  g = updatePlanningParameters(g, "RM2", { supplierId: "SUP-CENTRAL" }, T);
  g = setCapacityAdjustment(g, "WC200", 3, { overtimeHours: 2 }, T);
  return g.decisions;
};

describe("readable decision log", () => {
  it("describes each kind of decision in words, without JSON", () => {
    const texts = decisions().map((d) => describeDecision(d, en, scenario));
    expect(texts).toEqual([
      { category: "Release order", object: expect.stringMatching(/^PUR-RM1-1-/), change: "Released 600, due week 3" },
      { category: "Planning parameter", object: "RM4", change: "Safety stock: 30 → 80" },
      { category: "Planning parameter", object: "C1", change: "Lot sizing: FOQ 300 → LFL" },
      { category: "Supplier", object: "RM2", change: "Supplier North → Supplier Central" },
      { category: "Overtime", object: "WC200, week 3", change: "0 h → 2 h" },
    ]);
    for (const text of texts) expect(text.change).not.toMatch(/[{}"]/);
  });

  it("is translated", () => {
    const [release] = decisions().map((d) => describeDecision(d, sv, scenario, "sv"));
    expect(release).toMatchObject({ category: "Frisläpp order", change: "Frisläppt 600 st, klar vecka 3" });
  });
});
