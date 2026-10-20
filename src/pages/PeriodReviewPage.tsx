import { useState } from "react";
import { KpiCard } from "../components/common/KpiCard";
import { ItemTabs } from "../components/planning/ItemTabs";
import type { KpiResult } from "../domain/kpi";
import { useGameStore } from "../state/gameStore";
import { useT } from "../state/selectors";
import { formatMoney, formatNumber, formatPercent, formatQuantity } from "../utils/format";

const sumKpis = (list: readonly KpiResult[]): Partial<KpiResult> => {
  const keys: (keyof KpiResult)[] = [
    "revenue",
    "materialCost",
    "orderCost",
    "holdingCost",
    "overtimeCost",
    "expediteCost",
    "externalCapacityCost",
    "lateOrderCost",
    "netContribution",
  ];
  return Object.fromEntries(keys.map((key) => [key, list.reduce((sum, kpis) => sum + kpis[key], 0)]));
};

/** Realised outcome of a simulated week compared with the committed plan. */
export function PeriodReviewPage() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const results = game?.completedPeriods ?? [];
  const [selected, setSelected] = useState<number | null>(null);
  if (!game || !scenario) return null;
  if (results.length === 0) {
    return (
      <>
        <h1>{t("nav.review")}</h1>
        <p className="muted">{t("review.none")}</p>
      </>
    );
  }
  const result = results.find((r) => r.period === selected) ?? results[results.length - 1];
  const currency = scenario.settings.currency;
  const money = (value: number) => formatMoney(value, currency);
  const totals = sumKpis(results.map((r) => r.kpis));
  const due = results.reduce((sum, r) => sum + r.dueLines, 0);
  const onTime = results.reduce((sum, r) => sum + r.onTimeLines, 0);
  const eventName = (id: string) => scenario.events.find((e) => e.id === id)?.name ?? id;

  return (
    <>
      <h1>{t("review.title", { period: result.period })}</h1>
      <ItemTabs
        label={t("review.week")}
        items={results.map((r) => ({
          id: String(r.period),
          label: `${t("review.week")} ${r.period}`,
          flagged: r.failures.length > 0,
        }))}
        selectedId={String(result.period)}
        onSelect={(id) => setSelected(Number(id))}
      />
      <p className="muted small">{t("review.committed", { version: result.committedPlanVersionId })}</p>

      <section className="card">
        <h2>{t("review.realised")}</h2>
        <div className="grid kpis">
          <KpiCard label={t("kpi.serviceLevel")} value={formatPercent(result.kpis.serviceLevel)} hint={`${result.onTimeLines}/${result.dueLines}`} />
          <KpiCard label={t("kpi.revenue")} value={money(result.kpis.revenue)} />
          <KpiCard label={t("kpi.netContribution")} value={money(result.kpis.netContribution)} />
          <KpiCard label={t("kpi.holdingCost")} value={money(result.kpis.holdingCost)} />
          <KpiCard label={t("kpi.overtimeCost")} value={money(result.kpis.overtimeCost)} />
          <KpiCard label={t("kpi.lateOrderCost")} value={money(result.kpis.lateOrderCost)} />
          <KpiCard label={t("kpi.lateCustomerOrders")} value={result.kpis.lateCustomerOrders} />
          <KpiCard label={t("kpi.overloadHours")} value={formatNumber(result.kpis.overloadHours, 1)} />
        </div>
        <div className="table-scroll" style={{ marginTop: "1rem" }}>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">{t("versions.kpi")}</th>
                <th scope="col">
                  {t("review.week")} {result.period}
                </th>
                <th scope="col">{t("review.cumulative")}</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(totals) as (keyof KpiResult)[]).map((key) => (
                <tr key={key}>
                  <td>{t(`kpi.${key}`)}</td>
                  <td>{money(result.kpis[key])}</td>
                  <td>{money(totals[key] ?? 0)}</td>
                </tr>
              ))}
              <tr>
                <td>{t("kpi.serviceLevel")}</td>
                <td>{formatPercent(result.kpis.serviceLevel)}</td>
                <td>{formatPercent(due === 0 ? 1 : onTime / due)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid cols-2">
        <section className="card">
          <h2>{t("review.failures")}</h2>
          {result.failures.length === 0 ? (
            <p className="muted">{t("review.noFailures")}</p>
          ) : (
            <ul className="violation-list">
              {result.failures.map((failure, index) => (
                <li key={index}>
                  <span className={`badge ${failure.cause === "UNPLANNED" ? "warning" : "critical"}`}>
                    {t(`review.failure.${failure.kind}`)}
                  </span>
                  <div>
                    <div>{failure.description}</div>
                    <div className="related">{t(`review.cause.${failure.cause}`)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>{t("review.events")}</h2>
          {result.eventIds.length === 0 ? (
            <p className="muted">{t("review.noEvents")}</p>
          ) : (
            <ul>
              {result.eventIds.map((id) => (
                <li key={id}>{eventName(id)}</li>
              ))}
            </ul>
          )}
          <h3>{t("review.received")}</h3>
          <p className="small">{result.receivedOrderIds.join(", ") || t("review.none.short")}</p>
          <h3>{t("review.started")}</h3>
          <p className="small">{result.startedOrderIds.join(", ") || t("review.none.short")}</p>
          <h3>{t("review.completed")}</h3>
          <p className="small">{result.completedOrderIds.join(", ") || t("review.none.short")}</p>
        </section>
      </div>

      <section className="card">
        <h2>{t("review.deliveries")}</h2>
        {result.deliveries.length === 0 ? (
          <p className="muted">{t("review.none.short")}</p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t("orders.id")}</th>
                  <th scope="col" className="left">{t("orders.item")}</th>
                  <th scope="col">{t("orders.quantity")}</th>
                  <th scope="col" className="left">{t("orders.status")}</th>
                  <th scope="col">{t("kpi.revenue")}</th>
                </tr>
              </thead>
              <tbody>
                {result.deliveries.map((delivery) => (
                  <tr key={delivery.customerOrderId}>
                    <td>{delivery.customerOrderId}</td>
                    <td className="left">{delivery.itemId}</td>
                    <td>{formatQuantity(delivery.quantity)}</td>
                    <td className="left">
                      {delivery.onTime ? (
                        <span className="badge ok">{t("review.onTime")}</span>
                      ) : (
                        <span className="badge warning">{t("review.late")}</span>
                      )}
                    </td>
                    <td>{money(delivery.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>{t("review.planVsActual")}</h2>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">{t("plan.item")}</th>
                <th scope="col">{t("review.planned")}</th>
                <th scope="col">{t("review.actual")}</th>
                <th scope="col">{t("review.difference")}</th>
              </tr>
            </thead>
            <tbody>
              {result.plannedVersusActual.map((row) => {
                const difference = row.actualBalance - row.plannedBalance;
                return (
                  <tr key={row.itemId}>
                    <td>{row.itemId}</td>
                    <td>{formatQuantity(row.plannedBalance)}</td>
                    <td>{formatQuantity(row.actualBalance)}</td>
                    <td className={difference < 0 ? "risk-below" : ""}>
                      {difference > 0 ? "+" : ""}
                      {formatQuantity(difference)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
