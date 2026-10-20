export type ProductionOrderStatus = "PLANNED" | "RELEASED" | "IN_PROGRESS" | "COMPLETED";
export type PurchaseOrderStatus = "PLANNED" | "RELEASED" | "RECEIVED";

interface OrderBase {
  id: string;
  itemId: string;
  quantity: number;
  releasePeriod: number;
  duePeriod: number;
  /** Due period when the order was released; differs from duePeriod after delays. */
  originalDuePeriod?: number;
}

/**
 * Production order life cycle:
 * RELEASED (material not yet issued) → IN_PROGRESS (components issued, work
 * under way; completedOperations counts finished routing steps) → COMPLETED.
 */
export interface ProductionOrder extends OrderBase {
  kind: "PRODUCTION";
  status: ProductionOrderStatus;
  completedOperations?: number;
  startedPeriod?: number;
  completedPeriod?: number;
}

export interface PurchaseOrder extends OrderBase {
  kind: "PURCHASE";
  status: PurchaseOrderStatus;
  supplierId: string;
  expedited?: boolean;
  receivedPeriod?: number;
}

export type Order = ProductionOrder | PurchaseOrder;

/** Released orders appear as scheduled receipts in planning. */
export const isOpenReleasedOrder = (order: Order): boolean =>
  order.kind === "PRODUCTION"
    ? order.status === "RELEASED" || order.status === "IN_PROGRESS"
    : order.status === "RELEASED";

/** Released production orders whose components have not been issued yet. */
export const isUnstartedProductionOrder = (order: Order): order is ProductionOrder =>
  order.kind === "PRODUCTION" && order.status === "RELEASED";
