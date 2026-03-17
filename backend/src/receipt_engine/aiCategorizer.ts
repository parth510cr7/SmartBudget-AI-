/**
 * Receipt Intelligence Engine – AI Categorizer.
 * Call Gemini only when offline steps fail. Return ONLY the category name
 * and SAVE the new mapping to user_rules.json for future offline use.
 */

import * as fs from "fs";
import * as path from "path";
// Cloud AI removed (on-device-first). Kept for compatibility.

export const ALLOWED_CATEGORIES = [
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

export type CategoryName = (typeof ALLOWED_CATEGORIES)[number];

const CATEGORY_PROMPT = `You are a receipt categorizer. Given an item name from a receipt, respond with exactly ONE category from this list (no other text):
${ALLOWED_CATEGORIES.join(", ")}

Reply with only the category name, nothing else.`;

function getUserRulesPath(): string {
  return path.join(__dirname, "..", "..", "data", "user_rules.json");
}

function loadUserRules(): Record<string, string> {
  try {
    const p = getUserRulesPath();
    const data = fs.readFileSync(p, "utf-8");
    const obj = JSON.parse(data);
    return typeof obj === "object" && obj !== null ? obj : {};
  } catch {
    return {};
  }
}

/**
 * Save a new mapping (itemKey -> category) to user_rules.json.
 */
export function saveUserRule(itemKey: string, category: string): void {
  const rules = loadUserRules();
  const key = itemKey.trim().toLowerCase();
  if (!key) return;
  const allowed = new Set(ALLOWED_CATEGORIES);
  const value = allowed.has(category as CategoryName) ? category : "Other";
  rules[key] = value;
  try {
    const p = getUserRulesPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(rules, null, 2), "utf-8");
  } catch (e) {
    console.warn("Failed to save user_rules.json", e);
  }
}

/**
 * Call Gemini to categorize one item. Returns only the category name.
 * Saves the result to user_rules.json for future offline use.
 */
export async function categorizeWithAI(itemName: string): Promise<CategoryName> {
  void itemName;
  // No external calls; fallback category only.
  return "Other";
}
