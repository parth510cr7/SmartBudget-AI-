import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

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

const RECEIPT_JSON_SCHEMA = `{
  "storeName": "string",
  "storeAddress": "string or null",
  "date": "ISO 8601 date string (YYYY-MM-DD)",
  "subtotal": "number",
  "tax": "number",
  "total": "number",
  "items": [
    {
      "name": "normalized product name (e.g. Chicken Breast, Milk 2%)",
      "rawName": "exact text as on receipt",
      "quantity": "number (e.g. 1.5 if item shows 1.5 LB)",
      "unit": "string: one of g, kg, lb, oz, ml, L, item – use item if no weight/volume found",
      "unitPrice": "number (price per unit of measure)",
      "totalPrice": "number",
      "category": "one of: Groceries, Household, Personal Care, Health, Electronics, Dining, Other"
    }
  ]
}`;

const RECEIPT_PARSING_PROMPT = `You are an expert receipt parser. Extract structured data from the receipt image.

For every line item you MUST attempt to extract quantity and unit of measurement:
- Look for hints in the item name or line (e.g. "CHICKEN BRST 1.5 LB", "MILK 2L", "APPLES 500G", "BEEF 1.5LB $10.00").
- If a weight or volume is found, set quantity to that number and unit to the standard string: g, kg, lb, oz, L, ml.
- If no weight/volume is found, set quantity to 1 and unit to "item".
- unit must be exactly one of: g, kg, lb, oz, ml, L, item.
- unitPrice is the price per unit of measure (e.g. per lb, per L); totalPrice is the line total.

Rules:
- Extract store name, store address (if visible), date, subtotal, tax, total, and every line item.
- For each item: normalized name, raw name, quantity, unit, unitPrice, totalPrice, category.
- Categories: exactly one of Groceries, Household, Personal Care, Health, Electronics, Dining, Other.
- Dates: YYYY-MM-DD. All monetary values: numbers only.
- If tax/subtotal missing, set tax to 0 and subtotal equal to total.
- Return ONLY valid JSON, no markdown, no code fence. The response must parse with JSON.parse().

Exact JSON response format:
${RECEIPT_JSON_SCHEMA}`;

const USER_PROMPT =
  "Extract all receipt data from this image and return only the JSON object in the specified format.";

/**
 * Normalize base64 input: strip data URL prefix if present and return raw base64 + mime type.
 */
function normalizeBase64Image(base64Image: string): { data: string; mimeType: string } {
  if (base64Image.startsWith("data:")) {
    const match = base64Image.match(/^data:(image\/[a-z]+);base64,(.+)$/i);
    if (match) {
      return { data: match[2].trim(), mimeType: match[1].toLowerCase() };
    }
    const fallback = base64Image.replace(/^data:image\/[^;]+;base64,/, "").trim();
    return { data: fallback, mimeType: "image/jpeg" };
  }
  return { data: base64Image.trim(), mimeType: "image/jpeg" };
}

/**
 * Sends the receipt image to Gemini for vision-based extraction and returns structured JSON.
 */
export async function parseReceiptImage(base64Image: string): Promise<ParsedReceiptPayload> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const { data, mimeType } = normalizeBase64Image(base64Image);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: RECEIPT_PARSING_PROMPT,
  });

  const imagePart = {
    inlineData: {
      mimeType: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data,
    },
  };
  const result = await model.generateContent([imagePart, { text: USER_PROMPT }]);

  const raw = result.response.text()?.trim();
  if (!raw) throw new Error("Empty response from AI");

  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(jsonStr) as ParsedReceiptPayload;

  if (!parsed.storeName || !Array.isArray(parsed.items)) {
    throw new Error("Invalid receipt JSON: missing storeName or items");
  }
  if (typeof parsed.total !== "number" || typeof parsed.subtotal !== "number") {
    throw new Error("Invalid receipt JSON: total and subtotal must be numbers");
  }

  return parsed;
}

/** Native Intelligence: when store/total/date are locally verified, we only need items from the Cloud. */
const ITEMS_ONLY_SCHEMA = `{
  "items": [
    {
      "name": "normalized product name",
      "rawName": "exact text as on receipt",
      "quantity": "number (e.g. 1.5 for 1.5 LB)",
      "unit": "string: one of g, kg, lb, oz, ml, L, item",
      "unitPrice": "number",
      "totalPrice": "number",
      "category": "one of: Groceries, Household, Personal Care, Health, Electronics, Dining, Other"
    }
  ]
}`;

const ITEMS_ONLY_PROMPT = `You are an expert receipt parser. Store name, total, and date are already known. Extract ONLY the line items from this receipt image.
For each item you MUST extract quantity and unit: look for weight/volume in the line (e.g. 1.5 LB, 2L, 500G). If found, set quantity and unit (g, kg, lb, oz, ml, L); otherwise quantity 1, unit "item".
For each line item provide: name (normalized), rawName (as printed), quantity, unit, unitPrice, totalPrice, category.
unit must be exactly one of: g, kg, lb, oz, ml, L, item.
Categories: exactly one of Groceries, Household, Personal Care, Health, Electronics, Dining, Other.
Return ONLY valid JSON with an "items" array. No markdown, no code fence.`;

export interface LocalExtract {
  storeName: string;
  total: number;
  date?: string;
}

/**
 * Hybrid workflow: extract only line items from the image (store/total/date come from local OCR).
 * Used when frontend has "Locally Verified" store + total from on-device parser.
 */
export async function parseReceiptImageItemsOnly(
  base64Image: string,
  local: LocalExtract
): Promise<ParsedReceiptItem[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const { data, mimeType } = normalizeBase64Image(base64Image);
  const context = `Known: store=${local.storeName}, total=${local.total}${local.date ? `, date=${local.date}` : ""}.`;
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });
  const imagePart = {
    inlineData: {
      mimeType: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data,
    },
  };
  const result = await model.generateContent([
    imagePart,
    { text: `${ITEMS_ONLY_PROMPT}\n${context}\n\nSchema:\n${ITEMS_ONLY_SCHEMA}` },
  ]);
  const raw = result.response.text()?.trim();
  if (!raw) throw new Error("Empty response from AI");
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(jsonStr) as { items?: ParsedReceiptItem[] };
  if (!Array.isArray(parsed.items)) throw new Error("Invalid items-only JSON: missing items array");
  return parsed.items;
}

/**
 * Generate a text reply for the insights chat using Gemini.
 * context: summary of user's receipts/transactions (stores, totals, last 30 days, line items) so the AI can answer "How much at X?" or "Total in last 30 days".
 */
export async function generateChatReply(userMessage: string, context?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const contextBlock = context?.trim()
    ? `\n\nHere is the user's receipt/transaction data (use this to answer questions about spending, stores, or totals):\n${context}`
    : "";
  const result = await model.generateContent(
    `You are a budget assistant. Answer briefly and helpfully based only on the user's data when relevant. User asked: ${userMessage}${contextBlock}`
  );
  const text = result.response.text()?.trim();
  return text ?? "I couldn't generate a response.";
}

/**
 * Validate that the Gemini API key is set and accepted by the API (minimal text call).
 * Use for health/cloud check.
 */
export async function validateCloudReceiptApi(): Promise<{ ok: boolean; message?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return { ok: false, message: "GEMINI_API_KEY is not set" };
  }
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Reply with exactly: OK");
    const text = result.response.text()?.trim();
    if (text) return { ok: true };
    return { ok: false, message: "Empty response from Gemini" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
