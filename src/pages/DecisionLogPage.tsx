import { useGameStore } from "../state/gameStore";
import { useT } from "../state/selectors";
import { describeDecision } from "../utils/describeDecision";

/** Every decision of the game, newest first, with the student's reasons. */
export function DecisionLogPage() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const language = useGameStore((state) => state.language);
  if (!game) return null;
  const decisions = [...game.decisions].reverse();
  return (
    <>
      <h1>{t("decisions.title")}</h1>
      <section className="card">
        {decisions.length === 0 ? (
          <p className="muted">{t("decisions.none")}</p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t("decisions.id")}</th>
                  <th scope="col">{t("review.week")}</th>
                  <th scope="col">{t("decisions.iteration")}</th>
                  <th scope="col" className="left">
                    {t("decisions.category")}
                  </th>
                  <th scope="col" className="left">
                    {t("decisions.entity")}
                  </th>
                  <th scope="col" className="left">
                    {t("decisions.change")}
                  </th>
                  <th scope="col" className="left">
                    {t("decisions.reason")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((decision) => {
                  const text = describeDecision(decision, t, scenario, language);
                  return (
                    <tr key={decision.id}>
                      <td>{decision.id}</td>
                      <td>{decision.period}</td>
                      <td>{decision.iteration}</td>
                      <td className="left">{text.category}</td>
                      <td className="left">{text.object}</td>
                      <td className="left" style={{ whiteSpace: "normal" }}>
                        {text.change}
                      </td>
                      <td className="left" style={{ whiteSpace: "normal" }}>
                        {decision.reason ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
