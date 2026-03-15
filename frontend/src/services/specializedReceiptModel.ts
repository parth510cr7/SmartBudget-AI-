/**
 * Option 4: Specialized receipt model (tiny model or rules for receipt text → structured fields).
 * Current implementation uses the enhanced local parser; later plug in ONNX/Donut when available.
 */

import { parseReceiptText } from "../utils/localParser";
import type { ReceiptParseResult } from "./receiptParseTypes";

/** Result from specialized path only (before wrapping in ReceiptParseResult). */
export interface SpecializedParseResult {
  storeName: string;
  total: number;
  date?: string;
  items?: { name: string; quantity?: number; totalPrice?: number }[];
}

let specializedModelReady = false;

/**
 * Call once when a real model (e.g. ONNX) is loaded. Until then we use rule-based parser.
 */
export function setSpecializedModelReady(ready: boolean): void {
  specializedModelReady = ready;
}

export function isSpecializedModelReady(): boolean {
  return specializedModelReady;
}

/**
 * Parse receipt text using the specialized path (rules now; optional ONNX later).
 * Returns null if text is empty or parsing fails.
 */
export async function parseWithSpecializedModel(rawText: string): Promise<ReceiptParseResult | null> {
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) return null;
  try {
    const parsed = parseReceiptText(rawText.trim());
    if (!parsed.locallyVerified || parsed.storeName == null || parsed.total == null) return null;
    const result: ReceiptParseResult = {
      storeName: parsed.storeName,
      total: parsed.total,
      date: parsed.date,
      items: [],
      source: "specialized",
      confident: true,
    };
    return result;
  } catch {
    return null;
  }
}
