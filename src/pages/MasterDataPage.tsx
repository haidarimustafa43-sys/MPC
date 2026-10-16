import { useState } from "react";
import { ItemTabs } from "../components/planning/ItemTabs";
import type { BomLine } from "../domain/bom";
import { describePolicy } from "../engine/mrp/lotSizing";
import { useGameStore } from "../state/gameStore";
import { useT } from "../state/selectors";
import { formatNumber } from "../utils/format";

type Tab = "items" | "bom" | "routings" | "workCenters" | "suppliers";

function BomTree({ itemId, bom, depth = 0 }: { itemId: string; bom: readonly BomLine[]; depth?: number }) {
  const children = bom.filter((line) => line.parentItemId === itemId);
  if (children.length === 0 || depth > 20) return null;
  return (
    <ul className={`bom-tree ${depth === 0 ? "root" : ""}`}>
      {children.map((line) => (
        <li key={`${line.parentItemId}-${line.componentItemId}`}>
          {line.quantityPer} × <strong>{line.componentItemId}</strong>
          {line.scrapRate ? <span className="muted"> (+{formatNumber(line.scrapRate * 100)} % scrap)</span> : null}
          <BomTree itemId={line.componentItemId} bom={bom} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

/** Read-only scenario master data. Planning parameters are changed on the MPS/MRP pages. */
export function MasterDataPage() {
  const t = useT();
  const scenario = useGameStore((state) => state.scenario);
  const game = useGameStore((state) => state.game);
  const [tab, setTab] = useState<Tab>("items");
  if (!scenario || !game) return null;
  const currency = scenario.settings.currency;

  return (
    <>
      <h1>{t("nav.masterData")}</h1>
      <ItemTabs
        label={t("nav.masterData")}
        items={[
          { id: "items", label: t("master.items") },
          { id: "bom", label: t("master.bom") },
          { id: "routings", label: t("master.routings") },
          { id: "workCenters", label: t("master.workCenters") },
          { id: "suppliers", label: t("master.suppliers") },
        ]}
        selectedId={tab}
        onSelect={(id) => setTab(id as Tab)}
      />
      <section className="card">
        {tab === "items" && (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t("plan.item")}</th>
                  <th scope="col" className="left">{t("master.type")}</th>
                  <th scope="col" className="left">{t("master.unit")}</th>
                  <th scope="col">{t("plan.leadTime")}</th>
                  <th scope="col">{t("plan.safetyStock")}</th>
                  <th scope="col" className="left">{t("plan.lotSizing")}</th>
                  <th scope="col">{t("master.standardCost")}</th>
                  <th scope="col">{t("master.holdingCost")}</th>
                  <th scope="col">{t("master.orderCost")}</th>
                </tr>
              </thead>
              <tbody>
                {scenario.items.map((item) => {
                  const params = game.planningParameters[item.id];
                  return (
                    <tr key={item.id}>
                      <td>
                        {item.id} – {item.name}
                      </td>
                      <td className="left">{t(`master.items.${item.type}`)}</td>
                      <td className="left">{item.unit}</td>
                      <td>{item.leadTimePeriods}</td>
                      <td>{params?.safetyStock ?? item.safetyStock}</td>
                      <td className="left">{describePolicy(params?.lotSizingPolicy ?? item.lotSizingPolicy)}</td>
                      <td>{item.standardCost} {currency}</td>
                      <td>{item.holdingCostPerUnitPeriod}</td>
                      <td>{item.orderCost}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {tab === "bom" && (
          <div className="grid cols-2">
            {scenario.items
              .filter((item) => item.type === "END_ITEM")
              .map((item) => (
                <div key={item.id}>
                  <h3>
                    {item.id} – {item.name}
                  </h3>
                  <BomTree itemId={item.id} bom={scenario.bom} />
                </div>
              ))}
          </div>
        )}
        {tab === "routings" && (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t("plan.item")}</th>
                  <th scope="col">{t("master.sequence")}</th>
                  <th scope="col" className="left">{t("capacity.workCenter")}</th>
                  <th scope="col">{t("master.setupHours")}</th>
                  <th scope="col">{t("master.runHours")}</th>
                </tr>
              </thead>
              <tbody>
                {scenario.routings.map((op) => (
                  <tr key={`${op.itemId}-${op.sequence}`}>
                    <td>{op.itemId}</td>
                    <td>{op.sequence}</td>
                    <td className="left">{op.workCenterId}</td>
                    <td>{op.setupHours}</td>
                    <td>{op.runHoursPerUnit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === "workCenters" && (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t("capacity.workCenter")}</th>
                  <th scope="col">{t("master.capacity")}</th>
                  <th scope="col">{t("capacity.overtime")}</th>
                </tr>
              </thead>
              <tbody>
                {scenario.workCenters.map((wc) => (
                  <tr key={wc.id}>
                    <td>
                      {wc.id} – {wc.name}
                    </td>
                    <td>{wc.normalCapacityHoursByPeriod[0]} h</td>
                    <td>
                      ≤ {wc.overtimeCapacityLimitHours ?? 0} h · {wc.overtimeCostPerHour ?? 0} {currency}/h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === "suppliers" && (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t("plan.supplier")}</th>
                  <th scope="col" className="left">{t("master.items")}</th>
                  <th scope="col">{t("master.leadTime")}</th>
                  <th scope="col">{t("master.reliability")}</th>
                  <th scope="col" className="left">{t("master.standardCost")}</th>
                </tr>
              </thead>
              <tbody>
                {game.suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>{supplier.name}</td>
                    <td className="left">{supplier.suppliedItemIds.join(", ")}</td>
                    <td>{supplier.normalLeadTimePeriods}</td>
                    <td>{supplier.reliability !== undefined ? `${supplier.reliability * 100} %` : "–"}</td>
                    <td className="left">
                      {Object.entries(supplier.unitCostModifiers ?? {})
                        .map(([itemId, factor]) => `${itemId} ×${factor}`)
                        .join(", ")}
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
