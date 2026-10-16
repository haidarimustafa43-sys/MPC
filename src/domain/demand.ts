export interface ForecastEntry {
  itemId: string;
  period: number;
  quantity: number;
}

export type CustomerOrderStatus =
  | "PROPOSED"
  | "ACCEPTED"
  | "REJECTED"
  | "PARTIALLY_FULFILLED"
  | "FULFILLED"
  | "LATE";

export interface CustomerOrder {
  id: string;
  customerName: string;
  itemId: string;
  quantity: number;
  duePeriod: number;
  sellingPricePerUnit: number;
  status: CustomerOrderStatus;
  acceptedAtPeriod?: number;
  deliveredQuantity?: number;
}

/** Orders that consume end-item availability in planning. */
export const isOpenDemand = (order: CustomerOrder): boolean =>
  order.status === "ACCEPTED" || order.status === "PARTIALLY_FULFILLED" || order.status === "LATE";

export const remainingQuantity = (order: CustomerOrder): number =>
  Math.max(0, order.quantity - (order.deliveredQuantity ?? 0));
