export interface RoutingOperation {
  itemId: string;
  sequence: number;
  workCenterId: string;
  setupHours: number;
  runHoursPerUnit: number;
  yieldRate?: number;
}
