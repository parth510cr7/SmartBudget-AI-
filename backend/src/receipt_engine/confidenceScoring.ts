/**
 * Confidence scoring for the hybrid receipt pipeline.
 * Used to decide: use local result, run local-model repair, or trigger cloud fallback.
 */

export type OverallConfidence = "high" | "medium" | "low";

export interface ConfidenceScores {
  ocrCoverage: number;      // 0–1: text length and line count
  totalExtraction: number; // 0–1: total found and plausible
  merchantDetection: number; // 0–1: store name != "Unknown Store"
  itemExtraction: number;  // 0–1: fraction of lines with parsed price, few malformed
  categoryAssignment: number; // 0–1: fraction of items with non-Other category (optional)
  overall: OverallConfidence;
}

const MIN_OCR_CHARS = Number(process.env.RECEIPT_MIN_OCR_CHARS) || 80;
const MIN_OCR_LINES = Number(process.env.RECEIPT_MIN_OCR_LINES) || 3;
const MIN_ITEM_COVERAGE_FOR_HIGH = Number(process.env.RECEIPT_MIN_ITEM_COVERAGE) || 0.5;
const HIGH_TOTAL_CONFIDENCE = 0.8;
const LOW_TOTAL_CONFIDENCE = 0.5;

export function computeOcrCoverageScore(rawText: string, lineCount: number): number {
  if (!rawText || rawText.trim().length === 0) return 0;
  const lenScore = Math.min(1, rawText.trim().length / Math.max(200, MIN_OCR_CHARS));
  const lineScore = lineCount >= MIN_OCR_LINES ? 1 : lineCount / Math.max(1, MIN_OCR_LINES);
  return (lenScore + lineScore) / 2;
}

export function computeTotalConfidenceScore(
  totalConfidence: "high" | "low" | "fallback" | undefined,
  total: number,
  hasExplicitTotalLine: boolean
): number {
  if (total <= 0 || !Number.isFinite(total)) return 0;
  if (totalConfidence === "high") return 1;
  if (totalConfidence === "low") return 0.6;
  if (totalConfidence === "fallback") return 0.3;
  return hasExplicitTotalLine ? 0.8 : 0.4;
}

export function computeMerchantScore(storeName: string): number {
  const u = (storeName || "").trim().toLowerCase();
  if (u === "" || u === "unknown store") return 0;
  return 1;
}

export function computeItemExtractionScore(
  itemCount: number,
  linesWithPrice: number,
  totalLines: number,
  malformedNumericCount: number
): number {
  if (totalLines === 0) return itemCount > 0 ? 0.7 : 0;
  const coverage = linesWithPrice / Math.max(1, totalLines);
  const malformedPenalty = malformedNumericCount > 3 ? 0.5 : malformedNumericCount > 0 ? 0.8 : 1;
  return Math.min(1, coverage * malformedPenalty);
}

export function computeCategoryScore(itemsWithCategory: number, totalItems: number): number {
  if (totalItems === 0) return 1;
  const fraction = itemsWithCategory / totalItems;
  return fraction;
}

/**
 * Compute overall confidence from component scores.
 * high: all strong; medium: some weak but usable; low: total missing or very incomplete.
 */
export function computeOverallConfidence(scores: {
  ocrCoverage: number;
  totalExtraction: number;
  merchantDetection: number;
  itemExtraction: number;
  categoryAssignment?: number;
}): OverallConfidence {
  const { ocrCoverage, totalExtraction, merchantDetection, itemExtraction, categoryAssignment } = scores;
  const cat = categoryAssignment ?? 0.5;

  if (totalExtraction < 0.3 || ocrCoverage < 0.2) return "low";
  if (totalExtraction >= HIGH_TOTAL_CONFIDENCE && ocrCoverage >= 0.6 && merchantDetection >= 0.5 && itemExtraction >= MIN_ITEM_COVERAGE_FOR_HIGH)
    return "high";
  if (totalExtraction >= LOW_TOTAL_CONFIDENCE && (ocrCoverage >= 0.4 || itemExtraction >= 0.3))
    return "medium";
  return "low";
}

export function buildConfidenceScores(params: {
  rawText: string;
  lineCount: number;
  totalConfidence: "high" | "low" | "fallback" | undefined;
  total: number;
  hasExplicitTotalLine: boolean;
  storeName: string;
  itemCount: number;
  linesWithPrice: number;
  totalLines: number;
  malformedNumericCount: number;
  itemsWithNonOtherCategory: number;
}): ConfidenceScores {
  const ocrCoverage = computeOcrCoverageScore(params.rawText, params.lineCount);
  const totalExtraction = computeTotalConfidenceScore(
    params.totalConfidence,
    params.total,
    params.hasExplicitTotalLine
  );
  const merchantDetection = computeMerchantScore(params.storeName);
  const itemExtraction = computeItemExtractionScore(
    params.itemCount,
    params.linesWithPrice,
    params.totalLines,
    params.malformedNumericCount
  );
  const categoryAssignment = computeCategoryScore(
    params.itemsWithNonOtherCategory,
    params.itemCount
  );
  const overall = computeOverallConfidence({
    ocrCoverage,
    totalExtraction,
    merchantDetection,
    itemExtraction,
    categoryAssignment,
  });

  return {
    ocrCoverage,
    totalExtraction,
    merchantDetection,
    itemExtraction,
    categoryAssignment,
    overall,
  };
}
