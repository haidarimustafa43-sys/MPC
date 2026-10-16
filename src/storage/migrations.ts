import type { GameState } from "../domain/gameState";
import { SAVE_FILE_VERSION } from "../engine/game/gameActions";

export class SaveFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveFileError";
  }
}

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/**
 * migrations[n] upgrades a save from version n to n + 1. Add an entry here
 * whenever GameState changes shape, and bump SAVE_FILE_VERSION.
 */
const migrations: Record<number, Migration> = {};

const REQUIRED_FIELDS: (keyof GameState)[] = [
  "saveFileVersion",
  "gameId",
  "teamName",
  "scenarioId",
  "scenarioVersion",
  "randomSeed",
  "currentPeriod",
  "gameStatus",
  "inventory",
  "forecast",
  "customerOrders",
  "releasedOrders",
  "planningParameters",
  "planningVersions",
  "decisions",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const migrateGameState = (raw: unknown): GameState => {
  if (!isRecord(raw)) throw new SaveFileError("The saved game is not an object.");
  let state = raw;
  let version = state.saveFileVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new SaveFileError("The saved game has no valid saveFileVersion.");
  }
  if (version > SAVE_FILE_VERSION) {
    throw new SaveFileError(
      `The saved game was created by a newer version of the application (save version ${version}).`,
    );
  }
  while (version < SAVE_FILE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) throw new SaveFileError(`No migration from save version ${version}.`);
    state = migrate(state);
    version += 1;
    state = { ...state, saveFileVersion: version };
  }
  const missing = REQUIRED_FIELDS.filter((field) => !(field in state));
  if (missing.length > 0) {
    throw new SaveFileError(`The saved game is missing required fields: ${missing.join(", ")}.`);
  }
  return state as unknown as GameState;
};
