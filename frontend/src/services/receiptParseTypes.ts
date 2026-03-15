/**
 * Shared types for on-device receipt parsing pipeline (Option 2 + Option 4).
 */

export type ReceiptParseSource = "specialized" | "on_device_llm" | "regex" | "cloud";

export interface ReceiptParseResult {
  storeName: string;
  total: number;
  date?: string;
  items?: { name: string; quantity?: number; totalPrice?: number }[];
  source: ReceiptParseSource;
  /** When true, UI can show "Verified" without calling cloud. */
  confident: boolean;
}
