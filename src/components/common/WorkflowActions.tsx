import { CheckCircle2, Play, PlayCircle, RotateCcw, Rocket } from "lucide-react";
import { canPerform } from "../../engine/game/stateMachine";
import { latestVersion } from "../../engine/game/gameActions";
import { useGameStore } from "../../state/gameStore";
import { useT } from "../../state/selectors";

/**
 * The primary workflow buttons. Only actions relevant to the current phase are
 * shown; a disabled button always says why.
 */
export function WorkflowActions({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const startWeek = useGameStore((state) => state.startWeek);
  const runPlanning = useGameStore((state) => state.runPlanning);
  const commitPlan = useGameStore((state) => state.commitPlan);
  const resetWorkingPlan = useGameStore((state) => state.resetWorkingPlan);
  if (!game) return null;

  if (game.gameStatus === "PERIOD_START") {
    return (
      <button className="primary" onClick={startWeek}>
        <Rocket size={16} aria-hidden="true" /> {t("action.startWeek")}
      </button>
    );
  }

  const version = latestVersion(game);
  const run = canPerform(game, "RUN_PLANNING");
  const commit = canPerform(game, "COMMIT_PLAN", version?.id);
  const committed = !!version && game.committedPlanVersionId === version.id && game.pendingDecisionIds.length === 0;

  return (
    <div className="row">
      <button
        className={commit.allowed && !committed ? "" : "primary"}
        onClick={runPlanning}
        disabled={!run.allowed}
        title={run.reasonKey ? t(run.reasonKey) : undefined}
      >
        <Play size={16} aria-hidden="true" /> {t("action.runPlanning")}
      </button>
      {!compact && game.pendingDecisionIds.length > 0 && version && (
        <button onClick={resetWorkingPlan}>
          <RotateCcw size={16} aria-hidden="true" /> {t("action.resetWorkingPlan")}
        </button>
      )}
      {!committed && (
        <button
          className={commit.allowed ? "primary" : ""}
          onClick={() => version && commitPlan(version.id)}
          disabled={!commit.allowed}
          title={commit.reasonKey ? t(commit.reasonKey) : undefined}
        >
          <CheckCircle2 size={16} aria-hidden="true" /> {t("action.commitPlan")}
        </button>
      )}
      {committed && (
        <button disabled title={t("guard.notImplemented")}>
          <PlayCircle size={16} aria-hidden="true" /> {t("action.simulateWeek")}
        </button>
      )}
      {!compact && !commit.allowed && commit.reasonKey && game.gameStatus !== "PLAN_COMMITTED" && (
        <span className="muted small">{t(commit.reasonKey)}</span>
      )}
      {!compact && committed && <span className="muted small">{t("guard.notImplemented")}</span>}
    </div>
  );
}
