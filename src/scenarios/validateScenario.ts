import type { Scenario } from "../domain/scenario";
import { validateBom } from "../engine/mrp/explodeBom";
import { scenarioSchema } from "./schema";

export type ScenarioValidation =
  | { ok: true; scenario: Scenario }
  | { ok: false; errors: string[] };

const duplicates = (ids: readonly string[]): string[] =>
  [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];

/** Cross-reference checks that a JSON schema cannot express. */
export const referentialErrors = (scenario: Scenario): string[] => {
  const errors: string[] = [];
  const itemIds = new Set(scenario.items.map((item) => item.id));
  const workCenterIds = new Set(scenario.workCenters.map((wc) => wc.id));
  const warehouseIds = new Set(scenario.warehouses.map((wh) => wh.id));
  const supplierIds = new Set(scenario.suppliers.map((s) => s.id));

  for (const id of duplicates(scenario.items.map((item) => item.id))) errors.push(`Duplicate item id ${id}.`);
  const orderIds = [
    ...scenario.customerOrders.map((o) => o.id),
    ...scenario.productionOrders.map((o) => o.id),
    ...scenario.purchaseOrders.map((o) => o.id),
  ];
  for (const id of duplicates(orderIds)) errors.push(`Duplicate order id ${id}.`);
  for (const id of duplicates(scenario.events.map((e) => e.id))) errors.push(`Duplicate event id ${id}.`);

  for (const item of scenario.items) {
    if (!warehouseIds.has(item.defaultWarehouseId)) {
      errors.push(`Item ${item.id} refers to unknown warehouse ${item.defaultWarehouseId}.`);
    }
  }
  for (const operation of scenario.routings) {
    if (!itemIds.has(operation.itemId)) errors.push(`Routing refers to unknown item ${operation.itemId}.`);
    if (!workCenterIds.has(operation.workCenterId)) {
      errors.push(`Routing of ${operation.itemId} refers to unknown work centre ${operation.workCenterId}.`);
    }
  }
  for (const supplier of scenario.suppliers) {
    for (const itemId of supplier.suppliedItemIds) {
      if (!itemIds.has(itemId)) errors.push(`Supplier ${supplier.id} refers to unknown item ${itemId}.`);
    }
  }
  for (const entry of scenario.forecasts) {
    if (!itemIds.has(entry.itemId)) errors.push(`Forecast refers to unknown item ${entry.itemId}.`);
  }
  for (const order of [...scenario.customerOrders, ...scenario.productionOrders, ...scenario.purchaseOrders]) {
    if (!itemIds.has(order.itemId)) errors.push(`Order ${order.id} refers to unknown item ${order.itemId}.`);
  }
  for (const order of scenario.purchaseOrders) {
    if (!supplierIds.has(order.supplierId)) {
      errors.push(`Purchase order ${order.id} refers to unknown supplier ${order.supplierId}.`);
    }
  }
  const eventIds = new Set(scenario.events.map((event) => event.id));
  for (const event of scenario.events) {
    for (const followUp of event.followUpEventIds ?? []) {
      if (!eventIds.has(followUp)) errors.push(`Event ${event.id} refers to unknown follow-up ${followUp}.`);
    }
  }
  errors.push(...validateBom(scenario.items, scenario.bom).map((error) => error.message));
  return errors;
};

/** Validates unknown JSON as a scenario and returns readable error messages. */
export const validateScenario = (data: unknown): ScenarioValidation => {
  const parsed = scenarioSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    };
  }
  const errors = referentialErrors(parsed.data);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, scenario: parsed.data };
};
