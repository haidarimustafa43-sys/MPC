import { useNavigate } from "react-router-dom";
import type { Language } from "../domain/common";
import { useGameStore } from "../state/gameStore";
import { useT } from "../state/selectors";

export function SettingsPage() {
  const t = useT();
  const navigate = useNavigate();
  const language = useGameStore((state) => state.language);
  const setLanguage = useGameStore((state) => state.setLanguage);
  const game = useGameStore((state) => state.game);
  const newGame = useGameStore((state) => state.newGame);
  const closeGame = useGameStore((state) => state.closeGame);
  if (!game) return null;

  return (
    <>
      <h1>{t("nav.settings")}</h1>
      <section className="card">
        <label className="field" style={{ maxWidth: 240 }}>
          {t("settings.language")}
          <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
            <option value="en">English</option>
            <option value="sv">Svenska</option>
          </select>
        </label>
      </section>
      <section className="card">
        <h2>{t("settings.game")}</h2>
        <dl>
          <dt className="muted">{t("start.teamName")}</dt>
          <dd>{game.teamName}</dd>
          <dt className="muted">{t("start.scenario")}</dt>
          <dd>
            {game.scenarioId} v{game.scenarioVersion}
          </dd>
          <dt className="muted">{t("settings.seed")}</dt>
          <dd>{game.randomSeed}</dd>
        </dl>
        <div className="row">
          <button
            onClick={() => {
              closeGame();
              navigate("/");
            }}
          >
            {t("nav.games")}
          </button>
          <button
            className="danger"
            onClick={async () => {
              await newGame(game.teamName, game.scenarioId);
              navigate("/");
            }}
          >
            {t("settings.resetScenario")}
          </button>
        </div>
        <p className="muted small" style={{ marginTop: "0.5rem" }}>
          {t("settings.resetHelp")}
        </p>
      </section>
    </>
  );
}
