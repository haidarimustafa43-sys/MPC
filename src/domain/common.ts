/** Text that a scenario can provide in several languages. */
export interface LocalizedText {
  en: string;
  sv?: string;
}

export type Language = "en" | "sv";

export type Severity = "INFO" | "WARNING" | "CRITICAL" | "BLOCKING";

/**
 * Explanation data produced by the engines so the UI can show how a value was
 * derived. The text is generated from the real calculation, never hard-coded.
 */
export interface CalculationTrace {
  formula: string;
  inputs: Record<string, number | string>;
  intermediateValues?: Record<string, number>;
  result: number;
  explanationKey: string;
}
