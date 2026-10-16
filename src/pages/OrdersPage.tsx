import { useState } from "react";
import { PlanStatusBanner } from "../components/common/PlanStatusBanner";
import { ItemTabs } from "../components/planning/ItemTabs";
import type { ProductionOrder, PurchaseOrder } from "../domain/order";
import { useGameStore } from "../state/gameStore";
import { selectLatestVersion, useT } from "../state/selectors";
import { formatQuantity } from "../utils/format";

type Tab = "planned" | "released" | "purchase" | "customer";

export function OrdersPage() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const [tab, setTab] = useState<Tab>("planned");
  const version = selectLatestVersion(game);
  if (!game || !scenario) return null;
  const supplierName = (id?: string) => game.suppliers.find((s) => s.id === id)?.name ?? id ?? "";
  const planned = (version?.mrpResult.records ?? []).flatMap((record) => record.plannedOrders);
  const released = game.releasedOrders.filter((o): o is ProductionOrder => o.kind === "PRODUCTION");
  const purchases = game.releasedOrders.filter((o): o is PurchaseOrder => o.kind === "PURCHASE");

  return (
    <>
      <h1>{t("nav.orders")}</h1>
      <ItemTabs
        label={t("nav.orders")}
        items={[
          { id: "planned", label: t("orders.planned") },
          { id: "released", label: t("orders.released") },
          { id: "purchase", label: t("orders.purchase") },
          { id: "customer", label: t("orders.customer") },
        ]}
        selectedId={tab}
        onSelect={(id) => setTab(id as Tab)}
      />
      <section className="card">
        {tab === "planned" && (
          <>
            <PlanStatusBanner />
            {planned.length === 0 ? (
              <p className="muted">{t("orders.none")}</p>
            ) : (
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">{t("orders.id")}</th>
                      <th scope="col" className="left">{t("orders.item")}</th>
                      <th scope="col" className="left">{t("orders.source")}</th>
                      <th scope="col">{t("orders.quantity")}</th>
                      <th scope="col">{t("orders.release")}</th>
                      <th scope="col">{t("orders.due")}</th>
                      <th scope="col" className="left">{t("orders.supplier")}</th>
                      <th scope="col" className="left">{t("orders.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planned.map((order) => (
                      <tr key={order.id}>
                        <td>{order.id}</td>
                        <td className="left">{order.itemId}</td>
                        <td className="left">{order.kind === "PURCHASE" ? t("orders.plannedPurchase") : t("orders.planned")}</td>
                        <td>{formatQuantity(order.quantity)}</td>
                        <td className={order.releasePeriod === game.currentPeriod ? "emphasis" : ""}>{order.releasePeriod}</td>
                        <td>{order.receiptPeriod}</td>
                        <td className="left">{supplierName(order.supplierId)}</td>
                        <td className="left">
                          {order.compressed ? <span className="badge warning">{t("orders.compressed")}</span> : "PLANNED"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {tab === "released" && (
          <OrderTable
            headers={[t("orders.id"), t("orders.item"), t("orders.quantity"), t("orders.release"), t("orders.due"), t("orders.status")]}
            rows={released.map((o) => [o.id, o.itemId, formatQuantity(o.quantity), o.releasePeriod, o.duePeriod, o.status])}
            empty={t("orders.none")}
          />
        )}
        {tab === "purchase" && (
          <OrderTable
            headers={[t("orders.id"), t("orders.item"), t("orders.quantity"), t("orders.release"), t("orders.due"), t("orders.supplier"), t("orders.status")]}
            rows={purchases.map((o) => [
              o.id,
              o.itemId,
              formatQuantity(o.quantity),
              o.releasePeriod,
              o.duePeriod,
              supplierName(o.supplierId),
              o.status,
            ])}
            empty={t("orders.none")}
          />
        )}
        {tab === "customer" && (
          <OrderTable
            headers={[t("orders.id"), t("orders.customerName"), t("orders.item"), t("orders.quantity"), t("orders.due"), t("orders.price"), t("orders.status")]}
            rows={game.customerOrders.map((o) => [
              o.id,
              o.customerName,
              o.itemId,
              formatQuantity(o.quantity),
              o.duePeriod,
              `${o.sellingPricePerUnit} ${scenario.settings.currency}`,
              o.status,
            ])}
            empty={t("orders.none")}
          />
        )}
      </section>
    </>
  );
}

function OrderTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: (string | number)[][];
  empty: string;
}) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            {headers.map((header) => (
              <th scope="col" key={header} className={typeof rows[0][headers.indexOf(header)] === "string" ? "left" : ""}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[0])}>
              {row.map((cell, index) => (
                <td key={index} className={typeof cell === "string" ? "left" : ""}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
