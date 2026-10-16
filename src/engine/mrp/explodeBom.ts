import type { BomLine } from "../../domain/bom";
import type { Item } from "../../domain/item";

export interface BomValidationError {
  code: "CYCLE" | "UNKNOWN_PARENT" | "UNKNOWN_COMPONENT" | "PURCHASED_PARENT" | "INVALID_QUANTITY";
  message: string;
  itemIds: string[];
}

export const componentsOf = (bom: readonly BomLine[], parentItemId: string): BomLine[] =>
  bom.filter((line) => line.parentItemId === parentItemId);

/** BOM lines can be time-limited; a line applies to orders released in its window. */
export const isEffective = (line: BomLine, period: number): boolean =>
  (line.effectiveFromPeriod === undefined || period >= line.effectiveFromPeriod) &&
  (line.effectiveToPeriod === undefined || period <= line.effectiveToPeriod);

/** Returns every cycle as a list of item ids, e.g. ["A", "C1", "A"]. */
export const findBomCycles = (bom: readonly BomLine[]): string[][] => {
  const children = new Map<string, string[]>();
  for (const line of bom) {
    children.set(line.parentItemId, [...(children.get(line.parentItemId) ?? []), line.componentItemId]);
  }
  const cycles: string[][] = [];
  const done = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const visit = (id: string): void => {
    if (onStack.has(id)) {
      cycles.push([...stack.slice(stack.indexOf(id)), id]);
      return;
    }
    if (done.has(id)) return;
    onStack.add(id);
    stack.push(id);
    for (const child of children.get(id) ?? []) visit(child);
    stack.pop();
    onStack.delete(id);
    done.add(id);
  };

  for (const parent of children.keys()) visit(parent);
  return cycles;
};

export const validateBom = (items: readonly Item[], bom: readonly BomLine[]): BomValidationError[] => {
  const byId = new Map(items.map((item) => [item.id, item]));
  const errors: BomValidationError[] = [];
  for (const line of bom) {
    const parent = byId.get(line.parentItemId);
    if (!parent) {
      errors.push({
        code: "UNKNOWN_PARENT",
        message: `BOM line refers to unknown parent item ${line.parentItemId}.`,
        itemIds: [line.parentItemId],
      });
    } else if (parent.type === "PURCHASED") {
      errors.push({
        code: "PURCHASED_PARENT",
        message: `Purchased item ${parent.id} cannot have BOM components.`,
        itemIds: [parent.id],
      });
    }
    if (!byId.has(line.componentItemId)) {
      errors.push({
        code: "UNKNOWN_COMPONENT",
        message: `BOM line ${line.parentItemId} → ${line.componentItemId} refers to an unknown component.`,
        itemIds: [line.componentItemId],
      });
    }
    if (!(line.quantityPer > 0) || (line.scrapRate !== undefined && (line.scrapRate < 0 || line.scrapRate >= 1))) {
      errors.push({
        code: "INVALID_QUANTITY",
        message: `BOM line ${line.parentItemId} → ${line.componentItemId} has an invalid quantity or scrap rate.`,
        itemIds: [line.parentItemId, line.componentItemId],
      });
    }
  }
  for (const cycle of findBomCycles(bom)) {
    errors.push({ code: "CYCLE", message: `Cyclic BOM: ${cycle.join(" → ")}.`, itemIds: cycle });
  }
  return errors;
};

/**
 * Low-level code = the deepest level at which an item occurs in any BOM.
 * MRP must process items by increasing low-level code so that all gross
 * requirements of an item are known before it is netted. Assumes an acyclic BOM;
 * the depth guard stops runaway recursion if validation was skipped.
 */
export const computeLowLevelCodes = (
  items: readonly Item[],
  bom: readonly BomLine[],
): Record<string, number> => {
  const codes: Record<string, number> = {};
  for (const item of items) codes[item.id] = 0;
  const maxDepth = items.length + 1;

  const assign = (id: string, level: number): void => {
    if (level > maxDepth) return;
    if ((codes[id] ?? 0) < level) codes[id] = level;
    for (const line of componentsOf(bom, id)) assign(line.componentItemId, level + 1);
  };

  const componentIds = new Set(bom.map((line) => line.componentItemId));
  for (const item of items) if (!componentIds.has(item.id)) assign(item.id, 0);
  return codes;
};

/** Quantity of a component needed for `parentQuantity` units, including scrap. */
export const componentQuantity = (line: BomLine, parentQuantity: number): number =>
  Math.ceil(parentQuantity * line.quantityPer * (1 + (line.scrapRate ?? 0)) - 1e-9);

export interface ParentRelease {
  orderId: string;
  parentItemId: string;
  releasePeriod: number;
  quantity: number;
}

export interface DependentDemand {
  componentItemId: string;
  period: number;
  quantity: number;
  parentItemId: string;
  sourceOrderId: string;
}

/** Explodes one level: parent planned order releases → component gross requirements. */
export const explodeReleases = (
  bom: readonly BomLine[],
  releases: readonly ParentRelease[],
): DependentDemand[] =>
  releases.flatMap((release) =>
    componentsOf(bom, release.parentItemId)
      .filter((line) => isEffective(line, release.releasePeriod))
      .map((line) => ({
        componentItemId: line.componentItemId,
        period: release.releasePeriod,
        quantity: componentQuantity(line, release.quantity),
        parentItemId: release.parentItemId,
        sourceOrderId: release.orderId,
      })),
  );

/**
 * Full multi-level explosion of a quantity of one item (no netting, no lead
 * time offset). Useful for bills of resources and for teaching.
 */
export const explodeQuantity = (
  bom: readonly BomLine[],
  itemId: string,
  quantity: number,
  depth = 0,
): Record<string, number> => {
  const totals: Record<string, number> = {};
  if (depth > 50) return totals;
  for (const line of componentsOf(bom, itemId)) {
    const qty = quantity * line.quantityPer * (1 + (line.scrapRate ?? 0));
    totals[line.componentItemId] = (totals[line.componentItemId] ?? 0) + qty;
    const deeper = explodeQuantity(bom, line.componentItemId, qty, depth + 1);
    for (const [id, value] of Object.entries(deeper)) totals[id] = (totals[id] ?? 0) + value;
  }
  return totals;
};
