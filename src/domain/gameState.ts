import type { Language, LocalizedText, Severity } from "./common";
import type { CustomerOrder, ForecastEntry } from "./demand";
import type { DecisionRecord } from "./decision";
import type { MessageType } from "./event";
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

export interface PeriodResult {
  period: number;
  committedPlanVersionId: string;
  kpis: KpiResult;
}

export interface FinancialEntry {
  period: number;
  category: string;
  amount: number;
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
  /** Firm planned orders entered manually by the student (phase 3). */
  plannedOrders: PlannedOrder[];
  releasedOrders: Order[];
  suppliers: Supplier[];
  planningParameters: Record<string, ItemPlanningParameters>;
  workCenterCapacity: WorkCenterCapacityAdjustment[];
  activeEventEffects: ActiveEventEffect[];
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
}
