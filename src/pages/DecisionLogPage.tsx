import { useGameStore } from "../state/gameStore";
import { useT } from "../state/selectors";

const show = (value: unknown): string => {
  if (value === undefined) return "–";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
};

/** Every decision of the game, newest first, with the student's reasons. */
export function DecisionLogPage() {
  const t = useT();
  const game = useGameStore((state) => state.game);
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
                  <th scope="col" className="left">{t("decisions.category")}</th>
                  <th scope="col" className="left">{t("decisions.entity")}</th>
                  <th scope="col" className="left">{t("decisions.change")}</th>
                  <th scope="col" className="left">{t("decisions.reason")}</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((decision) => (
                  <tr key={decision.id}>
                    <td>{decision.id}</td>
                    <td>{decision.period}</td>
                    <td>{decision.iteration}</td>
                    <td className="left">{decision.category}</td>
                    <td className="left">
                      {decision.entityId ?? "–"}
                      {decision.field && !decision.field.includes("@") ? ` · ${decision.field}` : ""}
                    </td>
                    <td className="left" style={{ whiteSpace: "normal" }}>
                      {show(decision.previousValue)} → {show(decision.newValue)}
                    </td>
                    <td className="left" style={{ whiteSpace: "normal" }}>
                      {decision.reason ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
