/**
 * Native Intelligence – Phase 1: On-Device Text Extraction (Local Parser).
 * Scans raw OCR text for date, currency, and store keywords.
 * Used when we have raw text (e.g. from on-device OCR or Live Text); if store + total
 * are found we flag "Locally Verified" and use Cloud API only for line-item categorization.
 */

export interface LocalParseResult {
  /** Detected store name (from keywords or first line). */
  storeName?: string;
  /** Detected total amount (last/largest $ value often used as total). */
  total?: number;
  /** Detected date in YYYY-MM-DD form for backend. */
  date?: string;
  /** True when we have both storeName and total (suitable for hybrid flow). */
  locallyVerified: boolean;
}

/** Common store names to look for in receipt text (case-insensitive). */
const STORE_KEYWORDS = [
  "target", "walmart", "costco", "costco wholesale", "kroger", "safeway", "whole foods",
  "trader joe's", "trader joes", "cvs", "walgreens", "rite aid", "home depot", "lowes",
  "best buy", "amazon", "aldi", "publix", "heb", "meijer", "dollar general", "dollar tree",
  "cub foods", "hy-vee", "wegmans", "food lion", "giant", "stop & shop", "stop and shop",
  "albertsons", "sprouts", "lidl", "seven eleven", "7-eleven", "shell", "chevron", "exxon", "bp",
  "quick trip", "quiktrip", "circle k", "speedway", "starbucks", "mcdonald", "tim hortons",
  "the ups store", "ups store", "canadian tire", "shoppers drug mart", "loblaws", "nofrills",
  "metro", "sobeys", "freshco", "longo's", "farm boy", "rexall", "hindu temple", "temple",
  "royal bank", "rbc", "td bank", "scotiabank", "bmo", "cibc",
];

/**
 * Extract a store name from text: first match from STORE_KEYWORDS, or first non-meta line as fallback.
 */
function extractStoreName(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const keyword of STORE_KEYWORDS) {
    if (lower.includes(keyword)) {
      const name = keyword.replace(/\s*&\s*/g, " & ").replace(/\s+/g, " ").trim();
      return name.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length >= 2 && l.length <= 60 && !/^\d+\.?\d*$/.test(l) && !/^(total|subtotal|tax|date|receipt|thank)/i.test(l) && /\b[a-z]{2,}\b/i.test(l));
  return firstLine ? firstLine.replace(/\s+/g, " ").trim().slice(0, 50) : undefined;
}

/**
 * Parse date from text. Supports MM/DD/YY, MM/DD/YYYY, MM-DD-YY, MM-DD-YYYY.
 * Returns YYYY-MM-DD or undefined.
 */
function extractDate(text: string): string | undefined {
  const patterns = [
    /\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b/g,
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
    /\b(\d{1,2})-(\d{1,2})-(\d{2})\b/g,
    /\b(\d{1,2})-(\d{1,2})-(\d{4})\b/g,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const month = m[1].padStart(2, "0");
      const day = m[2].padStart(2, "0");
      let year = m[3];
      if (year.length === 2) {
        const y = parseInt(year, 10);
        year = y >= 0 && y <= 50 ? `20${year}` : `19${year}`;
      }
      return `${year}-${month}-${day}`;
    }
  }
  return undefined;
}

/** Total keywords – prefer amount on same line as these. */
const TOTAL_LINE_PATTERNS = [
  /\b(?:grand\s+total|amount\s+due|balance\s+due|amount\s+paid|total\s+due)\s*\$?\s*(\d+(?:,\d{3})*\.\d{2}|\d+\.\d{2})/gi,
  /\b(?:total|balance|cash\s+total|card\s+total)\s*\$?\s*[:\s]*(\d+(?:,\d{3})*\.\d{2}|\d+\.\d{2})/gi,
];

/**
 * Extract total from lines that contain total keywords (avoid receipt IDs, phone numbers).
 */
function extractTotalFromPatterns(text: string): number | undefined {
  for (const re of TOTAL_LINE_PATTERNS) {
    const m = re.exec(text);
    if (m?.[1]) {
      const n = parseFloat(m[1].replace(/,/g, ""));
      if (!Number.isNaN(n) && n > 0 && n < 1e5) return n;
    }
  }
  return undefined;
}

/**
 * Extract all currency amounts from text ($X.XX or standalone X.XX at line end). Filter out likely non-totals.
 */
function extractCurrencyAmounts(text: string): number[] {
  const amounts: number[] = [];
  const withDollar = /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2})/g;
  let match: RegExpExecArray | null;
  while ((match = withDollar.exec(text)) !== null) {
    const n = parseFloat(match[1].replace(/,/g, ""));
    if (!Number.isNaN(n) && n >= 0 && n < 1e6) amounts.push(n);
  }
  const lineEndPrice = /(\d+\.\d{2})\s*$/gm;
  while ((match = lineEndPrice.exec(text)) !== null) {
    const n = parseFloat(match[1]);
    if (!Number.isNaN(n) && n >= 0.01 && n < 1e5 && !amounts.includes(n)) amounts.push(n);
  }
  return amounts.sort((a, b) => a - b);
}

/** Exclude amounts that look like receipt IDs, SKUs, or implausible totals. */
function filterPlausibleTotals(amounts: number[]): number[] {
  return amounts.filter((a) => {
    if (a <= 0 || a > 5000) return false;
    if (a >= 100 && a === Math.floor(a)) return false;
    return true;
  });
}

/**
 * Scan raw receipt text and return extracted store, total, date.
 * Total: prefer line containing TOTAL/AMOUNT DUE; else largest plausible currency value.
 */
export function parseReceiptText(rawText: string): LocalParseResult {
  if (!rawText || typeof rawText !== "string") {
    return { locallyVerified: false };
  }
  const trimmed = rawText.trim();
  if (!trimmed.length) return { locallyVerified: false };

  const storeName = extractStoreName(trimmed);
  const date = extractDate(trimmed);
  const totalFromPattern = extractTotalFromPatterns(trimmed);
  const amounts = extractCurrencyAmounts(trimmed);
  const plausible = filterPlausibleTotals(amounts);
  const total =
    totalFromPattern ??
    (plausible.length > 0 ? plausible[plausible.length - 1] : amounts.length > 0 ? amounts[amounts.length - 1] : undefined);

  const locallyVerified = !!(storeName && total !== undefined && total > 0);
  return {
    storeName: storeName || undefined,
    total,
    date,
    locallyVerified,
  };
}
