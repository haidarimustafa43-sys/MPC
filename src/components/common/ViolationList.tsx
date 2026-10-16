import type { ConstraintViolation } from "../../domain/constraint";
import { useT, violationText } from "../../state/selectors";
import { SeverityBadge } from "./SeverityBadge";

interface Props {
  violations: readonly ConstraintViolation[];
  limit?: number;
  emptyText?: string;
}

export function ViolationList({ violations, limit, emptyText }: Props) {
  const t = useT();
  const shown = limit ? violations.slice(0, limit) : violations;
  if (violations.length === 0) return <p className="muted">{emptyText ?? t("dashboard.noProblems")}</p>;
  return (
    <>
      <ul className="violation-list">
        {shown.map((violation) => (
          <li key={violation.id}>
            <SeverityBadge severity={violation.severity} />
            <div>
              <div>{violationText(violation, t)}</div>
              {violation.relatedOrderIds && violation.relatedOrderIds.length > 0 && (
                <div className="related">
                  {t("constraint.related")}: {violation.relatedOrderIds.join(", ")}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {limit && violations.length > limit && (
        <p className="muted small">+ {violations.length - limit} …</p>
      )}
    </>
  );
}
