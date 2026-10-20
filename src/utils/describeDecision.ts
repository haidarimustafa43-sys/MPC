import type { DecisionRecord } from "../domain/decision";
import type { LotSizingPolicy } from "../domain/lotSizing";
import type { Scenario } from "../domain/scenario";
import { describePolicy } from "../engine/mrp/lotSizing";
import type { Params } from "../i18n";
import { localize } from "../i18n";
import type { Language } from "../domain/common";
import { formatQuantity } from "./format";

type Translate = (key: string, params?: Params) => string;

export interface DecisionText {
  category: string;
  object: string;
  change: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);
const isPolicy = (value: unknown): value is LotSizingPolicy =>
  isRecord(value) && typeof value.method === "string";

/** Last-resort rendering that never shows raw JSON braces. */
const plain = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "–";
  if (typeof value === "number") return formatQuantity(value);
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  if (isPolicy(value)) return describePolicy(value);
  if (isRecord(value))
    return Object.entries(value)
      .map(([k, v]) => `${k} ${plain(v)}`)
      .join(", ");
  return String(value);
};

/** "WC200@3" → "WC200, week 3"; plain ids stay as they are. */
const objectText = (entityId: string | undefined, t: Translate): string => {
  if (!entityId) return "–";
  const [id, period] = entityId.split("@");
  return period ? t("decisionText.objectInWeek", { id, week: period }) : id;
};

/**
 * A decision as the student would say it ("Safety stock: 30 → 80",
 * "Released 110, due week 8") instead of the stored values.
 */
export const describeDecision = (
  decision: DecisionRecord,
  t: Translate,
  scenario?: Scenario | null,
  language: Language = "en",
): DecisionText => {
  const key = `decisionCategory.${decision.category}`;
  const categoryLabel = t(key);
  const category = categoryLabel === key ? decision.category : categoryLabel;
  const object = objectText(decision.entityId, t);
  const prev = decision.previousValue;
  const next = decision.newValue;
  const supplierName = (id: unknown) =>
    (typeof id === "string" && scenario?.suppliers.find((s) => s.id === id)?.name) || plain(id);
  const arrow = (a: string, b: string) => `${a} → ${b}`;
  const messageEvent =
    decision.category === "MESSAGE_RESPONSE"
      ? scenario?.events.find((e) => decision.entityId?.startsWith(`MSG-${e.id}-`))
      : undefined;

  const change = ((): string => {
    switch (decision.category) {
      case "RELEASE_ORDER": {
        const value = isRecord(next) ? next : {};
        return t("decisionText.released", {
          quantity: plain(value.quantity),
          week: plain(value.duePeriod),
        });
      }
      case "PLANNING_PARAMETER": {
        const fieldKey = `decisionField.${decision.field}`;
        const fieldLabel = t(fieldKey);
        const label = fieldLabel === fieldKey ? (decision.field ?? "") : fieldLabel;
        return `${label}: ${arrow(plain(prev), plain(next))}`;
      }
      case "SUPPLIER_SELECTION":
        return arrow(supplierName(prev), supplierName(next));
      case "OVERTIME":
      case "EXTERNAL_CAPACITY":
        return arrow(`${plain(prev)} h`, `${plain(next)} h`);
      case "FORECAST_CHANGE":
        return arrow(plain(prev), plain(next));
      case "FIRM_PLANNED_ORDER": {
        const before = isRecord(prev) ? prev : {};
        const after = isRecord(next) ? next : {};
        const from =
          typeof before.from === "string" && before.from !== decision.entityId
            ? before.from
            : undefined;
        const text = arrow(
          t("decisionText.order", {
            quantity: plain(before.quantity),
            week: plain(before.receiptPeriod),
          }),
          t("decisionText.order", {
            quantity: plain(after.quantity),
            week: plain(after.receiptPeriod),
          }),
        );
        return from ? `${t("decisionText.from", { order: from })}: ${text}` : text;
      }
      case "CANCEL_FIRM_ORDER": {
        const before = isRecord(prev) ? prev : {};
        return t("decisionText.cancelled", {
          quantity: plain(before.quantity),
          week: plain(before.receiptPeriod),
        });
      }
      case "EXPRESS_DELIVERY":
        return t("decisionText.dueMoved", { from: plain(prev), to: plain(next) });
      case "MESSAGE_RESPONSE": {
        const choice = messageEvent?.choices?.find((c) => c.id === next);
        return t("decisionText.answer", {
          choice: choice ? localize(choice.label, language) : plain(next),
        });
      }
      case "ACCEPT_CUSTOMER_ORDER":
      case "REJECT_CUSTOMER_ORDER":
        return arrow(plain(prev), plain(next));
      case "RESET_WORKING_PLAN":
        return t("decisionText.reset", { version: plain(decision.entityId) });
      case "APPLY_WHAT_IF":
      case "DISCARD_WHAT_IF": {
        const value = isRecord(next) ? next : {};
        return t("decisionText.whatIf", {
          decisions: num(value.decisions) ?? 0,
          versions: num(value.versions) ?? 0,
        });
      }
      default:
        return prev === undefined ? plain(next) : arrow(plain(prev), plain(next));
    }
  })();

  // A message id says little; its title says what was answered.
  const shownObject = messageEvent ? localize(messageEvent.message.title, language) : object;
  return { category, object: shownObject, change };
};
