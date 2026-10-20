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
  /** Students may change the forecast for periods after the demand time fence. */
  forecastEditable?: boolean;
  /** Customer orders that arrive every week, derived from the forecast (see README). */
  orderIntake?: OrderIntakeSettings;
  /** Weights of the illustrative total score (see README); not a grade. */
  scoring?: ScoringSettings;
}

export interface OrderIntakeSettings {
  /** Orders arrive this many periods before they are due. */
  leadPeriods: number;
  /** Relative deviation from the forecast, e.g. 0.2 = up to ±20 %. */
  variation: number;
  /** Customers take turns, one order per item and week. */
  customers: string[];
}

export interface ScoringSettings {
  deliveryWeight: number;
  financialWeight: number;
  planAdherenceWeight: number;
  /** Net contribution per week that gives full financial points. */
  referenceNetContributionPerPeriod: number;
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
