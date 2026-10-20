import type { ProductionOrder } from "../../domain/order";
import type {
  CapacityBucket,
  CapacityContribution,
  CrpResult,
  PlannedOrder,
} from "../../domain/planningVersion";
import type { RoutingOperation } from "../../domain/routing";
import type { PlanningInput } from "../planningInput";
import { capacityAvailability } from "./capacityAvailability";

export interface LoadableOrder {
  orderId: string;
  itemId: string;
  orderType: "PLANNED" | "RELEASED";
  /** True when work on the order has started on the shop floor. */
  started: boolean;
  /** Routing steps already finished (set by the simulation). */
  completedOperations?: number;
  quantity: number;
  releasePeriod: number;
  duePeriod: number;
}

/**
 * Number of finished operations. Without simulation data, a started order is
 * assumed to have finished the operations scheduled before the current period.
 */
export const completedOperationsOf = (
  order: LoadableOrder,
  operationCount: number,
  currentPeriod: number,
): number => {
  if (order.completedOperations !== undefined) return order.completedOperations;
  if (!order.started) return 0;
  let done = 0;
  while (done < operationCount && operationPeriod(order, done, operationCount) < currentPeriod) done++;
  return done;
};

/**
 * Load without any capacity would be an infinite utilisation; a finite cap
 * keeps results serialisable to JSON (Infinity becomes null).
 */
export const MAX_UTILIZATION = 99.99;

export const utilizationOf = (loadHours: number, availableHours: number): number =>
  availableHours > 0
    ? Math.min(MAX_UTILIZATION, loadHours / availableHours)
    : loadHours > 0
      ? MAX_UTILIZATION
      : 0;

export const operationsFor =(routings: readonly RoutingOperation[], itemId: string): RoutingOperation[] =>
  routings.filter((operation) => operation.itemId === itemId).sort((a, b) => a.sequence - b.sequence);

/** capacity load = setup time per order + order quantity × run time per unit (adjusted for yield). */
export const operationLoad = (
  operation: RoutingOperation,
  quantity: number,
): { setupHours: number; runHours: number; totalHours: number } => {
  const yieldRate = operation.yieldRate && operation.yieldRate > 0 ? operation.yieldRate : 1;
  const runHours = (quantity / yieldRate) * operation.runHoursPerUnit;
  return { setupHours: operation.setupHours, runHours, totalHours: operation.setupHours + runHours };
};

/**
 * Spreads an order's operations evenly over its lead time: operation k of n is
 * loaded in release + floor(k · leadTime / n). With lead time 0 everything is
 * loaded in the release period.
 */
export const operationPeriod = (
  order: LoadableOrder,
  operationIndex: number,
  operationCount: number,
): number => {
  const leadTime = Math.max(0, order.duePeriod - order.releasePeriod);
  if (leadTime === 0 || operationCount === 0) return order.releasePeriod;
  return order.releasePeriod + Math.floor((operationIndex * leadTime) / operationCount);
};

export const loadableOrders = (
  plannedOrders: readonly PlannedOrder[],
  releasedOrders: readonly ProductionOrder[],
): LoadableOrder[] => [
  ...plannedOrders
    .filter((order) => order.kind === "PRODUCTION")
    .map((order) => ({
      orderId: order.id,
      itemId: order.itemId,
      orderType: "PLANNED" as const,
      started: false,
      quantity: order.quantity,
      releasePeriod: order.releasePeriod,
      duePeriod: order.receiptPeriod,
    })),
  ...releasedOrders
    .filter((order) => order.status === "RELEASED" || order.status === "IN_PROGRESS")
    .map((order) => ({
      orderId: order.id,
      itemId: order.itemId,
      orderType: "RELEASED" as const,
      started: order.status === "IN_PROGRESS",
      completedOperations: order.completedOperations,
      quantity: order.quantity,
      releasePeriod: order.releasePeriod,
      duePeriod: order.duePeriod,
    })),
];

/**
 * Detailed capacity requirements per work centre, period, order and operation.
 * Finished operations are not loaded. Remaining work that was scheduled before
 * the current period is still ahead, so it is loaded in the current period.
 */
export const calculateCrp = (input: PlanningInput, orders: readonly LoadableOrder[]): CrpResult => {
  const contributions = new Map<string, CapacityContribution[]>();
  const key = (workCenterId: string, period: number): string => `${workCenterId}:${period}`;

  for (const order of orders) {
    const operations = operationsFor(input.routings, order.itemId);
    const done = completedOperationsOf(order, operations.length, input.currentPeriod);
    operations.forEach((operation, index) => {
      if (index < done) return;
      const scheduled = operationPeriod(order, index, operations.length);
      const period = Math.max(scheduled, input.currentPeriod);
      const load = operationLoad(operation, order.quantity);
      const bucketKey = key(operation.workCenterId, period);
      contributions.set(bucketKey, [
        ...(contributions.get(bucketKey) ?? []),
        {
          orderId: order.orderId,
          itemId: order.itemId,
          orderType: order.orderType,
          operationSequence: operation.sequence,
          quantity: order.quantity,
          ...load,
        },
      ]);
    });
  }

  const buckets: CapacityBucket[] = input.workCenters.flatMap((workCenter) =>
    input.periods.map((period) => {
      const availability = capacityAvailability(workCenter, period, input.capacityAdjustments);
      const bucketContributions = contributions.get(key(workCenter.id, period)) ?? [];
      const loadHours = bucketContributions.reduce((sum, item) => sum + item.totalHours, 0);
      return {
        workCenterId: workCenter.id,
        period,
        ...availability,
        loadHours,
        balanceHours: availability.availableHours - loadHours,
        utilization: utilizationOf(loadHours, availability.availableHours),
        contributions: bucketContributions,
      };
    }),
  );

  return { buckets };
};

export const overloadedBuckets = (crp: CrpResult, tolerance = 1e-6): CapacityBucket[] =>
  crp.buckets.filter((bucket) => bucket.balanceHours < -tolerance);
