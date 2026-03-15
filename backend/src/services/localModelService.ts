/**
 * Local small-model service (repair / classification layer).
 * Stub implementation: interfaces ready for SmolVLM-256M / MLX or similar later.
 * Used when confidence is medium: normalize merchant, repair ambiguous lines, classify categories.
 */

import type { UnifiedReceiptResult, UnifiedReceiptItem } from "../receipt_engine/unifiedSchema";

export interface LocalModelRepairInput {
  rawOcrText: string;
  merchantName: string;
  items: UnifiedReceiptItem[];
  total: number;
}

export interface LocalModelRepairResult {
  merchantName: string;
  items: UnifiedReceiptItem[];
  total: number;
  invoked: boolean;
  /** If a real model is loaded and ran. */
  modelUsed: boolean;
}

const LOCAL_MODEL_ENABLED = process.env.LOCAL_RECEIPT_MODEL_ENABLED === "1";

/**
 * Repair and classify using a small local model.
 * Current: stub – returns input as-is. Future: load SmolVLM-256M/500M via MLX Swift / React Native ML and run.
 */
export async function repairAndClassify(input: LocalModelRepairInput): Promise<LocalModelRepairResult> {
  if (!LOCAL_MODEL_ENABLED) {
    return {
      merchantName: input.merchantName,
      items: input.items,
      total: input.total,
      invoked: false,
      modelUsed: false,
    };
  }

  // Stub: minimal normalization (trim merchant, ensure category set).
  const merchantName = (input.merchantName || "Unknown Store").trim();
  const items: UnifiedReceiptItem[] = input.items.map((it) => ({
    ...it,
    normalizedName: (it.normalizedName || it.rawText || "Item").trim(),
    category: (it.category && it.category !== "Other" ? it.category : "Other") as string,
  }));

  return {
    merchantName,
    items,
    total: input.total,
    invoked: true,
    modelUsed: false, // no real model loaded in this pass
  };
}

/** Whether the app is configured to attempt local model (for debug visibility). */
export function isLocalModelAvailable(): boolean {
  return LOCAL_MODEL_ENABLED;
}
