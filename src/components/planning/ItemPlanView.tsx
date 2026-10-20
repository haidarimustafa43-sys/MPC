import { useState } from "react";
import type { CalculationTrace } from "../../domain/common";
import type { ItemPlanRecord, MpsRecord } from "../../domain/planningVersion";
import { canPerform } from "../../engine/game/stateMachine";
import { describePolicy } from "../../engine/mrp/lotSizing";
import { useGameStore } from "../../state/gameStore";
import { useT } from "../../state/selectors";
import type { TimePhasedRow } from "../tables/TimePhasedTable";
import { TimePhasedTable } from "../tables/TimePhasedTable";
import { ExplanationPanel } from "./ExplanationPanel";
import { PlanningParametersForm } from "./PlanningParametersForm";

const isMps = (record: ItemPlanRecord): record is MpsRecord => "atp" in record;

const riskClass = (record: ItemPlanRecord, index: number): string =>
  record.risk[index] === "SHORTAGE" ? "risk-shortage" : record.risk[index] === "BELOW_SAFETY_STOCK" ? "risk-below" : "";

/** Time-phased MPS or MRP record of one item with explanations and parameters. */
export function ItemPlanView({
  record,
  itemName,
  unit,
  demandTimeFenceEnd,
}: {
  record: ItemPlanRecord;
  itemName: string;
  unit: string;
  demandTimeFenceEnd?: number;
}) {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const updateForecast = useGameStore((state) => state.updateForecast);
  const canEdit = !!game && canPerform(game, "CHANGE_PLAN").allowed;
  const forecastEditableFrom =
    scenario?.settings.forecastEditable && demandTimeFenceEnd !== undefined ? demandTimeFenceEnd + 1 : undefined;
  const [selected, setSelected] = useState<{ row: string; period: number; label: string } | null>(null);
  const uncovered = new Set(record.uncoveredPeriods);
  const firm = new Set(record.firmPeriods ?? []);
  const pabTooltip = (index: number) => t(`risk.${record.risk[index]}`);

  const common: TimePhasedRow[] = [
    {
      key: "scheduled",
      label: t("row.scheduledReceipts"),
      values: record.scheduledReceipts,
      kind: "input",
    },
    {
      key: "projectedBefore",
      label: t("row.projectedBeforePlanned"),
      values: record.projectedBeforePlanned,
      initial: record.startingOnHand,
      kind: "calc",
    },
    {
      key: "net",
      label: t("row.netRequirements"),
      values: record.netRequirements,
      kind: "calc",
      traceRow: "net",
      cellClass: (index) => (uncovered.has(record.periods[index]) ? "uncovered" : ""),
      tooltip: (index) => (uncovered.has(record.periods[index]) ? t("plan.uncovered") : undefined),
    },
    {
      key: "receipts",
      label: isMps(record) ? t("row.mpsReceipt") : t("row.plannedReceipts"),
      values: record.plannedReceipts,
      kind: "calc",
      emphasis: true,
      traceRow: "receipt",
      cellClass: (index) => (firm.has(record.periods[index]) ? "manual" : ""),
      tooltip: (index) => (firm.has(record.periods[index]) ? t("row.firmMarker") : undefined),
    },
    {
      key: "pab",
      label: t("row.projectedAvailable"),
      values: record.projectedAvailable,
      initial: record.startingOnHand,
      kind: "calc",
      traceRow: "pab",
      cellClass: (index) => riskClass(record, index),
      tooltip: pabTooltip,
    },
    {
      key: "releases",
      label: isMps(record) ? t("row.mpsRelease") : t("row.plannedReleases"),
      values: record.plannedReleases,
      kind: "calc",
      emphasis: true,
      traceRow: "release",
    },
  ];

  const rows: TimePhasedRow[] = isMps(record)
    ? [
        {
          key: "forecast",
          label: t("row.forecast"),
          values: record.forecast,
          kind: "input",
          editable: (index) =>
            forecastEditableFrom !== undefined && canEdit && record.periods[index] >= forecastEditableFrom,
          onEdit: (index, value) => updateForecast(record.itemId, record.periods[index], value),
        },
        { key: "orders", label: t("row.customerOrders"), values: record.customerOrders, kind: "input" },
        { key: "demand", label: t("row.totalDemand"), values: record.grossRequirements, kind: "calc", emphasis: true, traceRow: "gross" },
        ...common,
        { key: "atp", label: t("row.atp"), values: record.atp, kind: "calc", traceRow: "atp" },
      ]
    : [
        {
          key: "gross",
          label: t("row.grossRequirements"),
          values: record.grossRequirements,
          kind: "calc",
          emphasis: true,
          traceRow: "gross",
        },
        ...common,
      ];

  const trace = (row: string, period: number): CalculationTrace | undefined => record.traces[`${row}:${period}`];
  const selectedTrace = selected ? trace(selected.row, selected.period) : undefined;
  const receiptTrace = selected?.row === "receipt" ? selectedTrace : undefined;
  const lotTrace =
    receiptTrace && typeof receiptTrace.inputs.neededPeriod === "number"
      ? trace("lot", receiptTrace.inputs.neededPeriod)
      : undefined;

  return (
    <div className="grid">
      <section className="card">
        <div className="card-header">
          <h2>
            {record.itemId} – {itemName}
          </h2>
          <div className="row small">
            <span className="badge mode">
              {t("plan.lotSizing")}: {describePolicy(record.lotSizingPolicy)}
            </span>
            <span className="badge mode">
              {t("plan.safetyStock")}: {record.safetyStock} {unit}
            </span>
            <span className="badge mode">
              {t("plan.leadTime")}: {record.leadTimePeriods}
            </span>
            <span className="badge mode">
              {t("plan.safetyLeadTime")}: {record.safetyLeadTimePeriods}
            </span>
            <span className="badge mode">
              {t("plan.lowLevelCode")}: {record.lowLevelCode}
            </span>
          </div>
        </div>
        {demandTimeFenceEnd !== undefined && (
          <p className="muted small">
            {t("plan.dtfNote", { period: demandTimeFenceEnd })}
            {forecastEditableFrom !== undefined && ` ${t("forecast.editHint", { period: forecastEditableFrom })}`}
          </p>
        )}
        <TimePhasedTable
          caption={`${record.itemId} ${itemName}`}
          periods={record.periods}
          rows={rows}
          periodLabel={t("plan.period")}
          nowLabel={t("row.onHand")}
          hasTrace={(row, period) => !!trace(row, period)}
          selected={selected}
          onCellClick={(row, period) =>
            row.traceRow && setSelected({ row: row.traceRow, period, label: row.label })
          }
        />
        <div className="legend">
          <span className="l-input">{t("plan.inputLegend")}</span>
          <span className="l-below">{t("risk.BELOW_SAFETY_STOCK")}</span>
          <span className="l-shortage">{t("risk.SHORTAGE")}</span>
          <span className="l-uncovered">{t("plan.uncovered")}</span>
          <span className="l-manual">{t("plan.firmLegend")}</span>
        </div>
        <p className="muted small" style={{ marginTop: "0.5rem" }}>
          {t("plan.cellHelp")}
        </p>
      </section>
      {selected && selectedTrace && (
        <ExplanationPanel
          rowLabel={selected.label}
          period={selected.period}
          trace={selectedTrace}
          onClose={() => setSelected(null)}
        />
      )}
      {lotTrace && selected && (
        <ExplanationPanel
          rowLabel={t("plan.lotSizing")}
          period={selected.period}
          trace={lotTrace}
          onClose={() => setSelected(null)}
        />
      )}
      <PlanningParametersForm itemId={record.itemId} />
    </div>
  );
}
