export interface DecisionRecord {
  id: string;
  period: number;
  iteration: number;
  timestamp: string;
  category: string;
  entityType: string;
  entityId?: string;
  field?: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
}
