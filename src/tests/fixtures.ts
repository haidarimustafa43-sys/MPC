import type { GameState } from "../domain/gameState";
import type { Item } from "../domain/item";
import { acknowledgeMessage, markMessageRead } from "../engine/game/inboxActions";
import type { PlanningInput } from "../engine/planningInput";
import { horizonPeriods } from "../engine/planningInput";
import type { TimePhaseInput } from "../engine/mrp/timePhaseOrders";

/** Fixed test data builders. Tests never depend on the current time or unseeded randomness. */

export const makeItem = (overrides: Partial<Item> & Pick<Item, "id">): Item => ({
  name: overrides.id,
  type: "MANUFACTURED",
  unit: "pcs",
  leadTimePeriods: 1,
  safetyLeadTimePeriods: 0,
  safetyStock: 0,
  initialInventory: 0,
  lotSizingPolicy: { method: "LFL" },
  holdingCostPerUnitPeriod: 1,
  orderCost: 100,
  standardCost: 10,
  defaultWarehouseId: "WH",
  active: true,
  ...overrides,
});

export const timePhaseInput = (overrides: Partial<TimePhaseInput> = {}): TimePhaseInput => ({
  itemId: "X",
  kind: "PRODUCTION",
  currentPeriod: 1,
  periods: horizonPeriods(1, 8),
  startingOnHand: 0,
  grossRequirements: [0, 0, 0, 0, 0, 0, 0, 0],
  scheduledReceipts: [0, 0, 0, 0, 0, 0, 0, 0],
  safetyStock: 0,
  leadTimePeriods: 1,
  safetyLeadTimePeriods: 0,
  lotSizingPolicy: { method: "LFL" },
  orderCost: 100,
  holdingCostPerUnitPeriod: 1,
  lowLevelCode: 0,
  ...overrides,
});

export const planningInput = (overrides: Partial<PlanningInput> = {}): PlanningInput => ({
  currentPeriod: 1,
  periods: horizonPeriods(1, 6),
  items: [],
  bom: [],
  routings: [],
  workCenters: [],
  suppliers: [],
  forecast: [],
  customerOrders: [],
  releasedOrders: [],
  firmPlannedOrders: [],
  inventory: [],
  capacityAdjustments: [],
  settings: {
    currency: "SEK",
    gameLengthPeriods: 6,
    planningHorizonPeriods: 6,
    demandTimeFencePeriods: 2,
    frozenZonePeriods: 1,
    lateCostPerUnitPeriod: 10,
    eventMode: "fixed",
    allowPartialProduction: false,
  },
  ...overrides,
});

export const FIXED_TIME = "2026-01-05T08:00:00.000Z";

/** Reads every message and acknowledges those that need it (decisions stay open). */
export const takeInMessages = (game: GameState): GameState =>
  game.inboxMessages.reduce((state, message) => {
    const read = markMessageRead(state, message.id);
    return message.acknowledgementRequired && !message.decisionRequired ? acknowledgeMessage(read, message.id) : read;
  }, game);
