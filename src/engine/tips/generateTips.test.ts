import { describe, expect, it } from "vitest";
import { createGameState, runPlanningVersion, startPeriod, setCapacityAdjustment } from "../game/gameActions";
import { loadScenario } from "../../scenarios";
import { FIXED_TIME, takeInMessages } from "../../tests/fixtures";
import { whereUsedPaths, whereUsedText } from "../../utils/bom";
import { generateTips } from "./generateTips";

const scenario = loadScenario("standard");
const T = FIXED_TIME;
const started = () =>
  takeInMessages(startPeriod(createGameState(scenario, { gameId: "t", teamName: "T", randomSeed: 1, now: T }), scenario, T));
const ids = (game: ReturnType<typeof started>) => generateTips(game, scenario).map((tip) => tip.id);

describe("tips", () => {
  it("asks to run planning before anything else", () => {
    expect(ids(started())).toEqual(["noPlan"]);
  });

  it("points at an overload and the due orders, as questions about where to look", () => {
    const game = runPlanningVersion(started(), scenario, T);
    const tips = generateTips(game, scenario);
    expect(tips.map((tip) => tip.id)).toEqual(expect.arrayContaining(["overload-WC200", "due"]));
    const overload = tips.find((tip) => tip.id === "overload-WC200")!;
    expect(overload).toMatchObject({ key: "tip.overload", params: { workCenter: "WC200", period: 3, hours: 1 } });
    expect(overload.pages).toEqual(["dashboard", "capacity", "orders"]);
  });

  it("drops a tip when the problem is solved", () => {
    let game = runPlanningVersion(started(), scenario, T);
    game = runPlanningVersion(setCapacityAdjustment(game, "WC200", 3, { overtimeHours: 1 }, T), scenario, T);
    expect(ids(game)).not.toContain("overload-WC200");
  });

  it("says the plan is out of date after a change", () => {
    let game = runPlanningVersion(started(), scenario, T);
    game = setCapacityAdjustment(game, "WC200", 3, { overtimeHours: 1 }, T);
    expect(ids(game)).toContain("stale");
  });
});

describe("where-used paths", () => {
  it("follows an item up to the end products", () => {
    const paths = whereUsedPaths(scenario.bom, "RM2");
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((path) => path.length >= 2)).toBe(true);
    expect(whereUsedText(scenario.bom, "RM2")).toMatch(/→ (A|B)/);
    expect(whereUsedPaths(scenario.bom, "A")).toEqual([[]]);
  });
});
