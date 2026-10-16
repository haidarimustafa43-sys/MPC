import { useState } from "react";
import type { Language } from "../domain/common";
import { localize } from "../i18n";
import { loadScenario, scenarioIds } from "../scenarios";
import { useGameStore } from "../state/gameStore";
import { useT } from "../state/selectors";

export function StartPage() {
  const t = useT();
  const language = useGameStore((state) => state.language);
  const setLanguage = useGameStore((state) => state.setLanguage);
  const saves = useGameStore((state) => state.saves);
  const error = useGameStore((state) => state.error);
  const newGame = useGameStore((state) => state.newGame);
  const openGame = useGameStore((state) => state.openGame);
  const renameSave = useGameStore((state) => state.renameSave);
  const duplicateSave = useGameStore((state) => state.duplicateSave);
  const deleteSave = useGameStore((state) => state.deleteSave);
  const ids = scenarioIds();
  const [teamName, setTeamName] = useState("");
  const [scenarioId, setScenarioId] = useState(ids[0] ?? "");
  const scenario = scenarioId ? loadScenario(scenarioId) : null;

  return (
    <div className="start-page">
      <header className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>{t("app.title")}</h1>
          <p className="muted">{t("app.subtitle")} · {t("app.disclaimer")}</p>
        </div>
        <label className="field">
          {t("settings.language")}
          <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
            <option value="en">English</option>
            <option value="sv">Svenska</option>
          </select>
        </label>
      </header>

      {error && (
        <div className="banner critical" role="alert">
          {error}
        </div>
      )}

      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault();
          void newGame(teamName, scenarioId);
        }}
      >
        <h2>{t("start.title")}</h2>
        <div className="form-row">
          <label className="field">
            {t("start.teamName")}
            <input
              required
              value={teamName}
              maxLength={60}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Team 1"
            />
          </label>
          <label className="field">
            {t("start.scenario")}
            <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {localize(loadScenario(id).name, language)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary">
            {t("action.newGame")}
          </button>
        </div>
        {scenario && <p className="muted" style={{ marginTop: "0.75rem" }}>{localize(scenario.description, language)}</p>}
        <p className="muted small">{t("start.storageNote")}</p>
      </form>

      <section className="card">
        <h2>{t("start.saved")}</h2>
        {saves.length === 0 ? (
          <p className="muted">{t("start.noSaves")}</p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t("start.teamName")}</th>
                  <th scope="col" className="left">{t("start.scenario")}</th>
                  <th scope="col">{t("dashboard.week")}</th>
                  <th scope="col">{t("start.updated")}</th>
                  <th scope="col" className="left">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {saves.map((save) => (
                  <tr key={save.id}>
                    <td>{save.name}</td>
                    <td className="left">{save.scenarioId}</td>
                    <td>{save.currentPeriod}</td>
                    <td>{new Date(save.updatedAt).toLocaleString()}</td>
                    <td className="left">
                      <div className="row">
                        <button className="primary" onClick={() => void openGame(save.id)}>
                          {t("action.open")}
                        </button>
                        <button
                          onClick={() => {
                            const name = window.prompt(t("start.renamePrompt"), save.name);
                            if (name && name.trim()) void renameSave(save.id, name.trim());
                          }}
                        >
                          {t("action.rename")}
                        </button>
                        <button onClick={() => void duplicateSave(save.id)}>{t("action.duplicate")}</button>
                        <button
                          className="danger"
                          onClick={() => {
                            if (window.confirm(t("start.confirmDelete"))) void deleteSave(save.id);
                          }}
                        >
                          {t("action.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
