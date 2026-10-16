/**
 * Discrete available-to-promise.
 *
 * ATP is calculated in every period with supply (the first period always
 * counts, because it holds the on-hand balance):
 *   ATP(t) = on hand (first period only) + supply(t) − customer orders from t
 *            until the period before the next supply.
 * A negative ATP is covered by the previous supply period (backward netting),
 * so ATP never promises the same unit twice. Only customer orders consume ATP;
 * forecast does not.
 */
export const calculateAtp = (
  onHand: number,
  supply: readonly number[],
  customerOrders: readonly number[],
): (number | null)[] => {
  const n = supply.length;
  const atp: (number | null)[] = new Array(n).fill(null);
  const supplyIndexes = supply
    .map((value, index) => ({ value, index }))
    .filter(({ value, index }) => index === 0 || value > 0)
    .map(({ index }) => index);

  supplyIndexes.forEach((start, k) => {
    const end = k + 1 < supplyIndexes.length ? supplyIndexes[k + 1] : n;
    let committed = 0;
    for (let i = start; i < end; i++) committed += customerOrders[i];
    atp[start] = (start === 0 ? onHand : 0) + supply[start] - committed;
  });

  for (let k = supplyIndexes.length - 1; k > 0; k--) {
    const index = supplyIndexes[k];
    const value = atp[index] ?? 0;
    if (value < 0) {
      const previousIndex = supplyIndexes[k - 1];
      atp[previousIndex] = (atp[previousIndex] ?? 0) + value;
      atp[index] = 0;
    }
  }
  return atp;
};
