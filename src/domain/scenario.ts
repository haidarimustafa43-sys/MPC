import type { BomLine } from "./bom";
import type { LocalizedText } from "./common";
import type { CustomerOrder, ForecastEntry } from "./demand";
import type { EventDefinition } from "./event";
import type { Item } from "./item";
import type { ProductionOrder, PurchaseOrder } from "./order";
import type { RoutingOperation } from "./routing";
import type { Supplier } from "./supplier";
import type { Warehouse, WorkCenter } from "./workCenter";

export type EventMode = "fixed" | "seeded" | "random";

export interface ScenarioSettings {
  currency: string;
  gameLengthPeriods: number;
  planningHorizonPeriods: number;
  /** Inside the demand time fence only customer orders count as demand. */
  demandTimeFencePeriods: number;
  /** Planned orders inside the frozen zone should not be changed. */
  frozenZonePeriods: number;
  lateCostPerUnitPeriod: number;
  eventMode: EventMode;
  allowPartialProduction: boolean;
  expressDelivery?: { costPerUnit: number; leadTimeReductionPeriods: number };
  externalCapacity?: { costPerHour: number; maxHoursPerPeriod: number };
}

export interface ScenarioMeta {
  id: string;
  version: string;
  name: LocalizedText;
  description: LocalizedText;
  settings: ScenarioSettings;
  warehouses: Warehouse[];
}

export interface Scenario extends ScenarioMeta {
  items: Item[];
  bom: BomLine[];
  routings: RoutingOperation[];
  workCenters: WorkCenter[];
  suppliers: Supplier[];
  forecasts: ForecastEntry[];
  customerOrders: CustomerOrder[];
  productionOrders: ProductionOrder[];
  purchaseOrders: PurchaseOrder[];
  events: EventDefinition[];
}
