import { useEffect, useState } from "react";
import type { LotSizingMethod, LotSizingPolicy } from "../../domain/lotSizing";
import { LOT_SIZING_METHODS } from "../../domain/lotSizing";
import type { ItemPlanningParameters } from "../../domain/planningVersion";
import { canPerform } from "../../engine/game/stateMachine";
import { useGameStore } from "../../state/gameStore";
import { useT } from "../../state/selectors";

const defaultPolicy = (method: LotSizingMethod, current: LotSizingPolicy): LotSizingPolicy => {
  if (method === current.method) return current;
  switch (method) {
    case "FOQ":
      return { method, quantity: 100 };
    case "FPR":
      return { method, periods: 2 };
    case "MULTIPLE":
      return { method, multiple: 50 };
    default:
      return { method };
  }
};

const toNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/** Edits the student's planning parameters for one item in the working plan. */
export function PlanningParametersForm({ itemId }: { itemId: string }) {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const updateParameters = useGameStore((state) => state.updateParameters);
  const current = game?.planningParameters[itemId];
  const [draft, setDraft] = useState<ItemPlanningParameters | undefined>(current);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setDraft(current);
    setReason("");
  }, [current, itemId]);

  if (!game || !scenario || !current || !draft) return null;
  const item = scenario.items.find((candidate) => candidate.id === itemId);
  const suppliers = game.suppliers.filter((supplier) => supplier.suppliedItemIds.includes(itemId));
  const allowed = canPerform(game, "CHANGE_PLAN");
  const changed = JSON.stringify(draft) !== JSON.stringify(current);
  const policy = draft.lotSizingPolicy;

  const setPolicy = (next: LotSizingPolicy) => setDraft({ ...draft, lotSizingPolicy: next });

  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        updateParameters(itemId, draft, reason.trim() || undefined);
      }}
    >
      <div className="card-header">
        <h3>
          {t("plan.parameters")}: {itemId} {item ? `– ${item.name}` : ""}
        </h3>
      </div>
      <fieldset disabled={!allowed.allowed} style={{ border: "none", padding: 0, margin: 0 }}>
        <div className="form-row">
          <label className="field">
            {t("plan.safetyStock")}
            <input
              type="number"
              min={0}
              value={draft.safetyStock}
              onChange={(event) =>
                setDraft({ ...draft, safetyStock: toNumber(event.target.value, draft.safetyStock) })
              }
            />
          </label>
          <label className="field">
            {t("plan.safetyLeadTime")}
            <input
              type="number"
              min={0}
              step={1}
              value={draft.safetyLeadTimePeriods}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  safetyLeadTimePeriods: Math.round(toNumber(event.target.value, draft.safetyLeadTimePeriods)),
                })
              }
            />
          </label>
          <label className="field">
            {t("plan.lotSizing")}
            <select
              value={policy.method}
              onChange={(event) => setPolicy(defaultPolicy(event.target.value as LotSizingMethod, current.lotSizingPolicy))}
            >
              {LOT_SIZING_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          {policy.method === "FOQ" && (
            <label className="field">
              {t("plan.quantity")}
              <input
                type="number"
                min={1}
                value={policy.quantity}
                onChange={(event) =>
                  setPolicy({ method: "FOQ", quantity: Math.max(1, toNumber(event.target.value, policy.quantity)) })
                }
              />
            </label>
          )}
          {policy.method === "FPR" && (
            <label className="field">
              {t("plan.periods")}
              <input
                type="number"
                min={1}
                step={1}
                value={policy.periods}
                onChange={(event) =>
                  setPolicy({
                    method: "FPR",
                    periods: Math.max(1, Math.round(toNumber(event.target.value, policy.periods))),
                  })
                }
              />
            </label>
          )}
          {policy.method === "MULTIPLE" && (
            <>
              <label className="field">
                {t("plan.multiple")}
                <input
                  type="number"
                  min={1}
                  value={policy.multiple}
                  onChange={(event) =>
                    setPolicy({ ...policy, multiple: Math.max(1, toNumber(event.target.value, policy.multiple)) })
                  }
                />
              </label>
              <label className="field">
                {t("plan.minimum")}
                <input
                  type="number"
                  min={0}
                  value={policy.minimum ?? 0}
                  onChange={(event) =>
                    setPolicy({ ...policy, minimum: toNumber(event.target.value, policy.minimum ?? 0) || undefined })
                  }
                />
              </label>
            </>
          )}
          {item?.type === "PURCHASED" && suppliers.length > 0 && (
            <label className="field">
              {t("plan.supplier")}
              <select
                value={draft.supplierId ?? ""}
                onChange={(event) => setDraft({ ...draft, supplierId: event.target.value })}
              >
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} ({t("plan.leadTime")} {supplier.normalLeadTimePeriods},{" "}
                    ×{supplier.unitCostModifiers?.[itemId] ?? 1})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="form-row" style={{ marginTop: "0.75rem" }}>
          <label className="field" style={{ flex: 1, minWidth: 240 }}>
            {t("plan.reason")}
            <input
              type="text"
              value={reason}
              placeholder={t("plan.reasonPlaceholder")}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
            />
          </label>
          <button type="submit" className="primary" disabled={!changed}>
            {t("action.apply")}
          </button>
          <button type="button" disabled={!changed} onClick={() => setDraft(current)}>
            {t("action.cancel")}
          </button>
        </div>
      </fieldset>
      {!allowed.allowed && allowed.reasonKey && <p className="muted small">{t(allowed.reasonKey)}</p>}
    </form>
  );
}
