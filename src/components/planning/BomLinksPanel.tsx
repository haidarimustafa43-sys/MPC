import type { ItemPlanRecord } from "../../domain/planningVersion";
import { useGameStore } from "../../state/gameStore";
import { useT } from "../../state/selectors";
import { whereUsedPaths } from "../../utils/bom";
import { formatQuantity } from "../../utils/format";

/**
 * How the item of a record is connected in the bill of materials: where it is
 * used (up to the end items), which parent orders need it in the selected
 * period (pegging), and what it is made of. Helps to see who suffers from a
 * shortage and where to look next.
 */
export function BomLinksPanel({ record, period }: { record: ItemPlanRecord; period: number }) {
  const t = useT();
  const scenario = useGameStore((state) => state.scenario);
  if (!scenario) return null;
  const paths = whereUsedPaths(scenario.bom, record.itemId).filter((path) => path.length > 0);
  const components = scenario.bom.filter((line) => line.parentItemId === record.itemId);
  const index = record.periods.indexOf(period);
  const shortage = index >= 0 && record.risk[index] === "SHORTAGE";
  const pegging = record.traces[`gross:${period}`]?.inputs ?? {};
  const name = (id: string) => scenario.items.find((item) => item.id === id)?.name ?? id;
  if (paths.length === 0 && components.length === 0) return null;

  return (
    <section className={`card ${shortage ? "bom-links shortage" : "bom-links"}`} aria-label={t("bom.title")}>
      <h3>{t("bom.title")}</h3>
      {shortage && <p className="small">{t("bom.shortageHint", { item: record.itemId, period })}</p>}
      {paths.length > 0 && (
        <>
          <h4>{t("bom.usedIn")}</h4>
          <ul className="small">
            {paths.map((path) => (
              <li key={path.join(">")}>
                <strong>{record.itemId}</strong> → {path.join(" → ")}
              </li>
            ))}
          </ul>
        </>
      )}
      {Object.keys(pegging).length > 0 && (
        <>
          <h4>{t("bom.neededBy", { period })}</h4>
          <ul className="small">
            {Object.entries(pegging).map(([order, quantity]) => (
              <li key={order}>
                {order}: {formatQuantity(Number(quantity))} {t("bom.units")}
              </li>
            ))}
          </ul>
        </>
      )}
      {components.length > 0 && (
        <>
          <h4>{t("bom.madeOf")}</h4>
          <ul className="small">
            {components.map((line) => (
              <li key={line.componentItemId}>
                {line.quantityPer} × <strong>{line.componentItemId}</strong> – {name(line.componentItemId)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
