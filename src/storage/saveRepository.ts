import type { GameState } from "../domain/gameState";
import type { SaveRecord } from "./database";
import { getDatabase } from "./database";
import { migrateGameState } from "./migrations";

export type SaveSummary = Omit<SaveRecord, "state">;

const toRecord = (state: GameState, name: string): SaveRecord => ({
  id: state.gameId,
  name,
  teamName: state.teamName,
  scenarioId: state.scenarioId,
  currentPeriod: state.currentPeriod,
  createdAt: state.createdAt,
  updatedAt: state.updatedAt,
  state,
});

const summarize = ({ state: _state, ...summary }: SaveRecord): SaveSummary => summary;

export const saveGame = async (state: GameState, name?: string): Promise<void> => {
  const db = await getDatabase();
  const existing = await db.get("saves", state.gameId);
  await db.put("saves", toRecord(state, name ?? existing?.name ?? state.teamName));
};

export const loadGame = async (id: string): Promise<GameState | null> => {
  const record = await (await getDatabase()).get("saves", id);
  return record ? migrateGameState(record.state) : null;
};

export const listSaves = async (): Promise<SaveSummary[]> => {
  const records = await (await getDatabase()).getAll("saves");
  return records.map(summarize).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const renameSave = async (id: string, name: string): Promise<void> => {
  const db = await getDatabase();
  const record = await db.get("saves", id);
  if (record) await db.put("saves", { ...record, name });
};

export const duplicateSave = async (id: string, newId: string, now: string): Promise<string | null> => {
  const db = await getDatabase();
  const record = await db.get("saves", id);
  if (!record) return null;
  const state = migrateGameState(record.state);
  const copy: GameState = { ...structuredClone(state), gameId: newId, updatedAt: now };
  await db.put("saves", toRecord(copy, `${record.name} (copy)`));
  return newId;
};

export const deleteSave = async (id: string): Promise<void> => {
  await (await getDatabase()).delete("saves", id);
};
