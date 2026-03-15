/**
 * Hybrid receipt pipeline: OCR → local parser + confidence → optional local-model repair → optional cloud fallback.
 * All outputs normalize to UnifiedReceiptResult.
 */

import { processReceiptText, type EngineResult } from "./index";
import { normalizeReceiptText } from "./receiptNormalizer";
import {
  type UnifiedReceiptResult,
  type UnifiedReceiptItem,
  type ExtractionSource,
  type OverallConfidence,
  toUnifiedItem,
  toUnifiedResult,
} from "./unifiedSchema";
import { buildConfidenceScores, type ConfidenceScores } from "./confidenceScoring";
import { repairAndClassify } from "../services/localModelService";
import { parseReceiptImage } from "../services/aiService";
import { setLastReceiptDebug, isReceiptDebugEnabled } from "./receiptDebug";

export interface HybridPipelineOptions {
  /** When true and confidence is low, call cloud AI if image is provided. */
  cloudFallbackEnabled?: boolean;
  /** When true and local result is needsReview, try cloud to get verified. Set to false on free tier to save API calls. */
  useCloudWhenNeedsReview?: boolean;
  /** When true and confidence is medium, run local model repair. */
  localRepairEnabled?: boolean;
}

export interface HybridPipelineResult {
  result: UnifiedReceiptResult;
  confidenceScores: ConfidenceScores;
  localModelInvoked: boolean;
  cloudFallbackInvoked: boolean;
  pipelineDebug: Record<string, unknown>;
}

const DEFAULT_OPTIONS: HybridPipelineOptions = {
  cloudFallbackEnabled: process.env.RECEIPT_CLOUD_FALLBACK_ENABLED !== "0",
  useCloudWhenNeedsReview: process.env.RECEIPT_USE_CLOUD_WHEN_NEEDS_REVIEW !== "0",
  localRepairEnabled: true,
};

function engineToUnifiedItems(engine: EngineResult): UnifiedReceiptItem[] {
  return engine.items.map((i) =>
    toUnifiedItem(
      i.name,
      i.rawName,
      i.quantity,
      i.unit,
      i.unitPrice,
      i.totalPrice,
      i.category,
      i.totalPrice > 0 ? 1 : 0.5
    )
  );
}

function cloudPayloadToUnified(parsed: Awaited<ReturnType<typeof parseReceiptImage>>): UnifiedReceiptResult {
  const items: UnifiedReceiptItem[] = (parsed.items || []).map((it) =>
    toUnifiedItem(
      it.name,
      it.rawName ?? it.name,
      Number(it.quantity) || 1,
      (it as { unit?: string }).unit?.trim() || "item",
      Number(it.unitPrice) || 0,
      Number(it.totalPrice) || 0,
      it.category ?? "Other",
      1
    )
  );
  return toUnifiedResult(
    parsed.storeName?.trim() || "Unknown Store",
    parsed.date || new Date().toISOString().slice(0, 10),
    Number(parsed.subtotal) || 0,
    Number(parsed.tax) || 0,
    Number(parsed.total) || 0,
    items,
    "high",
    "cloud",
    "verified"
  );
}

/**
 * Run the full hybrid pipeline: local OCR text → parser → confidence → optional repair → optional cloud.
 */
export async function runHybridPipeline(
  rawText: string,
  base64Image: string | null,
  options: HybridPipelineOptions = {}
): Promise<HybridPipelineResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const normalized = normalizeReceiptText(rawText);
  const lineCount = normalized.lines.length;
  const rawLength = rawText.trim().length;

  let engine: EngineResult;
  try {
    engine = await processReceiptText(rawText);
  } catch (e) {
    if (base64Image && opts.cloudFallbackEnabled) {
      const parsed = await parseReceiptImage(base64Image);
      const result = cloudPayloadToUnified(parsed);
      const pipelineDebug = {
        rawOcrLength: rawLength,
        lineCount,
        localModelInvoked: false,
        cloudFallbackInvoked: true,
        extractionSource: "cloud",
        overallConfidence: "high",
        finalTotal: result.total,
        finalItemCount: result.items.length,
        analyticsIncluded: true,
        error: e instanceof Error ? e.message : String(e),
      };
      if (isReceiptDebugEnabled()) {
        setLastReceiptDebug({
          timestamp: new Date().toISOString(),
          source: "hybrid",
          rawOcrText: rawText.slice(0, 10000),
          localModelInvoked: false,
          cloudFallbackInvoked: true,
          extractionSource: "cloud",
          analyticsIncluded: true,
          pipelineDebug,
        });
      }
      return {
        result,
        confidenceScores: {
          ocrCoverage: 0,
          totalExtraction: 0,
          merchantDetection: 0,
          itemExtraction: 0,
          categoryAssignment: 0,
          overall: "low",
        },
        localModelInvoked: false,
        cloudFallbackInvoked: true,
        pipelineDebug,
      };
    }
    throw e;
  }

  const linesWithPrice = engine.items.filter((i) => i.totalPrice > 0).length;
  const malformedNumericCount = engine.items.filter((i) => i.totalPrice === 0 && (i.name?.length ?? 0) > 0).length;
  const itemsWithNonOther = engine.items.filter((i) => i.category && i.category !== "Other").length;
  const hasExplicitTotalLine = engine.totalConfidence === "high";

  const confidenceScores = buildConfidenceScores({
    rawText,
    lineCount,
    totalConfidence: engine.totalConfidence,
    total: engine.total,
    hasExplicitTotalLine,
    storeName: engine.storeName,
    itemCount: engine.items.length,
    linesWithPrice,
    totalLines: lineCount,
    malformedNumericCount,
    itemsWithNonOtherCategory: itemsWithNonOther,
  });

  let localModelInvoked = false;
  let cloudFallbackInvoked = false;
  let result: UnifiedReceiptResult;

  if (engine.needsReview && base64Image && opts.cloudFallbackEnabled && opts.useCloudWhenNeedsReview) {
    try {
      const parsed = await parseReceiptImage(base64Image);
      result = cloudPayloadToUnified(parsed);
      cloudFallbackInvoked = true;
    } catch {
      if (confidenceScores.overall === "high") {
        result = toUnifiedResult(
          engine.storeName,
          engine.date,
          engine.subtotal,
          engine.tax,
          engine.total,
          engineToUnifiedItems(engine),
          "high",
          "local",
          "needs_review"
        );
      } else if (confidenceScores.overall === "medium" && opts.localRepairEnabled) {
        const unifiedItems = engineToUnifiedItems(engine);
        const repair = await repairAndClassify({
          rawOcrText: rawText,
          merchantName: engine.storeName,
          items: unifiedItems,
          total: engine.total,
        });
        localModelInvoked = repair.invoked;
        result = toUnifiedResult(
          repair.merchantName,
          engine.date,
          engine.subtotal,
          engine.tax,
          repair.total,
          repair.items,
          "medium",
          localModelInvoked ? "local_ai_repair" : "local",
          "needs_review"
        );
      } else {
        result = toUnifiedResult(
          engine.storeName,
          engine.date,
          engine.subtotal,
          engine.tax,
          engine.total,
          engineToUnifiedItems(engine),
          confidenceScores.overall,
          "local",
          "needs_review"
        );
      }
    }
  } else if (confidenceScores.overall === "high") {
    result = toUnifiedResult(
      engine.storeName,
      engine.date,
      engine.subtotal,
      engine.tax,
      engine.total,
      engineToUnifiedItems(engine),
      "high",
      "local",
      engine.needsReview ? "needs_review" : "verified"
    );
  } else if (confidenceScores.overall === "medium" && opts.localRepairEnabled) {
    const unifiedItems = engineToUnifiedItems(engine);
    const repair = await repairAndClassify({
      rawOcrText: rawText,
      merchantName: engine.storeName,
      items: unifiedItems,
      total: engine.total,
    });
    localModelInvoked = repair.invoked;
    result = toUnifiedResult(
      repair.merchantName,
      engine.date,
      engine.subtotal,
      engine.tax,
      repair.total,
      repair.items,
      "medium",
      localModelInvoked ? "local_ai_repair" : "local",
      engine.needsReview ? "needs_review" : "verified"
    );
  } else if (confidenceScores.overall === "low" && base64Image && opts.cloudFallbackEnabled) {
    try {
      const parsed = await parseReceiptImage(base64Image);
      result = cloudPayloadToUnified(parsed);
      cloudFallbackInvoked = true;
    } catch (cloudErr) {
      result = toUnifiedResult(
        engine.storeName,
        engine.date,
        engine.subtotal,
        engine.tax,
        engine.total,
        engineToUnifiedItems(engine),
        "low",
        "local",
        "needs_review"
      );
    }
  } else {
    result = toUnifiedResult(
      engine.storeName,
      engine.date,
      engine.subtotal,
      engine.tax,
      engine.total,
      engineToUnifiedItems(engine),
      confidenceScores.overall,
      "local",
      "needs_review"
    );
  }

  const pipelineDebug: Record<string, unknown> = {
    rawOcrLength: rawLength,
    lineCount,
    localModelInvoked,
    cloudFallbackInvoked,
    extractionSource: result.extractionSource,
    overallConfidence: result.overallConfidence,
    finalTotal: result.total,
    finalItemCount: result.items.length,
    analyticsIncluded: result.reviewStatus === "verified",
    ocrCoverageScore: confidenceScores.ocrCoverage,
    totalExtractionScore: confidenceScores.totalExtraction,
    merchantScore: confidenceScores.merchantDetection,
    itemExtractionScore: confidenceScores.itemExtraction,
  };

  if (isReceiptDebugEnabled()) {
    setLastReceiptDebug({
      timestamp: new Date().toISOString(),
      source: "hybrid",
      rawOcrText: rawText.slice(0, 10000),
      normalizedLines: normalized.lines,
      chosenTotal: result.total,
      totalConfidence: engine.totalConfidence,
      status: result.reviewStatus === "verified" ? "VERIFIED" : "NEEDS_REVIEW",
      storeName: result.merchantName,
      subtotal: result.subtotal,
      tax: result.tax,
      date: result.purchaseDate,
      itemCount: result.items.length,
      items: result.items.map((i) => ({
        name: i.normalizedName,
        rawName: i.rawText,
        totalPrice: i.totalPrice,
        category: i.category,
      })),
      localModelInvoked,
      cloudFallbackInvoked,
      extractionSource: result.extractionSource,
      analyticsIncluded: result.reviewStatus === "verified",
      overallConfidence: result.overallConfidence,
      pipelineDebug,
    });
  }

  return {
    result,
    confidenceScores,
    localModelInvoked,
    cloudFallbackInvoked,
    pipelineDebug,
  };
}
