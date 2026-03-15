/**
 * Hybrid OCR: on-device when native module is available (EAS / dev build),
 * otherwise returns null so the app uses Cloud API (e.g. in Expo Go).
 * Supports expo-text-extractor (ML Kit / Vision). If react-native-vision-camera
 * or another engine is linked in the future, it can be tried here.
 */

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

type TextExtractorFn = (uri: string) => Promise<string[]>;
let extractTextFromImage: TextExtractorFn | null = null;
let isSupported = false;
try {
  const mod = require("expo-text-extractor");
  extractTextFromImage = (mod.extractTextFromImage as TextExtractorFn | undefined) ?? null;
  isSupported = mod.isSupported === true;
  if (!extractTextFromImage && __DEV__) {
    console.warn("[OCR] Native module not available (e.g. Expo Go). Cloud API will be used.");
  }
} catch (e) {
  extractTextFromImage = null;
  isSupported = false;
  if (__DEV__) {
    console.warn("[OCR] Package not linked or missing (common in Expo Go). Cloud backup will be used.", e);
  }
}

function isNativeModuleError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /not linked|package not linked|native module|TurboModule|linking/i.test(msg);
}

const OCR_TEMP_PREFIX = "receipt_ocr_";
const OCR_TEMP_EXT = ".jpg";

function isFileUri(input: string): boolean {
  const t = input.trim();
  return t.startsWith("file://") || t.startsWith("content://") || (Platform.OS === "android" && t.startsWith("/"));
}

async function base64ToTempFile(base64: string): Promise<string> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error("No cache directory");
  const path = `${dir}${OCR_TEMP_PREFIX}${Date.now()}${OCR_TEMP_EXT}`;
  const normalized = base64.replace(/^data:image\/[^;]+;base64,/, "").trim();
  await FileSystem.writeAsStringAsync(path, normalized, {
    encoding: "base64",
  } as { encoding: "base64" });
  return path;
}

/** Result of OCR: full text plus counts for logging and short-OCR detection. */
export interface OcrResult {
  text: string | null;
  /** Number of blocks/observations returned by native (e.g. Vision observations). */
  blockCount: number;
  /** Number of lines in joined text (non-empty after trim). */
  lineCount: number;
  /** Total character count of raw OCR before any normalization. */
  charCount: number;
}

const OCR_LOG_PREFIX = "[OCR]";

/**
 * Get raw text from an image (file URI or base64).
 * Returns null text if native OCR is unavailable or fails – app then uses Cloud API.
 * Joins ALL blocks/observations in order (native returns array; we join with newline).
 */
export async function getRawTextFromImage(imageBase64OrUri: string): Promise<string | null> {
  const result = await getRawTextFromImageWithMeta(imageBase64OrUri);
  return result.text;
}

/**
 * Same as getRawTextFromImage but returns metadata for logging and short-OCR rules.
 * Use this when you need blockCount, lineCount, or charCount.
 */
export async function getRawTextFromImageWithMeta(imageBase64OrUri: string): Promise<OcrResult> {
  const empty: OcrResult = { text: null, blockCount: 0, lineCount: 0, charCount: 0 };
  if (!imageBase64OrUri || typeof imageBase64OrUri !== "string") return empty;

  if (!extractTextFromImage) {
    if (__DEV__) console.warn(`${OCR_LOG_PREFIX} Native module not available. Using Cloud API.`);
    return empty;
  }

  try {
    let imagePath: string;
    let tempPath: string | null = null;

    if (isFileUri(imageBase64OrUri)) {
      imagePath = imageBase64OrUri;
    } else {
      tempPath = await base64ToTempFile(imageBase64OrUri);
      imagePath = tempPath;
    }

    const blocks = await extractTextFromImage(imagePath);
    const blockCount = Array.isArray(blocks) ? blocks.length : 0;
    const text = blockCount > 0 ? blocks.join("\n").trim() : null;
    const lineCount = text ? text.split(/\r?\n/).filter((l) => l.trim().length > 0).length : 0;
    const charCount = text ? text.length : 0;

    if (__DEV__) {
      console.log(
        `${OCR_LOG_PREFIX} Native returned blocks=${blockCount} lines=${lineCount} chars=${charCount} | raw preview: ${(text ?? "").slice(0, 200)}${(text?.length ?? 0) > 200 ? "..." : ""}`
      );
      if (blockCount <= 1 && text) {
        console.warn(`${OCR_LOG_PREFIX} Only one block returned – receipt may be truncated. Cloud fallback recommended.`);
      }
      if (text) {
        try {
          (global as { __LAST_OCR_RAW?: string }).__LAST_OCR_RAW = text;
        } catch (_) {}
      }
    }

    if (tempPath) {
      try {
        await FileSystem.deleteAsync(tempPath, { idempotent: true });
      } catch (_) {}
    }

    return { text: text || null, blockCount, lineCount, charCount };
  } catch (e) {
    if (__DEV__) {
      if (isNativeModuleError(e)) {
        console.warn(`${OCR_LOG_PREFIX} Package not linked (Expo Go / unsupported build). Cloud API will be used.`);
      } else {
        console.warn(`${OCR_LOG_PREFIX} Recognition failed. Cloud API will be used.`, e);
      }
    }
    return empty;
  }
}

/** Whether the device supports on-device text extraction (for UI). */
export function isOcrSupported(): boolean {
  return isSupported && extractTextFromImage != null;
}
