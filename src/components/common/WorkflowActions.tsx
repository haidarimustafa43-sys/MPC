import { CheckCircle2, ClipboardCheck, Inbox, Play, PlayCircle, RotateCcw, Rocket, SkipForward } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { latestVersion } from "../../engine/game/gameActions";
import { plannedOrdersDueForRelease } from "../../engine/game/orderActions";
import { canPerform } from "../../engine/game/stateMachine";
import { useGameStore } from "../../state/gameStore";
import { useT } from "../../state/selectors";
import { StartWhatIfButton } from "../planning/WhatIfBanner";

/**
 * The primary workflow buttons. Only actions relevant to the current phase are
 * shown; a disabled button always says why.
 */
export function WorkflowActions({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const game = useGameStore((state) => state.game);
  const startWeek = useGameStore((state) => state.startWeek);
  const runPlanning = useGameStore((state) => state.runPlanning);
  const commitPlan = useGameStore((state) => state.commitPlan);
  const resetWorkingPlan = useGameStore((state) => state.resetWorkingPlan);
  const simulateWeek = useGameStore((state) => state.simulateWeek);
  const reviewWeek = useGameStore((state) => state.reviewWeek);
  const startNextWeek = useGameStore((state) => state.startNextWeek);
  if (!game) return null;

  const reason = (key?: string) => (key ? t(key) : undefined);

  switch (game.gameStatus) {
    case "PERIOD_START":
      return (
        <button className="primary" onClick={startWeek}>
          <Rocket size={16} aria-hidden="true" /> {t("action.startWeek")}
        </button>
      );
    case "EVENTS_PENDING":
      return (
        <button className="primary" onClick={() => navigate("/inbox")}>
          <Inbox size={16} aria-hidden="true" /> {t("action.readMessages")}
        </button>
      );
    case "PERIOD_SIMULATED":
      return (
        <button
          className="primary"
          onClick={() => {
            reviewWeek();
            navigate("/review");
          }}
        >
          <ClipboardCheck size={16} aria-hidden="true" /> {t("action.reviewResult")}
        </button>
      );
    case "PERIOD_REVIEW":
      return (
        <button className="primary" onClick={startNextWeek}>
          <SkipForward size={16} aria-hidden="true" /> {t("action.startNextWeek")}
        </button>
      );
    case "GAME_COMPLETED":
      return <span className="badge ok">{t("status.GAME_COMPLETED")}</span>;
    default:
      break;
  }

  const version = latestVersion(game);
  const run = canPerform(game, "RUN_PLANNING");
  const commit = canPerform(game, "COMMIT_PLAN", version?.id);
  const simulate = canPerform(game, "SIMULATE_PERIOD");
  const committed =
    !!version && game.committedPlanVersionId === version.id && game.pendingDecisionIds.length === 0;
  const dueForRelease = version ? plannedOrdersDueForRelease(game).length : 0;

  return (
    <div className="row">
      <button
        className={committed || commit.allowed ? "" : "primary"}
        onClick={runPlanning}
        disabled={!run.allowed}
        title={reason(run.reasonKey)}
      >
        <Play size={16} aria-hidden="true" /> {t("action.runPlanning")}
      </button>
      {!compact && game.pendingDecisionIds.length > 0 && version && (
        <button onClick={resetWorkingPlan}>
          <RotateCcw size={16} aria-hidden="true" /> {t("action.resetWorkingPlan")}
        </button>
      )}
      {!compact && <StartWhatIfButton />}
      {/* Orders are released on the Orders page, where the student sees each one. */}
      {!compact && dueForRelease > 0 && (
        <button onClick={() => navigate("/orders")}>
          {t("action.goToDueOrders")} ({dueForRelease})
        </button>
      )}
      {!committed && (
        <button
          className={commit.allowed ? "primary" : ""}
          onClick={() => version && commitPlan(version.id)}
          disabled={!commit.allowed}
          title={reason(commit.reasonKey)}
        >
          <CheckCircle2 size={16} aria-hidden="true" /> {t("action.commitPlan")}
        </button>
      )}
      {committed && (
        <button
          className="primary"
          onClick={() => {
            simulateWeek();
            navigate("/");
          }}
          disabled={!simulate.allowed}
          title={reason(simulate.reasonKey)}
        >
          <PlayCircle size={16} aria-hidden="true" /> {t("action.simulateWeek")}
        </button>
      )}
      {!compact && !committed && !commit.allowed && commit.reasonKey && (
        <span className="muted small">{t(commit.reasonKey)}</span>
      )}
      {!compact && committed && !simulate.allowed && simulate.reasonKey && (
        <span className="muted small">{t(simulate.reasonKey)}</span>
      )}
    </div>
  );
}
