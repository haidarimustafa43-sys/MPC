import type { MpsResult, RccpResult } from "../../domain/planningVersion";
import { explodeQuantity } from "../mrp/explodeBom";
import type { PlanningInput } from "../planningInput";
import { capacityAvailability } from "./capacityAvailability";
import { operationsFor, utilizationOf } from "./calculateCrp";

/**
 * Bill of resources: run hours per unit of an end item on each work centre,
 * including all manufactured components. Setup times are left out because they
 * depend on lot sizes, which RCCP deliberately ignores.
 */
export const billOfResources = (
  input: PlanningInput,
  endItemId: string,
): Record<string, number> => {
  const hours: Record<string, number> = {};
  const add = (itemId: string, quantity: number): void => {
    for (const operation of operationsFor(input.routings, itemId)) {
      const yieldRate = operation.yieldRate && operation.yieldRate > 0 ? operation.yieldRate : 1;
      hours[operation.workCenterId] =
        (hours[operation.workCenterId] ?? 0) + (quantity / yieldRate) * operation.runHoursPerUnit;
    }
  };
  add(endItemId, 1);
  for (const [componentId, quantity] of Object.entries(explodeQuantity(input.bom, endItemId, 1))) {
    add(componentId, quantity);
  }
  return hours;
};

/**
 * Rough-cut capacity check of the MPS. All load is placed in the MPS receipt
 * period without lead-time offset; this is a coarse check that is kept
 * separate from the detailed CRP on purpose.
 */
export const calculateRccp = (input: PlanningInput, mps: MpsResult): RccpResult => {
  const bor: Record<string, Record<string, number>> = {};
  for (const record of mps.records) bor[record.itemId] = billOfResources(input, record.itemId);

  const buckets = input.workCenters.flatMap((workCenter) =>
    input.periods.map((period, index) => {
      const loadHours = mps.records.reduce(
        (sum, record) =>
          sum +
          (record.plannedReceipts[index] + record.scheduledReceipts[index]) *
            (bor[record.itemId][workCenter.id] ?? 0),
        0,
      );
      const { availableHours } = capacityAvailability(workCenter, period, input.capacityAdjustments);
      return {
        workCenterId: workCenter.id,
        period,
        availableHours,
        loadHours,
        utilization: utilizationOf(loadHours, availableHours),
      };
    }),
  );
  return { billOfResources: bor, buckets };
};
