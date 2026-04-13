/** Distinct bar colors; index chosen by store name so spend + visits charts match. */
const STORE_CHART_PALETTE = [
  "#007AFF",
  "#34C759",
  "#FF9500",
  "#AF52DE",
  "#5856D6",
  "#5AC8FA",
  "#FF2D55",
  "#32ADE6",
  "#FF3B30",
  "#00C7BE",
];

function hashLabel(s: string): number {
  const t = s.trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < t.length; i++) {
    h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Stable color for a store across “Top stores by spend” and “Store visits” bars. */
export function storeChartColor(storeName: string): string {
  const key = (storeName ?? "").trim();
  if (!key) return STORE_CHART_PALETTE[0];
  return STORE_CHART_PALETTE[hashLabel(key) % STORE_CHART_PALETTE.length];
}

/** Initials for store/category tiles (no third-party logos). */
export function storeInitials(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
