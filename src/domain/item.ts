import type { LotSizingPolicy } from "./lotSizing";

export type ItemType = "END_ITEM" | "MANUFACTURED" | "PURCHASED";

export interface Item {
  id: string;
  name: string;
  description?: string;
  type: ItemType;
  unit: string;
  leadTimePeriods: number;
  safetyLeadTimePeriods: number;
  safetyStock: number;
  initialInventory: number;
  lotSizingPolicy: LotSizingPolicy;
  holdingCostPerUnitPeriod: number;
  orderCost: number;
  standardCost: number;
  sellingPrice?: number;
  defaultWarehouseId: string;
  active: boolean;
}

export const isManufactured = (item: Item): boolean => item.type !== "PURCHASED";
