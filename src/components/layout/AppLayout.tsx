import {
  BarChart3,
  Boxes,
  ClipboardList,
  Database,
  Factory,
  GitCompare,
  History,
  Inbox,
  LayoutDashboard,
  LineChart as LineChartIcon,
  ScrollText,
  ListTree,
  Settings,
  X,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { latestVersion } from "../../engine/game/gameActions";
import { localize } from "../../i18n";
import { useGameStore } from "../../state/gameStore";
import { useT } from "../../state/selectors";
import { unreadCount } from "../../engine/game/inboxActions";
import { WorkflowActions } from "../common/WorkflowActions";
import { EventPopup } from "../inbox/EventPopup";
import { WhatIfBanner } from "../planning/WhatIfBanner";

const NAV = [
  { to: "/", key: "nav.dashboard", icon: LayoutDashboard, end: true },
  { to: "/inbox", key: "nav.inbox", icon: Inbox },
  { to: "/mps", key: "nav.mps", icon: BarChart3 },
  { to: "/mrp", key: "nav.mrp", icon: ListTree },
  { to: "/capacity", key: "nav.capacity", icon: Factory },
  { to: "/inventory", key: "nav.inventory", icon: Boxes },
  { to: "/orders", key: "nav.orders", icon: ClipboardList },
  { to: "/versions", key: "nav.versions", icon: GitCompare },
  { to: "/review", key: "nav.review", icon: History },
  { to: "/decisions", key: "nav.decisions", icon: ScrollText },
  { to: "/reports", key: "nav.reports", icon: LineChartIcon },
  { to: "/master-data", key: "nav.masterData", icon: Database },
  { to: "/settings", key: "nav.settings", icon: Settings },
] as const;

export function AppLayout() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const language = useGameStore((state) => state.language);
  const saveStatus = useGameStore((state) => state.saveStatus);
  const error = useGameStore((state) => state.error);
  const clearError = useGameStore((state) => state.clearError);
  if (!game || !scenario) return null;

  const version = latestVersion(game);
  const unread = unreadCount(game);
  const isLive =
    !!version && version.id === game.committedPlanVersionId && game.pendingDecisionIds.length === 0;

  return (
    <div className={`app-shell ${game.whatIf ? "in-whatif" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          {t("app.title")}
          <small>{game.teamName}</small>
        </div>
        <nav aria-label="Main">
          {NAV.map(({ to, key, icon: Icon, ...rest }) => (
            <NavLink key={to} to={to} end={"end" in rest ? rest.end : false}>
              <Icon size={17} aria-hidden="true" />
              {t(key)}
              {to === "/inbox" && unread > 0 && (
                <span className="nav-badge" aria-label={t("inbox.unread", { count: unread })}>
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          {localize(scenario.name, language)}
          <br />
          {t("app.disclaimer")}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="week">
            {t("dashboard.week")} {game.currentPeriod} {t("dashboard.of")} {scenario.settings.gameLengthPeriods}
          </span>
          <span className="badge info">{t(`status.${game.gameStatus}`)}</span>
          {game.whatIf ? (
            <span className="badge whatif" title={t("whatIf.help")}>
              {t("mode.whatIf")}
            </span>
          ) : (
            <span className="badge mode" title={t(isLive ? "mode.liveHelp" : "mode.workingHelp")}>
              {t(isLive ? "mode.live" : "mode.working")}
            </span>
          )}
          <span className="spacer" />
          <span className="muted small" role="status">
            {saveStatus === "saving" && t("save.saving")}
            {saveStatus === "saved" && t("save.saved")}
            {saveStatus === "error" && t("save.error")}
          </span>
          <WorkflowActions compact />
        </header>
        <main className="content">
          {error && (
            <div className="banner critical" role="alert">
              <strong>{t("error.title")}:</strong> <span style={{ flex: 1 }}>{error}</span>
              <button onClick={clearError} aria-label={t("action.close")}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )}
          <WhatIfBanner />
          <Outlet />
        </main>
        <EventPopup />
      </div>
    </div>
  );
}
