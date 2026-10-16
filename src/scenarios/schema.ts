import { z } from "zod";
import type { EventDefinition } from "../domain/event";
import type { Scenario } from "../domain/scenario";

const period = z.number().int().min(0);
const nonNegative = z.number().min(0);
const localized = z.object({ en: z.string().min(1), sv: z.string().optional() });

export const lotSizingPolicySchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("LFL") }),
  z.object({ method: z.literal("FOQ"), quantity: z.number().positive() }),
  z.object({ method: z.literal("POQ") }),
  z.object({ method: z.literal("EOQ") }),
  z.object({ method: z.literal("FPR"), periods: z.number().int().positive() }),
  z.object({
    method: z.literal("MULTIPLE"),
    multiple: z.number().positive(),
    minimum: nonNegative.optional(),
  }),
]);

const itemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["END_ITEM", "MANUFACTURED", "PURCHASED"]),
  unit: z.string().min(1),
  leadTimePeriods: z.number().int().min(0),
  safetyLeadTimePeriods: z.number().int().min(0),
  safetyStock: nonNegative,
  initialInventory: nonNegative,
  lotSizingPolicy: lotSizingPolicySchema,
  holdingCostPerUnitPeriod: nonNegative,
  orderCost: nonNegative,
  standardCost: nonNegative,
  sellingPrice: nonNegative.optional(),
  defaultWarehouseId: z.string().min(1),
  active: z.boolean(),
});

const bomLineSchema = z.object({
  parentItemId: z.string().min(1),
  componentItemId: z.string().min(1),
  quantityPer: z.number().positive(),
  scrapRate: z.number().min(0).lt(1).optional(),
  effectiveFromPeriod: period.optional(),
  effectiveToPeriod: period.optional(),
});

const routingSchema = z.object({
  itemId: z.string().min(1),
  sequence: z.number().int(),
  workCenterId: z.string().min(1),
  setupHours: nonNegative,
  runHoursPerUnit: nonNegative,
  yieldRate: z.number().gt(0).max(1).optional(),
});

const workCenterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  normalCapacityHoursByPeriod: z.array(nonNegative).min(1),
  overtimeCapacityLimitHours: nonNegative.optional(),
  overtimeCostPerHour: nonNegative.optional(),
});

const supplierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  suppliedItemIds: z.array(z.string()),
  normalLeadTimePeriods: z.number().int().min(0),
  unitCostModifiers: z.record(z.number().positive()).optional(),
  reliability: z.number().min(0).max(1).optional(),
  active: z.boolean(),
});

const customerOrderSchema = z.object({
  id: z.string().min(1),
  customerName: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().positive(),
  duePeriod: period,
  sellingPricePerUnit: nonNegative,
  status: z.enum(["PROPOSED", "ACCEPTED", "REJECTED", "PARTIALLY_FULFILLED", "FULFILLED", "LATE"]),
  acceptedAtPeriod: period.optional(),
  deliveredQuantity: nonNegative.optional(),
});

const orderBase = {
  id: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().positive(),
  releasePeriod: period,
  duePeriod: period,
};

export const productionOrderSchema = z.object({
  ...orderBase,
  kind: z.literal("PRODUCTION"),
  status: z.enum(["PLANNED", "RELEASED", "IN_PROGRESS", "COMPLETED"]),
});

export const purchaseOrderSchema = z.object({
  ...orderBase,
  kind: z.literal("PURCHASE"),
  status: z.enum(["PLANNED", "RELEASED", "RECEIVED"]),
  supplierId: z.string().min(1),
  expedited: z.boolean().optional(),
});

const severity = z.enum(["INFO", "WARNING", "CRITICAL", "BLOCKING"]);

const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PERIOD_START"), period }),
  z.object({ type: z.literal("PERIOD_END"), period }),
  z.object({ type: z.literal("PERIOD_RANGE"), fromPeriod: period, toPeriod: period }),
  z.object({ type: z.literal("INVENTORY_BELOW"), itemId: z.string(), threshold: z.number() }),
  z.object({ type: z.literal("UTILIZATION_ABOVE"), workCenterId: z.string(), threshold: z.number() }),
  z.object({ type: z.literal("SERVICE_LEVEL_BELOW"), threshold: z.number() }),
  z.object({ type: z.literal("DECISION_TAKEN"), category: z.string(), entityId: z.string().optional() }),
  z.object({ type: z.literal("RANDOM"), fromPeriod: period, toPeriod: period }),
]);

const effectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("DELAY_PURCHASE_ORDER"), purchaseOrderId: z.string(), periods: z.number().int() }),
  z.object({
    type: z.literal("CHANGE_CAPACITY"),
    workCenterId: z.string(),
    factor: z.number().min(0),
    fromPeriod: period,
    toPeriod: period,
  }),
  z.object({
    type: z.literal("ADD_CUSTOMER_ORDER"),
    orderId: z.string(),
    customerName: z.string(),
    itemId: z.string(),
    quantity: z.number().positive(),
    duePeriod: period,
    sellingPricePerUnit: nonNegative,
  }),
  z.object({ type: z.literal("CHANGE_CUSTOMER_ORDER_QUANTITY"), orderId: z.string(), quantity: z.number().positive() }),
  z.object({ type: z.literal("SUPPLIER_UNAVAILABLE"), supplierId: z.string(), fromPeriod: period, toPeriod: period }),
  z.object({ type: z.literal("SCRAP_INVENTORY"), itemId: z.string(), quantity: z.number().positive() }),
]);

export const eventSchema: z.ZodType<EventDefinition> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(["SUPPLIER", "CUSTOMER", "CAPACITY", "QUALITY", "INTERNAL", "FINANCE", "SYSTEM"]),
  trigger: triggerSchema,
  probability: z.number().min(0).max(1),
  prerequisites: z.array(z.string()).optional(),
  message: z.object({
    sender: z.string().min(1),
    severity,
    messageType: z.enum([
      "INFORMATION",
      "WARNING",
      "CRITICAL_DISRUPTION",
      "CUSTOMER_REQUEST",
      "BUSINESS_OPPORTUNITY",
      "INTERNAL",
      "SYSTEM",
    ]),
    title: localized,
    body: localized,
  }),
  choices: z
    .array(
      z.object({
        id: z.string().min(1),
        label: localized,
        effects: z.array(effectSchema),
        defersDecision: z.boolean().optional(),
      }),
    )
    .optional(),
  effects: z.array(effectSchema),
  delayedEffects: z
    .array(z.object({ afterPeriods: z.number().int().positive(), effects: z.array(effectSchema) }))
    .optional(),
  durationPeriods: z.number().int().positive().optional(),
  visibleToStudent: z.boolean().optional(),
  acknowledgementRequired: z.boolean(),
  decisionRequired: z.boolean(),
  followUpEventIds: z.array(z.string()).optional(),
});

export const scenarioSchema: z.ZodType<Scenario> = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: localized,
  description: localized,
  settings: z.object({
    currency: z.string().min(1),
    gameLengthPeriods: z.number().int().positive(),
    planningHorizonPeriods: z.number().int().positive(),
    demandTimeFencePeriods: z.number().int().min(0),
    frozenZonePeriods: z.number().int().min(0),
    lateCostPerUnitPeriod: nonNegative,
    eventMode: z.enum(["fixed", "seeded", "random"]),
    allowPartialProduction: z.boolean(),
    expressDelivery: z
      .object({ costPerUnit: nonNegative, leadTimeReductionPeriods: z.number().int().min(0) })
      .optional(),
    externalCapacity: z.object({ costPerHour: nonNegative, maxHoursPerPeriod: nonNegative }).optional(),
  }),
  warehouses: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        type: z.enum(["RAW_MATERIAL", "WIP", "FINISHED_GOODS"]),
      }),
    )
    .min(1),
  items: z.array(itemSchema).min(1),
  bom: z.array(bomLineSchema),
  routings: z.array(routingSchema),
  workCenters: z.array(workCenterSchema),
  suppliers: z.array(supplierSchema),
  forecasts: z.array(z.object({ itemId: z.string(), period, quantity: nonNegative })),
  customerOrders: z.array(customerOrderSchema),
  productionOrders: z.array(productionOrderSchema),
  purchaseOrders: z.array(purchaseOrderSchema),
  events: z.array(eventSchema),
});
