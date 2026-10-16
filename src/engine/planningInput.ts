import type { BomLine } from "../domain/bom";
import type { CustomerOrder, ForecastEntry } from "../domain/demand";
import type { InventoryBalance } from "../domain/inventory";
import type { Item } from "../domain/item";
import type { Order } from "../domain/order";
import type { ItemPlanningParameters, WorkCenterCapacityAdjustment } from "../domain/planningVersion";
import type { RoutingOperation } from "../domain/routing";
import type { ScenarioSettings } from "../domain/scenario";
import type { Supplier } from "../domain/supplier";
import type { WorkCenter } from "../domain/workCenter";

/** An item with the student's planning parameters and supplier lead time applied. */
export interface PlanningItem extends Item {
  supplierId?: string;
}

/** Everything the planning engines need; built from scenario + game state, no I/O. */
export interface PlanningInput {
  currentPeriod: number;
  /** Planning horizon, e.g. [3, 4, …, 10]. */
  periods: number[];
  items: PlanningItem[];
  bom: BomLine[];
  routings: RoutingOperation[];
  workCenters: WorkCenter[];
  suppliers: Supplier[];
  forecast: ForecastEntry[];
  customerOrders: CustomerOrder[];
  releasedOrders: Order[];
  inventory: InventoryBalance[];
  capacityAdjustments: WorkCenterCapacityAdjustment[];
  settings: ScenarioSettings;
}

export const horizonPeriods = (currentPeriod: number, length: number): number[] =>
  Array.from({ length }, (_, index) => currentPeriod + index);

/**
 * Applies parameter overrides. For purchased items the chosen supplier's
 * normal lead time replaces the item lead time, so changing supplier changes
 * when material can arrive.
 */
export const applyPlanningParameters = (
  items: readonly Item[],
  parameters: Readonly<Record<string, ItemPlanningParameters>>,
  suppliers: readonly Supplier[],
): PlanningItem[] =>
  items.map((item) => {
    const override = parameters[item.id];
    if (!override) return { ...item };
    const supplier = override.supplierId
      ? suppliers.find((candidate) => candidate.id === override.supplierId)
      : undefined;
    return {
      ...item,
      safetyStock: override.safetyStock,
      safetyLeadTimePeriods: override.safetyLeadTimePeriods,
      lotSizingPolicy: override.lotSizingPolicy,
      supplierId: override.supplierId,
      leadTimePeriods: supplier ? supplier.normalLeadTimePeriods : item.leadTimePeriods,
    };
  });

/** Usable on-hand = on hand minus allocations, summed over all warehouses. */
export const availableOnHand = (inventory: readonly InventoryBalance[], itemId: string): number =>
  inventory
    .filter((balance) => balance.itemId === itemId)
    .reduce((sum, balance) => sum + balance.quantityOnHand - balance.allocatedQuantity, 0);
