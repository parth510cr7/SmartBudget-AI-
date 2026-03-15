/**
 * Receipt Intelligence Engine – Category Engine.
 * Priority: (1) User Rules, (2) Store Category, (3) Item Dictionary,
 * (4) Fuse.js Fuzzy Matching, (5) AI Fallback.
 */

import * as fs from "fs";
import * as path from "path";
import Fuse from "fuse.js";
import { categorizeWithAI, type CategoryName } from "./aiCategorizer";

const DATA_DIR = path.join(__dirname, "..", "..", "data");

function loadJson<T>(filename: string): T {
  try {
    const p = path.join(DATA_DIR, filename);
    const data = fs.readFileSync(p, "utf-8");
    return JSON.parse(data) as T;
  } catch {
    return {} as T;
  }
}

let userRulesCache: Record<string, string> | null = null;
let storeCategoriesCache: Record<string, string> | null = null;
let itemDictionaryCache: Record<string, string> | null = null;

function getUserRules(): Record<string, string> {
  if (userRulesCache === null) userRulesCache = loadJson<Record<string, string>>("user_rules.json");
  return userRulesCache;
}

function getStoreCategories(): Record<string, string> {
  if (storeCategoriesCache === null) storeCategoriesCache = loadJson<Record<string, string>>("store_categories.json");
  return storeCategoriesCache;
}

function getItemDictionary(): Record<string, string> {
  if (itemDictionaryCache === null) itemDictionaryCache = loadJson<Record<string, string>>("item_dictionary.json");
  return itemDictionaryCache;
}

/** Invalidate caches (e.g. after saving a new user rule). */
export function invalidateCategoryCaches(): void {
  userRulesCache = null;
}

const ALLOWED_SET = new Set<string>([
  "Groceries", "Household", "Personal Care", "Health", "Electronics", "Dining", "Gas", "Other",
]);

function normalizeCategory(c: string): CategoryName {
  return (ALLOWED_SET.has(c) ? c : "Other") as CategoryName;
}

/**
 * (1) User Rules – exact or key match.
 */
function matchUserRules(itemName: string): CategoryName | null {
  const rules = getUserRules();
  const key = itemName.trim().toLowerCase();
  if (!key) return null;
  if (rules[key]) return normalizeCategory(rules[key]) as CategoryName;
  for (const [ruleKey, cat] of Object.entries(rules)) {
    if (key.includes(ruleKey) || ruleKey.includes(key)) return normalizeCategory(cat) as CategoryName;
  }
  return null;
}

/**
 * (2) Store Category – return store default (caller passes store name).
 */
function matchStoreCategory(storeName: string): CategoryName | null {
  const storeCat = getStoreCategories();
  const key = storeName.trim().toLowerCase();
  if (!key) return null;
  if (storeCat[key]) return normalizeCategory(storeCat[key]) as CategoryName;
  for (const [storeKey, cat] of Object.entries(storeCat)) {
    if (key.includes(storeKey) || storeKey.includes(key)) return normalizeCategory(cat) as CategoryName;
  }
  return null;
}

/**
 * (3) Item Dictionary – exact or key match.
 */
function matchItemDictionary(itemName: string): CategoryName | null {
  const dict = getItemDictionary();
  const key = itemName.trim().toLowerCase();
  if (!key) return null;
  if (dict[key]) return normalizeCategory(dict[key]) as CategoryName;
  const words = key.split(/\s+/).filter((w) => w.length > 1);
  for (const word of words) {
    if (dict[word]) return normalizeCategory(dict[word]) as CategoryName;
  }
  return null;
}

/**
 * (4) Fuse.js fuzzy match against item_dictionary keys.
 */
function matchFuzzy(itemName: string): CategoryName | null {
  const dict = getItemDictionary();
  const keys = Object.keys(dict);
  if (keys.length === 0) return null;
  const fuse = new Fuse(keys, { threshold: 0.5, includeScore: true });
  const results = fuse.search(itemName.trim().toLowerCase());
  if (results.length > 0 && results[0].score != null && results[0].score < 0.6) {
    const key = results[0].item;
    const cat = dict[key];
    if (cat) return normalizeCategory(cat) as CategoryName;
  }
  return null;
}

/**
 * Resolve category for one item. Item-level first, then store hint, then AI.
 * Unknown items default to Other – never force Groceries.
 */
export async function categorizeItem(
  itemName: string,
  storeName: string
): Promise<CategoryName> {
  const user = matchUserRules(itemName);
  if (user) return user;

  const dict = matchItemDictionary(itemName);
  if (dict) return dict;

  const fuzzy = matchFuzzy(itemName);
  if (fuzzy) return fuzzy;

  const storeCat = matchStoreCategory(storeName);
  if (storeCat) return storeCat;

  const cat = await categorizeWithAI(itemName);
  invalidateCategoryCaches();
  return cat;
}
