import type { Scenario } from "../domain/scenario";
import bom from "./standard/bom.json";
import customerOrders from "./standard/customerOrders.json";
import events from "./standard/events.json";
import forecasts from "./standard/forecasts.json";
import items from "./standard/items.json";
import openOrders from "./standard/openOrders.json";
import routings from "./standard/routings.json";
import meta from "./standard/scenario.json";
import suppliers from "./standard/suppliers.json";
import workCenters from "./standard/workCenters.json";
import { validateScenario } from "./validateScenario";

/*
 * Scenario files are bundled at build time. That keeps them working on GitHub
 * Pages under any base path (no runtime fetch of absolute URLs) and lets the
 * validator run before the first game starts.
 */

const rawScenarios: Record<string, unknown> = {
  standard: {
    ...meta,
    items,
    bom,
    routings,
    workCenters,
    suppliers,
    forecasts,
    customerOrders,
    productionOrders: openOrders.productionOrders,
    purchaseOrders: openOrders.purchaseOrders,
    events,
  },
};

export class ScenarioError extends Error {
  constructor(
    readonly scenarioId: string,
    readonly errors: string[],
  ) {
    super(`Scenario ${scenarioId} is invalid:\n${errors.join("\n")}`);
    this.name = "ScenarioError";
  }
}

const cache = new Map<string, Scenario>();

export const scenarioIds = (): string[] => Object.keys(rawScenarios);

export const loadScenario = (id: string): Scenario => {
  const cached = cache.get(id);
  if (cached) return cached;
  const raw = rawScenarios[id];
  if (!raw) throw new ScenarioError(id, [`Unknown scenario "${id}".`]);
  const result = validateScenario(raw);
  if (!result.ok) throw new ScenarioError(id, result.errors);
  cache.set(id, result.scenario);
  return result.scenario;
};
