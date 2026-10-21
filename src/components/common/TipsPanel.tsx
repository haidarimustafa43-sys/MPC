import { Lightbulb } from "lucide-react";
import type { TipPage } from "../../engine/tips/generateTips";
import { generateTips } from "../../engine/tips/generateTips";
import { useGameStore } from "../../state/gameStore";
import { useT } from "../../state/selectors";

/**
 * Leading questions for the current situation. The dashboard shows all of
 * them; other pages show only those about that page. Students can turn tips
 * off under Settings.
 */
export function TipsPanel({ page, limit = 6 }: { page: TipPage; limit?: number }) {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const showTips = useGameStore((state) => state.showTips);
  if (!game || !scenario || !showTips) return null;
  const tips = generateTips(game, scenario).filter((tip) => tip.pages.includes(page));
  if (tips.length === 0) return null;

  return (
    <section className="card" aria-label={t("tip.title")}>
      <div className="card-header">
        <h2>
          <Lightbulb size={18} aria-hidden="true" /> {t("tip.title")}
        </h2>
      </div>
      <p className="muted small">{t("tip.hint")}</p>
      <ul className="tip-list">
        {tips.slice(0, limit).map((tip) => (
          <li key={tip.id}>{t(tip.key, tip.params)}</li>
        ))}
      </ul>
    </section>
  );
}
