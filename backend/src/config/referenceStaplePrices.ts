/**
 * Rough US retail benchmarks for MVP "overpaid" comparisons when the user has
 * fewer than 2 historical purchases in the same item family.
 * Values are total $ for a typical pack size (not medical/financial advice).
 */
export const STAPLE_BENCHMARKS: Record<string, { refQty: number; refTotalUsd: number; note: string }> = {
  milk: { refQty: 4, refTotalUsd: 5.99, note: "~4 L conventional milk" },
  eggs: { refQty: 12, refTotalUsd: 4.99, note: "dozen large" },
  bread: { refQty: 1, refTotalUsd: 3.49, note: "standard loaf" },
  yogurt: { refQty: 1, refTotalUsd: 1.29, note: "~650g tub" },
  chips: { refQty: 1, refTotalUsd: 4.49, note: "medium bag" },
  soda: { refQty: 12, refTotalUsd: 7.99, note: "12-pack cans" },
  bananas: { refQty: 1, refTotalUsd: 0.65, note: "per lb approx" },
};
