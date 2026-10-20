import { z } from "zod";
import type { GameState } from "../domain/gameState";
import type { Scenario } from "../domain/scenario";
import { scenarioSchema } from "../scenarios/schema";
import { referentialErrors } from "../scenarios/validateScenario";
import { migrateGameState, SaveFileError } from "../storage/migrations";
import { checksumOf, EXPORT_SCHEMA_VERSION } from "./exportGame";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface ImportedGame {
  gameState: GameState;
  exportedAt: string;
  scenario?: Scenario;
}

export type ImportResult = { ok: true; value: ImportedGame } | { ok: false, errors: string[] };

const envelopeSchema = z.object({
  format: z.literal("mpc-planning-game"),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string().min(1),
  applicationVersion: z.string(),
  scenarioId: z.string().min(1),
  scenarioVersion: z.string().min(1),
  checksum: z.string().regex(/^[0-9a-f]{8}$/),
  gameState: z.record(z.unknown()),
  scenario: z.unknown().optional(),
});

const nonNegativeInt = z.number().int().min(0);

/**
 * Structural check of the parts of a game state the application relies on.
 * Unknown extra fields are kept; wrong types and impossible values are rejected.
 */
const gameStateShape = z
  .object({
    gameId: z.string().min(1).max(200),
    teamName: z.string().max(200),
    scenarioId: z.string().min(1),
    currentPeriod: z.number().int().min(1).max(1000),
    gameStatus: z.enum([
      "NOT_STARTED",
      "PERIOD_START",
      "EVENTS_PENDING",
      "ANALYSIS",
      "PLANNING_DIRTY",
      "PLAN_CALCULATED",
      "PLAN_COMMITTED",
      "PERIOD_SIMULATED",
      "PERIOD_REVIEW",
      "GAME_COMPLETED",
    ]),
    randomSeed: z.number().finite(),
    inventory: z.array(
      z.object({ itemId: z.string(), warehouseId: z.string(), quantityOnHand: z.number().finite().min(0), allocatedQuantity: z.number().finite() }).passthrough(),
    ),
    customerOrders: z.array(z.object({ id: z.string(), itemId: z.string(), quantity: z.number().finite().positive(), duePeriod: nonNegativeInt }).passthrough()),
    releasedOrders: z.array(
      z.object({ id: z.string(), kind: z.enum(["PRODUCTION", "PURCHASE"]), itemId: z.string(), quantity: z.number().finite().positive() }).passthrough(),
    ),
    planningVersions: z.array(z.object({ id: z.string(), period: nonNegativeInt }).passthrough()),
    decisions: z.array(z.object({ id: z.string(), period: nonNegativeInt, category: z.string() }).passthrough()),
    inboxMessages: z.array(z.object({ id: z.string(), status: z.string() }).passthrough()),
    completedPeriods: z.array(z.object({ period: nonNegativeInt }).passthrough()),
    kpiHistory: z.array(z.object({ period: nonNegativeInt, kpis: z.record(z.number()) }).passthrough()),
  })
  .passthrough();

const issues = (error: z.ZodError, prefix: string): string[] =>
  error.issues.slice(0, 10).map((issue) => `${prefix}${issue.path.join(".") || "(root)"}: ${issue.message}`);

/**
 * Validates an exported game file. The text is only parsed as JSON, never
 * executed. Checks: size, format and schema version, required fields, checksum,
 * scenario (built-in or embedded and valid), save-file migration, and the
 * structure of the game state.
 */
export const parseGameFile = (
  text: string,
  isKnownScenario: (id: string) => boolean,
): ImportResult => {
  if (text.length > MAX_FILE_BYTES) return { ok: false, errors: ["The file is too large to be a game file."] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON. Is it an .mpcgame file?"] };
  }
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return { ok: false, errors: ["The file is not an MPC game file.", ...issues(envelope.error, "")] };
  }
  const file = envelope.data;
  if (file.schemaVersion > EXPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`The file was exported by a newer version of the application (file schema ${file.schemaVersion}).`],
    };
  }
  if (checksumOf(file.gameState) !== file.checksum) {
    return { ok: false, errors: ["The integrity check failed: the file has been changed or damaged."] };
  }

  let scenario: Scenario | undefined;
  if (file.scenario !== undefined) {
    const parsed = scenarioSchema.safeParse(file.scenario);
    if (!parsed.success) return { ok: false, errors: ["The embedded scenario is invalid.", ...issues(parsed.error, "scenario.")] };
    const referential = referentialErrors(parsed.data);
    if (referential.length > 0) return { ok: false, errors: ["The embedded scenario is invalid.", ...referential] };
    scenario = parsed.data;
  } else if (!isKnownScenario(file.scenarioId)) {
    return { ok: false, errors: [`The game uses scenario "${file.scenarioId}", which is not available here.`] };
  }

  let gameState: GameState;
  try {
    gameState = migrateGameState(file.gameState);
  } catch (error) {
    return { ok: false, errors: [error instanceof SaveFileError ? error.message : "The game state could not be read."] };
  }
  const shape = gameStateShape.safeParse(gameState);
  if (!shape.success) return { ok: false, errors: ["The game state is damaged.", ...issues(shape.error, "gameState.")] };
  if (gameState.scenarioId !== file.scenarioId) {
    return { ok: false, errors: ["The scenario in the file header does not match the game state."] };
  }
  return { ok: true, value: { gameState, exportedAt: file.exportedAt, scenario } };
};
