/**
 * Option 2: On-device LLM (Phi 3.5 mini) for receipt parsing.
 * Uses llama.rn: initLlama returns context, then context.completion().
 */

import { Platform } from "react-native";
import type { ReceiptParseResult } from "./receiptParseTypes";

const RECEIPT_SYSTEM = `You are a receipt parser. Extract from the receipt text: store name (one short phrase), total (number, e.g. 42.99), and date (YYYY-MM-DD if present, else empty string). Reply with only valid JSON, no markdown: {"store":"Name","total":0.00,"date":"YYYY-MM-DD"}`;

const RECEIPT_PROMPT_PREFIX = `Receipt text:\n`;

let llamaContext: { completion: (params: unknown, cb?: (d: { token: string }) => void) => Promise<{ text: string }> } | null = null;
let initPromise: Promise<boolean> | null = null;

/**
 * Whether the on-device LLM native module is available.
 */
export function isLLMAvailable(): boolean {
  try {
    require("llama.rn");
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize the LLM with the given GGUF model path (file:// or absolute path).
 * Returns true if init succeeded; throws with a clear message if init fails.
 */
export async function initOnDeviceLLM(
  modelPath: string,
  onProgress?: (progress: number) => void
): Promise<boolean> {
  if (initPromise != null) return initPromise;
  initPromise = (async () => {
    if (llamaContext != null) return true;
    const { initLlama } = require("llama.rn");
    const path = modelPath.startsWith("file://") ? modelPath : `file://${modelPath}`;
    try {
      const context = await initLlama(
        {
          model: path,
          use_mlock: true,
          n_ctx: 2048,
          n_gpu_layers: Platform.OS === "ios" ? 0 : 99,
          n_batch: 512,
          n_threads: 4,
        },
        onProgress
      );
      if (context && typeof context.completion === "function") {
        llamaContext = context;
        return true;
      }
      throw new Error("Init returned no context");
    } catch (e) {
      initPromise = null;
      const msg = e instanceof Error ? e.message : String(e);
      if (__DEV__) console.warn("[OnDeviceLLM] init failed", msg, e);
      throw new Error(msg || "Failed to load model");
    }
  })();
  return initPromise;
}

export function isLLMReady(): boolean {
  return llamaContext != null;
}

/**
 * Parse receipt text using the on-device LLM. Returns null if not ready or parse fails.
 */
export async function parseWithOnDeviceLLM(rawText: string): Promise<ReceiptParseResult | null> {
  if (!rawText?.trim() || !llamaContext) return null;
  try {
    const prompt = RECEIPT_SYSTEM + "\n\n" + RECEIPT_PROMPT_PREFIX + rawText.trim().slice(0, 3000);
    const result = await llamaContext.completion({
      prompt,
      n_predict: 256,
      temperature: 0.1,
      stop: ["\n\n", "<|end|>", "<|eot_id|>", "<|end_of_text|>", "<|im_end|>", "}"],
    });
    const text = (result?.text ?? "").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const data = JSON.parse(jsonStr) as { store?: string; total?: number; date?: string };
    const storeName = typeof data.store === "string" && data.store.trim() ? data.store.trim() : null;
    const total = typeof data.total === "number" && data.total > 0 ? data.total : null;
    if (!storeName || total == null) return null;
    return {
      storeName,
      total,
      date: typeof data.date === "string" && data.date.trim() ? data.date.trim() : undefined,
      items: [],
      source: "on_device_llm",
      confident: true,
    };
  } catch (e) {
    if (__DEV__) console.warn("[OnDeviceLLM] parse failed", e);
    return null;
  }
}
