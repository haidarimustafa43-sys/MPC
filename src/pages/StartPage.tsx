import { useState } from "react";
import type { Language } from "../domain/common";
import { localize } from "../i18n";
import { openInstructorReview } from "../app/navigation";
import { builtInScenarioIds, isBuiltInScenario, loadScenario, scenarioAsJson } from "../scenarios";
import { useGameStore } from "../state/gameStore";
import { useT } from "../state/selectors";
import { downloadText, readFileText } from "../utils/download";

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
  const notice = useGameStore((state) => state.notice);
  const customIds = useGameStore((state) => state.customScenarioIds);
  const importGameFile = useGameStore((state) => state.importGameFile);
  const importScenarioFile = useGameStore((state) => state.importScenarioFile);
  const removeCustomScenario = useGameStore((state) => state.removeCustomScenario);
  const ids = [...builtInScenarioIds(), ...customIds];
  const [teamName, setTeamName] = useState("");
  const [scenarioId, setScenarioId] = useState(ids[0] ?? "");
  const scenario = scenarioId && ids.includes(scenarioId) ? loadScenario(scenarioId) : loadScenario(ids[0]);

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
      {notice && (
        <div className="banner info" role="status">
          {notice}
        </div>
      )}

      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault();
          void newGame(teamName, scenario.id);
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
            <select value={scenario.id} onChange={(event) => setScenarioId(event.target.value)}>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {localize(loadScenario(id).name, language)}
                  {isBuiltInScenario(id) ? "" : ` (${t("io.custom")})`}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary">
            {t("action.newGame")}
          </button>
        </div>
        <p className="muted" style={{ marginTop: "0.75rem" }}>
          {localize(scenario.description, language)}
        </p>
        <p className="muted small">
          {t("io.preview", {
            weeks: scenario.settings.gameLengthPeriods,
            items: scenario.items.length,
            workCenters: scenario.workCenters.length,
            events: scenario.events.length,
          })}
        </p>
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
      <section className="card">
        <h2>{t("io.files")}</h2>
        <div className="grid cols-2">
          <div>
            <h3>{t("io.importGame")}</h3>
            <p className="muted small">{t("io.importGameHelp")}</p>
            <input
              type="file"
              accept=".mpcgame,application/json"
              aria-label={t("io.importGame")}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await importGameFile(await readFileText(file));
                event.target.value = "";
              }}
            />
          </div>
          <div>
            <h3>{t("io.importScenario")}</h3>
            <p className="muted small">{t("io.importScenarioHelp")}</p>
            <input
              type="file"
              accept=".json,application/json"
              aria-label={t("io.importScenario")}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file && (await importScenarioFile(await readFileText(file)))) setScenarioId("");
                event.target.value = "";
              }}
            />
            <div className="row" style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={() => downloadText("standard-scenario.json", scenarioAsJson("standard"), "application/json")}
              >
                {t("io.downloadTemplate")}
              </button>
            </div>
            {customIds.length > 0 && (
              <ul>
                {customIds.map((id) => (
                  <li key={id} className="row">
                    {id}
                    <button type="button" className="link" onClick={() => void removeCustomScenario(id)}>
                      {t("action.delete")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <h2>{t("instructor.title")}</h2>
        <p className="muted small">{t("instructor.intro")}</p>
        <button type="button" onClick={openInstructorReview}>
          {t("instructor.open")}
        </button>
      </section>
    </div>
  );
}
