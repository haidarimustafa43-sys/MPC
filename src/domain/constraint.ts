import type { Severity } from "./common";

export type ConstraintType =
  | "INVENTORY_BELOW_ZERO"
  | "INVENTORY_BELOW_SAFETY_STOCK"
  | "MISSING_MATERIAL"
  | "LATE_PLANNED_RELEASE"
  | "PAST_DUE_ORDER"
  | "WORK_CENTER_OVERLOAD"
  | "CUSTOMER_ORDER_AT_RISK"
  | "CUSTOMER_ORDER_LATE"
  | "SUPPLIER_UNAVAILABLE"
  | "INVALID_BOM"
  | "MISSING_ROUTING"
  | "PLAN_NOT_RECALCULATED"
  | "FROZEN_ZONE_VIOLATION"
  | "UNCOMMITTED_CHANGES"
  | "RELEASE_DUE"
  | "DECISION_PENDING";

export interface ConstraintViolation {
  id: string;
  type: ConstraintType;
  severity: Severity;
  title: string;
  description: string;
  period?: number;
  itemId?: string;
  workCenterId?: string;
  relatedOrderIds?: string[];
  /** Values used to render a translated title/description (key = constraint type). */
  params?: Record<string, string | number>;
  source: "MPS" | "MRP" | "CRP" | "INVENTORY" | "EVENT" | "DATA";
}
