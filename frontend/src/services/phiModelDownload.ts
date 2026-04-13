/**
 * Download Phi 3.5 mini GGUF to app document directory for on-device LLM.
 * Uses Q2_K quantization (~1.4 GB) for mobile.
 * Uses expo-file-system (native) for reliable iOS file info + downloads.
 */

import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

const MODEL_FILENAME = "Phi-3.5-mini-instruct-Q2_K.gguf";
const DOWNLOAD_URL =
  "https://huggingface.co/QuantFactory/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q2_K.gguf";
// Rough size guard (bytes). Prevents treating partial downloads as “downloaded”.
// Q2_K is ~1.4GB; allow some slack for upstream changes.
const MIN_EXPECTED_BYTES = 900 * 1024 * 1024;

export interface DownloadState {
  path: string | null;
  downloading: boolean;
  progress: number;
  error: string | null;
}

export type FileSystemDiagnostics = {
  documentDirectory: string | null;
  cacheDirectory: string | null;
  expoNativeModule: "present" | "missing" | "unknown";
  requireNativeModuleOk: boolean;
  requireNativeModuleError?: string;
};

export async function diagnoseFileSystem(): Promise<FileSystemDiagnostics> {
  const fs = FileSystem as unknown as { documentDirectory?: string | null; cacheDirectory?: string | null };
  const documentDirectory = fs.documentDirectory ?? null;
  const cacheDirectory = fs.cacheDirectory ?? null;

  let expoNativeModule: FileSystemDiagnostics["expoNativeModule"] = "unknown";
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = require("react-native") as { NativeModules?: Record<string, unknown> };
    const native = RN.NativeModules?.ExpoFileSystem ?? null;
    expoNativeModule = native ? "present" : "missing";
  } catch {
    expoNativeModule = "unknown";
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require("expo-modules-core") as { requireNativeModule: (n: string) => unknown };
    requireNativeModule("ExpoFileSystem");
    return { documentDirectory, cacheDirectory, expoNativeModule, requireNativeModuleOk: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      documentDirectory,
      cacheDirectory,
      expoNativeModule,
      requireNativeModuleOk: false,
      requireNativeModuleError: msg,
    };
  }
}

/**
 * Get a writable directory for the model (documentDirectory, or cacheDirectory as fallback).
 * Retries a few times in case the native module is not ready yet.
 */
async function getModelDirectoryAsync(): Promise<string> {
  if (Platform.OS === "web") {
    throw new Error("On-device AI model download is not supported on web. Use the iOS/Android dev build app.");
  }
  const maxAttempts = 10;
  let delayMs = 250;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const fs = FileSystem as unknown as { documentDirectory?: string | null; cacheDirectory?: string | null };
    // Some iOS/dev-client launches can report null dirs briefly; calling into the module helps “wake” it.
    try {
      const probe =
        fs.cacheDirectory ??
        fs.documentDirectory ??
        // `file://` is a safe-ish sentinel to force native module init; it may error on getInfoAsync, which we ignore.
        "file://";
      await FileSystem.getInfoAsync(probe);
    } catch {
      // ignore
    }

    const dir = fs.documentDirectory ?? fs.cacheDirectory;
    if (dir && dir.trim()) return dir.replace(/\/+$/, "").trim() || dir.trim();

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.min(1200, Math.round(delayMs * 1.6));
    }
  }

  throw new Error(
    [
      "Storage not available (expo-file-system returned no document/cache directory).",
      "This usually means the dev build is missing `expo-file-system`, or the app needs a full cold restart.",
      "Try: fully quit the app (swipe away) and reopen. If it persists, rebuild the dev client.",
    ].join(" ")
  );
}

function getModelDirectorySync(): string {
  if (Platform.OS === "web") {
    throw new Error("On-device AI model path is not supported on web.");
  }
  const fs = FileSystem as unknown as { documentDirectory?: string | null; cacheDirectory?: string | null };
  const dir = fs.documentDirectory ?? fs.cacheDirectory;
  if (!dir || !dir.trim())
    throw new Error(
      "Storage not available (expo-file-system returned no document/cache directory). Fully quit the app and reopen; if it persists, rebuild the dev client."
    );
  return dir.replace(/\/*$/, "").trim() || dir.trim();
}

async function ensureEnoughFreeSpace(requiredBytes: number): Promise<void> {
  try {
    const free = await FileSystem.getFreeDiskStorageAsync();
    if (Number.isFinite(free) && free > 0 && free < requiredBytes) {
      const freeGb = (free / (1024 * 1024 * 1024)).toFixed(2);
      const needGb = (requiredBytes / (1024 * 1024 * 1024)).toFixed(2);
      throw new Error(`Not enough free storage (${freeGb} GB). Need at least ${needGb} GB to download the model.`);
    }
  } catch (e) {
    // If the API fails on a platform, don’t block downloads—just proceed.
    if (e instanceof Error && /Not enough free storage/.test(e.message)) throw e;
  }
}

/**
 * Get the path where the model should live. Does not check if file exists.
 */
export function getModelPath(): string {
  return `${getModelDirectorySync()}/${MODEL_FILENAME}`;
}

/**
 * Check if the model file already exists.
 */
export async function isModelDownloaded(): Promise<boolean> {
  try {
    const path = getModelPath();
    const info = await FileSystem.getInfoAsync(path);
    const size = typeof (info as { size?: number }).size === "number" ? (info as { size?: number }).size! : 0;
    return info.exists === true && size >= MIN_EXPECTED_BYTES;
  } catch {
    return false;
  }
}

export async function getModelInfo(): Promise<{ path: string; exists: boolean; sizeBytes: number }> {
  const path = getModelPath();
  const info = await FileSystem.getInfoAsync(path);
  const sizeBytes = typeof (info as { size?: number }).size === "number" ? (info as { size?: number }).size! : 0;
  return { path, exists: info.exists === true, sizeBytes };
}

/**
 * Download Phi 3.5 mini Q2_K to document directory.
 * onProgress: 0..1
 */
export async function downloadPhiModel(
  onProgress?: (progress: number) => void
): Promise<{ path: string }> {
  const dir = await getModelDirectoryAsync();
  const path = `${dir}/${MODEL_FILENAME}`;
  // Preflight: large file download needs space (and avoid “0 byte file” lingering from previous attempts).
  await ensureEnoughFreeSpace(2.2 * 1024 * 1024 * 1024);
  try {
    const existing = await FileSystem.getInfoAsync(path);
    const sizeBytes = typeof (existing as { size?: number }).size === "number" ? (existing as { size?: number }).size! : 0;
    if (existing.exists && sizeBytes > 0 && sizeBytes < MIN_EXPECTED_BYTES) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
    if (existing.exists && sizeBytes === 0) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
  } catch {
    // ignore
  }
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  const downloadResumable = FileSystem.createDownloadResumable(
    DOWNLOAD_URL,
    path,
    {},
    (downloadProgress) => {
      const expected = downloadProgress.totalBytesExpectedToWrite;
      const written = downloadProgress.totalBytesWritten;
      if (expected > 0 && onProgress) onProgress(Math.min(1, written / expected));
    }
  );
  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) throw new Error("Download failed");
  const info = await FileSystem.getInfoAsync(path);
  const sizeBytes = typeof (info as { size?: number }).size === "number" ? (info as { size?: number }).size! : 0;
  if (info.exists !== true || sizeBytes < MIN_EXPECTED_BYTES) {
    // Distinguish “network blocked” from “partial”.
    if (sizeBytes === 0) {
      throw new Error(
        "Download wrote 0 bytes. This is usually caused by a blocked download (network/VPN/firewall), a redirect issue, or iOS terminating a large transfer. Try: stable Wi‑Fi, disable VPN, keep the app open, then re-download."
      );
    }
    throw new Error(
      `Downloaded file looks incomplete (size ${(sizeBytes / (1024 * 1024)).toFixed(0)} MB). Please re-download on stable Wi‑Fi.`
    );
  }
  return { path: result.uri };
}

export async function deletePhiModel(): Promise<void> {
  const path = getModelPath();
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
  } catch {
    // ignore
  }
}

/**
 * Return a file:// path suitable for initLlama (works on iOS/Android).
 */
export function getModelFileUri(): string {
  const path = getModelPath();
  return path.startsWith("file://") ? path : `file://${path}`;
}
