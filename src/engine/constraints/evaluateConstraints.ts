import type { ConstraintViolation } from "../../domain/constraint";
import { isOpenDemand, remainingQuantity } from "../../domain/demand";
import type { GameState } from "../../domain/gameState";
import type { CrpResult, ItemPlanRecord, MpsResult, MrpResult } from "../../domain/planningVersion";
import { isOpenReleasedOrder } from "../../domain/order";
import { overloadedBuckets } from "../capacity/calculateCrp";
import { validateBom } from "../mrp/explodeBom";
import type { PlanningInput } from "../planningInput";

/*
 * The constraint engine reports problems; it never changes the plan and never
 * recommends a specific solution. Messages name the problem and its size and may
 * list contributing orders, but do not say what to move where.
 */

const fmt = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

export const evaluateDataConstraints = (input: PlanningInput): ConstraintViolation[] => {
  const bomViolations: ConstraintViolation[] = validateBom(input.items, input.bom).map(
    (error, index) => ({
      id: `INVALID_BOM-${index}`,
      type: "INVALID_BOM",
      severity: "BLOCKING",
      title: "Invalid bill of materials",
      description: error.message,
      itemId: error.itemIds[0],
      params: { detail: error.message },
      source: "DATA",
    }),
  );
  const routedItems = new Set(input.routings.map((operation) => operation.itemId));
  const routingViolations: ConstraintViolation[] = input.items
    .filter((item) => item.active && item.type !== "PURCHASED" && !routedItems.has(item.id))
    .map((item) => ({
      id: `MISSING_ROUTING-${item.id}`,
      type: "MISSING_ROUTING",
      severity: "WARNING",
      title: `Missing routing for ${item.id}`,
      description: `${item.id} is manufactured but has no routing, so it creates no capacity load.`,
      itemId: item.id,
      params: { item: item.id },
      source: "DATA",
    }));
  return [...bomViolations, ...routingViolations];
};

const firstIndex = (values: readonly number[], predicate: (value: number) => boolean): number =>
  values.findIndex(predicate);

const inventoryViolations = (
  record: ItemPlanRecord,
  isEndItem: boolean,
  parentOrderIdsByPeriod: (period: number) => string[],
): ConstraintViolation[] => {
  const source = isEndItem ? "MPS" : "MRP";
  const negativeIndex = firstIndex(record.projectedAvailable, (value) => value < 0);
  if (negativeIndex >= 0) {
    const period = record.periods[negativeIndex];
    const shortage = -Math.min(...record.projectedAvailable);
    return [
      isEndItem
        ? {
            id: `INVENTORY_BELOW_ZERO-${record.itemId}`,
            type: "INVENTORY_BELOW_ZERO",
            severity: "CRITICAL",
            title: `${record.itemId}: projected inventory below zero`,
            description: `Projected available balance of ${record.itemId} drops below zero in period ${period} (largest shortage ${fmt(shortage)} units).`,
            period,
            itemId: record.itemId,
            params: { item: record.itemId, period, quantity: fmt(shortage) },
            source,
          }
        : {
            id: `MISSING_MATERIAL-${record.itemId}`,
            type: "MISSING_MATERIAL",
            severity: "CRITICAL",
            title: `${record.itemId}: missing material`,
            description: `${record.itemId} is short by up to ${fmt(shortage)} units from period ${period}. Parent orders that need it may not be able to start.`,
            period,
            itemId: record.itemId,
            relatedOrderIds: parentOrderIdsByPeriod(period),
            params: { item: record.itemId, period, quantity: fmt(shortage) },
            source,
          },
    ];
  }
  const belowIndex = firstIndex(record.projectedAvailable, (value) => value < record.safetyStock);
  if (belowIndex >= 0) {
    const period = record.periods[belowIndex];
    return [
      {
        id: `INVENTORY_BELOW_SAFETY_STOCK-${record.itemId}`,
        type: "INVENTORY_BELOW_SAFETY_STOCK",
        severity: "WARNING",
        title: `${record.itemId}: below safety stock`,
        description: `Projected available balance of ${record.itemId} is below the safety stock of ${fmt(record.safetyStock)} in period ${period}.`,
        period,
        itemId: record.itemId,
        params: { item: record.itemId, period, safetyStock: fmt(record.safetyStock) },
        source,
      },
    ];
  }
  return [];
};

export const evaluatePlanConstraints = (
  input: PlanningInput,
  mps: MpsResult,
  mrp: MrpResult,
  crp: CrpResult,
): ConstraintViolation[] => {
  const violations: ConstraintViolation[] = [];
  const endItemIds = new Set(mps.records.map((record) => record.itemId));
  const parentsOf = (itemId: string): string[] =>
    input.bom.filter((line) => line.componentItemId === itemId).map((line) => line.parentItemId);
  const plannedOrders = mrp.records.flatMap((record) => record.plannedOrders);

  for (const record of mrp.records) {
    const parents = parentsOf(record.itemId);
    const parentOrdersFrom = (period: number): string[] =>
      plannedOrders
        .filter((order) => parents.includes(order.itemId) && order.releasePeriod >= period)
        .map((order) => order.id);
    violations.push(...inventoryViolations(record, endItemIds.has(record.itemId), parentOrdersFrom));

    for (const order of record.plannedOrders.filter((candidate) => candidate.compressed)) {
      violations.push({
        id: `LATE_PLANNED_RELEASE-${order.id}`,
        type: "LATE_PLANNED_RELEASE",
        severity: "WARNING",
        title: `${record.itemId}: safety lead time cannot be kept`,
        description: `Planned order ${order.id} for period ${order.neededPeriod} cannot be released early enough to keep the safety lead time.`,
        period: order.releasePeriod,
        itemId: record.itemId,
        relatedOrderIds: [order.id],
        params: { item: record.itemId, order: order.id, period: order.neededPeriod },
        source: endItemIds.has(record.itemId) ? "MPS" : "MRP",
      });
    }

    const releaseNow = record.plannedOrders.filter(
      (order) => order.releasePeriod === input.currentPeriod,
    );
    if (releaseNow.length > 0) {
      violations.push({
        id: `RELEASE_DUE-${record.itemId}`,
        type: "RELEASE_DUE",
        severity: "INFO",
        title: `${record.itemId}: planned order release due this period`,
        description: `${releaseNow.length} planned order(s) for ${record.itemId} have their release date in the current period.`,
        period: input.currentPeriod,
        itemId: record.itemId,
        relatedOrderIds: releaseNow.map((order) => order.id),
        params: { item: record.itemId, count: releaseNow.length },
        source: endItemIds.has(record.itemId) ? "MPS" : "MRP",
      });
    }
  }

  for (const order of input.releasedOrders) {
    if (isOpenReleasedOrder(order) && order.duePeriod < input.currentPeriod) {
      violations.push({
        id: `PAST_DUE_ORDER-${order.id}`,
        type: "PAST_DUE_ORDER",
        severity: "WARNING",
        title: `${order.id} is past due`,
        description: `${order.kind === "PURCHASE" ? "Purchase" : "Production"} order ${order.id} (${order.itemId}) was due in period ${order.duePeriod} and is still open.`,
        period: order.duePeriod,
        itemId: order.itemId,
        relatedOrderIds: [order.id],
        params: { order: order.id, item: order.itemId, period: order.duePeriod },
        source: "INVENTORY",
      });
    }
  }

  for (const bucket of overloadedBuckets(crp)) {
    const hours = -bucket.balanceHours;
    violations.push({
      id: `WORK_CENTER_OVERLOAD-${bucket.workCenterId}-${bucket.period}`,
      type: "WORK_CENTER_OVERLOAD",
      severity: "CRITICAL",
      title: `${bucket.workCenterId} overloaded in period ${bucket.period}`,
      description: `${bucket.workCenterId} is overloaded by ${fmt(hours)} hours in period ${bucket.period} (load ${fmt(bucket.loadHours)} h, available ${fmt(bucket.availableHours)} h).`,
      period: bucket.period,
      workCenterId: bucket.workCenterId,
      relatedOrderIds: [...new Set(bucket.contributions.map((item) => item.orderId))],
      params: { workCenter: bucket.workCenterId, period: bucket.period, hours: fmt(hours) },
      source: "CRP",
    });
  }

  violations.push(...customerOrderViolations(input, mps));
  violations.push(...supplierViolations(input));
  return violations;
};

export const customerOrderViolations = (input: PlanningInput, mps: MpsResult): ConstraintViolation[] => {
  const violations: ConstraintViolation[] = [];
  for (const order of input.customerOrders.filter(isOpenDemand)) {
    const quantity = remainingQuantity(order);
    if (order.duePeriod < input.currentPeriod) {
      violations.push({
        id: `CUSTOMER_ORDER_LATE-${order.id}`,
        type: "CUSTOMER_ORDER_LATE",
        severity: "CRITICAL",
        title: `${order.id} is late`,
        description: `${order.customerName} order ${order.id} (${quantity} × ${order.itemId}) was due in period ${order.duePeriod}.`,
        period: order.duePeriod,
        itemId: order.itemId,
        relatedOrderIds: [order.id],
        params: { order: order.id, customer: order.customerName, period: order.duePeriod },
        source: "MPS",
      });
      continue;
    }
    if (isCustomerOrderAtRisk(mps, order.itemId, order.duePeriod)) {
      violations.push({
        id: `CUSTOMER_ORDER_AT_RISK-${order.id}`,
        type: "CUSTOMER_ORDER_AT_RISK",
        severity: "WARNING",
        title: `${order.id} at risk`,
        description: `${order.customerName} order ${order.id} (${quantity} × ${order.itemId}, due period ${order.duePeriod}) may not be delivered on time: projected availability is negative.`,
        period: order.duePeriod,
        itemId: order.itemId,
        relatedOrderIds: [order.id],
        params: { order: order.id, customer: order.customerName, period: order.duePeriod },
        source: "MPS",
      });
    }
  }
  return violations;
};

/** An order is at risk when the end item's projected balance is negative in its due period. */
export const isCustomerOrderAtRisk = (mps: MpsResult, itemId: string, duePeriod: number): boolean => {
  const record = mps.records.find((candidate) => candidate.itemId === itemId);
  if (!record) return true;
  const index = record.periods.indexOf(duePeriod);
  return index >= 0 && record.projectedAvailable[index] < 0;
};

const supplierViolations = (input: PlanningInput): ConstraintViolation[] =>
  input.items
    .filter((item) => item.type === "PURCHASED" && item.supplierId)
    .flatMap((item) => {
      const supplier = input.suppliers.find((candidate) => candidate.id === item.supplierId);
      if (supplier && supplier.active && supplier.suppliedItemIds.includes(item.id)) return [];
      return [
        {
          id: `SUPPLIER_UNAVAILABLE-${item.id}`,
          type: "SUPPLIER_UNAVAILABLE" as const,
          severity: "CRITICAL" as const,
          title: `Supplier unavailable for ${item.id}`,
          description: `The selected supplier ${item.supplierId} cannot currently deliver ${item.id}.`,
          itemId: item.id,
          params: { item: item.id, supplier: item.supplierId ?? "" },
          source: "MRP" as const,
        },
      ];
    });

/** Workflow problems that depend on the game state rather than on a plan. */
export const evaluateGameConstraints = (game: GameState): ConstraintViolation[] => {
  const violations: ConstraintViolation[] = [];
  const versionsThisPeriod = game.planningVersions.filter((v) => v.period === game.currentPeriod);
  if (game.pendingDecisionIds.length > 0 && versionsThisPeriod.length > 0) {
    violations.push({
      id: "PLAN_NOT_RECALCULATED",
      type: "PLAN_NOT_RECALCULATED",
      severity: "WARNING",
      title: "Plan not recalculated",
      description: `${game.pendingDecisionIds.length} planning change(s) were made after the latest planning run.`,
      params: { count: game.pendingDecisionIds.length },
      source: "DATA",
    });
  }
  const committedThisPeriod = versionsThisPeriod.some((v) => v.id === game.committedPlanVersionId);
  if (versionsThisPeriod.length > 0 && !committedThisPeriod) {
    violations.push({
      id: "UNCOMMITTED_CHANGES",
      type: "UNCOMMITTED_CHANGES",
      severity: "INFO",
      title: "Plan not committed",
      description: "No planning version has been committed for the current period.",
      params: {},
      source: "DATA",
    });
  }
  return violations;
};

const severityRank = { BLOCKING: 0, CRITICAL: 1, WARNING: 2, INFO: 3 } as const;

export const sortViolations = (violations: readonly ConstraintViolation[]): ConstraintViolation[] =>
  [...violations].sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity] || (a.period ?? 0) - (b.period ?? 0),
  );
