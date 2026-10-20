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
import { receiveCustomerOrders } from "../events/orderIntake";
import { processEvents } from "../events/processEvents";
import { GameActionError } from "./errors";
import { hasUnhandledMessages, transition } from "./stateMachine";

export const SAVE_FILE_VERSION = 2;

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
    scheduledEffects: [],
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

/**
 * Starts the week: runs the event engine (scheduled effects, triggered events),
 * delivers messages and moves to EVENTS_PENDING when there is news to read.
 * The plan is not recalculated automatically.
 */
export const startPeriod = (game: GameState, scenario: Scenario, now: string, entropy = 0): GameState => {
  transition(game, "START_PERIOD");
  const withOrders = receiveCustomerOrders(game, scenario, game.currentPeriod, entropy);
  const withEvents = processEvents(withOrders, scenario, "PERIOD_START", game.currentPeriod, entropy);
  return {
    ...withEvents,
    gameStatus: hasUnhandledMessages(withEvents) ? "EVENTS_PENDING" : "ANALYSIS",
    updatedAt: now,
  };
};

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
  firmPlannedOrders: game.plannedOrders,
  inventory: game.inventory,
  capacityAdjustments: game.workCenterCapacity,
  settings: scenario.settings,
});

const currentIteration = (game: GameState): number =>
  game.planningVersions.filter((version) => version.period === game.currentPeriod).length;

const decisionRecordFor = (
  game: GameState,
  decision: Omit<DecisionRecord, "id" | "period" | "iteration">,
): DecisionRecord => ({
  ...decision,
  id: `D-${game.currentPeriod}-${game.decisions.length + 1}`,
  period: game.currentPeriod,
  iteration: currentIteration(game) + 1,
});

/** Adds an entry to the decision log without changing the plan (e.g. a discarded what-if). */
export const logDecision = (
  game: GameState,
  decision: Omit<DecisionRecord, "id" | "period" | "iteration">,
): GameState => ({
  ...game,
  decisions: [...game.decisions, decisionRecordFor(game, decision)],
  updatedAt: decision.timestamp,
});

/**
 * Logs a decision and marks the plan as changed. Answering a message is also
 * allowed while the week's messages are being read (EVENTS_PENDING).
 */
export const recordDecision = (
  game: GameState,
  decision: Omit<DecisionRecord, "id" | "period" | "iteration">,
  options: { allowWhileReadingMessages?: boolean } = {},
): GameState => {
  const record = decisionRecordFor(game, decision);
  const status =
    options.allowWhileReadingMessages && game.gameStatus === "EVENTS_PENDING"
      ? game.gameStatus
      : transition(game, "CHANGE_PLAN");
  return {
    ...game,
    gameStatus: status,
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

/**
 * Changes the forecast of an end item for one period. Only possible when the
 * scenario allows it and only outside the demand time fence, where forecast
 * drives the plan.
 */
export const updateForecast = (
  game: GameState,
  scenario: Scenario,
  itemId: string,
  period: number,
  quantity: number,
  now: string,
  reason?: string,
): GameState => {
  if (!scenario.settings.forecastEditable) throw new GameActionError("forecast.notEditable");
  const firstEditable = game.currentPeriod + scenario.settings.demandTimeFencePeriods;
  if (period < firstEditable) throw new GameActionError("forecast.insideFence", { period: firstEditable });
  const value = Math.round(quantity);
  if (!Number.isFinite(value) || value < 0) throw new GameActionError("orders.invalidQuantity");
  const existing = game.forecast.find((entry) => entry.itemId === itemId && entry.period === period);
  const previous = existing?.quantity ?? 0;
  if (previous === value) return game;
  const forecast = existing
    ? game.forecast.map((entry) => (entry === existing ? { ...entry, quantity: value } : entry))
    : [...game.forecast, { itemId, period, quantity: value }];
  return recordDecision(
    { ...game, forecast },
    {
      timestamp: now,
      category: "FORECAST_CHANGE",
      entityType: "ITEM",
      entityId: `${itemId}@${period}`,
      field: "forecast",
      previousValue: previous,
      newValue: value,
      reason,
    },
  );
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
  firmPlannedOrders: structuredClone(game.plannedOrders),
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
    ...(game.whatIf ? { origin: "WHAT_IF" as const } : {}),
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

/**
 * Restores the planning parameters, firm planned orders and overtime/external
 * capacity of the committed (or latest) version of this week. Capacity
 * factors set by events are kept: they are facts, not decisions.
 */
export const resetWorkingPlan = (game: GameState, now: string): GameState => {
  const reference =
    game.planningVersions.find((v) => v.id === game.committedPlanVersionId && v.period === game.currentPeriod) ??
    latestVersion(game);
  if (!reference) return game;
  const snapshotCapacity = reference.inputSnapshot.workCenterCapacity;
  const factors = game.workCenterCapacity.filter((entry) => entry.capacityFactor !== 1);
  const keys = new Set([...snapshotCapacity, ...factors].map((e) => `${e.workCenterId}@${e.period}`));
  const workCenterCapacity = [...keys].map((key) => {
    const [workCenterId, period] = [key.split("@")[0], Number(key.split("@")[1])];
    const decided = snapshotCapacity.find((e) => e.workCenterId === workCenterId && e.period === period);
    const current = game.workCenterCapacity.find((e) => e.workCenterId === workCenterId && e.period === period);
    return {
      workCenterId,
      period,
      capacityFactor: current?.capacityFactor ?? 1,
      overtimeHours: decided?.overtimeHours ?? 0,
      externalHours: decided?.externalHours ?? 0,
    };
  });
  return recordDecision(
    {
      ...game,
      planningParameters: structuredClone(reference.inputSnapshot.planningParameters),
      workCenterCapacity,
      plannedOrders: structuredClone(reference.inputSnapshot.firmPlannedOrders ?? []),
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
