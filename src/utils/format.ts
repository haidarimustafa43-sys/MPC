export const formatNumber = (value: number, decimals = 0): string =>
  value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const formatQuantity = (value: number): string =>
  Number.isInteger(value) ? formatNumber(value) : formatNumber(value, 1);

export const formatMoney = (value: number, currency: string): string =>
  `${formatNumber(Math.round(value))} ${currency}`;

export const formatPercent = (value: number): string =>
  value >= 99 ? ">999 %" : `${formatNumber(value * 100, 0)} %`;

export const formatHours = (value: number): string => `${formatNumber(value, 1)} h`;

export const generateId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
