/** Projected (plan) or realised KPIs. All money values are in the scenario currency. */
export interface KpiResult {
  revenue: number;
  materialCost: number;
  orderCost: number;
  holdingCost: number;
  overtimeCost: number;
  expediteCost: number;
  externalCapacityCost: number;
  lateOrderCost: number;
  netContribution: number;
  serviceLevel: number;
  lateCustomerOrders: number;
  ordersAtRisk: number;
  averageInventoryValue: number;
  capacityOverloads: number;
  overloadHours: number;
  shortageUnits: number;
  replanCount: number;
}
