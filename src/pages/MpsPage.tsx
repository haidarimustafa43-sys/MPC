import { useState } from "react";
import { PlanStatusBanner } from "../components/common/PlanStatusBanner";
import { ItemPlanView } from "../components/planning/ItemPlanView";
import { ItemTabs } from "../components/planning/ItemTabs";
import { useGameStore } from "../state/gameStore";
import { selectLatestVersion, useT } from "../state/selectors";

export function MpsPage() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const version = selectLatestVersion(game);
  const records = version?.mpsResult.records ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!game || !scenario) return null;
  const record = records.find((candidate) => candidate.itemId === selectedId) ?? records[0];
  const item = record && scenario.items.find((candidate) => candidate.id === record.itemId);

  return (
    <>
      <h1>{t("nav.mps")}</h1>
      <PlanStatusBanner />
      {records.length > 0 && record && item && (
        <>
          <ItemTabs
            label={t("plan.item")}
            items={records.map((r) => ({
              id: r.itemId,
              label: `${r.itemId} ${scenario.items.find((i) => i.id === r.itemId)?.name ?? ""}`,
              flagged: r.risk.some((risk) => risk !== "OK"),
            }))}
            selectedId={record.itemId}
            onSelect={setSelectedId}
          />
          <ItemPlanView
            record={record}
            itemName={item.name}
            unit={item.unit}
            demandTimeFenceEnd={game.currentPeriod + scenario.settings.demandTimeFencePeriods - 1}
          />
        </>
      )}
    </>
  );
}
