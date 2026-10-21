import { Link } from "react-router-dom";
import { KpiCard } from "../components/common/KpiCard";
import { TipsPanel } from "../components/common/TipsPanel";
import { ViolationList } from "../components/common/ViolationList";
import { WorkflowActions } from "../components/common/WorkflowActions";
import { cumulativeServiceLevel } from "../engine/events/evaluateEventTriggers";
import { latestVersion } from "../engine/game/gameActions";
import { plannedOrdersDueForRelease } from "../engine/game/orderActions";
import { useGameStore } from "../state/gameStore";
import { currentViolations, useT } from "../state/selectors";
import { describeDecision } from "../utils/describeDecision";
import { formatHours, formatMoney, formatPercent } from "../utils/format";

const nextStepKey = (status: string, stale: boolean, hasVersion: boolean, dueLeft: number): string => {
  switch (status) {
    case "PERIOD_START":
      return "next.startWeek";
    case "EVENTS_PENDING":
      return "next.readMessages";
    case "PERIOD_SIMULATED":
      return "next.review";
    case "PERIOD_REVIEW":
      return "next.nextWeek";
    case "GAME_COMPLETED":
      return "next.completed";
  }
  // Orders are normally released before committing; only remind when some were left.
  if (status === "PLAN_COMMITTED" && !stale) return dueLeft > 0 ? "next.simulateDueLeft" : "next.simulateNow";
  if (stale && hasVersion) return "next.rerun";
  if (hasVersion) return "next.commit";
  return "next.runPlanning";
};

export function DashboardPage() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const language = useGameStore((state) => state.language);
  if (!game || !scenario) return null;
  const version = latestVersion(game);
  const dueLeft = version ? plannedOrdersDueForRelease(game).length : 0;
  const kpis = version?.projectedKpis;
  const currency = scenario.settings.currency;
  const violations = currentViolations(game, scenario.settings.frozenZonePeriods).filter(
    (v) => v.severity !== "INFO",
  );
  const realisedResult = game.kpiHistory.reduce(
    (sum, entry) => sum + entry.kpis.netContribution,
    0,
  );
  const activeEffects = game.activeEventEffects.filter(
    (effect) => effect.fromPeriod <= game.currentPeriod && effect.toPeriod >= game.currentPeriod,
  );
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
          {t(nextStepKey(game.gameStatus, game.pendingDecisionIds.length > 0, !!version, dueLeft), {
            period: game.currentPeriod,
            count: dueLeft,
          })}
        </p>
        <WorkflowActions />
      </section>

      {game.completedPeriods.length > 0 && (
        <>
          <h2>{t("dashboard.realised")}</h2>
          <div className="grid kpis">
            <KpiCard
              label={t("dashboard.cumulativeService")}
              value={formatPercent(cumulativeServiceLevel(game))}
            />
            <KpiCard
              label={t("dashboard.cumulativeResult")}
              value={formatMoney(realisedResult, currency)}
            />
            <KpiCard
              label={t("kpi.lateCustomerOrders")}
              value={game.customerOrders.filter((order) => order.status === "LATE").length}
            />
          </div>
        </>
      )}

      {activeEffects.length > 0 && (
        <div className="banner warning" role="status">
          <strong>{t("dashboard.activeEffects")}:</strong>{" "}
          {activeEffects
            .map((effect) => `${effect.description} (${effect.fromPeriod}–${effect.toPeriod})`)
            .join(" · ")}
        </div>
      )}

      {kpis ? (
        <>
          <p className="muted small">{t("dashboard.kpisFrom", { version: version.id })}</p>
          <div className="grid kpis">
            <KpiCard label={t("dashboard.serviceLevel")} value={formatPercent(kpis.serviceLevel)} />
            <KpiCard
              label={t("dashboard.result")}
              value={formatMoney(kpis.netContribution, currency)}
            />
            <KpiCard
              label={t("dashboard.inventoryValue")}
              value={formatMoney(kpis.averageInventoryValue, currency)}
            />
            <KpiCard label={t("dashboard.overload")} value={formatHours(kpis.overloadHours)} />
            <KpiCard
              label={t("dashboard.atRisk")}
              value={kpis.ordersAtRisk + kpis.lateCustomerOrders}
            />
            <KpiCard label={t("kpi.replanCount")} value={kpis.replanCount} />
          </div>
        </>
      ) : (
        <div className="banner info">{t("dashboard.noPlan")}</div>
      )}

      <TipsPanel page="dashboard" />

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
                      <strong>{describeDecision(decision, t, scenario, language).category}</strong>{" "}
                      · {describeDecision(decision, t, scenario, language).object}:{" "}
                      {describeDecision(decision, t, scenario, language).change}
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
