/**
 * Unified on-device receipt parsing: Option 4 (specialized) → Option 2 (on-device LLM) → null (caller uses backend/regex).
 */

import { parseWithSpecializedModel } from "./specializedReceiptModel";
import { parseWithOnDeviceLLM, isLLMReady } from "./onDeviceLLM";
import type { ReceiptParseResult } from "./receiptParseTypes";

export type { ReceiptParseResult, ReceiptParseSource } from "./receiptParseTypes";
export { parseWithSpecializedModel } from "./specializedReceiptModel";
export { initOnDeviceLLM, isLLMReady, isLLMAvailable, parseWithOnDeviceLLM } from "./onDeviceLLM";

/**
 * Try on-device parsing in order: specialized model → on-device LLM.
 * Returns the first confident result, or null to let the caller use backend/process-text/regex/cloud.
 */
export async function runOnDevicePipeline(rawText: string): Promise<ReceiptParseResult | null> {
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) return null;

  const fromSpecialized = await parseWithSpecializedModel(rawText);
  if (fromSpecialized) return fromSpecialized;

  if (isLLMReady()) {
    const fromLLM = await parseWithOnDeviceLLM(rawText);
    if (fromLLM) return fromLLM;
  }

  return null;
}
