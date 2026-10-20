import type { Language, LocalizedText, Severity } from "./common";
import type { CustomerOrder, ForecastEntry } from "./demand";
import type { DecisionRecord } from "./decision";
import type { EventEffect, MessageType } from "./event";
import type { InventoryBalance } from "./inventory";
import type { KpiResult } from "./kpi";
import type { Order } from "./order";
import type {
  ItemPlanningParameters,
  PlannedOrder,
  PlanningVersion,
  WorkCenterCapacityAdjustment,
} from "./planningVersion";
import type { Supplier } from "./supplier";

export type GameStatus =
  | "NOT_STARTED"
  | "PERIOD_START"
  | "EVENTS_PENDING"
  | "ANALYSIS"
  | "PLANNING_DIRTY"
  | "PLAN_CALCULATED"
  | "PLAN_COMMITTED"
  | "PERIOD_SIMULATED"
  | "PERIOD_REVIEW"
  | "GAME_COMPLETED";

export type MessageStatus = "UNREAD" | "READ" | "ACKNOWLEDGED" | "RESPONDED";

export interface InboxMessage {
  id: string;
  eventId?: string;
  period: number;
  sender: string;
  messageType: MessageType;
  severity: Severity;
  title: LocalizedText;
  body: LocalizedText;
  status: MessageStatus;
  acknowledgementRequired: boolean;
  decisionRequired: boolean;
  relatedEntityIds?: string[];
  /** Choice the student made (decision-required messages). */
  choiceId?: string;
  respondedPeriod?: number;
}

export interface ActiveEventEffect {
  eventId: string;
  fromPeriod: number;
  toPeriod: number;
  description: string;
}

export interface EventHistoryEntry {
  eventId: string;
  period: number;
  choiceId?: string;
}

/** Effects that an event schedules for a later period (delayed effects, follow-ups). */
export interface ScheduledEffect {
  period: number;
  eventId: string;
  effects: EventEffect[];
  /** Follow-up events to trigger in that period. */
  followUpEventIds?: string[];
}

/** Why something in the realised week went differently from the ideal. */
export type FailureCause = "UNRESOLVED_PLAN_PROBLEM" | "UNPLANNED";

export interface PeriodFailure {
  kind: "MATERIAL_SHORTAGE" | "CAPACITY_SHORTAGE" | "LATE_DELIVERY" | "ORDER_NOT_RELEASED";
  orderId?: string;
  itemId?: string;
  workCenterId?: string;
  quantity?: number;
  hours?: number;
  cause: FailureCause;
  description: string;
}

export interface PeriodDelivery {
  customerOrderId: string;
  itemId: string;
  quantity: number;
  onTime: boolean;
  revenue: number;
}

export interface PlannedVersusActual {
  itemId: string;
  plannedBalance: number;
  actualBalance: number;
}

/** Immutable outcome of one simulated week. */
export interface PeriodResult {
  period: number;
  committedPlanVersionId: string;
  kpis: KpiResult;
  receivedOrderIds: string[];
  startedOrderIds: string[];
  completedOrderIds: string[];
  deliveries: PeriodDelivery[];
  failures: PeriodFailure[];
  eventIds: string[];
  /** Customer order lines due this period and how many were delivered complete and on time. */
  dueLines: number;
  onTimeLines: number;
  plannedVersusActual: PlannedVersusActual[];
  endInventory: InventoryBalance[];
}

export interface FinancialEntry {
  period: number;
  category: "ORDER_COST" | "EXPEDITE_COST" | "MATERIAL_COST" | "REVENUE" | string;
  amount: number;
  reference?: string;
}

export interface GameSettings {
  language: Language;
}

export interface GameState {
  saveFileVersion: number;
  applicationVersion: string;
  gameId: string;
  teamName: string;
  scenarioId: string;
  scenarioVersion: string;
  randomSeed: number;
  createdAt: string;
  updatedAt: string;
  currentPeriod: number;
  gameStatus: GameStatus;
  inventory: InventoryBalance[];
  forecast: ForecastEntry[];
  customerOrders: CustomerOrder[];
  /** Firm planned orders created or changed manually by the student. */
  plannedOrders: PlannedOrder[];
  releasedOrders: Order[];
  suppliers: Supplier[];
  planningParameters: Record<string, ItemPlanningParameters>;
  workCenterCapacity: WorkCenterCapacityAdjustment[];
  activeEventEffects: ActiveEventEffect[];
  scheduledEffects: ScheduledEffect[];
  inboxMessages: InboxMessage[];
  eventHistory: EventHistoryEntry[];
  decisions: DecisionRecord[];
  planningVersions: PlanningVersion[];
  committedPlanVersionId: string | null;
  /** Decisions taken after the latest planning run; non-empty means the plan is stale. */
  pendingDecisionIds: string[];
  completedPeriods: PeriodResult[];
  kpiHistory: { period: number; kpis: KpiResult }[];
  financialHistory: FinancialEntry[];
  settings: GameSettings;
  /** Present only on a what-if branch; the live game never has it. */
  whatIf?: { startedAt: string; basePlanVersionId: string | null };
}
