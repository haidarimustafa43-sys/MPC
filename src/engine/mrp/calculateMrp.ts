import { isUnstartedProductionOrder } from "../../domain/order";
import type { ItemPlanRecord, MpsResult, MrpResult } from "../../domain/planningVersion";
import { scheduledReceiptsFor } from "../inventory/projectInventory";
import type { PlanningInput } from "../planningInput";
import { availableOnHand } from "../planningInput";
import type { ParentRelease } from "./explodeBom";
import { computeLowLevelCodes, explodeReleases } from "./explodeBom";
import { timePhaseOrders } from "./timePhaseOrders";

const releasesOf = (record: ItemPlanRecord): ParentRelease[] =>
  record.plannedOrders.map((order) => ({
    orderId: order.id,
    parentItemId: record.itemId,
    releasePeriod: order.releasePeriod,
    quantity: order.quantity,
  }));

/**
 * Released production orders that have not started still need their
 * components (an allocation). Started orders already have their material.
 */
const allocationsOf = (input: PlanningInput): ParentRelease[] =>
  input.releasedOrders.filter(isUnstartedProductionOrder).map((order) => ({
    orderId: order.id,
    parentItemId: order.itemId,
    releasePeriod: Math.max(order.releasePeriod, input.currentPeriod),
    quantity: order.quantity,
  }));

/**
 * Multi-level MRP. Items are processed by low-level code so that all parents
 * have been planned before a component is netted. Component gross requirements
 * come from the parents' planned order releases (including firm planned
 * orders) and from released orders that have not started yet (see README).
 *
 * The caller must validate the BOM first; with a cyclic BOM the low-level codes
 * are not meaningful (the engine still terminates).
 */
export const calculateMrp = (input: PlanningInput, mps: MpsResult): MrpResult => {
  const allocations = allocationsOf(input);
  const items = input.items.filter((item) => item.active);
  const lowLevelCodes = computeLowLevelCodes(items, input.bom);
  const ordered = [...items].sort(
    (a, b) => lowLevelCodes[a.id] - lowLevelCodes[b.id] || a.id.localeCompare(b.id),
  );

  const records = new Map<string, ItemPlanRecord>();
  for (const record of mps.records) records.set(record.itemId, { ...record, lowLevelCode: 0 });

  const first = input.periods[0];
  const n = input.periods.length;

  for (const item of ordered) {
    if (records.has(item.id)) continue;

    const gross = new Array<number>(n).fill(0);
    // Pegging: which parent orders create each gross requirement.
    const sources: Record<number, Record<string, number>> = {};
    const parentReleases = [...[...records.values()].flatMap(releasesOf), ...allocations];
    for (const demand of explodeReleases(input.bom, parentReleases)) {
      if (demand.componentItemId !== item.id) continue;
      const index = demand.period - first;
      // A parent release before the horizon is already reported as late on the
      // parent; its material is still needed now.
      if (index >= n) continue;
      const bucket = Math.max(0, index);
      gross[bucket] += demand.quantity;
      const label = `${demand.sourceOrderId} (${demand.parentItemId})`;
      sources[bucket] = { ...sources[bucket], [label]: (sources[bucket]?.[label] ?? 0) + demand.quantity };
    }

    const record = timePhaseOrders({
      itemId: item.id,
      kind: item.type === "PURCHASED" ? "PURCHASE" : "PRODUCTION",
      supplierId: item.supplierId,
      currentPeriod: input.currentPeriod,
      periods: input.periods,
      startingOnHand: availableOnHand(input.inventory, item.id),
      grossRequirements: gross,
      scheduledReceipts: scheduledReceiptsFor(item.id, input.releasedOrders, input.periods).values,
      safetyStock: item.safetyStock,
      leadTimePeriods: item.leadTimePeriods,
      safetyLeadTimePeriods: item.safetyLeadTimePeriods,
      lotSizingPolicy: item.lotSizingPolicy,
      orderCost: item.orderCost,
      holdingCostPerUnitPeriod: item.holdingCostPerUnitPeriod,
      lowLevelCode: lowLevelCodes[item.id],
      firmOrders: input.firmPlannedOrders.filter((order) => order.itemId === item.id),
    });
    for (const [index, parents] of Object.entries(sources)) {
      const period = input.periods[Number(index)];
      record.traces[`gross:${period}`] = {
        formula: "gross requirement = Σ parent order releases × quantity per × (1 + scrap)",
        inputs: parents,
        result: gross[Number(index)],
        explanationKey: "mrp.gross",
      };
    }
    records.set(item.id, record);
  }

  return {
    records: ordered.map((item) => records.get(item.id)).filter((r): r is ItemPlanRecord => !!r),
    lowLevelCodes,
  };
};

export const allPlannedOrders = (mrp: MrpResult) => mrp.records.flatMap((record) => record.plannedOrders);
