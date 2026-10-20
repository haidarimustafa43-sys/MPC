import type { InventoryBalance } from "../../domain/inventory";

/** Physical on hand of an item over all warehouses (allocations ignored). */
export const onHand = (inventory: readonly InventoryBalance[], itemId: string): number =>
  inventory.filter((b) => b.itemId === itemId).reduce((sum, b) => sum + b.quantityOnHand, 0);

export const addStock = (
  inventory: readonly InventoryBalance[],
  itemId: string,
  warehouseId: string,
  quantity: number,
): InventoryBalance[] => {
  const existing = inventory.find((b) => b.itemId === itemId && b.warehouseId === warehouseId);
  if (!existing) {
    return [...inventory, { itemId, warehouseId, quantityOnHand: quantity, allocatedQuantity: 0 }];
  }
  return inventory.map((b) => (b === existing ? { ...b, quantityOnHand: b.quantityOnHand + quantity } : b));
};

/** Removes up to `quantity` from the item's balances; returns how much was actually removed. */
export const removeStock = (
  inventory: readonly InventoryBalance[],
  itemId: string,
  quantity: number,
): { inventory: InventoryBalance[]; removed: number } => {
  let remaining = Math.max(0, quantity);
  const next = inventory.map((balance) => {
    if (balance.itemId !== itemId || remaining <= 0) return balance;
    const take = Math.min(balance.quantityOnHand, remaining);
    remaining -= take;
    return { ...balance, quantityOnHand: balance.quantityOnHand - take };
  });
  return { inventory: next, removed: Math.max(0, quantity) - remaining };
};
