/**
 * Receipt Intelligence Engine – Pipeline.
 * OCR (frontend) → Normalizer → Parser → Extractor → CategoryEngine → Store.
 */

import { normalizeReceiptText } from "./receiptNormalizer";
import { parseReceiptMeta, extractTotalCandidates } from "./receiptParser";
import { extractItems, type ExtractedItem } from "./itemExtractor";
import { categorizeItem } from "./categoryEngine";
import { setLastReceiptDebug, isReceiptDebugEnabled, getLastReceiptDebug } from "./receiptDebug";

export interface EngineItem {
  name: string;
  rawName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  category: string;
}

export interface EngineResult {
  storeName: string;
  date: string;
  subtotal: number;
  tax: number;
  total: number;
  items: EngineItem[];
  totalConfidence?: "high" | "low" | "fallback";
  needsReview?: boolean;
}

/**
 * Run the full pipeline on raw receipt text. Returns structured payload for DB.
 */
export async function processReceiptText(rawText: string): Promise<EngineResult> {
  const normalized = normalizeReceiptText(rawText);
  const meta = parseReceiptMeta(normalized);
  const extracted = extractItems(normalized, meta);

  const storeName = meta.storeName || "Unknown Store";
  const date = meta.date || new Date().toISOString().slice(0, 10);
  const items: EngineItem[] = [];

  for (const item of extracted) {
    const category = await categorizeItem(item.name, storeName);
    items.push({
      name: item.name,
      rawName: item.rawName,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      category: category || "Other",
    });
  }

  const needsReview = meta.totalConfidence === "low" || meta.totalConfidence === "fallback";

  const sumOfItemPrices = items.reduce((s, i) => s + i.totalPrice, 0);
  if (isReceiptDebugEnabled()) {
    setLastReceiptDebug({
      timestamp: new Date().toISOString(),
      source: "process-text",
      rawOcrText: rawText.slice(0, 10000),
      normalizedLines: normalized.lines,
      amounts: normalized.amounts,
      totalCandidates: extractTotalCandidates(normalized.raw, normalized.lines, normalized.amounts),
      chosenTotal: meta.total,
      totalConfidence: meta.totalConfidence,
      status: needsReview ? "NEEDS_REVIEW" : "VERIFIED",
      storeName,
      subtotal: meta.subtotal,
      tax: meta.tax,
      date,
      itemCount: items.length,
      sumOfItemPrices,
      items: items.map((i) => ({ name: i.name, rawName: i.rawName, totalPrice: i.totalPrice, category: i.category })),
    });
  }

  return {
    storeName,
    date,
    subtotal: meta.subtotal,
    tax: meta.tax,
    total: meta.total,
    items,
    totalConfidence: meta.totalConfidence,
    needsReview,
  };
}

export { normalizeReceiptText } from "./receiptNormalizer";
export { parseReceiptMeta } from "./receiptParser";
export { extractItems } from "./itemExtractor";
export { categorizeItem, invalidateCategoryCaches } from "./categoryEngine";
export { saveUserRule, categorizeWithAI } from "./aiCategorizer";
export { getLastReceiptDebug, setLastReceiptDebug, isReceiptDebugEnabled } from "./receiptDebug";
