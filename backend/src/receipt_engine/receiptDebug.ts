/**
 * Receipt pipeline debug – capture last processed receipt for inspection.
 * Enable with DEBUG_RECEIPT=1 or NODE_ENV=development.
 */

import * as fs from "fs";
import * as path from "path";

export interface ReceiptDebugSnapshot {
  timestamp: string;
  source: "process-text" | "from-base64" | "from-local" | "hybrid";
  rawOcrText?: string;
  normalizedLines?: string[];
  amounts?: number[];
  totalCandidates?: { value: number; source: string; confidence: number }[];
  chosenTotal?: number;
  totalConfidence?: "high" | "low" | "fallback";
  status?: "VERIFIED" | "NEEDS_REVIEW";
  storeName?: string;
  subtotal?: number;
  tax?: number;
  date?: string;
  itemCount?: number;
  items?: { name: string; rawName: string; totalPrice: number; category: string }[];
  sumOfItemPrices?: number;
  error?: string;
  /** Hybrid pipeline: was local small-model repair invoked? */
  localModelInvoked?: boolean;
  /** Hybrid pipeline: was cloud AI fallback invoked? */
  cloudFallbackInvoked?: boolean;
  /** Final extraction source: local | local_ai_repair | cloud */
  extractionSource?: string;
  /** Is this receipt included in analytics (VERIFIED)? */
  analyticsIncluded?: boolean;
  /** Overall confidence from confidence scoring */
  overallConfidence?: "high" | "medium" | "low";
  /** Full pipeline debug (for persistence on Receipt.pipelineDebug) */
  pipelineDebug?: Record<string, unknown>;
}

let lastSnapshot: ReceiptDebugSnapshot | null = null;
const DEBUG_ENABLED =
  process.env.DEBUG_RECEIPT === "1" || process.env.NODE_ENV === "development";
const DEBUG_DIR = path.join(__dirname, "..", "..", "data", "debug");

export function isReceiptDebugEnabled(): boolean {
  return DEBUG_ENABLED;
}

export function setLastReceiptDebug(snapshot: ReceiptDebugSnapshot): void {
  lastSnapshot = snapshot;
  if (!DEBUG_ENABLED) return;
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const file = path.join(DEBUG_DIR, "last_receipt_debug.json");
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf-8");
  } catch (e) {
    console.warn("[ReceiptDebug] Failed to write debug file:", e);
  }
}

export function getLastReceiptDebug(): ReceiptDebugSnapshot | null {
  return lastSnapshot;
}
