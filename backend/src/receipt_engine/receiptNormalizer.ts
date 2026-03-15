/**
 * Receipt Intelligence Engine – Normalizer.
 * Lowercase, remove symbols, split into lines, normalize currency.
 */

export interface NormalizedReceipt {
  /** Original raw text (trimmed). */
  raw: string;
  /** Lowercase, symbol-stripped lines (non-empty). */
  lines: string[];
  /** Currency amounts found in text: e.g. "12.99" -> 12.99. */
  amounts: number[];
}

/** Only match amounts with exactly two decimal places (X.XX). Excludes SKU/product codes like 1045625, 1428777. */
const PRICE_REGEX = /\$?\s*(\d{1,6}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\b/g;

/**
 * Normalize currency string to number (strip $ and commas).
 */
function parseAmount(match: string): number {
  const cleaned = match.replace(/[$,]/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Strip most symbols for matching; keep letters, digits, spaces, and one dot for decimals.
 */
function stripSymbols(line: string): string {
  return line
    .replace(/[^\w\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize receipt text: lowercase, remove symbols, split into lines, extract currency amounts.
 */
export function normalizeReceiptText(rawText: string): NormalizedReceipt {
  if (!rawText || typeof rawText !== "string") {
    return { raw: "", lines: [], amounts: [] };
  }
  const raw = rawText.trim();
  const lines = raw
    .split(/\r?\n/)
    .map((l) => stripSymbols(l).toLowerCase())
    .filter((l) => l.length > 0);

  const amounts: number[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(PRICE_REGEX.source, "g");
  while ((m = re.exec(raw)) !== null) {
    const str = (m[1] ?? m[0]).trim();
    const num = parseAmount(str);
    if (num > 0 && num < 1e5) amounts.push(num);
  }
  amounts.sort((a, b) => a - b);

  return { raw, lines, amounts };
}
