export interface Supplier {
  id: string;
  name: string;
  suppliedItemIds: string[];
  normalLeadTimePeriods: number;
  /** Multiplier on the item's standard cost, per item id. */
  unitCostModifiers?: Record<string, number>;
  reliability?: number;
  active: boolean;
}
