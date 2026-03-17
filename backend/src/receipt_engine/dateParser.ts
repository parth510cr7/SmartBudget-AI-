/**
 * Receipt date parsing: multiple formats and validation.
 * Stores use different date formats (US MM/DD/YYYY, EU DD/MM/YYYY, etc.).
 * We try several formats, validate the date is plausible, and return YYYY-MM-DD or undefined.
 */

/** Reasonable receipt date: not before this year - 2, not more than 1 day in future. */
const MIN_YEAR = new Date().getFullYear() - 2;
const MAX_DAYS_FUTURE = 1;

function toDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function isValidReceiptDate(d: Date): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const maxFuture = new Date(today);
  maxFuture.setDate(maxFuture.getDate() + MAX_DAYS_FUTURE);
  if (d > maxFuture) return false;
  if (d.getFullYear() < MIN_YEAR) return false;
  return true;
}

/**
 * Parse a date string with multiple format attempts. Returns YYYY-MM-DD or undefined.
 * Tries: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, DD-MM-YYYY, MM-DD-YYYY, and 2-digit year.
 */
export function parseReceiptDate(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;

  const candidates: { y: number; m: number; d: number }[] = [];

  // ISO-style YYYY-MM-DD or YYYY/MM/DD
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    candidates.push({ y: parseInt(iso[1], 10), m: parseInt(iso[2], 10), d: parseInt(iso[3], 10) });
  }

  // MM/DD/YYYY or MM-DD-YYYY (US)
  const us = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (us) {
    const y = us[3].length === 2 ? (parseInt(us[3], 10) <= 50 ? 2000 + parseInt(us[3], 10) : 1900 + parseInt(us[3], 10)) : parseInt(us[3], 10);
    candidates.push({ y, m: parseInt(us[1], 10), d: parseInt(us[2], 10) });
  }

  // DD/MM/YYYY (EU/UK): same regex as US but month/day swapped
  const eu = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (eu && (eu[1] !== eu[2] || parseInt(eu[1], 10) > 12)) {
    const y = eu[3].length === 2 ? (parseInt(eu[3], 10) <= 50 ? 2000 + parseInt(eu[3], 10) : 1900 + parseInt(eu[3], 10)) : parseInt(eu[3], 10);
    candidates.push({ y, m: parseInt(eu[2], 10), d: parseInt(eu[1], 10) });
  }

  for (const { y, m, d } of candidates) {
    const date = toDate(y, m, d);
    if (date && isValidReceiptDate(date)) {
      const yy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    }
  }
  return undefined;
}

/**
 * Extract first plausible date from raw receipt text using common patterns.
 * Tries multiple patterns and validates before returning.
 */
export function extractReceiptDateFromText(raw: string): string | undefined {
  // ISO-style YYYY-MM-DD or YYYY/MM/DD
  const iso = raw.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    const parsed = parseReceiptDate(`${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`);
    if (parsed) return parsed;
  }

  // DD Mon YYYY or D Mon YYYY
  const textMonth = raw.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{2,4})\b/i);
  if (textMonth) {
    const months: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const mon = months[textMonth[2].toLowerCase().slice(0, 3)];
    let year = textMonth[3];
    if (year.length === 2) year = parseInt(year, 10) <= 50 ? `20${year}` : `19${year}`;
    const toParse = `${year}-${String(mon).padStart(2, "0")}-${textMonth[1].padStart(2, "0")}`;
    const parsed = parseReceiptDate(toParse);
    if (parsed) return parsed;
  }

  // MM/DD/YYYY or DD/MM/YYYY (try both)
  const slash = raw.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  if (slash) {
    const a = slash[1].padStart(2, "0");
    const b = slash[2].padStart(2, "0");
    const y = slash[3].length === 2 ? (parseInt(slash[3], 10) <= 50 ? `20${slash[3]}` : `19${slash[3]}`) : slash[3];
    const parsed = parseReceiptDate(`${a}-${b}-${y}`) ?? parseReceiptDate(`${b}-${a}-${y}`);
    if (parsed) return parsed;
  }
  return undefined;
}
