import { useState } from "react";
import { PlanStatusBanner } from "../components/common/PlanStatusBanner";
import { ItemTabs } from "../components/planning/ItemTabs";
import type { ProductionOrder, PurchaseOrder } from "../domain/order";
import type { PlannedOrder } from "../domain/planningVersion";
import type { Supplier } from "../domain/supplier";
import {
  canExpedite,
  currentPlannedOrders,
  earliestReceiptPeriod,
  plannedOrdersDueForRelease,
  suppliersFor,
} from "../engine/game/orderActions";
import { canPerform } from "../engine/game/stateMachine";
import { useGameStore } from "../state/gameStore";
import { useT } from "../state/selectors";
import { formatQuantity } from "../utils/format";

type Tab = "planned" | "released" | "purchase" | "customer";

/** "Supplier Central (lead time 1, ×1.25)": what the choice of supplier means for the order. */
const useSupplierLabel = () => {
  const t = useT();
  return (supplier: Supplier, itemId: string) =>
    `${supplier.name} (${t("plan.leadTime")} ${supplier.normalLeadTimePeriods}, ×${supplier.unitCostModifiers?.[itemId] ?? 1})`;
};

function PlannedOrderEditor({ order, onClose }: { order: PlannedOrder; onClose: () => void }) {
  const t = useT();
  const firmOrder = useGameStore((state) => state.firmOrder);
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const supplierLabel = useSupplierLabel();
  const [quantity, setQuantity] = useState(order.quantity);
  const [receipt, setReceipt] = useState(order.receiptPeriod);
  const [supplierId, setSupplierId] = useState(order.supplierId);
  const [reason, setReason] = useState("");
  if (!game || !scenario) return null;
  const earliest = earliestReceiptPeriod(game, scenario, order, supplierId);
  const suppliers = order.kind === "PURCHASE" ? suppliersFor(game, order.itemId) : [];
  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        firmOrder(
          order.id,
          { quantity, receiptPeriod: receipt, ...(supplierId !== order.supplierId ? { supplierId } : {}) },
          reason.trim() || undefined,
        );
        onClose();
      }}
    >
      <h3>{t("orders.editTitle", { order: order.id })}</h3>
      <p className="muted small">{t("orders.editHelp")}</p>
      <div className="form-row">
        <label className="field">
          {t("orders.quantity")}
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 0)} />
        </label>
        <label className="field">
          {t("orders.receipt")}
          <input type="number" min={earliest} value={receipt} onChange={(e) => setReceipt(Number(e.target.value) || 0)} />
        </label>
        {suppliers.length > 1 && (
          <label className="field">
            {t("orders.supplier")}
            <select value={supplierId ?? ""} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplierLabel(supplier, order.itemId)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field" style={{ flex: 1, minWidth: 220 }}>
          {t("plan.reason")}
          <input type="text" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="submit" className="primary">
          {t("action.apply")}
        </button>
        <button type="button" onClick={onClose}>
          {t("action.cancel")}
        </button>
      </div>
      <p className="muted small">{t("orders.earliestReceipt", { period: earliest })}</p>
      {receipt < earliest && (
        <p className="badge warning" role="status">
          {t("orders.releaseInPast", { period: receipt - (earliest - game.currentPeriod) })}
        </p>
      )}
      {receipt > order.neededPeriod && (
        <p className="badge warning" role="status">
          {t("orders.lateReceipt", { needed: order.neededPeriod, receipt, item: order.itemId })}
        </p>
      )}
    </form>
  );
}

/**
 * One kind of planned order. Purchases get a supplier column where the
 * supplier can be changed; that turns the order into a firm planned order.
 */
function PlannedOrdersTable({
  title,
  orders,
  dueIds,
  onEdit,
}: {
  title: string;
  orders: PlannedOrder[];
  dueIds: Set<string>;
  onEdit: (order: PlannedOrder) => void;
}) {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const releaseOrder = useGameStore((state) => state.releaseOrder);
  const firmOrder = useGameStore((state) => state.firmOrder);
  const cancelFirmOrder = useGameStore((state) => state.cancelFirmOrder);
  const supplierLabel = useSupplierLabel();
  if (!game) return null;
  const editable = canPerform(game, "CHANGE_PLAN");
  const disabledReason = editable.reasonKey ? t(editable.reasonKey) : undefined;
  const purchases = orders.some((order) => order.kind === "PURCHASE");

  return (
    <section className="card">
      <h2>{title}</h2>
      {orders.length === 0 ? (
        <p className="muted">{t("orders.none")}</p>
      ) : (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">{t("orders.id")}</th>
                <th scope="col" className="left">{t("orders.item")}</th>
                {purchases && <th scope="col" className="left">{t("orders.supplier")}</th>}
                <th scope="col">{t("orders.quantity")}</th>
                <th scope="col">{t("orders.release")}</th>
                <th scope="col">{t("orders.receipt")}</th>
                <th scope="col" className="left">{t("orders.status")}</th>
                <th scope="col" className="left">{t("orders.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const suppliers = order.kind === "PURCHASE" ? suppliersFor(game, order.itemId) : [];
                return (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td className="left">{order.itemId}</td>
                    {purchases && (
                      <td className="left">
                        {suppliers.length > 1 ? (
                          <select
                            aria-label={`${t("orders.supplier")} ${order.id}`}
                            value={order.supplierId ?? ""}
                            disabled={!editable.allowed}
                            title={disabledReason}
                            onChange={(event) => firmOrder(order.id, { supplierId: event.target.value })}
                          >
                            {suppliers.map((supplier) => (
                              <option key={supplier.id} value={supplier.id}>
                                {supplierLabel(supplier, order.itemId)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          (suppliers[0]?.name ?? order.supplierId ?? "")
                        )}
                      </td>
                    )}
                    <td>{formatQuantity(order.quantity)}</td>
                    <td className={dueIds.has(order.id) ? "emphasis" : ""}>{order.releasePeriod}</td>
                    <td>{order.receiptPeriod}</td>
                    <td className="left">
                      <div className="row">
                        {order.firm && <span className="badge mode">{t("orders.firm")}</span>}
                        {dueIds.has(order.id) && <span className="badge info">{t("orders.dueNow")}</span>}
                        {order.compressed && <span className="badge warning">{t("orders.compressed")}</span>}
                      </div>
                    </td>
                    <td className="left actions">
                      <div className="row">
                        {dueIds.has(order.id) && (
                          <button
                            className="primary"
                            disabled={!editable.allowed}
                            title={disabledReason}
                            onClick={() => releaseOrder(order.id)}
                          >
                            {t("action.release")}
                          </button>
                        )}
                        <button
                          disabled={!editable.allowed}
                          title={disabledReason}
                          onClick={() => firmOrder(order.id, { receiptPeriod: order.receiptPeriod - 1 })}
                        >
                          ◀ {t("action.earlier")}
                        </button>
                        <button
                          disabled={!editable.allowed}
                          title={disabledReason}
                          onClick={() => firmOrder(order.id, { receiptPeriod: order.receiptPeriod + 1 })}
                        >
                          {t("action.later")} ▶
                        </button>
                        <button disabled={!editable.allowed} title={disabledReason} onClick={() => onEdit(order)}>
                          {t("action.firm")}
                        </button>
                        {order.firm && (
                          <button
                            className="danger"
                            disabled={!editable.allowed}
                            title={disabledReason}
                            onClick={() => cancelFirmOrder(order.id)}
                          >
                            {t("action.cancelFirm")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function OrdersPage() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const releaseAllDue = useGameStore((state) => state.releaseAllDue);
  const expedite = useGameStore((state) => state.expedite);
  const decideCustomerOrder = useGameStore((state) => state.decideCustomerOrder);
  const [tab, setTab] = useState<Tab>("planned");
  const [editing, setEditing] = useState<PlannedOrder | null>(null);
  if (!game || !scenario) return null;

  const editable = canPerform(game, "CHANGE_PLAN");
  const disabledReason = editable.reasonKey ? t(editable.reasonKey) : undefined;
  const supplierName = (id?: string) => game.suppliers.find((s) => s.id === id)?.name ?? id ?? "";
  const planned = [...currentPlannedOrders(game)].sort(
    (a, b) => a.releasePeriod - b.releasePeriod || a.id.localeCompare(b.id),
  );
  const dueIds = new Set(plannedOrdersDueForRelease(game).map((order) => order.id));
  const released = game.releasedOrders.filter((o): o is ProductionOrder => o.kind === "PRODUCTION");
  const purchases = game.releasedOrders.filter((o): o is PurchaseOrder => o.kind === "PURCHASE");
  const express = scenario.settings.expressDelivery;
  const delayed = (order: { duePeriod: number; originalDuePeriod?: number }) =>
    order.originalDuePeriod !== undefined && order.originalDuePeriod !== order.duePeriod ? (
      <span className="badge warning">{t("orders.delayed", { period: order.originalDuePeriod })}</span>
    ) : null;

  return (
    <>
      <h1>{t("nav.orders")}</h1>
      <ItemTabs
        label={t("nav.orders")}
        items={[
          { id: "planned", label: t("orders.plannedTab"), flagged: dueIds.size > 0 },
          { id: "released", label: t("orders.released") },
          { id: "purchase", label: t("orders.purchase") },
          { id: "customer", label: t("orders.customer"), flagged: game.customerOrders.some((o) => o.status === "PROPOSED") },
        ]}
        selectedId={tab}
        onSelect={(id) => setTab(id as Tab)}
      />
      {tab === "planned" && (
        <>
          <PlanStatusBanner />
          {editing && <PlannedOrderEditor key={editing.id} order={editing} onClose={() => setEditing(null)} />}
          {dueIds.size > 0 && (
            <div className="row" style={{ marginBottom: "0.75rem" }}>
              <span className="muted small">{t("orders.dueHint", { count: dueIds.size })}</span>
              <button onClick={() => releaseAllDue()} disabled={!editable.allowed} title={disabledReason}>
                {t("action.releaseAllDue")} ({dueIds.size})
              </button>
            </div>
          )}
          <PlannedOrdersTable
            title={t("orders.plannedProduction")}
            orders={planned.filter((order) => order.kind !== "PURCHASE")}
            dueIds={dueIds}
            onEdit={setEditing}
          />
          <PlannedOrdersTable
            title={t("orders.plannedPurchases")}
            orders={planned.filter((order) => order.kind === "PURCHASE")}
            dueIds={dueIds}
            onEdit={setEditing}
          />
        </>
      )}

      {tab === "released" && (
        <section className="card">
          {released.length === 0 ? (
            <p className="muted">{t("orders.none")}</p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">{t("orders.id")}</th>
                    <th scope="col" className="left">{t("orders.item")}</th>
                    <th scope="col">{t("orders.quantity")}</th>
                    <th scope="col">{t("orders.release")}</th>
                    <th scope="col">{t("orders.due")}</th>
                    <th scope="col">{t("orders.completedOps")}</th>
                    <th scope="col" className="left">{t("orders.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {released.map((order) => (
                    <tr key={order.id}>
                      <td>{order.id}</td>
                      <td className="left">{order.itemId}</td>
                      <td>{formatQuantity(order.quantity)}</td>
                      <td>{order.releasePeriod}</td>
                      <td>{order.duePeriod}</td>
                      <td>{order.completedOperations ?? "–"}</td>
                      <td className="left">
                        <div className="row">
                          {order.status}
                          {delayed(order)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "purchase" && (
        <section className="card">
          {express && (
            <p className="muted small">
              {t("orders.expressHint", {
                periods: express.leadTimeReductionPeriods,
                cost: `${express.costPerUnit} ${scenario.settings.currency}`,
              })}
            </p>
          )}
          {purchases.length === 0 ? (
            <p className="muted">{t("orders.none")}</p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">{t("orders.id")}</th>
                    <th scope="col" className="left">{t("orders.item")}</th>
                    <th scope="col">{t("orders.quantity")}</th>
                    <th scope="col">{t("orders.release")}</th>
                    <th scope="col">{t("orders.due")}</th>
                    <th scope="col" className="left">{t("orders.supplier")}</th>
                    <th scope="col" className="left">{t("orders.status")}</th>
                    <th scope="col" className="left">{t("orders.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((order) => (
                    <tr key={order.id}>
                      <td>{order.id}</td>
                      <td className="left">{order.itemId}</td>
                      <td>{formatQuantity(order.quantity)}</td>
                      <td>{order.releasePeriod}</td>
                      <td>{order.duePeriod}</td>
                      <td className="left">{supplierName(order.supplierId)}</td>
                      <td className="left">
                        <div className="row">
                          {order.status}
                          {delayed(order)}
                          {order.expedited && <span className="badge info">{t("orders.expedited")}</span>}
                        </div>
                      </td>
                      <td className="left actions">
                        {express && order.status === "RELEASED" && canExpedite(game, order) && (
                          <button disabled={!editable.allowed} title={disabledReason} onClick={() => expedite(order.id)}>
                            {t("action.expedite")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "customer" && (
        <section className="card">
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t("orders.id")}</th>
                  <th scope="col" className="left">{t("orders.customerName")}</th>
                  <th scope="col" className="left">{t("orders.item")}</th>
                  <th scope="col">{t("orders.quantity")}</th>
                  <th scope="col">{t("orders.delivered")}</th>
                  <th scope="col">{t("orders.due")}</th>
                  <th scope="col">{t("orders.price")}</th>
                  <th scope="col" className="left">{t("orders.status")}</th>
                </tr>
              </thead>
              <tbody>
                {game.customerOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td className="left">{order.customerName}</td>
                    <td className="left">{order.itemId}</td>
                    <td>{formatQuantity(order.quantity)}</td>
                    <td>{formatQuantity(order.deliveredQuantity ?? 0)}</td>
                    <td>{order.duePeriod}</td>
                    <td>
                      {order.sellingPricePerUnit} {scenario.settings.currency}
                    </td>
                    <td className="left">
                      {order.status === "PROPOSED" ? (
                        <div className="row">
                          <span className="badge warning">{t("orders.proposed")}</span>
                          <button
                            className="primary"
                            disabled={!editable.allowed}
                            onClick={() => decideCustomerOrder(order.id, true)}
                          >
                            {t("action.accept")}
                          </button>
                          <button disabled={!editable.allowed} onClick={() => decideCustomerOrder(order.id, false)}>
                            {t("action.reject")}
                          </button>
                        </div>
                      ) : (
                        <span className={`badge ${order.status === "LATE" ? "critical" : order.status === "FULFILLED" ? "ok" : "info"}`}>
                          {order.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
