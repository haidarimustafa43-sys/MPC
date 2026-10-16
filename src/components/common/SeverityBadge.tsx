import { AlertOctagon, AlertTriangle, Ban, Info } from "lucide-react";
import type { Severity } from "../../domain/common";
import { useT } from "../../state/selectors";

const ICONS = { INFO: Info, WARNING: AlertTriangle, CRITICAL: AlertOctagon, BLOCKING: Ban } as const;

/** Severity is always shown as icon + text + colour, never colour alone. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const t = useT();
  const Icon = ICONS[severity];
  return (
    <span className={`badge ${severity.toLowerCase()}`}>
      <Icon size={14} aria-hidden="true" />
      {t(`severity.${severity}`)}
    </span>
  );
}
