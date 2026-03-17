/**
 * Receipt Intelligence Engine – Parser.
 * Detect Store, Subtotal, Tax, and Total using regex (\d+\.\d{2}).
 * Total extraction: prioritize TOTAL/AMOUNT DUE lines; avoid receipt IDs, phone numbers, timestamps.
 */

import { NormalizedReceipt } from "./receiptNormalizer";
import { extractReceiptDateFromText } from "./dateParser";

export interface ParsedReceiptMeta {
  storeName: string;
  /** First line that looks like a street address (optional). */
  storeAddress?: string | null;
  subtotal: number;
  tax: number;
  total: number;
  date?: string;
  /** How we chose the total – for "needs review" when low. */
  totalConfidence?: "high" | "low" | "fallback";
}

/** Heuristic: line has street number + words, not a price line. Used for Basket store address. */
function extractStoreAddress(normalized: NormalizedReceipt, storeName: string): string | null {
  const storeLower = storeName.toLowerCase().trim();
  for (const line of normalized.lines) {
    const t = line.trim();
    if (t.length < 10 || t.length > 120) continue;
    if (t.toLowerCase() === storeLower) continue;
    if (/\d+\.\d{2}\s*$/.test(t)) continue;
    if (/^(total|subtotal|tax|amount|balance|card|cash)\b/i.test(t)) continue;
    if (/\d{1,5}\s+[\w\s]+(?:st|street|ave|avenu|road|rd|blvd|drive|dr|lane|ln|way|court|ct)/i.test(t) || (/^\d+\s/.test(t) && (t.match(/\s/g)?.length ?? 0) >= 2)) {
      return t;
    }
  }
  return null;
}

/** Patterns for total (e.g. "total 12.99", "amount due 12.99"). Order: most specific first. */
const TOTAL_PATTERNS = [
  /\b(?:grand\s+total|amount\s+due|balance\s+due|amount\s+paid|total\s+due)\s*\$?\s*(\d+\.\d{2})/i,
  /\b(?:total|amount\s+due|balance|cash\s+total|card\s+total)\s*[:\s]*\$?\s*(\d+\.\d{2})/i,
  /\b(?:total|balance)\s*\$?\s*(\d+\.\d{2})/i,
];

/** Patterns for subtotal. */
const SUBTOTAL_PATTERNS = [
  /\b(?:subtotal|sub\s+total)\s*\$?\s*(\d+\.\d{2})/i,
  /\b(?:subtotal|sub\s+total)\s*:\s*\$?\s*(\d+\.\d{2})/i,
];

/** Patterns for tax. */
const TAX_PATTERNS = [
  /\b(?:tax|gst|vat|hst)\s*\$?\s*(\d+\.\d{2})/i,
  /\b(?:tax|gst|vat)\s*:\s*\$?\s*(\d+\.\d{2})/i,
];

/** Common store name keywords (first line or keyword match). */
const STORE_KEYWORDS = [
  "target", "walmart", "costco", "costco wholesale", "kroger", "safeway", "whole foods",
  "trader joe's", "trader joes", "cvs", "walgreens", "rite aid", "home depot", "lowes",
  "best buy", "amazon", "aldi", "publix", "heb", "meijer", "dollar general", "dollar tree",
  "starbucks", "mcdonald", "shell", "chevron", "exxon", "bp", "quiktrip", "circle k", "speedway",
  "7-eleven", "seven eleven", "hy-vee", "wegmans", "food lion", "giant",
  "stop & shop", "stop and shop", "albertsons", "sprouts", "lidl", "cub foods",
  "the ups store", "ups store", "canadian tire", "shoppers drug mart", "loblaws", "nofrills",
  "metro", "sobeys", "freshco", "longo's", "farm boy", "rexall", "hindu temple", "temple",
  "royal bank", "rbc", "td bank", "scotiabank", "bmo", "cibc",
];

// Date parsing moved to dateParser.ts (multi-format + validation).

/** Normalize OCR amount: 899 → 8.99, 350 → 3.50 when raw looks like cents (no decimal). */
function normalizeAmount(value: number, rawMatch: string): number {
  if (value >= 0.01 && value < 100) return value;
  const noDec = rawMatch.replace(/\.\d{2}$/, "").replace(/,/g, "");
  if (/^\d{2,5}$/.test(noDec)) {
    const asCents = parseInt(noDec, 10);
    if (asCents >= 100 && asCents <= 99999) return Math.round(asCents) / 100;
  }
  return value;
}

/** If amount looks like cents (integer 100–9999), convert to dollars to avoid total inflation. */
function normalizeAmountForTotal(amount: number): number {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return 0;
  if (amount >= 0.01 && amount < 100) return amount;
  if (amount >= 100 && amount <= 9999 && amount === Math.floor(amount)) return Math.round(amount) / 100;
  return amount;
}

function extractFirstMatch(text: string, patterns: RegExp[]): number | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const raw = m[1].replace(/,/g, "");
      const n = parseFloat(raw);
      if (!Number.isNaN(n) && n >= 0) return normalizeAmount(n, raw);
    }
  }
  return undefined;
}

/** Exclude amounts that are likely receipt IDs, SKUs, or implausible totals. */
function filterPlausibleTotals(amounts: number[]): number[] {
  return amounts.filter((a) => {
    if (typeof a !== "number" || !Number.isFinite(a)) return false;
    if (a <= 0 || a > 5000) return false;
    if (a >= 1000 && a === Math.floor(a)) return false;
    if (a >= 100 && a === Math.floor(a)) return false;
    return true;
  });
}

/** Extract total candidates from lines containing total keywords; return with confidence. */
function extractTotalCandidates(
  raw: string,
  lines: string[],
  amounts: number[]
): { value: number; source: string; confidence: number }[] {
  const candidates: { value: number; source: string; confidence: number }[] = [];
  const totalLineRegex = /\b(?:grand\s+total|amount\s+due|balance\s+due|amount\s+paid|total\s+due|total|balance|cash\s+total|card\s+total)\s*[:\s]*\$?\s*(\d+(?:,\d{3})*\.\d{2}|\d+\.\d{2})/gi;
  let match: RegExpExecArray | null;
  while ((match = totalLineRegex.exec(raw)) !== null) {
    const rawVal = (match[1] ?? "").replace(/,/g, "");
    const val = parseFloat(rawVal);
    if (!Number.isNaN(val) && val > 0) {
      const normalized = rawVal.includes(".") ? val : normalizeAmountForTotal(val);
      if (normalized > 0 && normalized < 1e5) {
        const confidence = /grand\s+total|amount\s+due|balance\s+due/i.test(match[0]) ? 0.95 : 0.85;
        candidates.push({ value: normalized, source: "total_line", confidence });
      }
    }
  }
  const filtered = filterPlausibleTotals(amounts).map(normalizeAmountForTotal);
  if (filtered.length > 0) {
    const max = Math.max(...filtered);
    if (max > 0 && max < 1e5 && !candidates.some((c) => Math.abs(c.value - max) < 0.01))
      candidates.push({ value: max, source: "max_filtered", confidence: 0.5 });
  }
  return candidates;
}

function extractStoreName(normalized: NormalizedReceipt): string {
  const fullLower = normalized.raw.toLowerCase();
  for (const keyword of STORE_KEYWORDS) {
    if (fullLower.includes(keyword)) {
      const name = keyword.replace(/\s*&\s*/g, " & ").replace(/\s+/g, " ").trim();
      return name.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }
  for (const line of normalized.lines) {
    const t = line.trim();
    if (t.length >= 2 && t.length <= 60 && !/^\d+\.?\d*$/.test(t) && !/^(total|subtotal|tax|date|receipt|thank|self|checkout)/i.test(t) && /\b[a-z]{2,}\b/i.test(t)) {
      return t.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").trim().slice(0, 50);
    }
  }
  return "Unknown Store";
}

function extractDate(raw: string): string | undefined {
  return extractReceiptDateFromText(raw);
}

/**
 * Parse receipt metadata from normalized receipt (store, subtotal, tax, total, date).
 * Total: prefer TOTAL/AMOUNT DUE lines; else best candidate from filtered amounts.
 */
export function parseReceiptMeta(normalized: NormalizedReceipt): ParsedReceiptMeta {
  const raw = normalized.raw;
  const totalCandidates = extractTotalCandidates(raw, normalized.lines, normalized.amounts);
  const totalFromPattern = extractFirstMatch(raw, TOTAL_PATTERNS);
  let total: number;
  let totalConfidence: "high" | "low" | "fallback";
  if (totalFromPattern != null && totalFromPattern > 0) {
    total = totalFromPattern;
    totalConfidence = "high";
  } else if (totalCandidates.length > 0) {
    const best = totalCandidates.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
    total = Number.isFinite(best.value) && best.value > 0 ? best.value : 0;
    totalConfidence = best.confidence >= 0.8 ? "high" : "low";
  } else {
    const filtered = filterPlausibleTotals(normalized.amounts).map(normalizeAmountForTotal).filter((n) => Number.isFinite(n) && n > 0);
    total = filtered.length > 0 ? Math.max(...filtered) : 0;
    totalConfidence = "fallback";
  }
  if (!Number.isFinite(total) || total < 0) total = 0;

  const subtotal = extractFirstMatch(raw, SUBTOTAL_PATTERNS)
    ?? (normalized.amounts.length > 1 ? normalized.amounts[normalized.amounts.length - 2] : total);
  const tax = extractFirstMatch(raw, TAX_PATTERNS)
    ?? (total > 0 && subtotal > 0 ? Math.round((total - subtotal) * 100) / 100 : 0);
  const storeName = extractStoreName(normalized);
  const storeAddress = extractStoreAddress(normalized, storeName);
  const date = extractDate(raw);

  const safe = (n: number) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);
  return {
    storeName,
    storeAddress: storeAddress ?? undefined,
    subtotal: safe(subtotal >= 0 ? subtotal : total),
    tax: safe(tax),
    total: safe(total),
    date,
    totalConfidence,
  };
}

export { extractTotalCandidates, filterPlausibleTotals };
