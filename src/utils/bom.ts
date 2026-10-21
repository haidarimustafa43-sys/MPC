import type { BomLine } from "../domain/bom";

/** Paths from an item up to the end items, e.g. ["C2 (×1)", "A (×1)"]. */
export const whereUsedPaths = (bom: readonly BomLine[], itemId: string, depth = 0): string[][] => {
  const parents = bom.filter((line) => line.componentItemId === itemId);
  if (parents.length === 0 || depth > 20) return [[]];
  return parents.flatMap((line) =>
    whereUsedPaths(bom, line.parentItemId, depth + 1).map((path) => [
      `${line.parentItemId} (×${line.quantityPer})`,
      ...path,
    ]),
  );
};

/** "C2 → A, C2 → B": the short form of the where-used paths, for a tooltip. */
export const whereUsedText = (bom: readonly BomLine[], itemId: string): string =>
  whereUsedPaths(bom, itemId)
    .filter((path) => path.length > 0)
    .map((path) => path.map((step) => step.replace(/ \(×.*\)$/, "")).join(" → "))
    .join(", ");
