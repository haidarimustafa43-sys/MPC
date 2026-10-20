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
/** Scenarios imported at runtime (validated before registration). */
const custom = new Map<string, Scenario>();

export const builtInScenarioIds = (): string[] => Object.keys(rawScenarios);
export const scenarioIds = (): string[] => [...Object.keys(rawScenarios), ...custom.keys()];
export const isBuiltInScenario = (id: string): boolean => id in rawScenarios;
export const isKnownScenario = (id: string): boolean => id in rawScenarios || custom.has(id);
export const customScenario = (id: string): Scenario | undefined => custom.get(id);

/**
 * Validates and registers a scenario that is not built in (imported JSON).
 * Built-in ids cannot be replaced.
 */
export const registerScenario = (data: unknown): { ok: true; scenario: Scenario } | { ok: false; errors: string[] } => {
  const result = validateScenario(data);
  if (!result.ok) return result;
  if (isBuiltInScenario(result.scenario.id)) {
    return { ok: false, errors: [`The id "${result.scenario.id}" belongs to a built-in scenario. Choose another id.`] };
  }
  custom.set(result.scenario.id, result.scenario);
  return { ok: true, scenario: result.scenario };
};

export const unregisterScenario = (id: string): void => {
  custom.delete(id);
};

/** The built-in scenario as one JSON document, as a template for teachers. */
export const scenarioAsJson = (id: string): string => JSON.stringify(loadScenario(id), null, 2);

export const loadScenario = (id: string): Scenario => {
  const imported = custom.get(id);
  if (imported) return imported;
  const cached = cache.get(id);
  if (cached) return cached;
  const raw = rawScenarios[id];
  if (!raw) throw new ScenarioError(id, [`Unknown scenario "${id}".`]);
  const result = validateScenario(raw);
  if (!result.ok) throw new ScenarioError(id, result.errors);
  cache.set(id, result.scenario);
  return result.scenario;
};
