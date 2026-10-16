import { X } from "lucide-react";
import type { CalculationTrace } from "../../domain/common";
import { useT } from "../../state/selectors";
import { formatQuantity } from "../../utils/format";

const formatValue = (value: number | string): string =>
  typeof value === "number" ? formatQuantity(value) : value;

/** Shows how a value was calculated, generated from the engine's trace data. */
export function ExplanationPanel({
  rowLabel,
  period,
  trace,
  onClose,
}: {
  rowLabel: string;
  period: number;
  trace: CalculationTrace;
  onClose: () => void;
}) {
  const t = useT();
  const params = { ...trace.inputs, ...(trace.intermediateValues ?? {}) };
  return (
    <section className="card explain" aria-live="polite">
      <div className="card-header">
        <h3>{t("explain.title", { row: rowLabel, period })}</h3>
        <button onClick={onClose} aria-label={t("action.close")}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <p>{t(trace.explanationKey, params)}</p>
      <div className="formula">{trace.formula}</div>
      <dl>
        {Object.entries(trace.inputs).map(([name, value]) => (
          <div key={name} style={{ display: "contents" }}>
            <dt>{name}</dt>
            <dd>{formatValue(value)}</dd>
          </div>
        ))}
        {Object.entries(trace.intermediateValues ?? {}).map(([name, value]) => (
          <div key={name} style={{ display: "contents" }}>
            <dt>{name}</dt>
            <dd>{formatValue(value)}</dd>
          </div>
        ))}
        <dt>
          <strong>{t("explain.result")}</strong>
        </dt>
        <dd>
          <strong>{formatValue(trace.result)}</strong>
        </dd>
      </dl>
    </section>
  );
}
