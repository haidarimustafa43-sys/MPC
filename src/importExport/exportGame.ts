import type { GameState } from "../domain/gameState";
import type { Scenario } from "../domain/scenario";
import { hashString } from "../engine/events/eventRandom";
import { APPLICATION_VERSION } from "../engine/game/gameActions";

export const EXPORT_SCHEMA_VERSION = 1;
export const GAME_FILE_EXTENSION = ".mpcgame";

/**
 * A complete game as a portable file. The checksum is a simple integrity check
 * (FNV-1a over the serialised game state) that detects accidental damage or
 * editing; it is not a security measure.
 */
export interface GameExportFile {
  format: "mpc-planning-game";
  schemaVersion: number;
  exportedAt: string;
  applicationVersion: string;
  scenarioId: string;
  scenarioVersion: string;
  checksum: string;
  gameState: GameState;
  /** Included for scenarios that are not built into the application. */
  scenario?: Scenario;
}

export const checksumOf = (gameState: unknown): string =>
  hashString(JSON.stringify(gameState)).toString(16).padStart(8, "0");

export const buildExportFile = (game: GameState, now: string, customScenario?: Scenario): GameExportFile => {
  // A what-if branch is never exported; only the live game counts.
  const { whatIf: _branch, ...gameState } = game;
  return {
    format: "mpc-planning-game",
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: now,
    applicationVersion: APPLICATION_VERSION,
    scenarioId: game.scenarioId,
    scenarioVersion: game.scenarioVersion,
    checksum: checksumOf(gameState),
    gameState,
    ...(customScenario ? { scenario: customScenario } : {}),
  };
};

export const serializeExportFile = (file: GameExportFile): string => JSON.stringify(file);

export const exportFileName = (game: GameState): string => {
  const safeTeam = game.teamName.replace(/[^\w-]+/g, "_").slice(0, 40) || "team";
  return `${safeTeam}_${game.scenarioId}_week${game.currentPeriod}${GAME_FILE_EXTENSION}`;
};
