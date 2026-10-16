import { create } from "zustand";
import type { Language } from "../domain/common";
import type { GameState } from "../domain/gameState";
import type { ItemPlanningParameters } from "../domain/planningVersion";
import type { Scenario } from "../domain/scenario";
import {
  commitPlan,
  createGameState,
  resetWorkingPlan,
  runPlanningVersion,
  setCapacityAdjustment,
  startPeriod,
  updatePlanningParameters,
} from "../engine/game/gameActions";
import { InvalidTransitionError } from "../engine/game/stateMachine";
import { translate } from "../i18n";
import { loadScenario } from "../scenarios";
import {
  deleteSave,
  duplicateSave,
  listSaves,
  loadGame,
  renameSave,
  saveGame,
  type SaveSummary,
} from "../storage/saveRepository";
import { getActiveGameId, getStoredLanguage, setActiveGameId, setStoredLanguage } from "../storage/settings";
import { generateId } from "../utils/format";
import { newSeed } from "../utils/random";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface GameStoreState {
  initialized: boolean;
  language: Language;
  scenario: Scenario | null;
  game: GameState | null;
  saves: SaveSummary[];
  saveStatus: SaveStatus;
  error: string | null;
}

interface GameStoreActions {
  init: () => Promise<void>;
  refreshSaves: () => Promise<void>;
  newGame: (teamName: string, scenarioId: string) => Promise<void>;
  openGame: (id: string) => Promise<void>;
  closeGame: () => void;
  renameSave: (id: string, name: string) => Promise<void>;
  duplicateSave: (id: string) => Promise<void>;
  deleteSave: (id: string) => Promise<void>;
  setLanguage: (language: Language) => void;
  clearError: () => void;
  startWeek: () => void;
  updateParameters: (itemId: string, patch: Partial<ItemPlanningParameters>, reason?: string) => void;
  setCapacity: (
    workCenterId: string,
    period: number,
    patch: { overtimeHours?: number; externalHours?: number },
    reason?: string,
  ) => void;
  runPlanning: () => void;
  commitPlan: (versionId: string) => void;
  resetWorkingPlan: () => void;
}

export type GameStore = GameStoreState & GameStoreActions;

const now = (): string => new Date().toISOString();

const describeError = (error: unknown, language: Language): string => {
  if (error instanceof InvalidTransitionError) return translate(language, error.reasonKey);
  if (error instanceof Error) return error.message;
  return String(error);
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useGameStore = create<GameStore>()((set, get) => {
  /** Autosave is debounced so a burst of edits becomes one IndexedDB write. */
  const scheduleSave = (game: GameState): void => {
    set({ saveStatus: "saving" });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveGame(game)
        .then(() => {
          if (get().game?.gameId === game.gameId) set({ saveStatus: "saved" });
          return get().refreshSaves();
        })
        .catch(() => set({ saveStatus: "error" }));
    }, 300);
  };

  /** Central error handling for all game mutations. */
  const mutate = (change: (game: GameState, scenario: Scenario) => GameState): void => {
    const { game, scenario, language } = get();
    if (!game || !scenario) return;
    try {
      const next = change(game, scenario);
      if (next === game) return;
      set({ game: next, error: null });
      scheduleSave(next);
    } catch (error) {
      set({ error: describeError(error, language) });
    }
  };

  const activate = (game: GameState): void => {
    const scenario = loadScenario(game.scenarioId);
    setActiveGameId(game.gameId);
    set({ game, scenario, error: null, saveStatus: "saved" });
  };

  return {
    initialized: false,
    language: "en",
    scenario: null,
    game: null,
    saves: [],
    saveStatus: "idle",
    error: null,

    init: async () => {
      set({ language: getStoredLanguage() });
      try {
        await get().refreshSaves();
        const activeId = getActiveGameId();
        if (activeId) {
          const game = await loadGame(activeId);
          if (game) activate(game);
        }
      } catch (error) {
        set({ error: describeError(error, get().language) });
      } finally {
        set({ initialized: true });
      }
    },

    refreshSaves: async () => {
      set({ saves: await listSaves() });
    },

    newGame: async (teamName, scenarioId) => {
      try {
        const scenario = loadScenario(scenarioId);
        const game = createGameState(scenario, {
          gameId: generateId("game"),
          teamName: teamName.trim() || "Team",
          randomSeed: newSeed(),
          now: now(),
          language: get().language,
        });
        activate(game);
        await saveGame(game);
        await get().refreshSaves();
      } catch (error) {
        set({ error: describeError(error, get().language) });
      }
    },

    openGame: async (id) => {
      try {
        const game = await loadGame(id);
        if (game) activate(game);
      } catch (error) {
        set({ error: describeError(error, get().language) });
      }
    },

    closeGame: () => {
      setActiveGameId(null);
      set({ game: null, scenario: null, saveStatus: "idle" });
    },

    renameSave: async (id, name) => {
      await renameSave(id, name);
      await get().refreshSaves();
    },

    duplicateSave: async (id) => {
      await duplicateSave(id, generateId("game"), now());
      await get().refreshSaves();
    },

    deleteSave: async (id) => {
      await deleteSave(id);
      if (get().game?.gameId === id) get().closeGame();
      await get().refreshSaves();
    },

    setLanguage: (language) => {
      setStoredLanguage(language);
      set({ language });
    },

    clearError: () => set({ error: null }),

    startWeek: () => mutate((game) => startPeriod(game, now())),
    updateParameters: (itemId, patch, reason) =>
      mutate((game) => updatePlanningParameters(game, itemId, patch, now(), reason)),
    setCapacity: (workCenterId, period, patch, reason) =>
      mutate((game) => setCapacityAdjustment(game, workCenterId, period, patch, now(), reason)),
    runPlanning: () => mutate((game, scenario) => runPlanningVersion(game, scenario, now())),
    commitPlan: (versionId) => mutate((game) => commitPlan(game, versionId, now())),
    resetWorkingPlan: () => mutate((game) => resetWorkingPlan(game, now())),
  };
});
