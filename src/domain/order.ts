export type ProductionOrderStatus = "PLANNED" | "RELEASED" | "IN_PROGRESS" | "COMPLETED";
export type PurchaseOrderStatus = "PLANNED" | "RELEASED" | "RECEIVED";

interface OrderBase {
  id: string;
  itemId: string;
  quantity: number;
  releasePeriod: number;
  duePeriod: number;
}

export interface ProductionOrder extends OrderBase {
  kind: "PRODUCTION";
  status: ProductionOrderStatus;
}

export interface PurchaseOrder extends OrderBase {
  kind: "PURCHASE";
  status: PurchaseOrderStatus;
  supplierId: string;
  expedited?: boolean;
}

export type Order = ProductionOrder | PurchaseOrder;

/** Released orders appear as scheduled receipts in planning. */
export const isOpenReleasedOrder = (order: Order): boolean =>
  order.kind === "PRODUCTION"
    ? order.status === "RELEASED" || order.status === "IN_PROGRESS"
    : order.status === "RELEASED";
