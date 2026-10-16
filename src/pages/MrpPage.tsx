import { useState } from "react";
import { PlanStatusBanner } from "../components/common/PlanStatusBanner";
import { ItemPlanView } from "../components/planning/ItemPlanView";
import { ItemTabs } from "../components/planning/ItemTabs";
import { useGameStore } from "../state/gameStore";
import { selectLatestVersion, useT } from "../state/selectors";

/** MRP records of all dependent-demand items, in low-level-code order. */
export function MrpPage() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const version = selectLatestVersion(game);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!game || !scenario) return null;
  const endItems = new Set(scenario.items.filter((item) => item.type === "END_ITEM").map((item) => item.id));
  const records = (version?.mrpResult.records ?? []).filter((record) => !endItems.has(record.itemId));
  const record = records.find((candidate) => candidate.itemId === selectedId) ?? records[0];
  const item = record && scenario.items.find((candidate) => candidate.id === record.itemId);

  return (
    <>
      <h1>{t("nav.mrp")}</h1>
      <PlanStatusBanner />
      {records.length > 0 && record && item && (
        <>
          <ItemTabs
            label={t("plan.item")}
            items={records.map((r) => ({
              id: r.itemId,
              label: `${r.itemId} (${t("plan.lowLevelCode")} ${r.lowLevelCode})`,
              flagged: r.risk.some((risk) => risk !== "OK") || r.uncoveredPeriods.length > 0,
            }))}
            selectedId={record.itemId}
            onSelect={setSelectedId}
          />
          <ItemPlanView record={record} itemName={item.name} unit={item.unit} />
        </>
      )}
    </>
  );
}
