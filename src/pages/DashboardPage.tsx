import { Link } from "react-router-dom";
import { KpiCard } from "../components/common/KpiCard";
import { ViolationList } from "../components/common/ViolationList";
import { WorkflowActions } from "../components/common/WorkflowActions";
import { latestVersion } from "../engine/game/gameActions";
import { useGameStore } from "../state/gameStore";
import { currentViolations, useT } from "../state/selectors";
import { formatHours, formatMoney, formatPercent } from "../utils/format";

const nextStepKey = (status: string, stale: boolean, hasVersion: boolean): string => {
  if (status === "PERIOD_START") return "next.startWeek";
  if (status === "PLAN_COMMITTED" && !stale) return "next.simulate";
  if (stale && hasVersion) return "next.rerun";
  if (hasVersion) return "next.commit";
  return "next.runPlanning";
};

export function DashboardPage() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  if (!game || !scenario) return null;
  const version = latestVersion(game);
  const kpis = version?.projectedKpis;
  const currency = scenario.settings.currency;
  const violations = currentViolations(game).filter((v) => v.severity !== "INFO");
  const recent = [...game.decisions].reverse().slice(0, 6);

  return (
    <>
      <section className="card">
        <div className="card-header">
          <h1>
            {t("dashboard.week")} {game.currentPeriod}
          </h1>
          <span className="badge info">{t(`status.${game.gameStatus}`)}</span>
        </div>
        <p>
          <strong>{t("next.title")}:</strong>{" "}
          {t(nextStepKey(game.gameStatus, game.pendingDecisionIds.length > 0, !!version), {
            period: game.currentPeriod,
          })}
        </p>
        <WorkflowActions />
      </section>

      {kpis ? (
        <>
          <p className="muted small">{t("dashboard.kpisFrom", { version: version.id })}</p>
          <div className="grid kpis">
            <KpiCard label={t("dashboard.serviceLevel")} value={formatPercent(kpis.serviceLevel)} />
            <KpiCard label={t("dashboard.result")} value={formatMoney(kpis.netContribution, currency)} />
            <KpiCard
              label={t("dashboard.inventoryValue")}
              value={formatMoney(kpis.averageInventoryValue, currency)}
            />
            <KpiCard label={t("dashboard.overload")} value={formatHours(kpis.overloadHours)} />
            <KpiCard label={t("dashboard.atRisk")} value={kpis.ordersAtRisk + kpis.lateCustomerOrders} />
            <KpiCard label={t("kpi.replanCount")} value={kpis.replanCount} />
          </div>
        </>
      ) : (
        <div className="banner info">{t("dashboard.noPlan")}</div>
      )}

      <div className="grid cols-2">
        <section className="card">
          <div className="card-header">
            <h2>{t("dashboard.problems")}</h2>
            <Link to="/versions">{t("nav.versions")}</Link>
          </div>
          <ViolationList
            violations={violations}
            limit={8}
            emptyText={version ? t("dashboard.noProblems") : t("dashboard.noPlan")}
          />
        </section>
        <section className="card">
          <h2>{t("dashboard.recentDecisions")}</h2>
          {recent.length === 0 ? (
            <p className="muted">{t("dashboard.noDecisions")}</p>
          ) : (
            <ul className="violation-list">
              {recent.map((decision) => (
                <li key={decision.id}>
                  <span className="badge mode">{decision.id}</span>
                  <div>
                    <div>
                      {decision.entityId} · {decision.field ?? decision.category}:{" "}
                      {JSON.stringify(decision.previousValue)} → {JSON.stringify(decision.newValue)}
                    </div>
                    {decision.reason && <div className="related">“{decision.reason}”</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
