import type { ConstraintViolation } from "../../domain/constraint";
import type { KpiResult } from "../../domain/kpi";
import type { ProductionOrder } from "../../domain/order";
import type { CrpResult, MpsResult, MrpResult, RccpResult } from "../../domain/planningVersion";
import { calculateCrp, loadableOrders } from "../capacity/calculateCrp";
import { calculateRccp } from "../capacity/calculateRccp";
import {
  evaluateDataConstraints,
  evaluatePlanConstraints,
  sortViolations,
} from "../constraints/evaluateConstraints";
import { calculateMps } from "../mps/calculateMps";
import { allPlannedOrders, calculateMrp } from "../mrp/calculateMrp";
import type { PlanningInput } from "../planningInput";
import { calculateProjectedKpis, emptyKpis } from "../scoring/calculateKpis";

export interface PlanningRunResult {
  mps: MpsResult;
  mrp: MrpResult;
  crp: CrpResult;
  rccp: RccpResult;
  violations: ConstraintViolation[];
  kpis: KpiResult;
}

/**
 * One planning run: MPS → MRP → CRP/RCCP → constraints → projected KPIs.
 * Pure: same input gives the same result. A blocking data error (e.g. a cyclic
 * BOM) stops the run before MRP, because netting would be meaningless.
 */
export const runPlanning = (input: PlanningInput, replanCount = 0): PlanningRunResult => {
  const dataViolations = evaluateDataConstraints(input);
  if (dataViolations.some((violation) => violation.severity === "BLOCKING")) {
    return {
      mps: { records: [] },
      mrp: { records: [], lowLevelCodes: {} },
      crp: { buckets: [] },
      rccp: { billOfResources: {}, buckets: [] },
      violations: sortViolations(dataViolations),
      kpis: { ...emptyKpis(), replanCount },
    };
  }

  const mps = calculateMps(input);
  const mrp = calculateMrp(input, mps);
  const releasedProduction = input.releasedOrders.filter(
    (order): order is ProductionOrder => order.kind === "PRODUCTION",
  );
  const crp = calculateCrp(input, loadableOrders(allPlannedOrders(mrp), releasedProduction));
  const rccp = calculateRccp(input, mps);
  const violations = sortViolations([
    ...dataViolations,
    ...evaluatePlanConstraints(input, mps, mrp, crp),
  ]);
  const kpis = calculateProjectedKpis(input, mps, mrp, crp, replanCount);
  return { mps, mrp, crp, rccp, violations, kpis };
};
