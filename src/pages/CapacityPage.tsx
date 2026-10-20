import { useState } from "react";
import { CapacityChart } from "../components/charts/CapacityChart";
import { CommitNumberInput } from "../components/common/CommitNumberInput";
import { PlanStatusBanner } from "../components/common/PlanStatusBanner";
import { ItemTabs } from "../components/planning/ItemTabs";
import { canPerform } from "../engine/game/stateMachine";
import { useGameStore } from "../state/gameStore";
import { selectLatestVersion, useT } from "../state/selectors";
import { formatHours, formatNumber, formatPercent } from "../utils/format";

export function CapacityPage() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const setCapacity = useGameStore((state) => state.setCapacity);
  const version = selectLatestVersion(game);
  const [workCenterId, setWorkCenterId] = useState<string | null>(null);
  const [period, setPeriod] = useState<number | null>(null);
  if (!game || !scenario) return null;

  const workCenter = scenario.workCenters.find((wc) => wc.id === workCenterId) ?? scenario.workCenters[0];
  const buckets = (version?.crpResult.buckets ?? []).filter((b) => b.workCenterId === workCenter.id);
  const rccp = (version?.rccpResult.buckets ?? []).filter((b) => b.workCenterId === workCenter.id);
  const selectedBucket = buckets.find((b) => b.period === period);
  const editable = canPerform(game, "CHANGE_PLAN").allowed;
  const adjustment = (p: number) =>
    game.workCenterCapacity.find((entry) => entry.workCenterId === workCenter.id && entry.period === p);
  const external = scenario.settings.externalCapacity;
  const allBuckets = version?.crpResult.buckets ?? [];

  return (
    <>
      <h1>{t("nav.capacity")}</h1>
      <PlanStatusBanner />
      <ItemTabs
        label={t("capacity.workCenter")}
        items={scenario.workCenters.map((wc) => ({
          id: wc.id,
          label: `${wc.id} ${wc.name}`,
          flagged: allBuckets.some((b) => b.workCenterId === wc.id && b.balanceHours < 0),
        }))}
        selectedId={workCenter.id}
        onSelect={(id) => {
          setWorkCenterId(id);
          setPeriod(null);
        }}
      />
      {buckets.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h2>
              {t("capacity.crp")}: {workCenter.id} – {workCenter.name}
            </h2>
            <span className="muted small">
              {t("capacity.overtimeLimit", {
                hours: workCenter.overtimeCapacityLimitHours ?? 0,
                cost: `${workCenter.overtimeCostPerHour ?? 0} ${scenario.settings.currency}`,
              })}
            </span>
          </div>
          <CapacityChart
            buckets={buckets}
            loadLabel={t("capacity.load")}
            availableLabel={t("capacity.available")}
            normalLabel={`${t("capacity.normal")} × ${t("capacity.factor")}`}
          />
          <div className="table-scroll">
            <table className="timephased">
              <thead>
                <tr>
                  <th scope="col" className="row-label">
                    {t("plan.period")}
                  </th>
                  {buckets.map((b) => (
                    <th scope="col" key={b.period}>
                      <button
                        className="link"
                        onClick={() => setPeriod(b.period)}
                        aria-pressed={period === b.period}
                      >
                        {b.period}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="row-label">{t("capacity.normal")}</th>
                  {buckets.map((b) => <td key={b.period}>{formatNumber(b.normalCapacityHours, 1)}</td>)}
                </tr>
                <tr>
                  <th scope="row" className="row-label">{t("capacity.factor")}</th>
                  {buckets.map((b) => (
                    <td key={b.period} className={b.capacityFactor < 1 ? "risk-below" : ""}>
                      {formatPercent(b.capacityFactor)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="row-label">{t("capacity.overtime")}</th>
                  {buckets.map((b) => (
                    <td key={`${workCenter.id}-${b.period}`} className="input">
                      <CommitNumberInput
                        min={0}
                        max={workCenter.overtimeCapacityLimitHours ?? 0}
                        disabled={!editable}
                        ariaLabel={`${t("capacity.overtime")} ${workCenter.id} ${t("plan.period")} ${b.period}`}
                        value={adjustment(b.period)?.overtimeHours ?? 0}
                        onCommit={(value) => setCapacity(workCenter.id, b.period, { overtimeHours: value })}
                      />
                    </td>
                  ))}
                </tr>
                {external && (
                  <tr>
                    <th scope="row" className="row-label">{t("capacity.external")}</th>
                    {buckets.map((b) => (
                      <td key={`${workCenter.id}-${b.period}`} className="input">
                        <CommitNumberInput
                          min={0}
                          max={external.maxHoursPerPeriod}
                          disabled={!editable}
                          ariaLabel={`${t("capacity.external")} ${workCenter.id} ${t("plan.period")} ${b.period}`}
                          value={adjustment(b.period)?.externalHours ?? 0}
                          onCommit={(value) => setCapacity(workCenter.id, b.period, { externalHours: value })}
                        />
                      </td>
                    ))}
                  </tr>
                )}
                <tr>
                  <th scope="row" className="row-label">{t("capacity.available")}</th>
                  {buckets.map((b) => <td key={b.period}>{formatNumber(b.availableHours, 1)}</td>)}
                </tr>
                <tr>
                  <th scope="row" className="row-label">{t("capacity.load")}</th>
                  {buckets.map((b) => (
                    <td key={b.period} className="emphasis">
                      {formatNumber(b.loadHours, 1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="row-label">{t("capacity.balance")}</th>
                  {buckets.map((b) => (
                    <td
                      key={b.period}
                      className={b.balanceHours < 0 ? "risk-shortage" : ""}
                      title={b.balanceHours < 0 ? t("capacity.overloaded") : undefined}
                    >
                      {b.balanceHours < 0 ? "▲ " : ""}
                      {formatNumber(b.balanceHours, 1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="row-label">{t("capacity.utilization")}</th>
                  {buckets.map((b) => (
                    <td key={b.period} className={b.utilization > 1 ? "risk-shortage" : b.utilization > 0.9 ? "risk-below" : ""}>
                      {formatPercent(b.utilization)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ marginTop: "0.5rem" }}>
            {t("capacity.selectCell")}
          </p>
        </section>
      )}

      {selectedBucket && (
        <section className="card">
          <h3>{t("capacity.contributions", { workCenter: workCenter.id, period: selectedBucket.period })}</h3>
          {selectedBucket.contributions.length === 0 ? (
            <p className="muted">{t("orders.none")}</p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">{t("orders.id")}</th>
                    <th scope="col" className="left">{t("orders.item")}</th>
                    <th scope="col" className="left">{t("orders.source")}</th>
                    <th scope="col">{t("capacity.operation")}</th>
                    <th scope="col">{t("orders.quantity")}</th>
                    <th scope="col">{t("capacity.setup")}</th>
                    <th scope="col">{t("capacity.run")}</th>
                    <th scope="col">{t("capacity.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBucket.contributions.map((c) => (
                    <tr key={`${c.orderId}-${c.operationSequence}`}>
                      <td>{c.orderId}</td>
                      <td className="left">{c.itemId}</td>
                      <td className="left">{c.orderType === "PLANNED" ? t("orders.planned") : t("orders.released")}</td>
                      <td>{c.operationSequence}</td>
                      <td>{formatNumber(c.quantity)}</td>
                      <td>{formatHours(c.setupHours)}</td>
                      <td>{formatHours(c.runHours)}</td>
                      <td>
                        <strong>{formatHours(c.totalHours)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {rccp.length > 0 && version && (
        <section className="card">
          <h2>{t("capacity.rccp")}</h2>
          <p className="muted small">{t("capacity.rccpHelp")}</p>
          <div className="table-scroll">
            <table className="timephased">
              <thead>
                <tr>
                  <th scope="col" className="row-label">{t("plan.period")}</th>
                  {rccp.map((b) => <th scope="col" key={b.period}>{b.period}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="row-label">{t("capacity.available")}</th>
                  {rccp.map((b) => <td key={b.period}>{formatNumber(b.availableHours, 1)}</td>)}
                </tr>
                <tr>
                  <th scope="row" className="row-label">{t("capacity.load")}</th>
                  {rccp.map((b) => <td key={b.period}>{formatNumber(b.loadHours, 1)}</td>)}
                </tr>
                <tr>
                  <th scope="row" className="row-label">{t("capacity.utilization")}</th>
                  {rccp.map((b) => (
                    <td key={b.period} className={b.utilization > 1 ? "risk-shortage" : b.utilization > 0.9 ? "risk-below" : ""}>
                      {formatPercent(b.utilization)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <h3 style={{ marginTop: "1rem" }}>{t("capacity.billOfResources")}</h3>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t("plan.item")}</th>
                  {scenario.workCenters.map((wc) => <th scope="col" key={wc.id}>{wc.id}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(version.rccpResult.billOfResources).map(([itemId, hours]) => (
                  <tr key={itemId}>
                    <td>{itemId}</td>
                    {scenario.workCenters.map((wc) => (
                      <td key={wc.id}>{formatNumber(hours[wc.id] ?? 0, 3)}</td>
                    ))}
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
