import { describe, expect, it } from "vitest";
import type { GameState } from "../domain/gameState";
import { commitPlan, createGameState, latestVersion, runPlanningVersion, startPeriod } from "../engine/game/gameActions";
import { releaseAllDueOrders } from "../engine/game/orderActions";
import { simulatePeriod } from "../engine/game/weekFlow";
import { isKnownScenario, loadScenario, registerScenario, unregisterScenario } from "../scenarios";
import { FIXED_TIME, takeInMessages } from "../tests/fixtures";
import { decisionsCsv, historiesJson, inventoryHistoryCsv, kpiHistoryCsv, ordersCsv, toCsv } from "./csv";
import { buildExportFile, checksumOf, exportFileName, serializeExportFile } from "./exportGame";
import { parseGameFile } from "./validateSaveFile";

const scenario = loadScenario("standard");
const T = FIXED_TIME;

const playedGame = (): GameState => {
  let game = takeInMessages(
    startPeriod(createGameState(scenario, { gameId: "g-1", teamName: "Team, \"North\"", randomSeed: 9, now: T }), scenario, T),
  );
  game = runPlanningVersion(game, scenario, T);
  game = releaseAllDueOrders(game, scenario, T, "Due now");
  game = runPlanningVersion(game, scenario, T);
  game = commitPlan(game, latestVersion(game)!.id, T);
  return simulatePeriod(game, scenario, T);
};

describe(".mpcgame export and import", () => {
  it("round-trips a game without information loss", () => {
    const game = playedGame();
    const text = serializeExportFile(buildExportFile(game, T));
    const result = parseGameFile(text, isKnownScenario);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.gameState).toEqual(game);
      expect(result.value.exportedAt).toBe(T);
    }
  });

  it("contains the required header fields and a checksum", () => {
    const file = buildExportFile(playedGame(), T);
    expect(file).toMatchObject({
      format: "mpc-planning-game",
      schemaVersion: 1,
      exportedAt: T,
      scenarioId: "standard",
      scenarioVersion: "1.1.0",
    });
    expect(file.checksum).toBe(checksumOf(file.gameState));
    expect(exportFileName(file.gameState)).toBe("Team_North__standard_week1.mpcgame");
  });

  it("never exports a what-if branch marker", () => {
    const game = { ...playedGame(), whatIf: { startedAt: T, basePlanVersionId: null } };
    expect("whatIf" in buildExportFile(game, T).gameState).toBe(false);
  });

  it("rejects damaged, foreign or unsupported files with readable messages", () => {
    const file = buildExportFile(playedGame(), T);
    const errorsOf = (text: string) => {
      const result = parseGameFile(text, isKnownScenario);
      return result.ok ? [] : result.errors;
    };
    expect(errorsOf("not json")[0]).toMatch(/not valid JSON/);
    expect(errorsOf(JSON.stringify({ hello: "world" }))[0]).toMatch(/not an MPC game file/);
    expect(errorsOf(JSON.stringify({ ...file, schemaVersion: 99 }))[0]).toMatch(/newer version/);
    const tampered = { ...file, gameState: { ...file.gameState, teamName: "Someone else" } };
    expect(errorsOf(JSON.stringify(tampered))[0]).toMatch(/integrity check failed/);
    const unknown = { ...file, scenarioId: "nowhere" };
    expect(errorsOf(JSON.stringify(unknown))[0]).toMatch(/not available here/);
    const broken = { ...file.gameState, currentPeriod: -4 };
    const damaged = { ...file, gameState: broken, checksum: checksumOf(broken) };
    expect(errorsOf(JSON.stringify(damaged)).join(" ")).toMatch(/gameState.currentPeriod/);
  });

  it("migrates an older save inside the file", () => {
    const file = buildExportFile(playedGame(), T);
    const { scheduledEffects: _dropped, ...rest } = file.gameState;
    const v1 = { ...rest, saveFileVersion: 1 };
    const old = { ...file, gameState: v1, checksum: checksumOf(v1) };
    const result = parseGameFile(JSON.stringify(old), isKnownScenario);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.gameState.scheduledEffects).toEqual([]);
  });

  it("carries a custom scenario inside the file", () => {
    const custom = { ...structuredClone(scenario), id: "custom-course", version: "2" };
    const game = { ...playedGame(), scenarioId: "custom-course", scenarioVersion: "2" };
    const text = serializeExportFile(buildExportFile(game, T, custom));
    const result = parseGameFile(text, isKnownScenario);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.scenario?.id).toBe("custom-course");
    // Without the embedded scenario the file cannot be used here.
    const withoutScenario = serializeExportFile(buildExportFile(game, T));
    expect(parseGameFile(withoutScenario, isKnownScenario).ok).toBe(false);
  });
});

describe("custom scenarios", () => {
  it("registers a valid scenario and refuses to replace a built-in one", () => {
    expect(registerScenario(scenario)).toMatchObject({ ok: false });
    const custom = { ...structuredClone(scenario), id: "my-course" };
    expect(registerScenario(custom)).toMatchObject({ ok: true });
    expect(isKnownScenario("my-course")).toBe(true);
    expect(loadScenario("my-course").id).toBe("my-course");
    unregisterScenario("my-course");
    expect(isKnownScenario("my-course")).toBe(false);
  });
});

describe("CSV and JSON exports", () => {
  it("escapes commas, quotes and newlines", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], ["line\nbreak", 3]])).toBe(
      'a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",3',
    );
  });

  it("exports KPI, decision, order and inventory histories", () => {
    const game = playedGame();
    const kpis = kpiHistoryCsv(game).split("\r\n");
    expect(kpis[0]).toContain("serviceLevel");
    expect(kpis).toHaveLength(2);
    expect(decisionsCsv(game)).toContain("RELEASE_ORDER");
    expect(decisionsCsv(game)).toContain("Due now");
    expect(ordersCsv(game)).toContain("CO-1001");
    expect(inventoryHistoryCsv(game).split("\r\n")[1]).toMatch(/^1,/);
    expect(JSON.parse(historiesJson(game)).kpiHistory).toHaveLength(1);
  });
});
