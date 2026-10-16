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

interface MpcDatabase extends DBSchema {
  saves: {
    key: string;
    value: SaveRecord;
    indexes: { "by-updated": string };
  };
}

export const DATABASE_NAME = "mpc-planning-game";
const DATABASE_VERSION = 1;

let connection: Promise<IDBPDatabase<MpcDatabase>> | null = null;

export const getDatabase = (): Promise<IDBPDatabase<MpcDatabase>> => {
  connection ??= openDB<MpcDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore("saves", { keyPath: "id" });
      store.createIndex("by-updated", "updatedAt");
    },
  });
  return connection;
};

/** For tests: forget the cached connection so a fresh fake database can be used. */
export const closeDatabase = async (): Promise<void> => {
  if (connection) (await connection).close();
  connection = null;
};
