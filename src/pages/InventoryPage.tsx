import { PlanStatusBanner } from "../components/common/PlanStatusBanner";
import { SeverityBadge } from "../components/common/SeverityBadge";
import { useGameStore } from "../state/gameStore";
import { selectLatestVersion, useT } from "../state/selectors";
import { formatMoney, formatQuantity } from "../utils/format";

export function InventoryPage() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const scenario = useGameStore((state) => state.scenario);
  const version = selectLatestVersion(game);
  if (!game || !scenario) return null;
  const warehouseName = (id: string) => scenario.warehouses.find((w) => w.id === id)?.name ?? id;
  const records = version?.mrpResult.records ?? [];
  const periods = records[0]?.periods ?? [];

  return (
    <>
      <h1>{t("nav.inventory")}</h1>
      <section className="card">
        <h2>
          {t("row.onHand")} – {t("dashboard.week")} {game.currentPeriod}
        </h2>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">{t("plan.item")}</th>
                <th scope="col" className="left">{t("inventory.warehouse")}</th>
                <th scope="col">{t("row.onHand")}</th>
                <th scope="col">{t("inventory.allocated")}</th>
                <th scope="col">{t("inventory.available")}</th>
                <th scope="col">{t("plan.safetyStock")}</th>
                <th scope="col">{t("master.standardCost")}</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {game.inventory.map((balance) => {
                const item = scenario.items.find((i) => i.id === balance.itemId);
                const available = balance.quantityOnHand - balance.allocatedQuantity;
                const safety = game.planningParameters[balance.itemId]?.safetyStock ?? 0;
                return (
                  <tr key={`${balance.itemId}-${balance.warehouseId}`}>
                    <td>
                      {balance.itemId} {item?.name}
                    </td>
                    <td className="left">{warehouseName(balance.warehouseId)}</td>
                    <td>{formatQuantity(balance.quantityOnHand)}</td>
                    <td>{formatQuantity(balance.allocatedQuantity)}</td>
                    <td className={available < safety ? "risk-below" : ""}>{formatQuantity(available)}</td>
                    <td>{formatQuantity(safety)}</td>
                    <td>{formatMoney(item?.standardCost ?? 0, scenario.settings.currency)}</td>
                    <td>{formatMoney(balance.quantityOnHand * (item?.standardCost ?? 0), scenario.settings.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <PlanStatusBanner />
      {records.length > 0 && (
        <section className="card">
          <h2>{t("inventory.projection")}</h2>
          <div className="table-scroll">
            <table className="timephased">
              <thead>
                <tr>
                  <th scope="col" className="row-label">{t("plan.item")}</th>
                  <th scope="col">{t("row.onHand")}</th>
                  {periods.map((p) => <th scope="col" key={p}>{p}</th>)}
                  <th scope="col" className="left">{t("inventory.shortageRisk")}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const worst = record.risk.includes("SHORTAGE")
                    ? "CRITICAL"
                    : record.risk.includes("BELOW_SAFETY_STOCK")
                      ? "WARNING"
                      : null;
                  return (
                    <tr key={record.itemId}>
                      <th scope="row" className="row-label">
                        {record.itemId} ({t("plan.safetyStock")} {record.safetyStock})
                      </th>
                      <td>{formatQuantity(record.startingOnHand)}</td>
                      {record.projectedAvailable.map((value, i) => (
                        <td
                          key={record.periods[i]}
                          className={record.risk[i] === "SHORTAGE" ? "risk-shortage" : record.risk[i] === "BELOW_SAFETY_STOCK" ? "risk-below" : ""}
                          title={t(`risk.${record.risk[i]}`)}
                        >
                          {formatQuantity(value)}
                        </td>
                      ))}
                      <td className="left">{worst ? <SeverityBadge severity={worst} /> : <span className="badge ok">OK</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
