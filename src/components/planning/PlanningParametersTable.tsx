import { useState } from "react";
import { canPerform } from "../../engine/game/stateMachine";
import { describePolicy } from "../../engine/mrp/lotSizing";
import { useGameStore } from "../../state/gameStore";
import { useT } from "../../state/selectors";
import { CommitNumberInput } from "../common/CommitNumberInput";
import { PlanningParametersForm } from "./PlanningParametersForm";

/**
 * The student's planning parameters of all items in one place, as in an ERP
 * material master. They are the same values as in the form under each MPS/MRP
 * record; changing them here or there is the same decision.
 */
export function PlanningParametersTable() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const updateParameters = useGameStore((state) => state.updateParameters);
  const [editingLotSize, setEditingLotSize] = useState<string | null>(null);
  if (!game || !scenario) return null;
  const allowed = canPerform(game, "CHANGE_PLAN");
  const disabledReason = allowed.reasonKey ? t(allowed.reasonKey) : undefined;

  return (
    <>
      <p className="muted small">{t("master.parametersHelp")}</p>
      {!allowed.allowed && disabledReason && <p className="muted small">{disabledReason}</p>}
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">{t("plan.item")}</th>
              <th scope="col">{t("plan.safetyStock")}</th>
              <th scope="col">{t("plan.safetyLeadTime")}</th>
              <th scope="col" className="left">{t("plan.lotSizing")}</th>
              <th scope="col" className="left">{t("plan.supplier")}</th>
              <th scope="col">{t("plan.leadTime")}</th>
            </tr>
          </thead>
          <tbody>
            {scenario.items.map((item) => {
              const params = game.planningParameters[item.id];
              if (!params) return null;
              const suppliers = game.suppliers.filter((s) => s.active && s.suppliedItemIds.includes(item.id));
              const supplier = suppliers.find((s) => s.id === params.supplierId);
              const changed = (value: unknown, original: unknown) =>
                JSON.stringify(value) !== JSON.stringify(original) ? (
                  <span className="muted small"> ({t("master.scenarioValue", { value: String(original ?? "–") })})</span>
                ) : null;
              return (
                <tr key={item.id}>
                  <td>
                    {item.id} – {item.name}
                  </td>
                  <td>
                    <CommitNumberInput
                      key={`${item.id}-ss`}
                      value={params.safetyStock}
                      min={0}
                      max={1_000_000}
                      disabled={!allowed.allowed}
                      ariaLabel={`${t("plan.safetyStock")} ${item.id}`}
                      onCommit={(value) => updateParameters(item.id, { safetyStock: value })}
                    />
                    {changed(params.safetyStock, item.safetyStock)}
                  </td>
                  <td>
                    <CommitNumberInput
                      key={`${item.id}-slt`}
                      value={params.safetyLeadTimePeriods}
                      min={0}
                      max={10}
                      disabled={!allowed.allowed}
                      ariaLabel={`${t("plan.safetyLeadTime")} ${item.id}`}
                      onCommit={(value) => updateParameters(item.id, { safetyLeadTimePeriods: Math.round(value) })}
                    />
                  </td>
                  <td className="left">
                    <div className="row">
                      {describePolicy(params.lotSizingPolicy)}
                      <button
                        className="link"
                        disabled={!allowed.allowed}
                        title={disabledReason}
                        aria-expanded={editingLotSize === item.id}
                        onClick={() => setEditingLotSize(editingLotSize === item.id ? null : item.id)}
                      >
                        {t("action.change")}
                      </button>
                    </div>
                  </td>
                  <td className="left">
                    {suppliers.length > 1 ? (
                      <select
                        aria-label={`${t("plan.supplier")} ${item.id}`}
                        value={params.supplierId ?? ""}
                        disabled={!allowed.allowed}
                        title={disabledReason}
                        onChange={(event) => updateParameters(item.id, { supplierId: event.target.value })}
                      >
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} (×{s.unitCostModifiers?.[item.id] ?? 1})
                          </option>
                        ))}
                      </select>
                    ) : (
                      (supplier?.name ?? "–")
                    )}
                  </td>
                  <td>{supplier ? supplier.normalLeadTimePeriods : item.leadTimePeriods}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editingLotSize && (
        <div style={{ marginTop: "1rem" }}>
          <PlanningParametersForm key={editingLotSize} itemId={editingLotSize} />
        </div>
      )}
    </>
  );
}
