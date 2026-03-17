/**
 * Category config: full list + "essential" subset used for price tracking only.
 * Reports and spending breakdown always use ALL categories.
 *
 * Essential = everyday / household-type items where price comparison is meaningful.
 * Excluded from price tracking: Clothing, Fashion, Vacation/Travel, Electronics,
 * Banking, Subscriptions, Entertainment, Education, Gifts & Donations (too variable or one-off).
 */

export const ALL_CATEGORY_NAMES = [
  "Groceries",
  "Household",
  "Personal Care",
  "Health",
  "Baby",
  "Pet",
  "Electronics",
  "Dining",
  "Gas",
  "Transportation",
  "Banking",
  "Clothing",
  "Subscriptions",
  "Entertainment",
  "Education",
  "Gifts & Donations",
  "Other",
] as const;

/** Default essential categories for price tracking (merged: app defaults + household essentials list). Override via ESSENTIAL_CATEGORIES env (comma-separated). */
const DEFAULT_ESSENTIAL_FOR_PRICE_TRACKING = [
  "Groceries",
  "Household",
  "Personal Care",
  "Health",
  "Baby",
  "Pet",
  "Gas",
  "Transportation",
  "Dining",
];

function parseEnvList(envKey: string): string[] {
  const raw = process.env[envKey];
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

let cachedEssential: Set<string> | null = null;

/**
 * Categories we use for price intelligence only (community sync, basket comparison).
 * No duplicates; normalized (trimmed). Empty = treat all as essential (backward compat).
 */
export function getEssentialCategoriesForPriceTracking(): Set<string> {
  if (cachedEssential !== null) return cachedEssential;
  const fromEnv = parseEnvList("ESSENTIAL_CATEGORIES");
  const list =
    fromEnv.length > 0 ? fromEnv : DEFAULT_ESSENTIAL_FOR_PRICE_TRACKING;
  cachedEssential = new Set(list.map((c) => c.trim()).filter(Boolean));
  return cachedEssential;
}

/** Returns true if we should create/use PriceRecords for this category. */
export function isEssentialCategoryForPriceTracking(category: string | null | undefined): boolean {
  if (category == null || String(category).trim() === "") return false;
  const set = getEssentialCategoriesForPriceTracking();
  if (set.size === 0) return true; // no filter = all
  return set.has(String(category).trim());
}
