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
    firmOrders: input.firmPlannedOrders.filter((order) => order.itemId === item.id),
  });

  const fenceEnd = input.currentPeriod + input.settings.demandTimeFencePeriods - 1;
  input.periods.forEach((period, i) => {
    record.traces[`gross:${period}`] = {
      formula:
        period <= fenceEnd
          ? "total demand = customer orders (inside the demand time fence)"
          : "total demand = max(forecast, customer orders)",
      inputs: { forecast: forecast[i], customerOrders: orders[i], demandTimeFenceEndsInPeriod: fenceEnd },
      result: demand[i],
      explanationKey: period <= fenceEnd ? "mps.demandInsideFence" : "mps.demandOutsideFence",
    };
  });

  const supply = record.plannedReceipts.map((value, i) => value + scheduled[i]);
  const atp = calculateAtp(onHand, supply, orders);
  atp.forEach((value, i) => {
    if (value === null) return;
    const nextSupply = atp.findIndex((candidate, j) => j > i && candidate !== null);
    const end = nextSupply === -1 ? orders.length : nextSupply;
    const committed = orders.slice(i, end).reduce((sum, quantity) => sum + quantity, 0);
    record.traces[`atp:${input.periods[i]}`] = {
      formula: "ATP = (on hand, first period only) + supply − customer orders until the next supply",
      inputs: {
        onHand: i === 0 ? onHand : 0,
        supply: supply[i],
        customerOrdersUntilNextSupply: committed,
        coversPeriods: `${input.periods[i]}–${input.periods[end - 1]}`,
      },
      intermediateValues: { beforeBackwardNetting: (i === 0 ? onHand : 0) + supply[i] - committed },
      result: value,
      explanationKey: "mps.atp",
    };
  });

  return {
    ...record,
    forecast,
    customerOrders: orders,
    atp,
  };
};

export const calculateMps = (input: PlanningInput): MpsResult => ({
  records: input.items
    .filter((item) => item.active && item.type === "END_ITEM")
    .map((item) => calculateMpsRecord(input, item)),
});
