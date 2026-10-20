import { useState } from "react";
import { latestVersion } from "../../engine/game/gameActions";
import { useGameStore } from "../../state/gameStore";
import { useT } from "../../state/selectors";
import { VersionComparison } from "./VersionComparison";

/**
 * Shown on every page while a what-if branch is open: what is different from
 * the live plan, and the explicit choice to apply or discard the branch.
 */
export function WhatIfBanner() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const liveGame = useGameStore((state) => state.liveGame);
  const scenario = useGameStore((state) => state.scenario);
  const applyWhatIf = useGameStore((state) => state.applyWhatIf);
  const discardWhatIf = useGameStore((state) => state.discardWhatIf);
  const [reason, setReason] = useState("");
  const [showComparison, setShowComparison] = useState(true);
  if (!game?.whatIf || !liveGame || !scenario) return null;

  const base = latestVersion(liveGame);
  const current = latestVersion(game);
  const branchChanges = game.decisions.length - liveGame.decisions.length;
  const branchVersions = game.planningVersions.length - liveGame.planningVersions.length;
  const stale = game.pendingDecisionIds.length > 0;

  return (
    <section className="card whatif" aria-label={t("mode.whatIf")}>
      <div className="card-header">
        <h2>
          <span className="badge whatif">{t("mode.whatIf")}</span> {t("whatIf.title")}
        </h2>
        <span className="muted small">
          {t("whatIf.summary", { decisions: branchChanges, versions: branchVersions })}
        </span>
      </div>
      <p className="small">{t("whatIf.help")}</p>
      {stale && <p className="small">⚠ {t("whatIf.rerun")}</p>}
      {base && current && current.id !== base.id && branchVersions > 0 && (
        <>
          <button className="link" onClick={() => setShowComparison(!showComparison)}>
            {t(showComparison ? "whatIf.hideComparison" : "whatIf.showComparison", { live: base.id, branch: current.id })}
          </button>
          {showComparison && (
            <div style={{ marginTop: "0.5rem" }}>
              <VersionComparison before={base} after={current} currency={scenario.settings.currency} compact />
            </div>
          )}
        </>
      )}
      <div className="form-row" style={{ marginTop: "0.75rem" }}>
        <label className="field" style={{ flex: 1, minWidth: 220 }}>
          {t("plan.reason")}
          <input type="text" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button className="primary" onClick={() => applyWhatIf(reason.trim() || undefined)}>
          {t("whatIf.apply")}
        </button>
        <button className="danger" onClick={() => discardWhatIf(reason.trim() || undefined)}>
          {t("whatIf.discard")}
        </button>
      </div>
    </section>
  );
}

/** Starts a what-if branch from the live game. */
export function StartWhatIfButton({ label }: { label?: string }) {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const enterWhatIf = useGameStore((state) => state.enterWhatIf);
  if (!game || game.whatIf) return null;
  const allowed = ["ANALYSIS", "PLANNING_DIRTY", "PLAN_CALCULATED", "PLAN_COMMITTED"].includes(game.gameStatus);
  return (
    <button onClick={enterWhatIf} disabled={!allowed} title={allowed ? t("whatIf.startHelp") : t("whatIf.startNotNow")}>
      {label ?? t("whatIf.start")}
    </button>
  );
}
