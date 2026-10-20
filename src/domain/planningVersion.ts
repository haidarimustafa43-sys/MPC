import type { CalculationTrace } from "./common";
import type { ConstraintViolation } from "./constraint";
import type { CustomerOrder } from "./demand";
import type { InventoryBalance } from "./inventory";
import type { KpiResult } from "./kpi";
import type { LotSizingPolicy } from "./lotSizing";
import type { Order } from "./order";

/** Student-controlled planning parameters that override item master data. */
export interface ItemPlanningParameters {
  safetyStock: number;
  safetyLeadTimePeriods: number;
  lotSizingPolicy: LotSizingPolicy;
  /** Only for purchased items. */
  supplierId?: string;
}

export interface WorkCenterCapacityAdjustment {
  workCenterId: string;
  period: number;
  /** Set by events, e.g. 0.6 after a breakdown. */
  capacityFactor: number;
  overtimeHours: number;
  externalHours: number;
}

export interface PlannedOrder {
  id: string;
  itemId: string;
  kind: "PRODUCTION" | "PURCHASE";
  quantity: number;
  releasePeriod: number;
  receiptPeriod: number;
  /** Period whose requirement triggered the order. */
  neededPeriod: number;
  supplierId?: string;
  /** Safety lead time had to be compressed to release in time. */
  compressed: boolean;
  /** Firm planned order: fixed by the student, MRP does not change it. */
  firm?: boolean;
}

export type CellRisk = "OK" | "BELOW_SAFETY_STOCK" | "SHORTAGE";

/** Time-phased record shared by MPS and MRP. Arrays are indexed like `periods`. */
export interface ItemPlanRecord {
  itemId: string;
  periods: number[];
  startingOnHand: number;
  grossRequirements: number[];
  scheduledReceipts: number[];
  /** Projected balance counting only released orders (before new planned orders). */
  projectedBeforePlanned: number[];
  netRequirements: number[];
  plannedReceipts: number[];
  plannedReleases: number[];
  projectedAvailable: number[];
  risk: CellRisk[];
  safetyStock: number;
  leadTimePeriods: number;
  safetyLeadTimePeriods: number;
  lotSizingPolicy: LotSizingPolicy;
  lowLevelCode: number;
  plannedOrders: PlannedOrder[];
  /** Keyed by "row:period", e.g. "net:7". */
  traces: Record<string, CalculationTrace>;
  /** Periods with net requirements that cannot be covered because they lie inside the lead time. */
  uncoveredPeriods: number[];
  /** Receipt periods that contain a firm planned order (manually set values). */
  firmPeriods: number[];
}

export interface MpsRecord extends ItemPlanRecord {
  forecast: number[];
  customerOrders: number[];
  /** Available-to-promise; null in periods without supply. */
  atp: (number | null)[];
}

export interface MpsResult {
  records: MpsRecord[];
}

export interface MrpResult {
  /** All items in low-level-code order, end items first (their records come from the MPS). */
  records: ItemPlanRecord[];
  lowLevelCodes: Record<string, number>;
}

export interface CapacityContribution {
  orderId: string;
  itemId: string;
  orderType: "PLANNED" | "RELEASED";
  operationSequence: number;
  quantity: number;
  setupHours: number;
  runHours: number;
  totalHours: number;
}

export interface CapacityBucket {
  workCenterId: string;
  period: number;
  normalCapacityHours: number;
  capacityFactor: number;
  overtimeHours: number;
  externalHours: number;
  availableHours: number;
  loadHours: number;
  /** available - load; negative means overload. */
  balanceHours: number;
  utilization: number;
  contributions: CapacityContribution[];
}

export interface CrpResult {
  buckets: CapacityBucket[];
}

export interface RccpBucket {
  workCenterId: string;
  period: number;
  availableHours: number;
  loadHours: number;
  utilization: number;
}

export interface RccpResult {
  /** Run hours per unit of end item, per work center: billOfResources[endItemId][workCenterId]. */
  billOfResources: Record<string, Record<string, number>>;
  buckets: RccpBucket[];
}

export interface PlanningInputSnapshot {
  currentPeriod: number;
  planningParameters: Record<string, ItemPlanningParameters>;
  workCenterCapacity: WorkCenterCapacityAdjustment[];
  inventory: InventoryBalance[];
  customerOrders: CustomerOrder[];
  releasedOrders: Order[];
  firmPlannedOrders: PlannedOrder[];
}

export interface PlanningVersion {
  id: string;
  period: number;
  iteration: number;
  createdAt: string;
  decisionIds: string[];
  inputSnapshot: PlanningInputSnapshot;
  mpsResult: MpsResult;
  mrpResult: MrpResult;
  crpResult: CrpResult;
  rccpResult: RccpResult;
  violations: ConstraintViolation[];
  projectedKpis: KpiResult;
  /** Versions calculated in a what-if branch that was later applied. */
  origin?: "WHAT_IF";
}
