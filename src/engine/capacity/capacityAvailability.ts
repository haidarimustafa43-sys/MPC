import type { WorkCenterCapacityAdjustment } from "../../domain/planningVersion";
import type { WorkCenter } from "../../domain/workCenter";

export interface CapacityAvailability {
  normalCapacityHours: number;
  capacityFactor: number;
  overtimeHours: number;
  externalHours: number;
  availableHours: number;
}

/** Normal capacity for a period; beyond the defined array the last value repeats. */
export const normalCapacity = (workCenter: WorkCenter, period: number): number => {
  const values = workCenter.normalCapacityHoursByPeriod;
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.max(0, period - 1))];
};

/**
 * available = normal × capacity factor + overtime + external capacity.
 * Overtime is capped by the work centre's overtime limit so that an invalid
 * decision can never create unlimited capacity.
 */
export const capacityAvailability = (
  workCenter: WorkCenter,
  period: number,
  adjustments: readonly WorkCenterCapacityAdjustment[],
): CapacityAvailability => {
  const adjustment = adjustments.find(
    (candidate) => candidate.workCenterId === workCenter.id && candidate.period === period,
  );
  const normalCapacityHours = normalCapacity(workCenter, period);
  const capacityFactor = adjustment?.capacityFactor ?? 1;
  const overtimeLimit = workCenter.overtimeCapacityLimitHours ?? 0;
  const overtimeHours = Math.min(Math.max(0, adjustment?.overtimeHours ?? 0), overtimeLimit);
  const externalHours = Math.max(0, adjustment?.externalHours ?? 0);
  return {
    normalCapacityHours,
    capacityFactor,
    overtimeHours,
    externalHours,
    availableHours: normalCapacityHours * capacityFactor + overtimeHours + externalHours,
  };
};
