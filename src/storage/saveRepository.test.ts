import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGameState, runPlanningVersion, startPeriod } from "../engine/game/gameActions";
import { loadScenario } from "../scenarios";
import { FIXED_TIME, takeInMessages } from "../tests/fixtures";
import { closeDatabase } from "./database";
import { migrateGameState, SaveFileError } from "./migrations";
import { deleteSave, duplicateSave, listSaves, loadGame, renameSave, saveGame } from "./saveRepository";

const scenario = loadScenario("standard");
const game = (id: string, updatedAt = FIXED_TIME) => ({
  ...createGameState(scenario, { gameId: id, teamName: `Team ${id}`, randomSeed: 1, now: FIXED_TIME }),
  updatedAt,
});

describe("save repository (IndexedDB)", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });
  afterEach(async () => {
    await closeDatabase();
  });

  it("saves and loads a game without information loss", async () => {
    const played = runPlanningVersion(takeInMessages(startPeriod(game("g1"), scenario, FIXED_TIME)), scenario, FIXED_TIME);
    await saveGame(played);
    expect(await loadGame("g1")).toEqual(played);
  });

  it("lists, renames, duplicates and deletes saves", async () => {
    await saveGame(game("g1", "2026-01-01T00:00:00.000Z"));
    await saveGame(game("g2", "2026-01-02T00:00:00.000Z"));
    expect((await listSaves()).map((s) => s.id)).toEqual(["g2", "g1"]);

    await renameSave("g1", "Renamed");
    expect((await listSaves()).find((s) => s.id === "g1")?.name).toBe("Renamed");

    await duplicateSave("g1", "g3", "2026-01-03T00:00:00.000Z");
    const copy = await loadGame("g3");
    expect(copy?.gameId).toBe("g3");
    expect((await listSaves())[0]).toMatchObject({ id: "g3", name: "Renamed (copy)" });

    await deleteSave("g2");
    expect((await listSaves()).map((s) => s.id).sort()).toEqual(["g1", "g3"]);
  });

  it("returns null for a missing save", async () => {
    expect(await loadGame("nope")).toBeNull();
  });
});

describe("save-file migration and validation", () => {
  it("accepts the current version", () => {
    const state = game("g1");
    expect(migrateGameState(structuredClone(state))).toEqual(state);
  });

  it("rejects broken data with readable messages", () => {
    expect(() => migrateGameState(null)).toThrow(SaveFileError);
    expect(() => migrateGameState({ saveFileVersion: "1" })).toThrow(/saveFileVersion/);
    expect(() => migrateGameState({ saveFileVersion: 99 })).toThrow(/newer version/);
    expect(() => migrateGameState({ saveFileVersion: 1, gameId: "x" })).toThrow(/missing required fields/);
  });
});
