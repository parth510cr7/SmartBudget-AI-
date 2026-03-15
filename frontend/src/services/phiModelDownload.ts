/**
 * Download Phi 3.5 mini GGUF to app document directory for on-device LLM.
 * Uses Q2_K quantization (~1.4 GB) for mobile.
 */

import * as FileSystem from "expo-file-system";

const MODEL_FILENAME = "Phi-3.5-mini-instruct-Q2_K.gguf";
const DOWNLOAD_URL =
  "https://huggingface.co/QuantFactory/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q2_K.gguf";

export interface DownloadState {
  path: string | null;
  downloading: boolean;
  progress: number;
  error: string | null;
}

/**
 * Get the path where the model should live. Does not check if file exists.
 */
export function getModelPath(): string {
  const dir = FileSystem.documentDirectory;
  if (!dir) throw new Error("No document directory");
  return `${dir.replace(/\/$/, "")}/${MODEL_FILENAME}`;
}

/**
 * Check if the model file already exists.
 */
export async function isModelDownloaded(): Promise<boolean> {
  try {
    const path = getModelPath();
    const info = await FileSystem.getInfoAsync(path, { size: false });
    return info.exists === true;
  } catch {
    return false;
  }
}

/**
 * Download Phi 3.5 mini Q2_K to document directory.
 * onProgress: 0..1
 */
export async function downloadPhiModel(
  onProgress?: (progress: number) => void
): Promise<{ path: string }> {
  const path = getModelPath();
  const dir = path.replace(/\/[^/]+$/, "");
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  const downloadResumable = FileSystem.createDownloadResumable(
    DOWNLOAD_URL,
    path,
    {},
    (downloadProgress) => {
      const total = downloadProgress.totalBytesWritten + downloadProgress.totalBytesExpectedToWrite;
      const written = downloadProgress.totalBytesWritten;
      if (total > 0 && onProgress) onProgress(written / total);
    }
  );
  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) throw new Error("Download failed");
  return { path: result.uri };
}

/**
 * Return a file:// path suitable for initLlama (works on iOS/Android).
 */
export function getModelFileUri(): string {
  const path = getModelPath();
  return path.startsWith("file://") ? path : `file://${path}`;
}
