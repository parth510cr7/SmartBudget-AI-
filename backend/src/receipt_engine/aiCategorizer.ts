/**
 * Receipt Intelligence Engine – AI Categorizer.
 * Call Gemini only when offline steps fail. Return ONLY the category name
 * and SAVE the new mapping to user_rules.json for future offline use.
 */

import * as fs from "fs";
import * as path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

export const ALLOWED_CATEGORIES = [
  "Groceries",
  "Household",
  "Personal Care",
  "Health",
  "Electronics",
  "Dining",
  "Gas",
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "Other";

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(`${CATEGORY_PROMPT}\n\nItem: ${itemName.trim()}`);
  const text = result.response.text()?.trim() ?? "";
  const category = ALLOWED_CATEGORIES.find(
    (c) => c.toLowerCase() === text.toLowerCase()
  ) ?? "Other";

  const key = itemName.trim().toLowerCase();
  if (key) saveUserRule(key, category);

  return category;
}
