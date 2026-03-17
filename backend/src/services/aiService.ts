/**
 * Cloud AI (Gemini) has been removed to support on-device-first operation.
 * These exports remain for API compatibility; they no longer call any external provider.
 */

/** JSON shape the AI must return for a parsed receipt (Master Blueprint). */
export interface ParsedReceiptItem {
  name: string;
  rawName: string;
  quantity: number;
  unit?: string;  // e.g. "g", "kg", "lb", "oz", "ml", "L", "item" – default "item" if omitted
  unitPrice: number;
  totalPrice: number;
  category: string;
}

export interface ParsedReceiptPayload {
  storeName: string;
  storeAddress?: string;
  date: string;
  subtotal: number;
  tax: number;
  total: number;
  items: ParsedReceiptItem[];
}

/**
 * Cloud receipt parsing was removed. Use on-device parsing instead.
 */
export async function parseReceiptImage(base64Image: string): Promise<ParsedReceiptPayload> {
  void base64Image;
  throw new Error("Cloud receipt parsing is disabled. Use on-device receipt parsing.");
}

export interface LocalExtract {
  storeName: string;
  total: number;
  date?: string;
}

/**
 * Cloud items-only extraction was removed. Use on-device parsing instead.
 */
export async function parseReceiptImageItemsOnly(
  base64Image: string,
  local: LocalExtract
): Promise<ParsedReceiptItem[]> {
  void base64Image;
  void local;
  throw new Error("Cloud receipt parsing is disabled. Use on-device receipt parsing.");
}

/**
 * Cloud chat was removed. Use on-device LLM for chat.
 * context: summary of user's receipts/transactions (stores, totals, last 30 days, line items) so the AI can answer "How much at X?" or "Total in last 30 days".
 */
export async function generateChatReply(userMessage: string, context?: string): Promise<string> {
  void userMessage;
  void context;
  throw new Error("Cloud chat is disabled. Use the on-device LLM.");
}

/**
 * Validate that the Gemini API key is set and accepted by the API (minimal text call).
 * Use for health/cloud check.
 */
export async function validateCloudReceiptApi(): Promise<{ ok: boolean; message?: string }> {
  return { ok: false, message: "Cloud AI is disabled (on-device-only mode)." };
}
