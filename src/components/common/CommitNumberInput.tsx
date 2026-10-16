import { useEffect, useState } from "react";

interface Props {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  ariaLabel: string;
  onCommit: (value: number) => void;
}

/**
 * Number input that reports its value on blur or Enter only, so that typing
 * "10" is logged as one decision rather than two.
 */
export function CommitNumberInput({ value, min, max, disabled, ariaLabel, onCommit }: Props) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = Number(draft);
    const clamped = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={1}
      disabled={disabled}
      aria-label={ariaLabel}
      value={draft}
      style={{ width: "4.5rem" }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setDraft(String(value));
      }}
    />
  );
}
