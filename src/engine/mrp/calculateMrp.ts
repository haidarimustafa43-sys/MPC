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
 * Multi-level MRP. Items are processed by low-level code so that all parents
 * have been planned before a component is netted. Component gross requirements
 * come from the parents' planned order releases (released orders are assumed to
 * have their material issued already, see README).
 *
 * The caller must validate the BOM first; with a cyclic BOM the low-level codes
 * are not meaningful (the engine still terminates).
 */
export const calculateMrp = (input: PlanningInput, mps: MpsResult): MrpResult => {
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
    const parentReleases = [...records.values()].flatMap(releasesOf);
    for (const demand of explodeReleases(input.bom, parentReleases)) {
      if (demand.componentItemId !== item.id) continue;
      const index = demand.period - first;
      // A parent release before the horizon is already reported as late on the
      // parent; its material is still needed now.
      if (index < n) gross[Math.max(0, index)] += demand.quantity;
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
    });
    records.set(item.id, record);
  }

  return {
    records: ordered.map((item) => records.get(item.id)).filter((r): r is ItemPlanRecord => !!r),
    lowLevelCodes,
  };
};

export const allPlannedOrders = (mrp: MrpResult) => mrp.records.flatMap((record) => record.plannedOrders);
