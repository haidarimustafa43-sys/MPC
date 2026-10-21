import { create } from "zustand";
import type { Language } from "../domain/common";
import type { GameState } from "../domain/gameState";
import type { ItemPlanningParameters } from "../domain/planningVersion";
import type { Scenario } from "../domain/scenario";
import {
  commitPlan,
  createGameState,
  latestVersion,
  resetWorkingPlan,
  runPlanningVersion,
  setCapacityAdjustment,
  startPeriod,
  updateForecast,
  updatePlanningParameters,
} from "../engine/game/gameActions";
import { GameActionError } from "../engine/game/errors";
import { acknowledgeMessage, markMessageRead, respondToMessage } from "../engine/game/inboxActions";
import {
  cancelFirmPlannedOrder,
  decideCustomerOrder,
  expeditePurchaseOrder,
  firmPlannedOrder,
  releaseAllDueOrders,
  releasePlannedOrder,
} from "../engine/game/orderActions";
import { InvalidTransitionError } from "../engine/game/stateMachine";
import { reviewPeriod, simulatePeriod, startNextPeriod } from "../engine/game/weekFlow";
import { applyWhatIf, discardWhatIf, startWhatIf } from "../engine/game/whatIf";
import { translate } from "../i18n";
import {
  isBuiltInScenario,
  isKnownScenario,
  loadScenario,
  registerScenario,
  scenarioIds,
  unregisterScenario,
} from "../scenarios";
import { buildExportFile, exportFileName, serializeExportFile } from "../importExport/exportGame";
import { parseGameFile } from "../importExport/validateSaveFile";
import { deleteCustomScenario, listCustomScenarios, saveCustomScenario } from "../storage/scenarioRepository";
import { downloadText } from "../utils/download";
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
  /** The live game while a what-if branch is open in `game`. */
  liveGame: GameState | null;
  saves: SaveSummary[];
  saveStatus: SaveStatus;
  error: string | null;
  /** Short success message, e.g. after an import. */
  notice: string | null;
  /** Ids of scenarios imported into this browser. */
  customScenarioIds: string[];
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
  markRead: (messageId: string) => void;
  acknowledge: (messageId: string) => void;
  respond: (messageId: string, choiceId: string, reason?: string) => void;
  releaseOrder: (plannedOrderId: string, reason?: string) => void;
  releaseAllDue: (reason?: string) => void;
  firmOrder: (plannedOrderId: string, changes: { quantity?: number; receiptPeriod?: number }, reason?: string) => void;
  cancelFirmOrder: (orderId: string, reason?: string) => void;
  expedite: (orderId: string, reason?: string) => void;
  decideCustomerOrder: (orderId: string, accept: boolean, reason?: string) => void;
  simulateWeek: () => void;
  reviewWeek: () => void;
  startNextWeek: () => void;
  enterWhatIf: () => void;
  updateForecast: (itemId: string, period: number, quantity: number, reason?: string) => void;
  exportGame: () => void;
  importGameFile: (text: string) => Promise<boolean>;
  importScenarioFile: (text: string) => Promise<boolean>;
  removeCustomScenario: (id: string) => Promise<void>;
  clearNotice: () => void;
  applyWhatIf: (reason?: string) => void;
  discardWhatIf: (reason?: string) => void;
}

export type GameStore = GameStoreState & GameStoreActions;

const now = (): string => new Date().toISOString();

const describeError = (error: unknown, language: Language): string => {
  if (error instanceof InvalidTransitionError) return translate(language, error.reasonKey);
  if (error instanceof GameActionError) return translate(language, error.reasonKey, error.params);
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
      // A what-if branch is never saved; only the live game is.
      if (!next.whatIf) scheduleSave(next);
    } catch (error) {
      set({ error: describeError(error, language) });
    }
  };

  const activate = (game: GameState): void => {
    const scenario = loadScenario(game.scenarioId);
    setActiveGameId(game.gameId);
    set({ game, scenario, liveGame: null, error: null, saveStatus: "saved" });
  };

  return {
    initialized: false,
    language: "en",
    scenario: null,
    game: null,
    liveGame: null,
    saves: [],
    saveStatus: "idle",
    error: null,
    notice: null,
    customScenarioIds: [],

    init: async () => {
      set({ language: getStoredLanguage() });
      try {
        for (const data of await listCustomScenarios()) registerScenario(data);
        set({ customScenarioIds: scenarioIds().filter((id) => !isBuiltInScenario(id)) });
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
      set({ game: null, liveGame: null, scenario: null, saveStatus: "idle" });
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
    clearNotice: () => set({ notice: null }),

    exportGame: () => {
      const { game, liveGame, scenario } = get();
      const live = liveGame ?? game;
      if (!live || !scenario) return;
      const file = buildExportFile(live, now(), isBuiltInScenario(scenario.id) ? undefined : scenario);
      downloadText(exportFileName(live), serializeExportFile(file), "application/json");
    },

    importGameFile: async (text) => {
      const { language } = get();
      const result = parseGameFile(text, isKnownScenario);
      if (!result.ok) {
        set({ error: result.errors.join(" "), notice: null });
        return false;
      }
      try {
        const { gameState, scenario } = result.value;
        if (scenario && !isKnownScenario(scenario.id)) {
          const registered = registerScenario(scenario);
          if (!registered.ok) throw new Error(registered.errors.join(" "));
          await saveCustomScenario(scenario.id, scenario, now());
          set({ customScenarioIds: scenarioIds().filter((id) => !isBuiltInScenario(id)) });
        }
        const exists = get().saves.some((save) => save.id === gameState.gameId);
        // Importing never overwrites a game in this browser: a clash gets a new id.
        const imported = exists ? { ...gameState, gameId: generateId("game") } : gameState;
        await saveGame(imported, exists ? `${gameState.teamName} (imported)` : undefined);
        await get().refreshSaves();
        set({ error: null, notice: translate(language, "io.imported", { team: gameState.teamName }) });
        return true;
      } catch (error) {
        set({ error: describeError(error, language), notice: null });
        return false;
      }
    },

    importScenarioFile: async (text) => {
      const { language } = get();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        set({ error: translate(language, "io.notJson"), notice: null });
        return false;
      }
      const result = registerScenario(data);
      if (!result.ok) {
        set({ error: result.errors.slice(0, 8).join(" "), notice: null });
        return false;
      }
      await saveCustomScenario(result.scenario.id, data, now());
      set({
        customScenarioIds: scenarioIds().filter((id) => !isBuiltInScenario(id)),
        error: null,
        notice: translate(language, "io.scenarioImported", { id: result.scenario.id }),
      });
      return true;
    },

    removeCustomScenario: async (id) => {
      await deleteCustomScenario(id);
      unregisterScenario(id);
      set({ customScenarioIds: scenarioIds().filter((candidate) => !isBuiltInScenario(candidate)) });
    },

    startWeek: () => mutate((game, scenario) => startPeriod(game, scenario, now(), Math.random())),
    updateParameters: (itemId, patch, reason) =>
      mutate((game) => updatePlanningParameters(game, itemId, patch, now(), reason)),
    setCapacity: (workCenterId, period, patch, reason) =>
      mutate((game) => setCapacityAdjustment(game, workCenterId, period, patch, now(), reason)),
    runPlanning: () => mutate((game, scenario) => runPlanningVersion(game, scenario, now())),
    commitPlan: (versionId) => mutate((game) => commitPlan(game, versionId, now())),
    resetWorkingPlan: () => mutate((game) => resetWorkingPlan(game, now())),
    markRead: (messageId) => mutate((game) => markMessageRead(game, messageId)),
    acknowledge: (messageId) => mutate((game) => acknowledgeMessage(game, messageId)),
    respond: (messageId, choiceId, reason) =>
      mutate((game, scenario) => respondToMessage(game, scenario, messageId, choiceId, now(), reason)),
    releaseOrder: (plannedOrderId, reason) =>
      mutate((game, scenario) => releasePlannedOrder(game, scenario, plannedOrderId, now(), reason)),
    releaseAllDue: (reason) => mutate((game, scenario) => releaseAllDueOrders(game, scenario, now(), reason)),
    firmOrder: (plannedOrderId, changes, reason) =>
      mutate((game, scenario) => firmPlannedOrder(game, scenario, plannedOrderId, changes, now(), reason)),
    cancelFirmOrder: (orderId, reason) => mutate((game) => cancelFirmPlannedOrder(game, orderId, now(), reason)),
    expedite: (orderId, reason) =>
      mutate((game, scenario) => expeditePurchaseOrder(game, scenario, orderId, now(), reason)),
    decideCustomerOrder: (orderId, accept, reason) =>
      mutate((game) => decideCustomerOrder(game, orderId, accept, now(), reason)),
    simulateWeek: () => mutate((game, scenario) => simulatePeriod(game, scenario, now(), Math.random())),
    reviewWeek: () => mutate((game) => reviewPeriod(game, now())),
    updateForecast: (itemId, period, quantity, reason) =>
      mutate((game, scenario) => updateForecast(game, scenario, itemId, period, quantity, now(), reason)),
    enterWhatIf: () => {
      const { game, scenario, language } = get();
      if (!game || !scenario) return;
      try {
        // The banner compares the branch with the live plan of this week, so
        // make sure there is an up-to-date one to compare with.
        let live = game;
        if (!latestVersion(live) || live.pendingDecisionIds.length > 0) {
          live = runPlanningVersion(live, scenario, now());
          scheduleSave(live);
        }
        set({ liveGame: live, game: startWhatIf(live, now()), error: null });
      } catch (error) {
        set({ error: describeError(error, language) });
      }
    },
    applyWhatIf: (reason) => {
      const { game, liveGame, language } = get();
      if (!game || !liveGame) return;
      try {
        const applied = applyWhatIf(liveGame, game, now(), reason);
        set({ game: applied, liveGame: null, error: null });
        scheduleSave(applied);
      } catch (error) {
        set({ error: describeError(error, language) });
      }
    },
    discardWhatIf: (reason) => {
      const { game, liveGame } = get();
      if (!game || !liveGame) return;
      const live = discardWhatIf(liveGame, game, now(), reason);
      set({ game: live, liveGame: null, error: null });
      scheduleSave(live);
    },
    startNextWeek: () => mutate((game, scenario) => startNextPeriod(game, scenario, now(), Math.random())),
  };
});
