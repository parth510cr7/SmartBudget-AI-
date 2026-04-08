/**
 * Receipt Intelligence Engine – Item Extractor.
 * Filter lines for valid purchase items (exclude tax/total/subtotal/store header lines).
 */

import { NormalizedReceipt } from "./receiptNormalizer";
import { ParsedReceiptMeta } from "./receiptParser";

export interface ExtractedItem {
  /** Display name (cleaned). */
  name: string;
  /** Raw line as on receipt. */
  rawName: string;
  quantity: number;
  /** e.g. "lb", "oz", "g", "kg", "L", "ml", "item" */
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

/** Lines that indicate totals/tax and should be excluded from items. */
const SKIP_PATTERNS = [
  /^(?:total|subtotal|sub\s+total|tax|gst|vat|amount\s+due|balance|grand\s+total|change|cash|card|visa|mastercard|debit|credit)/i,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  /^\d+\.\d{2}$/,  // lone amount
  /^(?:thank you|receipt|store|welcome)/i,
];

/** Line looks like a price line: ends with amount \d+\.\d{2} */
const PRICE_LINE_REGEX = /(.+?)\s+\$?\s*(\d+\.\d{2})\s*$/;

/** Weight/volume before price: e.g. "1.5 LB", "500G", "2L", "12 OZ" */
const WEIGHT_VOLUME_REGEX = /(\d+(?:\.\d+)?)\s*(LB|OZ|G|KG|L|ML)\s*$/i;

/**
 * Check if line should be skipped (tax/total/header).
 */
function shouldSkipLine(line: string): boolean {
  const t = line.trim().toLowerCase();
  if (t.length < 2) return true;
  for (const re of SKIP_PATTERNS) {
    if (re.test(t)) return true;
  }
  return false;
}

/**
 * Normalize unit string to one of: g, kg, lb, oz, ml, L, item.
 */
function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().trim();
  if (["g", "kg", "lb", "oz", "ml", "l", "item"].includes(u)) return u === "l" ? "L" : u;
  if (u === "lbs" || u === "pound" || u === "pounds") return "lb";
  if (u === "ounce" || u === "ounces") return "oz";
  if (u === "liter" || u === "litre" || u === "liters") return "L";
  if (u === "gram" || u === "grams") return "g";
  if (u === "kilogram" || u === "kilograms") return "kg";
  if (u === "milliliter" || u === "millilitre" || u === "milliliters") return "ml";
  return "item";
}

/**
 * Try to parse a line as "description amount" (totalPrice at end). Optionally extract quantity and unit from description.
 */
function parsePriceLine(line: string): { name: string; totalPrice: number; quantity: number; unit: string } | null {
  const m = line.match(PRICE_LINE_REGEX);
  if (!m) return null;
  let namePart = m[1].trim();
  const amount = parseFloat(m[2].replace(/,/g, ""));
  if (namePart.length < 1 || Number.isNaN(amount) || amount < 0) return null;

  let quantity = 1;
  let unit = "item";
  const wv = namePart.match(WEIGHT_VOLUME_REGEX);
  if (wv) {
    quantity = parseFloat(wv[1]);
    unit = normalizeUnit(wv[2]);
    namePart = namePart.replace(WEIGHT_VOLUME_REGEX, "").replace(/\s+/g, " ").trim();
  }

  const name = namePart.length > 0 ? namePart : line.trim();
  if (name.length === 0) return null;
  // Guard against OCR/POS codes being treated as items (e.g. "2915302", "2 0").
  // If there are no letters after cleanup, it’s almost always unusable for matching.
  if (!/[a-z]/i.test(name)) return null;
  return { name, totalPrice: amount, quantity, unit };
}

/**
 * Extract purchase item lines from normalized receipt, excluding meta lines and totals.
 * IMPORTANT: We only persist items with non-zero prices. Price-less lines create noisy $0 history
 * and break basket estimates, so we exclude them from extracted items (they can still appear in debug output).
 */
export function extractItems(
  normalized: NormalizedReceipt,
  meta: ParsedReceiptMeta
): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  const totalAmounts = new Set([meta.total, meta.subtotal, meta.tax].filter((n) => n > 0));

  for (const line of normalized.lines) {
    if (shouldSkipLine(line)) continue;
    const parsed = parsePriceLine(line);
    if (parsed) {
      if (totalAmounts.has(parsed.totalPrice)) continue;
      if (parsed.totalPrice <= 0 || parsed.totalPrice > 1e6) continue;
      const rawName = line.trim();
      const name = parsed.name.length > 0 ? parsed.name : rawName;
      const q = parsed.quantity > 0 ? parsed.quantity : 1;
      const unitPrice = q > 0 ? parsed.totalPrice / q : parsed.totalPrice;
      items.push({
        name,
        rawName,
        quantity: q,
        unit: parsed.unit,
        unitPrice,
        totalPrice: parsed.totalPrice,
      });
      continue;
    }
  }

  return items;
}
