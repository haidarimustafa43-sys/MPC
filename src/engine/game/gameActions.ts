import type { Language } from "../../domain/common";
import type { DecisionRecord } from "../../domain/decision";
import type { GameState } from "../../domain/gameState";
import type { InventoryBalance } from "../../domain/inventory";
import type {
  ItemPlanningParameters,
  PlanningInputSnapshot,
  PlanningVersion,
  WorkCenterCapacityAdjustment,
} from "../../domain/planningVersion";
import type { Scenario } from "../../domain/scenario";
import type { PlanningInput } from "../planningInput";
import { applyPlanningParameters, horizonPeriods } from "../planningInput";
import { runPlanning } from "../planning/runPlanning";
import { transition } from "./stateMachine";

export const SAVE_FILE_VERSION = 1;

declare const __APP_VERSION__: string | undefined;
export const APPLICATION_VERSION: string =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0-dev";

/*
 * Pure state transitions for a game. Every function returns a new GameState
 * and takes the time stamp as an argument so tests stay deterministic.
 */

const defaultSupplierFor = (scenario: Scenario, itemId: string, leadTime: number): string | undefined => {
  const candidates = scenario.suppliers.filter((s) => s.active && s.suppliedItemIds.includes(itemId));
  return (candidates.find((s) => s.normalLeadTimePeriods === leadTime) ?? candidates[0])?.id;
};

export const initialPlanningParameters = (scenario: Scenario): Record<string, ItemPlanningParameters> =>
  Object.fromEntries(
    scenario.items.map((item) => [
      item.id,
      {
        safetyStock: item.safetyStock,
        safetyLeadTimePeriods: item.safetyLeadTimePeriods,
        lotSizingPolicy: item.lotSizingPolicy,
        supplierId:
          item.type === "PURCHASED" ? defaultSupplierFor(scenario, item.id, item.leadTimePeriods) : undefined,
      },
    ]),
  );

export const initialInventory = (scenario: Scenario): InventoryBalance[] =>
  scenario.items.map((item) => ({
    itemId: item.id,
    warehouseId: item.defaultWarehouseId,
    quantityOnHand: item.initialInventory,
    allocatedQuantity: 0,
  }));

export interface NewGameOptions {
  gameId: string;
  teamName: string;
  randomSeed: number;
  now: string;
  language?: Language;
}

export const createGameState = (scenario: Scenario, options: NewGameOptions): GameState => {
  const game: GameState = {
    saveFileVersion: SAVE_FILE_VERSION,
    applicationVersion: APPLICATION_VERSION,
    gameId: options.gameId,
    teamName: options.teamName,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    randomSeed: options.randomSeed,
    createdAt: options.now,
    updatedAt: options.now,
    currentPeriod: 1,
    gameStatus: "NOT_STARTED",
    inventory: initialInventory(scenario),
    forecast: scenario.forecasts.map((entry) => ({ ...entry })),
    customerOrders: scenario.customerOrders.map((order) => ({ ...order })),
    plannedOrders: [],
    releasedOrders: [
      ...scenario.productionOrders.map((order) => ({ ...order })),
      ...scenario.purchaseOrders.map((order) => ({ ...order })),
    ],
    suppliers: scenario.suppliers.map((supplier) => ({ ...supplier })),
    planningParameters: initialPlanningParameters(scenario),
    workCenterCapacity: [],
    activeEventEffects: [],
    inboxMessages: [],
    eventHistory: [],
    decisions: [],
    planningVersions: [],
    committedPlanVersionId: null,
    pendingDecisionIds: [],
    completedPeriods: [],
    kpiHistory: [],
    financialHistory: [],
    settings: { language: options.language ?? "en" },
  };
  return { ...game, gameStatus: transition(game, "START_GAME") };
};

export const startPeriod = (game: GameState, now: string): GameState => ({
  ...game,
  gameStatus: transition(game, "START_PERIOD"),
  updatedAt: now,
});

export const buildPlanningInput = (scenario: Scenario, game: GameState): PlanningInput => ({
  currentPeriod: game.currentPeriod,
  periods: horizonPeriods(game.currentPeriod, scenario.settings.planningHorizonPeriods),
  items: applyPlanningParameters(scenario.items, game.planningParameters, game.suppliers),
  bom: scenario.bom,
  routings: scenario.routings,
  workCenters: scenario.workCenters,
  suppliers: game.suppliers,
  forecast: game.forecast,
  customerOrders: game.customerOrders,
  releasedOrders: game.releasedOrders,
  inventory: game.inventory,
  capacityAdjustments: game.workCenterCapacity,
  settings: scenario.settings,
});

const currentIteration = (game: GameState): number =>
  game.planningVersions.filter((version) => version.period === game.currentPeriod).length;

const recordDecision = (
  game: GameState,
  decision: Omit<DecisionRecord, "id" | "period" | "iteration">,
): GameState => {
  const record: DecisionRecord = {
    ...decision,
    id: `D-${game.currentPeriod}-${game.decisions.length + 1}`,
    period: game.currentPeriod,
    iteration: currentIteration(game) + 1,
  };
  return {
    ...game,
    gameStatus: transition(game, "CHANGE_PLAN"),
    decisions: [...game.decisions, record],
    pendingDecisionIds: [...game.pendingDecisionIds, record.id],
    updatedAt: decision.timestamp,
  };
};

export const updatePlanningParameters = (
  game: GameState,
  itemId: string,
  patch: Partial<ItemPlanningParameters>,
  now: string,
  reason?: string,
): GameState => {
  const previous = game.planningParameters[itemId];
  if (!previous) throw new Error(`Unknown item ${itemId}.`);
  const changedFields = (Object.keys(patch) as (keyof ItemPlanningParameters)[]).filter(
    (field) => JSON.stringify(patch[field]) !== JSON.stringify(previous[field]),
  );
  if (changedFields.length === 0) return game;
  let next: GameState = {
    ...game,
    planningParameters: { ...game.planningParameters, [itemId]: { ...previous, ...patch } },
  };
  for (const field of changedFields) {
    next = recordDecision(next, {
      timestamp: now,
      category: field === "supplierId" ? "SUPPLIER_SELECTION" : "PLANNING_PARAMETER",
      entityType: "ITEM",
      entityId: itemId,
      field,
      previousValue: previous[field],
      newValue: patch[field],
      reason,
    });
  }
  return next;
};

export const setCapacityAdjustment = (
  game: GameState,
  workCenterId: string,
  period: number,
  patch: Partial<Pick<WorkCenterCapacityAdjustment, "overtimeHours" | "externalHours">>,
  now: string,
  reason?: string,
): GameState => {
  const existing = game.workCenterCapacity.find(
    (entry) => entry.workCenterId === workCenterId && entry.period === period,
  );
  const previous: WorkCenterCapacityAdjustment = existing ?? {
    workCenterId,
    period,
    capacityFactor: 1,
    overtimeHours: 0,
    externalHours: 0,
  };
  const updated = { ...previous, ...patch };
  if (updated.overtimeHours === previous.overtimeHours && updated.externalHours === previous.externalHours) {
    return game;
  }
  const others = game.workCenterCapacity.filter((entry) => entry !== existing);
  return recordDecision(
    { ...game, workCenterCapacity: [...others, updated] },
    {
      timestamp: now,
      category: patch.externalHours !== undefined ? "EXTERNAL_CAPACITY" : "OVERTIME",
      entityType: "WORK_CENTER",
      entityId: `${workCenterId}@${period}`,
      field: patch.externalHours !== undefined ? "externalHours" : "overtimeHours",
      previousValue: patch.externalHours !== undefined ? previous.externalHours : previous.overtimeHours,
      newValue: patch.externalHours !== undefined ? updated.externalHours : updated.overtimeHours,
      reason,
    },
  );
};

const snapshotOf = (game: GameState): PlanningInputSnapshot => ({
  currentPeriod: game.currentPeriod,
  planningParameters: structuredClone(game.planningParameters),
  workCenterCapacity: structuredClone(game.workCenterCapacity),
  inventory: structuredClone(game.inventory),
  customerOrders: structuredClone(game.customerOrders),
  releasedOrders: structuredClone(game.releasedOrders),
});

/** Runs MPS → MRP → CRP → constraints → KPIs and stores an immutable planning version. */
export const runPlanningVersion = (game: GameState, scenario: Scenario, now: string): GameState => {
  const status = transition(game, "RUN_PLANNING");
  const iteration = currentIteration(game) + 1;
  const result = runPlanning(buildPlanningInput(scenario, game), iteration);
  const previousVersions = game.planningVersions.filter((v) => v.period === game.currentPeriod);
  const decisionIds =
    previousVersions.length === 0
      ? game.decisions.filter((d) => d.period === game.currentPeriod).map((d) => d.id)
      : game.pendingDecisionIds;
  const version: PlanningVersion = {
    id: `PV-${game.currentPeriod}-${iteration}`,
    period: game.currentPeriod,
    iteration,
    createdAt: now,
    decisionIds,
    inputSnapshot: snapshotOf(game),
    mpsResult: result.mps,
    mrpResult: result.mrp,
    crpResult: result.crp,
    rccpResult: result.rccp,
    violations: result.violations,
    projectedKpis: result.kpis,
  };
  return {
    ...game,
    gameStatus: status,
    planningVersions: [...game.planningVersions, version],
    pendingDecisionIds: [],
    updatedAt: now,
  };
};

export const commitPlan = (game: GameState, versionId: string, now: string): GameState => ({
  ...game,
  gameStatus: transition(game, "COMMIT_PLAN", versionId),
  committedPlanVersionId: versionId,
  updatedAt: now,
});

/** Restores the planning parameters and capacity decisions of the committed (or latest) version. */
export const resetWorkingPlan = (game: GameState, now: string): GameState => {
  const reference =
    game.planningVersions.find((v) => v.id === game.committedPlanVersionId) ??
    game.planningVersions.filter((v) => v.period === game.currentPeriod).at(-1);
  if (!reference) return game;
  return recordDecision(
    {
      ...game,
      planningParameters: structuredClone(reference.inputSnapshot.planningParameters),
      workCenterCapacity: structuredClone(reference.inputSnapshot.workCenterCapacity),
    },
    {
      timestamp: now,
      category: "RESET_WORKING_PLAN",
      entityType: "PLANNING_VERSION",
      entityId: reference.id,
    },
  );
};

export const latestVersion = (game: GameState): PlanningVersion | undefined =>
  game.planningVersions.filter((version) => version.period === game.currentPeriod).at(-1);
