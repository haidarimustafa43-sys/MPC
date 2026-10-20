import type { KpiResult } from "../../domain/kpi";
import type { PlanningVersion } from "../../domain/planningVersion";
import type { QuantityDelta } from "../../engine/planning/compareVersions";
import { compareVersionsDetailed } from "../../engine/planning/compareVersions";
import { useT } from "../../state/selectors";
import { formatMoney, formatNumber, formatPercent, formatQuantity } from "../../utils/format";

const MONEY: (keyof KpiResult)[] = [
  "revenue",
  "materialCost",
  "orderCost",
  "holdingCost",
  "overtimeCost",
  "expediteCost",
  "externalCapacityCost",
  "lateOrderCost",
  "netContribution",
  "averageInventoryValue",
];

function Change({ change }: { change: QuantityDelta["change"] }) {
  const t = useT();
  if (change === "BETTER") return <span className="delta-better">▲ {t("versions.better")}</span>;
  if (change === "WORSE") return <span className="delta-worse">▼ {t("versions.worse")}</span>;
  return <span className="muted">= {t("versions.same")}</span>;
}

/**
 * "Plan A → Plan B": concrete problems first (overloads per work centre,
 * shortages per item), then every KPI marked better or worse on its own.
 */
export function VersionComparison({
  before,
  after,
  currency,
  compact = false,
}: {
  before: PlanningVersion;
  after: PlanningVersion;
  currency: string;
  compact?: boolean;
}) {
  const t = useT();
  const comparison = compareVersionsDetailed(before, after);
  const format = (kpi: keyof KpiResult, value: number) =>
    MONEY.includes(kpi)
      ? formatMoney(value, currency)
      : kpi === "serviceLevel"
        ? formatPercent(value)
        : formatNumber(value, kpi === "overloadHours" ? 1 : 0);
  const kpis = compact
    ? comparison.kpis.filter((d) => d.change !== "SAME" || d.kpi === "netContribution" || d.kpi === "serviceLevel")
    : comparison.kpis;

  return (
    <div className="grid">
      <ul className="comparison-list">
        <li>
          {t("compare.problems")}: {comparison.violationsBefore} → {comparison.violationsAfter}
        </li>
        {comparison.workCenters.map((delta) => (
          <li key={delta.id}>
            {t("compare.overload", { workCenter: delta.id })}: {formatNumber(delta.before, 1)} h →{" "}
            {formatNumber(delta.after, 1)} h <Change change={delta.change} />
          </li>
        ))}
        {comparison.items.map((delta) => (
          <li key={delta.id}>
            {t("compare.shortage", { item: delta.id })}: {formatQuantity(delta.before)} →{" "}
            {formatQuantity(delta.after)} <Change change={delta.change} />
          </li>
        ))}
      </ul>
      <p className="muted small">{t("versions.note")}</p>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">{t("versions.kpi")}</th>
              <th scope="col">{before.id}</th>
              <th scope="col">{after.id}</th>
              <th scope="col" className="left">
                {t("versions.compareTitle", { a: before.id, b: after.id })}
              </th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((delta) => (
              <tr key={delta.kpi}>
                <td>{t(`kpi.${delta.kpi}`)}</td>
                <td>{format(delta.kpi, delta.before)}</td>
                <td>{format(delta.kpi, delta.after)}</td>
                <td className="left">
                  <Change change={delta.change} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
