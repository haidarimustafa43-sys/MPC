import type { GameState } from "../../domain/gameState";
import type { Scenario } from "../../domain/scenario";
import { latestVersion } from "../game/gameActions";
import { plannedOrdersDueForRelease } from "../game/orderActions";

/*
 * Tips are leading questions: they point at where to look and what to think
 * about, never at the answer. They are derived from the same plan and game
 * state the student sees, so every tip can be checked on the page it names.
 */

export type TipPage = "dashboard" | "inbox" | "mps" | "mrp" | "capacity" | "orders";

export interface Tip {
  id: string;
  /** Translation key of the question; params fill it in. */
  key: string;
  params?: Record<string, string | number>;
  /** Pages the tip is relevant to; every tip also shows on the dashboard. */
  pages: TipPage[];
}

export const generateTips = (game: GameState, scenario: Scenario): Tip[] => {
  const tips: Tip[] = [];
  const add = (id: string, key: string, pages: TipPage[], params?: Tip["params"]) =>
    tips.push({ id, key, pages: ["dashboard", ...pages.filter((page) => page !== "dashboard")], params });
  const gameLength = scenario.settings.gameLengthPeriods;
  const itemType = (id: string) => scenario.items.find((item) => item.id === id)?.type;

  if (game.gameStatus === "EVENTS_PENDING") add("messages", "tip.readMessages", ["inbox"]);
  if (["PERIOD_SIMULATED", "PERIOD_REVIEW"].includes(game.gameStatus)) add("review", "tip.review", []);
  if (["PERIOD_START", "EVENTS_PENDING", "PERIOD_SIMULATED", "PERIOD_REVIEW", "GAME_COMPLETED"].includes(game.gameStatus)) {
    return tips;
  }

  const request = game.inboxMessages.find((m) => m.decisionRequired && m.status !== "RESPONDED");
  if (request) add("request", "tip.request", ["inbox"]);

  const version = latestVersion(game);
  if (!version) {
    add("noPlan", "tip.noPlan", ["mps", "mrp", "capacity", "orders"]);
    return tips;
  }
  if (game.pendingDecisionIds.length > 0) add("stale", "tip.stale", ["mps", "mrp", "capacity", "orders"]);

  // Delayed deliveries: who depends on them?
  for (const order of game.releasedOrders) {
    if (order.status !== "RELEASED" || order.originalDuePeriod === undefined) continue;
    if (order.duePeriod <= order.originalDuePeriod) continue;
    add(`delayed-${order.id}`, "tip.delayed", ["mrp", "orders"], {
      order: order.id,
      item: order.itemId,
      from: order.originalDuePeriod,
      to: order.duePeriod,
    });
  }

  let beyond = false;
  for (const record of version.mrpResult.records) {
    const shortage = record.risk.findIndex((risk) => risk === "SHORTAGE");
    if (shortage >= 0) {
      const period = record.periods[shortage];
      if (period > gameLength) beyond = true;
      else if (itemType(record.itemId) === "PURCHASED") {
        add(`short-${record.itemId}`, "tip.shortagePurchased", ["mrp"], {
          item: record.itemId,
          period,
          leadTime: record.leadTimePeriods,
        });
      } else {
        add(`short-${record.itemId}`, "tip.shortageMade", ["mrp", "mps", "capacity"], { item: record.itemId, period });
      }
    }
    const uncovered = record.uncoveredPeriods.find((period) => period <= gameLength);
    if (uncovered !== undefined) {
      add(`uncovered-${record.itemId}`, "tip.uncovered", ["mrp", "orders"], {
        item: record.itemId,
        period: uncovered,
        leadTime: record.leadTimePeriods,
      });
    }
    const below = record.risk.findIndex((risk) => risk === "BELOW_SAFETY_STOCK");
    if (below >= 0 && shortage < 0 && record.periods[below] <= gameLength) {
      add(`below-${record.itemId}`, "tip.belowSafety", ["mrp", "mps"], { item: record.itemId, period: record.periods[below] });
    }
  }

  const overloaded = new Set<string>();
  for (const bucket of version.crpResult.buckets) {
    if (bucket.balanceHours >= 0 || overloaded.has(bucket.workCenterId)) continue;
    if (bucket.period > gameLength) {
      beyond = true;
      continue;
    }
    overloaded.add(bucket.workCenterId);
    add(`overload-${bucket.workCenterId}`, "tip.overload", ["capacity", "orders"], {
      workCenter: bucket.workCenterId,
      period: bucket.period,
      hours: Math.round(-bucket.balanceHours * 10) / 10,
    });
  }

  for (const violation of version.violations) {
    if (violation.type !== "CUSTOMER_ORDER_AT_RISK" && violation.type !== "CUSTOMER_ORDER_LATE") continue;
    const order = violation.relatedOrderIds?.[0];
    if (order) add(`risk-${order}`, "tip.orderAtRisk", ["mps", "orders"], { order, item: violation.itemId ?? "" });
  }

  for (const firm of game.plannedOrders) {
    if (firm.receiptPeriod > firm.neededPeriod) {
      add(`firmLate-${firm.id}`, "tip.firmLate", ["orders", "mrp"], {
        order: firm.id,
        item: firm.itemId,
        needed: firm.neededPeriod,
        receipt: firm.receiptPeriod,
      });
    }
  }

  const due = plannedOrdersDueForRelease(game).length;
  if (due > 0) add("due", "tip.dueOrders", ["orders"], { count: due });
  if (beyond) add("beyond", "tip.beyondGame", ["mrp", "capacity"], { period: gameLength });
  if (tips.length === 0) add("clear", "tip.allClear", []);
  return tips;
};
