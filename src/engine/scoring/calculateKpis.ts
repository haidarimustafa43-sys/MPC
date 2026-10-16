import { isOpenDemand, remainingQuantity } from "../../domain/demand";
import type { KpiResult } from "../../domain/kpi";
import type { CrpResult, MpsResult, MrpResult } from "../../domain/planningVersion";
import { overloadedBuckets } from "../capacity/calculateCrp";
import { isCustomerOrderAtRisk } from "../constraints/evaluateConstraints";
import type { PlanningInput } from "../planningInput";

export const emptyKpis = (): KpiResult => ({
  revenue: 0,
  materialCost: 0,
  orderCost: 0,
  holdingCost: 0,
  overtimeCost: 0,
  expediteCost: 0,
  externalCapacityCost: 0,
  lateOrderCost: 0,
  netContribution: 0,
  serviceLevel: 1,
  lateCustomerOrders: 0,
  ordersAtRisk: 0,
  averageInventoryValue: 0,
  capacityOverloads: 0,
  overloadHours: 0,
  shortageUnits: 0,
  replanCount: 0,
});

/**
 * Projected KPIs of a plan over the planning horizon (rules in README):
 * - holding cost = Σ max(0, PAB) × holding cost per unit and period,
 * - order cost = number of new planned orders × order cost,
 * - material cost = planned purchase quantity × standard cost × supplier modifier,
 * - revenue = open customer orders in the horizon that are not at risk,
 * - late cost = quantity of late or at-risk orders × late cost per unit (one period).
 */
export const calculateProjectedKpis = (
  input: PlanningInput,
  mps: MpsResult,
  mrp: MrpResult,
  crp: CrpResult,
  replanCount: number,
): KpiResult => {
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const supplierById = new Map(input.suppliers.map((supplier) => [supplier.id, supplier]));

  let holdingCost = 0;
  let orderCost = 0;
  let materialCost = 0;
  let shortageUnits = 0;
  const inventoryValueByPeriod = new Array<number>(input.periods.length).fill(0);

  for (const record of mrp.records) {
    const item = itemById.get(record.itemId);
    if (!item) continue;
    record.projectedAvailable.forEach((balance, index) => {
      holdingCost += Math.max(0, balance) * item.holdingCostPerUnitPeriod;
      inventoryValueByPeriod[index] += Math.max(0, balance) * item.standardCost;
    });
    shortageUnits += Math.max(0, -Math.min(0, ...record.projectedAvailable));
    for (const order of record.plannedOrders) {
      orderCost += item.orderCost;
      if (order.kind === "PURCHASE") {
        const modifier =
          (order.supplierId && supplierById.get(order.supplierId)?.unitCostModifiers?.[item.id]) || 1;
        materialCost += order.quantity * item.standardCost * modifier;
      }
    }
  }

  const workCenterById = new Map(input.workCenters.map((wc) => [wc.id, wc]));
  const overtimeCost = crp.buckets.reduce(
    (sum, bucket) =>
      sum + bucket.overtimeHours * (workCenterById.get(bucket.workCenterId)?.overtimeCostPerHour ?? 0),
    0,
  );
  const externalCapacityCost = crp.buckets.reduce(
    (sum, bucket) => sum + bucket.externalHours * (input.settings.externalCapacity?.costPerHour ?? 0),
    0,
  );

  const lastPeriod = input.periods[input.periods.length - 1];
  const ordersInHorizon = input.customerOrders.filter(
    (order) => isOpenDemand(order) && order.duePeriod <= lastPeriod,
  );
  let revenue = 0;
  let lateOrderCost = 0;
  let ordersAtRisk = 0;
  let lateCustomerOrders = 0;
  for (const order of ordersInHorizon) {
    const quantity = remainingQuantity(order);
    const late = order.duePeriod < input.currentPeriod;
    const atRisk = !late && isCustomerOrderAtRisk(mps, order.itemId, order.duePeriod);
    if (late) lateCustomerOrders++;
    if (atRisk) ordersAtRisk++;
    if (late || atRisk) lateOrderCost += quantity * input.settings.lateCostPerUnitPeriod;
    else revenue += quantity * order.sellingPricePerUnit;
  }

  const overloaded = overloadedBuckets(crp);
  const expediteCost = 0;
  const totalCost =
    materialCost + orderCost + holdingCost + overtimeCost + expediteCost + externalCapacityCost + lateOrderCost;

  return {
    revenue,
    materialCost,
    orderCost,
    holdingCost,
    overtimeCost,
    expediteCost,
    externalCapacityCost,
    lateOrderCost,
    netContribution: revenue - totalCost,
    serviceLevel:
      ordersInHorizon.length === 0
        ? 1
        : (ordersInHorizon.length - ordersAtRisk - lateCustomerOrders) / ordersInHorizon.length,
    lateCustomerOrders,
    ordersAtRisk,
    averageInventoryValue:
      inventoryValueByPeriod.reduce((sum, value) => sum + value, 0) / Math.max(1, input.periods.length),
    capacityOverloads: overloaded.length,
    overloadHours: overloaded.reduce((sum, bucket) => sum - bucket.balanceHours, 0),
    shortageUnits,
    replanCount,
  };
};
