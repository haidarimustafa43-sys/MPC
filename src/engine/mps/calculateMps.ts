import type { MpsRecord, MpsResult } from "../../domain/planningVersion";
import { customerDemandFor, scheduledReceiptsFor } from "../inventory/projectInventory";
import { timePhaseOrders } from "../mrp/timePhaseOrders";
import type { PlanningInput, PlanningItem } from "../planningInput";
import { availableOnHand } from "../planningInput";
import { calculateAtp } from "./calculateAtp";

/**
 * Forecast consumption rule (documented in README):
 * - inside the demand time fence (the first `demandTimeFencePeriods` periods
 *   from the current period) only customer orders count;
 * - outside it, total demand = max(forecast, customer orders), i.e. customer
 *   orders consume the forecast and only orders above forecast add demand.
 */
export const totalDemand = (
  periods: readonly number[],
  currentPeriod: number,
  demandTimeFencePeriods: number,
  forecast: readonly number[],
  customerOrders: readonly number[],
): number[] =>
  periods.map((period, i) =>
    period < currentPeriod + demandTimeFencePeriods
      ? customerOrders[i]
      : Math.max(forecast[i], customerOrders[i]),
  );

export const forecastFor = (input: PlanningInput, itemId: string): number[] =>
  input.periods.map((period) =>
    input.forecast
      .filter((entry) => entry.itemId === itemId && entry.period === period)
      .reduce((sum, entry) => sum + entry.quantity, 0),
  );

export const calculateMpsRecord = (input: PlanningInput, item: PlanningItem): MpsRecord => {
  const forecast = forecastFor(input, item.id);
  const orders = customerDemandFor(item.id, input.customerOrders, input.periods).values;
  const demand = totalDemand(
    input.periods,
    input.currentPeriod,
    input.settings.demandTimeFencePeriods,
    forecast,
    orders,
  );
  const scheduled = scheduledReceiptsFor(item.id, input.releasedOrders, input.periods).values;
  const onHand = availableOnHand(input.inventory, item.id);

  const record = timePhaseOrders({
    itemId: item.id,
    kind: "PRODUCTION",
    currentPeriod: input.currentPeriod,
    periods: input.periods,
    startingOnHand: onHand,
    grossRequirements: demand,
    scheduledReceipts: scheduled,
    safetyStock: item.safetyStock,
    leadTimePeriods: item.leadTimePeriods,
    safetyLeadTimePeriods: item.safetyLeadTimePeriods,
    lotSizingPolicy: item.lotSizingPolicy,
    orderCost: item.orderCost,
    holdingCostPerUnitPeriod: item.holdingCostPerUnitPeriod,
    lowLevelCode: 0,
  });

  const supply = record.plannedReceipts.map((value, i) => value + scheduled[i]);
  return {
    ...record,
    forecast,
    customerOrders: orders,
    atp: calculateAtp(onHand, supply, orders),
  };
};

export const calculateMps = (input: PlanningInput): MpsResult => ({
  records: input.items
    .filter((item) => item.active && item.type === "END_ITEM")
    .map((item) => calculateMpsRecord(input, item)),
});
