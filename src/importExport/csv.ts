import type { GameState } from "../domain/gameState";

type Cell = string | number | boolean | null | undefined;

/** RFC 4180 style CSV: values with comma, quote or newline are quoted. */
export const toCsv = (header: readonly string[], rows: readonly (readonly Cell[])[]): string => {
  const escape = (value: Cell): string => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "string" ? value : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
};

const json = (value: unknown): string => (value === undefined ? "" : JSON.stringify(value));

export const kpiHistoryCsv = (game: GameState): string => {
  const keys = game.kpiHistory[0] ? (Object.keys(game.kpiHistory[0].kpis) as (keyof GameState["kpiHistory"][number]["kpis"])[]) : [];
  return toCsv(
    ["period", ...keys],
    game.kpiHistory.map((entry) => [entry.period, ...keys.map((key) => entry.kpis[key])]),
  );
};

export const decisionsCsv = (game: GameState): string =>
  toCsv(
    ["id", "period", "iteration", "timestamp", "category", "entityType", "entityId", "field", "previousValue", "newValue", "reason"],
    game.decisions.map((d) => [
      d.id,
      d.period,
      d.iteration,
      d.timestamp,
      d.category,
      d.entityType,
      d.entityId,
      d.field,
      json(d.previousValue),
      json(d.newValue),
      d.reason,
    ]),
  );

export const ordersCsv = (game: GameState): string =>
  toCsv(
    ["id", "type", "itemId", "quantity", "releasePeriod", "duePeriod", "originalDuePeriod", "status", "supplierOrCustomer", "delivered"],
    [
      ...game.releasedOrders.map((o) => [
        o.id,
        o.kind,
        o.itemId,
        o.quantity,
        o.releasePeriod,
        o.duePeriod,
        o.originalDuePeriod,
        o.status,
        o.kind === "PURCHASE" ? o.supplierId : "",
        "",
      ]),
      ...game.customerOrders.map((o) => [
        o.id,
        "CUSTOMER",
        o.itemId,
        o.quantity,
        "",
        o.duePeriod,
        "",
        o.status,
        o.customerName,
        o.deliveredQuantity ?? 0,
      ]),
    ],
  );

/** End-of-week stock per item and warehouse for every simulated week. */
export const inventoryHistoryCsv = (game: GameState): string =>
  toCsv(
    ["period", "itemId", "warehouseId", "quantityOnHand"],
    game.completedPeriods.flatMap((result) =>
      result.endInventory.map((b) => [result.period, b.itemId, b.warehouseId, b.quantityOnHand]),
    ),
  );

export const historiesJson = (game: GameState): string =>
  JSON.stringify(
    {
      gameId: game.gameId,
      teamName: game.teamName,
      kpiHistory: game.kpiHistory,
      decisions: game.decisions,
      orders: { released: game.releasedOrders, customer: game.customerOrders },
      inventoryHistory: game.completedPeriods.map((r) => ({ period: r.period, inventory: r.endInventory })),
    },
    null,
    2,
  );
