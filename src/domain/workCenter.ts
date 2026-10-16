export interface WorkCenter {
  id: string;
  name: string;
  /** Normal capacity in hours, index 0 = period 1. */
  normalCapacityHoursByPeriod: number[];
  overtimeCapacityLimitHours?: number;
  overtimeCostPerHour?: number;
}

export interface Warehouse {
  id: string;
  name: string;
  type: "RAW_MATERIAL" | "WIP" | "FINISHED_GOODS";
}
