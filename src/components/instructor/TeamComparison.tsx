import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GameSummary } from "../../engine/scoring/gameSummary";
import type { TeamAnalysis } from "../../engine/scoring/teamAnalysis";
import { COST_KEYS, FAILURE_KINDS } from "../../engine/scoring/teamAnalysis";
import { useT } from "../../state/selectors";
import { formatMoney, formatNumber, formatPercent } from "../../utils/format";

export interface ComparedTeam {
  key: string;
  summary: GameSummary;
  analysis: TeamAnalysis;
  currency: string;
}

// Distinguishable series colours; teams beyond eight reuse them.
const TEAM_COLORS = ["#1f4e79", "#c0504d", "#18794e", "#e08a1e", "#7b5ea7", "#2a9d8f", "#8c564b", "#d6619c"];
const COST_COLORS = ["#4f81bd", "#9bbb59", "#f2a93b", "#c0504d", "#8064a2", "#4bacc6", "#7f7f7f"];

const teamColor = (index: number) => TEAM_COLORS[index % TEAM_COLORS.length];

/**
 * Side-by-side analyses of the loaded teams: score parts and costs, the course
 * of the game week by week, what went wrong, and how the team worked. Figures
 * only; no ranking.
 */
export function TeamComparison({ teams }: { teams: ComparedTeam[] }) {
  const t = useT();
  const currency = teams[0]?.currency ?? "";
  const periods = [...new Set(teams.flatMap((team) => team.analysis.weekly.map((w) => w.period)))].sort((a, b) => a - b);
  const weekly = periods.map((period) => {
    const row: Record<string, number> = { period };
    teams.forEach((team, index) => {
      const point = team.analysis.weekly.find((w) => w.period === period);
      if (point) {
        row[`service${index}`] = Math.round(point.serviceLevel * 100);
        row[`net${index}`] = Math.round(point.cumulativeNet);
      }
    });
    return row;
  });
  const costData = teams.map((team) => ({
    team: team.summary.teamName,
    ...Object.fromEntries(COST_KEYS.map((key) => [key, Math.round(team.analysis.costs[key])])),
  }));

  return (
    <>
      <section className="card">
        <h2>{t("analysis.scoreAndCosts")}</h2>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">{t("start.teamName")}</th>
                {teams[0]?.summary.score.components.map((component) => (
                  <th scope="col" key={component.key}>
                    {t(`reports.component.${component.key}`)} (/{component.maxPoints})
                  </th>
                ))}
                <th scope="col">{t("reports.score")}</th>
                {COST_KEYS.map((key) => (
                  <th scope="col" key={key}>
                    {t(`kpi.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.key}>
                  <td>{team.summary.teamName}</td>
                  {team.summary.score.components.map((component) => (
                    <td key={component.key}>{formatNumber(component.points, 1)}</td>
                  ))}
                  <td>
                    <strong>{formatNumber(team.summary.score.total, 1)}</strong>
                  </td>
                  {COST_KEYS.map((key) => (
                    <td key={key}>{formatMoney(team.analysis.costs[key], team.currency)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ width: "100%", height: 260, marginTop: "1rem" }}>
          <ResponsiveContainer>
            <BarChart data={costData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e7ee" />
              <XAxis dataKey="team" />
              <YAxis width={70} />
              <Tooltip formatter={(value) => formatMoney(Number(value), currency)} />
              <Legend />
              {COST_KEYS.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={t(`kpi.${key}`)}
                  stackId="costs"
                  fill={COST_COLORS[index]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {periods.length > 0 && (
        <section className="card">
          <h2>{t("analysis.weekByWeek")}</h2>
          <div className="grid cols-2">
            <div>
              <h3>{t("analysis.serviceByWeek")}</h3>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={weekly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e3e7ee" />
                    <XAxis dataKey="period" />
                    <YAxis domain={[0, 100]} unit=" %" width={50} />
                    <Tooltip />
                    <Legend />
                    {teams.map((team, index) => (
                      <Line
                        key={team.key}
                        dataKey={`service${index}`}
                        name={team.summary.teamName}
                        stroke={teamColor(index)}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <h3>{t("analysis.cumulativeNet")}</h3>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={weekly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e3e7ee" />
                    <XAxis dataKey="period" />
                    <YAxis width={70} />
                    <Tooltip formatter={(value) => formatMoney(Number(value), currency)} />
                    <Legend />
                    {teams.map((team, index) => (
                      <Line
                        key={team.key}
                        dataKey={`net${index}`}
                        name={team.summary.teamName}
                        stroke={teamColor(index)}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <h2>{t("analysis.failures")}</h2>
        <p className="muted small">{t("analysis.failuresHelp")}</p>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">{t("start.teamName")}</th>
                {FAILURE_KINDS.map((kind) => (
                  <th scope="col" key={kind}>
                    {t(`review.failure.${kind}`)}
                  </th>
                ))}
                <th scope="col">{t("analysis.known")}</th>
                <th scope="col">{t("analysis.unplanned")}</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.key}>
                  <td>{team.summary.teamName}</td>
                  {FAILURE_KINDS.map((kind) => (
                    <td key={kind}>{team.analysis.failures.byKind[kind]}</td>
                  ))}
                  <td className={team.analysis.failures.known > 0 ? "risk-below" : ""}>{team.analysis.failures.known}</td>
                  <td>{team.analysis.failures.unplanned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>{t("analysis.workingMethod")}</h2>
        <p className="muted small">{t("analysis.workingMethodHelp")}</p>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">{t("start.teamName")}</th>
                <th scope="col">{t("instructor.decisions")}</th>
                <th scope="col">{t("analysis.reasonShare")}</th>
                <th scope="col">{t("analysis.planningRuns")}</th>
                <th scope="col">{t("analysis.runsPerWeek")}</th>
                <th scope="col">{t("analysis.whatIfs")}</th>
                <th scope="col">{t("analysis.orderMoves")}</th>
                <th scope="col">{t("analysis.supplierChanges")}</th>
                <th scope="col">{t("analysis.parameterChanges")}</th>
                <th scope="col">{t("analysis.capacityDecisions")}</th>
                <th scope="col">{t("analysis.releases")}</th>
              </tr>
            </thead>
            <tbody>
              {teams.map(({ key, summary, analysis: { process } }) => (
                <tr key={key}>
                  <td>{summary.teamName}</td>
                  <td>{process.decisions}</td>
                  <td>{formatPercent(process.reasonShare)}</td>
                  <td>{process.planningRuns}</td>
                  <td>{formatNumber(process.runsPerWeek, 1)}</td>
                  <td>{process.whatIfCount}</td>
                  <td>{process.orderMoves}</td>
                  <td>{process.supplierChanges}</td>
                  <td>{process.parameterChanges}</td>
                  <td>{process.capacityDecisions}</td>
                  <td>{process.releases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
