import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard } from "../components/common/KpiCard";
import { decisionsCsv, historiesJson, inventoryHistoryCsv, kpiHistoryCsv, ordersCsv } from "../importExport/csv";
import { calculateScore, realisedTotals } from "../engine/scoring/calculateScore";
import { useGameStore } from "../state/gameStore";
import { useT } from "../state/selectors";
import { downloadText } from "../utils/download";
import { formatMoney, formatNumber, formatPercent } from "../utils/format";

const COST_KEYS = [
  "materialCost",
  "orderCost",
  "holdingCost",
  "overtimeCost",
  "expediteCost",
  "externalCapacityCost",
  "lateOrderCost",
] as const;
const COST_COLORS = ["#4f81bd", "#9bbb59", "#f2a93b", "#c0504d", "#8064a2", "#4bacc6", "#7f7f7f"];

/** Realised results over the weeks, the trade-offs behind them and data exports. */
export function ReportsPage() {
  const t = useT();
  const game = useGameStore((state) => state.liveGame ?? state.game);
  const scenario = useGameStore((state) => state.scenario);
  if (!game || !scenario) return null;
  const currency = scenario.settings.currency;
  const history = game.completedPeriods.map((result) => ({
    period: result.period,
    serviceLevel: Math.round(result.kpis.serviceLevel * 100),
    netContribution: Math.round(result.kpis.netContribution),
    inventoryValue: Math.round(result.kpis.averageInventoryValue),
    holdingCost: Math.round(result.kpis.holdingCost),
    ...Object.fromEntries(COST_KEYS.map((key) => [key, Math.round(result.kpis[key])])),
  }));
  let cumulativeNet = 0;
  const cumulative = history.map((row) => {
    cumulativeNet += row.netContribution;
    return { period: row.period, cumulativeNet };
  });
  const totals = realisedTotals(game);
  const score = calculateScore(game, scenario.settings.scoring);
  const base = `${game.teamName.replace(/[^\w-]+/g, "_")}_${game.scenarioId}`;
  const exports = [
    { label: t("reports.exportKpis"), file: `${base}_kpis.csv`, text: () => kpiHistoryCsv(game), type: "text/csv" },
    { label: t("reports.exportDecisions"), file: `${base}_decisions.csv`, text: () => decisionsCsv(game), type: "text/csv" },
    { label: t("reports.exportOrders"), file: `${base}_orders.csv`, text: () => ordersCsv(game), type: "text/csv" },
    { label: t("reports.exportInventory"), file: `${base}_inventory.csv`, text: () => inventoryHistoryCsv(game), type: "text/csv" },
    { label: t("reports.exportJson"), file: `${base}_history.json`, text: () => historiesJson(game), type: "application/json" },
  ];

  return (
    <>
      <h1>{t("nav.reports")}</h1>
      {history.length === 0 ? (
        <p className="muted">{t("review.none")}</p>
      ) : (
        <>
          <section className="card">
            <div className="card-header">
              <h2>{t("reports.score")}</h2>
              <span className="badge mode">
                {formatNumber(score.total, 1)} / {score.maxTotal}
              </span>
            </div>
            <p className="muted small">{t("reports.scoreNote")}</p>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">{t("reports.component")}</th>
                    <th scope="col">{t("reports.measured")}</th>
                    <th scope="col">{t("reports.points")}</th>
                    <th scope="col" className="left">{t("reports.formula")}</th>
                  </tr>
                </thead>
                <tbody>
                  {score.components.map((component) => (
                    <tr key={component.key}>
                      <td>{t(`reports.component.${component.key}`)}</td>
                      <td>{formatPercent(component.ratio)}</td>
                      <td>
                        {formatNumber(component.points, 1)} / {component.maxPoints}
                      </td>
                      <td className="left">
                        <code>{component.formula}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid kpis">
            <KpiCard label={t("kpi.serviceLevel")} value={formatPercent(totals.serviceLevel)} />
            <KpiCard label={t("kpi.revenue")} value={formatMoney(totals.revenue, currency)} />
            <KpiCard label={t("kpi.netContribution")} value={formatMoney(totals.netContribution, currency)} />
            <KpiCard label={t("kpi.holdingCost")} value={formatMoney(totals.holdingCost, currency)} />
            <KpiCard label={t("kpi.overtimeCost")} value={formatMoney(totals.overtimeCost, currency)} />
            <KpiCard label={t("kpi.lateCustomerOrders")} value={totals.lateCustomerOrders} />
            <KpiCard label={t("kpi.averageInventoryValue")} value={formatMoney(totals.averageInventoryValue, currency)} />
            <KpiCard label={t("kpi.replanCount")} value={game.planningVersions.length} />
          </div>

          <div className="grid cols-2">
            <section className="card">
              <h2>{t("reports.serviceAndResult")}</h2>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <ComposedChart data={history.map((row, i) => ({ ...row, cumulativeNet: cumulative[i].cumulativeNet }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e3e7ee" />
                    <XAxis dataKey="period" />
                    <YAxis yAxisId="money" width={70} />
                    <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} unit=" %" width={50} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="money" dataKey="netContribution" name={t("kpi.netContribution")} fill="#4f81bd" isAnimationActive={false} />
                    <Line yAxisId="money" dataKey="cumulativeNet" name={t("reports.cumulativeNet")} stroke="#1f4e79" isAnimationActive={false} />
                    <Line yAxisId="pct" dataKey="serviceLevel" name={t("kpi.serviceLevel")} stroke="#18794e" strokeWidth={2} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="card">
              <h2>{t("reports.costs")}</h2>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e3e7ee" />
                    <XAxis dataKey="period" />
                    <YAxis width={70} />
                    <Tooltip />
                    <Legend />
                    {COST_KEYS.map((key, index) => (
                      <Bar key={key} dataKey={key} stackId="costs" name={t(`kpi.${key}`)} fill={COST_COLORS[index]} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <section className="card">
            <h2>{t("reports.tradeOff")}</h2>
            <p className="muted small">{t("reports.tradeOffHelp")}</p>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e7ee" />
                  <XAxis dataKey="period" />
                  <YAxis yAxisId="money" width={70} />
                  <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} unit=" %" width={50} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="money" dataKey="inventoryValue" name={t("kpi.averageInventoryValue")} stroke="#f2a93b" isAnimationActive={false} />
                  <Line yAxisId="money" dataKey="holdingCost" name={t("kpi.holdingCost")} stroke="#c0504d" isAnimationActive={false} />
                  <Line yAxisId="pct" dataKey="serviceLevel" name={t("kpi.serviceLevel")} stroke="#18794e" strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}

      <section className="card">
        <h2>{t("reports.exports")}</h2>
        <p className="muted small">{t("reports.exportsHelp")}</p>
        <div className="row">
          {exports.map((entry) => (
            <button key={entry.file} onClick={() => downloadText(entry.file, entry.text(), entry.type)}>
              {entry.label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
