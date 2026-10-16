import type { LocalizedText, Severity } from "./common";

/*
 * Data-driven event definitions. Events are declared in scenario JSON; the
 * event engine (phase 3) evaluates triggers and applies effects. The types
 * already live here so scenario files are validated from the start.
 */

export type EventCategory =
  | "SUPPLIER"
  | "CUSTOMER"
  | "CAPACITY"
  | "QUALITY"
  | "INTERNAL"
  | "FINANCE"
  | "SYSTEM";

export type EventTrigger =
  | { type: "PERIOD_START"; period: number }
  | { type: "PERIOD_END"; period: number }
  | { type: "PERIOD_RANGE"; fromPeriod: number; toPeriod: number }
  | { type: "INVENTORY_BELOW"; itemId: string; threshold: number }
  | { type: "UTILIZATION_ABOVE"; workCenterId: string; threshold: number }
  | { type: "SERVICE_LEVEL_BELOW"; threshold: number }
  | { type: "DECISION_TAKEN"; category: string; entityId?: string }
  | { type: "RANDOM"; fromPeriod: number; toPeriod: number };

export type EventEffect =
  | { type: "DELAY_PURCHASE_ORDER"; purchaseOrderId: string; periods: number }
  | {
      type: "CHANGE_CAPACITY";
      workCenterId: string;
      factor: number;
      fromPeriod: number;
      toPeriod: number;
    }
  | {
      type: "ADD_CUSTOMER_ORDER";
      orderId: string;
      customerName: string;
      itemId: string;
      quantity: number;
      duePeriod: number;
      sellingPricePerUnit: number;
    }
  | { type: "CHANGE_CUSTOMER_ORDER_QUANTITY"; orderId: string; quantity: number }
  | { type: "SUPPLIER_UNAVAILABLE"; supplierId: string; fromPeriod: number; toPeriod: number }
  | { type: "SCRAP_INVENTORY"; itemId: string; quantity: number };

export interface EventChoice {
  id: string;
  label: LocalizedText;
  effects: EventEffect[];
  /** Keeps the message open so the student can explore a what-if plan first. */
  defersDecision?: boolean;
}

export type MessageType =
  | "INFORMATION"
  | "WARNING"
  | "CRITICAL_DISRUPTION"
  | "CUSTOMER_REQUEST"
  | "BUSINESS_OPPORTUNITY"
  | "INTERNAL"
  | "SYSTEM";

export interface EventMessage {
  sender: string;
  severity: Severity;
  messageType: MessageType;
  title: LocalizedText;
  body: LocalizedText;
}

export interface EventDefinition {
  id: string;
  name: string;
  category: EventCategory;
  trigger: EventTrigger;
  probability: number;
  prerequisites?: string[];
  message: EventMessage;
  choices?: EventChoice[];
  effects: EventEffect[];
  delayedEffects?: { afterPeriods: number; effects: EventEffect[] }[];
  durationPeriods?: number;
  visibleToStudent?: boolean;
  acknowledgementRequired: boolean;
  decisionRequired: boolean;
  followUpEventIds?: string[];
}
