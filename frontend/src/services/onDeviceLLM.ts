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
    let initLlama: ((opts: any, onProgress?: (p: number) => void) => Promise<any>) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      initLlama = require("llama.rn").initLlama;
    } catch {
      initPromise = null;
      throw new Error("On-device AI is not available in Expo Go. Install a dev build (Dev Client/EAS) with llama.rn.");
    }
    if (!initLlama) {
      initPromise = null;
      throw new Error("On-device AI module loaded but initLlama is missing. Rebuild the dev client.");
    }
    const path = modelPath.startsWith("file://") ? modelPath : `file://${modelPath}`;
    try {
      // iOS is memory-constrained; conservative defaults avoid “failed to load”.
      const isIOS = Platform.OS === "ios";
      const context = await initLlama(
        {
          model: path,
          // mlock frequently fails on iOS; disable by default to reduce init failures.
          use_mlock: false,
          n_ctx: isIOS ? 768 : 2048,
          n_gpu_layers: isIOS ? 0 : 99,
          n_batch: isIOS ? 64 : 512,
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
      const hint = (() => {
        if (/no such file|not found|ENOENT/i.test(msg)) return "Model file not found at path (download may have failed).";
        if (/failed to load model/i.test(msg)) return "Model init failed (often memory/corruption). Try deleting and re-downloading the model.";
        if (/permission/i.test(msg)) return "File permission error. Try reinstalling the dev build.";
        return null;
      })();
      throw new Error([msg || "Failed to load model", hint].filter(Boolean).join(" — "));
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

/** Short synthetic receipt for Profile self-test (no network). */
const SELF_TEST_RECEIPT = `FRESH MART GROCERY
123 Main St
Subtotal $18.50
Tax $1.49
TOTAL $19.99
01/22/2025`;

/**
 * Quick parse on fixed text to verify the loaded model responds with JSON.
 * Call from Profile after “Load model” to confirm on-device parsing works.
 */
export async function runOnDeviceLLMSelfTest(): Promise<{ ok: boolean; message: string }> {
  if (!isLLMReady()) {
    return { ok: false, message: "Load the model first, then run this test." };
  }
  try {
    const result = await parseWithOnDeviceLLM(SELF_TEST_RECEIPT);
    if (result?.storeName && result.total != null && result.total > 0) {
      return {
        ok: true,
        message: `OK — extracted store “${result.storeName}” and total $${result.total.toFixed(2)}.`,
      };
    }
    return {
      ok: false,
      message: "Model ran but did not return a valid store/total. Try Load model again or re-download the file.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg || "Self-test failed." };
  }
}
