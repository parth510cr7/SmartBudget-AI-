/**
 * Native Intelligence – Phase 3: Local Categorization.
 * Keyword-based mapping: store name (or receipt context) -> category.
 * When OCR + Parser + Categorizer all succeed, we flag "Fully Processed On-Device"
 * and minimize data sent to the Cloud.
 */

export type ReceiptCategory =
  | "Groceries"
  | "Household"
  | "Personal Care"
  | "Health"
  | "Electronics"
  | "Dining"
  | "Gas"
  | "Other";

/** Store name (lowercase) or keyword -> category. Keys with hyphens or spaces are quoted to avoid syntax errors. */
const STORE_TO_CATEGORY: Record<string, ReceiptCategory> = {
  // Dining / Coffee / Restaurants
  starbucks: "Dining",
  "starbucks coffee": "Dining",
  mcdonald: "Dining",
  mcdonalds: "Dining",
  subway: "Dining",
  "taco bell": "Dining",
  chipotle: "Dining",
  "pizza hut": "Dining",
  dominos: "Dining",
  dunkin: "Dining",
  "dunkin'": "Dining",
  "dunkin donuts": "Dining",
  panera: "Dining",
  "chick-fil-a": "Dining",
  chickfila: "Dining",
  wendy: "Dining",
  "burger king": "Dining",
  "five guys": "Dining",
  "in-n-out": "Dining",
  "shake shack": "Dining",
  "panda express": "Dining",
  "chipotle mexican grill": "Dining",
  "whole foods market": "Groceries",
  "trader joe's": "Groceries",
  "trader joes": "Groceries",
  // Gas / Fuel
  chevron: "Gas",
  shell: "Gas",
  exxon: "Gas",
  mobil: "Gas",
  bp: "Gas",
  "bp gas": "Gas",
  "quick trip": "Gas",
  quiktrip: "Gas",
  "circle k": "Gas",
  speedway: "Gas",
  "marathon petroleum": "Gas",
  "sunoco": "Gas",
  "citgo": "Gas",
  "texaco": "Gas",
  "valero": "Gas",
  "costco gas": "Gas",
  "sams club gas": "Gas",
  // Groceries (already common in localParser store list)
  target: "Groceries",
  walmart: "Groceries",
  costco: "Groceries",
  kroger: "Groceries",
  safeway: "Groceries",
  "whole foods": "Groceries",
  aldi: "Groceries",
  publix: "Groceries",
  heb: "Groceries",
  meijer: "Groceries",
  "dollar general": "Groceries",
  "dollar tree": "Groceries",
  "cub foods": "Groceries",
  "hy-vee": "Groceries",
  wegmans: "Groceries",
  "food lion": "Groceries",
  giant: "Groceries",
  "stop & shop": "Groceries",
  "stop and shop": "Groceries",
  albertsons: "Groceries",
  sprouts: "Groceries",
  lidl: "Groceries",
  // Pharmacy / Health
  cvs: "Health",
  walgreens: "Health",
  "rite aid": "Health",
  // Electronics / General retail
  "best buy": "Electronics",
  "home depot": "Household",
  lowes: "Household",
  amazon: "Other",
  "7-eleven": "Other",
  "seven eleven": "Other",
};

/**
 * Get category for a store name (e.g. from local parser).
 * Returns "Other" if no mapping found.
 */
export function getCategoryForStore(storeName: string): ReceiptCategory {
  if (!storeName || typeof storeName !== "string") return "Other";
  const key = storeName.trim().toLowerCase();
  if (!key) return "Other";
  if (STORE_TO_CATEGORY[key]) return STORE_TO_CATEGORY[key];
  for (const [keyword, category] of Object.entries(STORE_TO_CATEGORY)) {
    if (key.includes(keyword) || keyword.includes(key)) return category;
  }
  return "Other";
}

/**
 * Returns true when the store has a known category mapping (not Other).
 */
export function hasLocalCategory(storeName: string): boolean {
  return getCategoryForStore(storeName) !== "Other";
}
