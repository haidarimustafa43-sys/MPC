import type { DBSchema, IDBPDatabase } from "idb";
import { openDB } from "idb";

export interface SaveRecord {
  id: string;
  name: string;
  teamName: string;
  scenarioId: string;
  currentPeriod: number;
  createdAt: string;
  updatedAt: string;
  /** Serialised GameState; parsed and migrated on load. */
  state: unknown;
}

/** A teacher-provided scenario, stored as validated JSON. */
export interface ScenarioRecord {
  id: string;
  importedAt: string;
  scenario: unknown;
}

interface MpcDatabase extends DBSchema {
  saves: {
    key: string;
    value: SaveRecord;
    indexes: { "by-updated": string };
  };
  scenarios: {
    key: string;
    value: ScenarioRecord;
  };
}

export const DATABASE_NAME = "mpc-planning-game";
const DATABASE_VERSION = 2;

let connection: Promise<IDBPDatabase<MpcDatabase>> | null = null;

export const getDatabase = (): Promise<IDBPDatabase<MpcDatabase>> => {
  connection ??= openDB<MpcDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const store = db.createObjectStore("saves", { keyPath: "id" });
        store.createIndex("by-updated", "updatedAt");
      }
      if (oldVersion < 2) db.createObjectStore("scenarios", { keyPath: "id" });
    },
  });
  return connection;
};

/** For tests: forget the cached connection so a fresh fake database can be used. */
export const closeDatabase = async (): Promise<void> => {
  if (connection) (await connection).close();
  connection = null;
};
