import type { KeyboardEvent } from "react";
import { formatQuantity } from "../../utils/format";
import { CommitNumberInput } from "../common/CommitNumberInput";

export interface TimePhasedRow {
  key: string;
  label: string;
  values: readonly (number | null)[];
  /** Value shown in the "Now" column (e.g. on-hand balance). */
  initial?: number;
  /** "input" rows are data the plan starts from; "calc" rows are calculated. */
  kind: "input" | "calc";
  emphasis?: boolean;
  cellClass?: (index: number) => string;
  /** Row name in the calculation traces, e.g. "net"; makes cells clickable. */
  traceRow?: string;
  tooltip?: (index: number) => string | undefined;
  /** Cells the student may change directly (e.g. forecast outside the time fence). */
  editable?: (index: number) => boolean;
  onEdit?: (index: number, value: number) => void;
}

interface Props {
  caption: string;
  periods: readonly number[];
  rows: readonly TimePhasedRow[];
  periodLabel: string;
  nowLabel?: string;
  hasTrace?: (traceRow: string, period: number) => boolean;
  selected?: { row: string; period: number } | null;
  onCellClick?: (row: TimePhasedRow, period: number) => void;
}

/**
 * Time-phased planning table with a sticky label column and horizontal scroll.
 * Input values and calculated values are styled differently; calculated cells
 * with a trace can be opened with mouse or keyboard.
 */
export function TimePhasedTable({
  caption,
  periods,
  rows,
  periodLabel,
  nowLabel,
  hasTrace,
  selected,
  onCellClick,
}: Props) {
  const showNow = rows.some((row) => row.initial !== undefined);

  const handleKey = (event: KeyboardEvent, row: TimePhasedRow, period: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCellClick?.(row, period);
    }
  };

  return (
    <div className="table-scroll">
      <table className="timephased">
        <caption className="sr-only">
          {caption}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="row-label">
              {periodLabel}
            </th>
            {showNow && <th scope="col">{nowLabel}</th>}
            {periods.map((period) => (
              <th scope="col" key={period}>
                {period}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="row-label" style={{ fontWeight: 500, color: "var(--text)" }}>
                {row.label}
              </th>
              {showNow && <td>{row.initial !== undefined ? formatQuantity(row.initial) : ""}</td>}
              {row.values.map((value, index) => {
                const period = periods[index];
                if (row.editable?.(index) && row.onEdit) {
                  return (
                    <td key={period} className="input manual-edit">
                      <CommitNumberInput
                        value={value ?? 0}
                        min={0}
                        max={1_000_000}
                        ariaLabel={`${row.label}, ${periodLabel} ${period}`}
                        onCommit={(next) => row.onEdit?.(index, next)}
                      />
                    </td>
                  );
                }
                const clickable =
                  !!row.traceRow && !!onCellClick && (hasTrace?.(row.traceRow, period) ?? false);
                const isSelected = selected?.row === row.traceRow && selected?.period === period;
                const classes = [
                  row.kind === "input" ? "input" : "",
                  row.emphasis ? "emphasis" : "",
                  value === 0 ? "zero" : "",
                  clickable ? "clickable" : "",
                  isSelected ? "selected" : "",
                  row.cellClass?.(index) ?? "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <td
                    key={period}
                    className={classes}
                    title={row.tooltip?.(index)}
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? "button" : undefined}
                    aria-label={clickable ? `${row.label}, ${periodLabel} ${period}: ${value ?? ""}` : undefined}
                    onClick={clickable ? () => onCellClick?.(row, period) : undefined}
                    onKeyDown={clickable ? (event) => handleKey(event, row, period) : undefined}
                  >
                    {value === null ? "" : formatQuantity(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
