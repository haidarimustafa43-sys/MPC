import { useState } from "react";
import { ViolationList } from "../components/common/ViolationList";
import type { KpiResult } from "../domain/kpi";
import { compareVersions } from "../engine/planning/compareVersions";
import { useGameStore } from "../state/gameStore";
import { useT } from "../state/selectors";
import { formatMoney, formatNumber, formatPercent } from "../utils/format";

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

export function PlanningVersionsPage() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const [pick, setPick] = useState<{ a?: string; b?: string; detail?: string }>({});
  if (!game || !scenario) return null;
  const versions = [...game.planningVersions].reverse();
  const defaultB = versions[0]?.id;
  const defaultA = versions[1]?.id;
  const a = game.planningVersions.find((v) => v.id === (pick.a ?? defaultA));
  const b = game.planningVersions.find((v) => v.id === (pick.b ?? defaultB));
  const detail = game.planningVersions.find((v) => v.id === (pick.detail ?? defaultB));
  const format = (kpi: keyof KpiResult, value: number) =>
    MONEY.includes(kpi)
      ? formatMoney(value, scenario.settings.currency)
      : kpi === "serviceLevel"
        ? formatPercent(value)
        : formatNumber(value, kpi === "overloadHours" ? 1 : 0);

  return (
    <>
      <h1>{t("versions.title")}</h1>
      {versions.length === 0 ? (
        <p className="muted">{t("versions.none")}</p>
      ) : (
        <>
          <section className="card">
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">{t("versions.version")}</th>
                    <th scope="col">{t("dashboard.week")}</th>
                    <th scope="col">{t("versions.created")}</th>
                    <th scope="col">{t("versions.decisions")}</th>
                    <th scope="col">{t("versions.problems")}</th>
                    <th scope="col">{t("kpi.netContribution")}</th>
                    <th scope="col">{t("kpi.serviceLevel")}</th>
                    <th scope="col" className="left">{t("orders.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((version) => (
                    <tr key={version.id}>
                      <td>
                        <button className="link" onClick={() => setPick({ ...pick, detail: version.id })}>
                          {version.id}
                        </button>
                      </td>
                      <td>{version.period}</td>
                      <td>{new Date(version.createdAt).toLocaleTimeString()}</td>
                      <td>{version.decisionIds.length}</td>
                      <td>{version.violations.filter((v) => v.severity !== "INFO").length}</td>
                      <td>{formatMoney(version.projectedKpis.netContribution, scenario.settings.currency)}</td>
                      <td>{formatPercent(version.projectedKpis.serviceLevel)}</td>
                      <td className="left">
                        {version.id === game.committedPlanVersionId && (
                          <span className="badge ok">{t("versions.committed")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>{t("action.compare")}</h2>
              <div className="row">
                <select
                  aria-label="Version A"
                  value={a?.id ?? ""}
                  onChange={(event) => setPick({ ...pick, a: event.target.value })}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id}
                    </option>
                  ))}
                </select>
                →
                <select
                  aria-label="Version B"
                  value={b?.id ?? ""}
                  onChange={(event) => setPick({ ...pick, b: event.target.value })}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {a && b && a.id !== b.id ? (
              <>
                <p className="muted small">{t("versions.note")}</p>
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th scope="col">{t("versions.kpi")}</th>
                        <th scope="col">{a.id}</th>
                        <th scope="col">{b.id}</th>
                        <th scope="col" className="left">
                          {t("versions.compareTitle", { a: a.id, b: b.id })}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareVersions(a, b).map((delta) => (
                        <tr key={delta.kpi}>
                          <td>{t(`kpi.${delta.kpi}`)}</td>
                          <td>{format(delta.kpi, delta.before)}</td>
                          <td>{format(delta.kpi, delta.after)}</td>
                          <td className="left">
                            {delta.change === "BETTER" && <span className="delta-better">▲ {t("versions.better")}</span>}
                            {delta.change === "WORSE" && <span className="delta-worse">▼ {t("versions.worse")}</span>}
                            {delta.change === "SAME" && <span className="muted">= {t("versions.same")}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="muted">{t("versions.selectTwo")}</p>
            )}
          </section>

          {detail && (
            <section className="card">
              <h2>
                {detail.id}: {t("versions.problems")}
              </h2>
              <ViolationList violations={detail.violations} />
            </section>
          )}
        </>
      )}
    </>
  );
}
