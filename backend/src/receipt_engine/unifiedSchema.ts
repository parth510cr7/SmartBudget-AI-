/**
 * Unified receipt output schema for the hybrid pipeline.
 * All paths (local OCR+parser, local+repair, cloud) normalize to this shape.
 */

export type ExtractionSource = "local" | "local_ai_repair" | "cloud";
export type ReviewStatus = "verified" | "needs_review";
export type OverallConfidence = "high" | "medium" | "low";

export interface UnifiedReceiptItem {
  rawText: string;
  normalizedName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  category: string;
  confidence: number;
}

export interface UnifiedReceiptResult {
  merchantName: string;
  purchaseDate: string;
  subtotal: number;
  tax: number;
  total: number;
  items: UnifiedReceiptItem[];
  overallConfidence: OverallConfidence;
  extractionSource: ExtractionSource;
  reviewStatus: ReviewStatus;
}

export function toUnifiedItem(
  name: string,
  rawName: string,
  quantity: number,
  unit: string,
  unitPrice: number,
  totalPrice: number,
  category: string,
  confidence: number = 1
): UnifiedReceiptItem {
  return {
    rawText: rawName,
    normalizedName: name,
    quantity,
    unit: unit || "item",
    unitPrice,
    totalPrice,
    category: category || "Other",
    confidence,
  };
}

export function toUnifiedResult(
  merchantName: string,
  purchaseDate: string,
  subtotal: number,
  tax: number,
  total: number,
  items: UnifiedReceiptItem[],
  overallConfidence: OverallConfidence,
  extractionSource: ExtractionSource,
  reviewStatus: ReviewStatus
): UnifiedReceiptResult {
  return {
    merchantName,
    purchaseDate,
    subtotal,
    tax,
    total,
    items,
    overallConfidence,
    extractionSource,
    reviewStatus,
  };
}
