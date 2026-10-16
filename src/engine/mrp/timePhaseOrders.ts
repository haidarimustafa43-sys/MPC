import type { CalculationTrace } from "../../domain/common";
import type { LotSizingPolicy } from "../../domain/lotSizing";
import type { CellRisk, ItemPlanRecord, PlannedOrder } from "../../domain/planningVersion";
import { calculateLotSize } from "./lotSizing";

export interface TimePhaseInput {
  itemId: string;
  kind: "PRODUCTION" | "PURCHASE";
  supplierId?: string;
  currentPeriod: number;
  periods: readonly number[];
  startingOnHand: number;
  grossRequirements: readonly number[];
  scheduledReceipts: readonly number[];
  safetyStock: number;
  leadTimePeriods: number;
  safetyLeadTimePeriods: number;
  lotSizingPolicy: LotSizingPolicy;
  orderCost: number;
  holdingCostPerUnitPeriod: number;
  lowLevelCode: number;
}

const riskOf = (balance: number, safetyStock: number): CellRisk =>
  balance < 0 ? "SHORTAGE" : balance < safetyStock ? "BELOW_SAFETY_STOCK" : "OK";

/**
 * Netting, lot sizing and lead-time offsetting for one item.
 *
 * Rules (documented in README):
 * - net requirement(t) = gross(t) + safety stock − (PAB(t−1) + scheduled receipts(t)), if positive.
 * - A planned order receipt is placed safetyLeadTime periods before the need
 *   and released leadTime periods before the receipt.
 * - Nothing can be released before the current period. If the safety lead time
 *   would push the release into the past it is compressed (receipt moves later,
 *   at the latest to the period of need). If even that is impossible the need
 *   lies inside the lead time: no order is created, the shortage carries
 *   forward and is reported. This is how a supplier delay becomes visible.
 */
export const timePhaseOrders = (input: TimePhaseInput): ItemPlanRecord => {
  const n = input.periods.length;
  const gross = [...input.grossRequirements];
  const scheduled = [...input.scheduledReceipts];
  const projectedBeforePlanned: number[] = new Array(n).fill(0);
  const net: number[] = new Array(n).fill(0);
  const plannedReceipts: number[] = new Array(n).fill(0);
  const plannedReleases: number[] = new Array(n).fill(0);
  const pab: number[] = new Array(n).fill(0);
  const traces: Record<string, CalculationTrace> = {};
  const plannedOrders: PlannedOrder[] = [];
  const uncoveredPeriods: number[] = [];

  const { safetyStock, leadTimePeriods, safetyLeadTimePeriods, currentPeriod } = input;
  const indexOf = (period: number): number => period - input.periods[0];

  let released = input.startingOnHand;
  for (let i = 0; i < n; i++) {
    released += scheduled[i] - gross[i];
    projectedBeforePlanned[i] = released;
  }

  let previous = input.startingOnHand;
  let carriedShortfall = 0;
  for (let i = 0; i < n; i++) {
    const period = input.periods[i];
    const available = previous + scheduled[i] + plannedReceipts[i];
    const projected = available - gross[i];

    if (projected >= safetyStock) {
      pab[i] = projected;
      previous = projected;
      carriedShortfall = 0;
      continue;
    }

    const requirement = safetyStock - projected;
    // The net row shows only new requirements; a shortfall carried over from an
    // uncovered period was already shown there, but the order must still cover it.
    net[i] = requirement - carriedShortfall;
    traces[`net:${period}`] = {
      formula: "net = gross + safety stock − (PAB previous + scheduled receipts + planned receipts)",
      inputs: {
        grossRequirements: gross[i],
        safetyStock,
        projectedAvailablePrevious: previous,
        scheduledReceipts: scheduled[i],
        plannedReceipts: plannedReceipts[i],
      },
      intermediateValues: { carriedShortfall, totalRequirement: requirement },
      result: net[i],
      explanationKey: "mrp.net",
    };

    const earliestReceipt = currentPeriod + leadTimePeriods;
    const desiredReceipt = period - safetyLeadTimePeriods;
    const receiptPeriod = Math.max(desiredReceipt, earliestReceipt, input.periods[0]);

    if (receiptPeriod > period) {
      if (net[i] > 0) uncoveredPeriods.push(period);
      pab[i] = projected;
      previous = projected;
      carriedShortfall = requirement;
      continue;
    }

    const lot = calculateLotSize(input.lotSizingPolicy, {
      netRequirement: requirement,
      periodIndex: i,
      grossRequirements: gross,
      scheduledReceipts: scheduled,
      orderCost: input.orderCost,
      holdingCostPerUnitPeriod: input.holdingCostPerUnitPeriod,
    });
    const quantity = Math.ceil(lot.quantity - 1e-9);
    const releasePeriod = receiptPeriod - leadTimePeriods;
    const receiptIndex = indexOf(receiptPeriod);

    plannedReceipts[receiptIndex] += quantity;
    const releaseIndex = indexOf(releasePeriod);
    if (releaseIndex >= 0) plannedReleases[releaseIndex] += quantity;

    // An earlier receipt (safety lead time) raises the balance of the periods in between.
    for (let k = receiptIndex; k < i; k++) pab[k] += quantity;

    pab[i] = projected + quantity;
    previous = pab[i];
    carriedShortfall = 0;

    const order: PlannedOrder = {
      id: `PL-${input.itemId}-${period}`,
      itemId: input.itemId,
      kind: input.kind,
      quantity,
      releasePeriod,
      receiptPeriod,
      neededPeriod: period,
      supplierId: input.supplierId,
      compressed: receiptPeriod > desiredReceipt,
    };
    plannedOrders.push(order);

    traces[`lot:${period}`] = lot.trace;
    traces[`receipt:${receiptPeriod}`] = {
      formula: "planned receipt = lot size",
      inputs: {
        lotSizingMethod: input.lotSizingPolicy.method,
        netRequirement: requirement,
        neededPeriod: period,
        safetyLeadTimePeriods,
      },
      result: plannedReceipts[receiptIndex],
      explanationKey: "mrp.receipt",
    };
    traces[`release:${releasePeriod}`] = {
      formula: "release period = receipt period − lead time",
      inputs: { receiptPeriod, leadTimePeriods },
      result: releasePeriod,
      explanationKey: "mrp.release",
    };
  }

  for (let i = 0; i < n; i++) {
    const period = input.periods[i];
    traces[`pab:${period}`] = {
      formula: "PAB = PAB previous + scheduled receipts + planned receipts − gross requirements",
      inputs: {
        projectedAvailablePrevious: i === 0 ? input.startingOnHand : pab[i - 1],
        scheduledReceipts: scheduled[i],
        plannedReceipts: plannedReceipts[i],
        grossRequirements: gross[i],
      },
      result: pab[i],
      explanationKey: "mrp.pab",
    };
  }

  return {
    itemId: input.itemId,
    periods: [...input.periods],
    startingOnHand: input.startingOnHand,
    grossRequirements: gross,
    scheduledReceipts: scheduled,
    projectedBeforePlanned,
    netRequirements: net,
    plannedReceipts,
    plannedReleases,
    projectedAvailable: pab,
    risk: pab.map((value) => riskOf(value, safetyStock)),
    safetyStock,
    leadTimePeriods,
    safetyLeadTimePeriods,
    lotSizingPolicy: input.lotSizingPolicy,
    lowLevelCode: input.lowLevelCode,
    plannedOrders,
    traces,
    uncoveredPeriods,
  };
};
