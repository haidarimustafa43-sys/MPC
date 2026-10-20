import { useEffect, useRef, useState } from "react";

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
 *
 * Callers must give each input a key that identifies what it edits (e.g.
 * work centre and period). Otherwise React reuses the element when the view
 * switches, and a draft typed for one work centre shows up for the next.
 */
export function CommitNumberInput({ value, min, max, disabled, ariaLabel, onCommit }: Props) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const clamp = (text: string) => {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
  };

  // Safari does not move focus to a clicked button, so switching tab can
  // unmount the input without a blur. Commit the pending draft on unmount.
  const pending = useRef({ draft, value, commit: (_: number) => {} });
  pending.current = { draft, value, commit: (next: number) => (next !== value ? onCommit(next) : undefined) };
  useEffect(
    () => () => {
      const { draft: text, value: current, commit } = pending.current;
      if (text !== String(current) && !disabled) commit(clamp(text));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const commit = () => {
    const clamped = clamp(draft);
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
