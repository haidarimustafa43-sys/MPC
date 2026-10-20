import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GameState } from "../domain/gameState";
import type { Scenario } from "../domain/scenario";
import { parseGameFile } from "../importExport/validateSaveFile";
import { summarizeGame, type GameSummary } from "../engine/scoring/gameSummary";
import { isKnownScenario, loadScenario } from "../scenarios";
import { useT } from "../state/selectors";
import { readFileText } from "../utils/download";
import { formatMoney, formatNumber, formatPercent } from "../utils/format";

interface LoadedGame {
  key: string;
  fileName: string;
  game: GameState;
  summary: GameSummary;
  currency: string;
}

interface FailedFile {
  fileName: string;
  errors: string[];
}

const scenarioFor = (game: GameState, embedded?: Scenario): Scenario | undefined => {
  if (embedded) return embedded;
  try {
    return loadScenario(game.scenarioId);
  } catch {
    return undefined;
  }
};

/**
 * Local review of exported games for teachers. Files are read in the browser
 * only; nothing is uploaded or stored. KPIs are shown side by side without any
 * ranking or grade.
 */
export function InstructorReviewPage({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [games, setGames] = useState<LoadedGame[]>([]);
  const [failed, setFailed] = useState<FailedFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const loaded: LoadedGame[] = [];
    const errors: FailedFile[] = [];
    for (const file of [...files]) {
      const result = parseGameFile(await readFileText(file), (id) => isKnownScenario(id));
      if (!result.ok) {
        errors.push({ fileName: file.name, errors: result.errors });
        continue;
      }
      const scenario = scenarioFor(result.value.gameState, result.value.scenario);
      loaded.push({
        key: `${file.name}-${result.value.gameState.gameId}-${result.value.exportedAt}`,
        fileName: file.name,
        game: result.value.gameState,
        summary: summarizeGame(result.value.gameState, scenario?.settings.scoring),
        currency: scenario?.settings.currency ?? "",
      });
    }
    setGames((current) => [...current, ...loaded.filter((g) => !current.some((c) => c.key === g.key))]);
    setFailed(errors);
  };

  const detail = games.find((g) => g.key === selected) ?? games[0];
  const chartData = games.map((g) => ({
    team: g.summary.teamName,
    serviceLevel: Math.round(g.summary.totals.serviceLevel * 100),
    netContribution: Math.round(g.summary.totals.netContribution),
    holdingCost: Math.round(g.summary.totals.holdingCost),
  }));

  return (
    <div className="start-page" style={{ maxWidth: 1200 }}>
      <header className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>{t("instructor.title")}</h1>
          <p className="muted">{t("instructor.intro")}</p>
        </div>
        <button onClick={onBack}>{t("instructor.back")}</button>
      </header>

      <section className="card">
        <label className="field">
          {t("instructor.chooseFiles")}
          <input type="file" accept=".mpcgame,application/json" multiple onChange={(e) => void addFiles(e.target.files)} />
        </label>
        <p className="muted small">{t("instructor.privacy")}</p>
        {failed.map((file) => (
          <div key={file.fileName} className="banner critical" role="alert" style={{ marginTop: "0.5rem" }}>
            <strong>{file.fileName}:</strong> {file.errors.join(" ")}
          </div>
        ))}
      </section>

      {games.length > 0 && (
        <>
          <section className="card">
            <h2>{t("instructor.overview")}</h2>
            <p className="muted small">{t("instructor.noRanking")}</p>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">{t("start.teamName")}</th>
                    <th scope="col" className="left">{t("start.scenario")}</th>
                    <th scope="col">{t("instructor.finalWeek")}</th>
                    <th scope="col" className="left">{t("instructor.completed")}</th>
                    <th scope="col">{t("kpi.serviceLevel")}</th>
                    <th scope="col">{t("kpi.netContribution")}</th>
                    <th scope="col">{t("kpi.holdingCost")}</th>
                    <th scope="col">{t("kpi.overtimeCost")}</th>
                    <th scope="col">{t("kpi.lateCustomerOrders")}</th>
                    <th scope="col">{t("kpi.replanCount")}</th>
                    <th scope="col">{t("instructor.decisions")}</th>
                    <th scope="col">{t("reports.score")}</th>
                    <th scope="col" className="left">
                      <span className="sr-only">{t("orders.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {games.map(({ key, summary, currency }) => (
                    <tr key={key}>
                      <td>
                        <button className="link" onClick={() => setSelected(key)}>
                          {summary.teamName}
                        </button>
                      </td>
                      <td className="left">
                        {summary.scenarioId} v{summary.scenarioVersion}
                      </td>
                      <td>{summary.finalPeriod}</td>
                      <td className="left">
                        {summary.completed ? <span className="badge ok">{t("instructor.yes")}</span> : <span className="badge info">{t("instructor.no")}</span>}
                      </td>
                      <td>{formatPercent(summary.totals.serviceLevel)}</td>
                      <td>{formatMoney(summary.totals.netContribution, currency)}</td>
                      <td>{formatMoney(summary.totals.holdingCost, currency)}</td>
                      <td>{formatMoney(summary.totals.overtimeCost, currency)}</td>
                      <td>{summary.totals.lateCustomerOrders}</td>
                      <td>{summary.replanCount}</td>
                      <td>{summary.decisionCount}</td>
                      <td>
                        {formatNumber(summary.score.total, 1)} / {summary.score.maxTotal}
                      </td>
                      <td className="left">
                        <button className="danger" onClick={() => setGames((current) => current.filter((g) => g.key !== key))}>
                          {t("action.delete")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>{t("instructor.compareChart")}</h2>
            <div className="grid cols-2">
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e3e7ee" />
                    <XAxis dataKey="team" />
                    <YAxis domain={[0, 100]} unit=" %" width={50} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="serviceLevel" name={t("kpi.serviceLevel")} fill="#18794e" isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e3e7ee" />
                    <XAxis dataKey="team" />
                    <YAxis width={70} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="netContribution" name={t("kpi.netContribution")} fill="#4f81bd" isAnimationActive={false} />
                    <Bar dataKey="holdingCost" name={t("kpi.holdingCost")} fill="#f2a93b" isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {detail && (
            <section className="card">
              <h2>
                {detail.summary.teamName} <span className="muted small">({detail.fileName})</span>
              </h2>
              <div className="grid cols-2">
                <div>
                  <h3>{t("instructor.majorDecisions")}</h3>
                  {detail.summary.majorDecisions.length === 0 ? (
                    <p className="muted">{t("decisions.none")}</p>
                  ) : (
                    <ul className="violation-list">
                      {detail.summary.majorDecisions.map((decision) => (
                        <li key={decision.id}>
                          <span className="badge mode">
                            {t("review.week")} {decision.period}
                          </span>
                          <div>
                            <div>
                              <strong>{decision.category}</strong> · {decision.entityId ?? ""}{" "}
                              {decision.newValue !== undefined ? `→ ${JSON.stringify(decision.newValue)}` : ""}
                            </div>
                            {decision.reason && <div className="related">“{decision.reason}”</div>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3>{t("instructor.events")}</h3>
                  <ul>
                    {detail.summary.events.map((event) => (
                      <li key={`${event.eventId}-${event.period}`}>
                        {t("review.week")} {event.period}: {event.eventId}
                        {event.choiceId ? ` → ${event.choiceId}` : ""}
                      </li>
                    ))}
                  </ul>
                  <h3>{t("instructor.versionsPerWeek")}</h3>
                  <p className="small">
                    {Object.entries(detail.summary.versionsPerPeriod)
                      .map(([period, count]) => `${t("review.week")} ${period}: ${count}`)
                      .join(" · ")}
                  </p>
                  <h3>{t("instructor.decisionsByCategory")}</h3>
                  <p className="small">
                    {Object.entries(detail.summary.decisionsByCategory)
                      .map(([category, count]) => `${category}: ${count}`)
                      .join(" · ")}
                  </p>
                  <h3>{t("instructor.weeks")}</h3>
                  <ul>
                    {detail.game.completedPeriods.map((result) => (
                      <li key={result.period}>
                        {t("review.week")} {result.period}: {formatPercent(result.kpis.serviceLevel)},{" "}
                        {formatMoney(result.kpis.netContribution, detail.currency)},{" "}
                        {t("instructor.failures", { count: result.failures.length })}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
