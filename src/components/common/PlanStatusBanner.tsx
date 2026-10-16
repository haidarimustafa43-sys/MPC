import { AlertTriangle } from "lucide-react";
import { isPlanStale, selectLatestVersion, useT } from "../../state/selectors";
import { useGameStore } from "../../state/gameStore";

/** Tells the student whether the results on screen are current. */
export function PlanStatusBanner() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const version = selectLatestVersion(game);
  if (!version) {
    return (
      <div className="banner info" role="status">
        {t("plan.noVersion")}
      </div>
    );
  }
  if (isPlanStale(game)) {
    return (
      <div className="banner warning" role="status">
        <AlertTriangle size={18} aria-hidden="true" />
        {t("plan.stale")}
      </div>
    );
  }
  return null;
}
