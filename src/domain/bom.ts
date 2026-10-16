export interface BomLine {
  parentItemId: string;
  componentItemId: string;
  quantityPer: number;
  /** Fraction of extra material lost in production, e.g. 0.05 = 5 %. */
  scrapRate?: number;
  effectiveFromPeriod?: number;
  effectiveToPeriod?: number;
}
