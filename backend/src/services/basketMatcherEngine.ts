/**
 * Single shared matcher for basket ↔ receipt lines (suggestions, insights coverage, optimizer).
 * Weighted scoring: exact / core / family / alias / substring / token overlap.
 */

export type MatchTier = "strong" | "medium" | "weak";

export interface MatchDetail {
  /** 0–1 overall match strength */
  score: number;
  tier: MatchTier;
  reasons: string[];
  /** Canonical family id when detected (e.g. milk, chips) */
  family?: string;
}

/**
 * Minimum score for coverage counts, suggestions, and optimizer line prices — keep one threshold
 * so “matched in history” and “priced at store” stay aligned.
 */
export const MATCH_THRESHOLD_COVERAGE = 0.18;
export const MATCH_THRESHOLD_PRICE = MATCH_THRESHOLD_COVERAGE;

const TIER_STRONG = 0.62;
const TIER_MEDIUM = 0.42;

/** Lean family keywords → family id. Extend over time. */
export const ITEM_FAMILIES: Record<string, { id: string; keywords: string[] }> = {
  milk: {
    id: "milk",
    keywords: [
      "milk",
      "mlk",
      "lait",
      "dairy beverage",
      "lactose free milk",
      "oat milk",
      "almond milk",
      "soy milk",
      "homo milk",
      "org homo",
      "homo",
      "homogenized",
      "2% milk",
      "1% milk",
      "skim milk",
      "whole milk",
    ],
  },
  chips: {
    id: "chips",
    keywords: [
      "chips",
      "chip",
      "crisp",
      "crisps",
      "potato chip",
      "potato chips",
      "lays",
      "lay's",
      "doritos",
      "ruffles",
      "kettle chip",
      "tortilla chip",
      "tortilla chips",
      "croustilles",
    ],
  },
  bread: {
    id: "bread",
    keywords: [
      "bread",
      "baguette",
      "bun",
      "buns",
      "roll",
      "rolls",
      "tortilla",
      "pita",
      "naan",
      "pain",
      "loaf",
      "wheat bread",
      "white bread",
      "whole wheat",
      "sliced bread",
    ],
  },
  yogurt: {
    id: "yogurt",
    keywords: ["yogurt", "yoghurt", "greek yogurt", "skyr"],
  },
  eggs: {
    id: "eggs",
    keywords: ["egg", "eggs", "dozen"],
  },
  soda: {
    id: "soda",
    keywords: ["coke", "coca cola", "pepsi", "sprite", "cola", "soft drink", "ginger ale"],
  },
  bananas: {
    id: "bananas",
    keywords: ["banana", "bananas", "plantain"],
  },
};

/** Brand / synonym hints (basket fragment → boosts when present on receipt) */
const ALIAS_GROUPS: string[][] = [
  ["coke", "coca cola", "coca-cola", "cola"],
  ["pepsi", "pepsi cola"],
  ["diet coke", "coke zero", "coca-cola zero"],
  ["2% milk", "2 %", "2%"],
  ["whole milk", "homogenized milk", "3.25%"],
  ["skim milk", "nonfat milk", "0% milk"],
];

/** Lowercase, trim, drop common OCR / POS noise so "Milk" and "*** MLK 2L ***" can align. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[*•·#|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripSizeAndUnits(normalized: string): string {
  return normalized
    .replace(/\b\d*\.?\d+\s*(l|liter|litre|ml|g|kg|lb|oz|mg)\b/gi, " ")
    .replace(/\b\d+%\s*/g, " ")
    .replace(/\b(organic|whole|skim|2%|1%|fat\s*free|low\s*fat|large|medium|small|dozen|pack|ct|pk|ea)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || normalized;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match keyword against receipt/basket text; long phrases use substring, short tokens use word boundaries. */
function keywordMatchesNorm(norm: string, keyword: string): boolean {
  const k = keyword.toLowerCase();
  const n = norm.toLowerCase();
  if (k.length === 0) return false;
  if (k.includes(" ") || k.includes("'") || k.length >= 6) {
    return n.includes(k);
  }
  if (k.length <= 2) {
    return n.includes(k);
  }
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(k)}([^a-z0-9]|$)`, "i");
  return re.test(n);
}

function collectKeywordsSorted(): { id: string; k: string }[] {
  const rows: { id: string; k: string }[] = [];
  for (const def of Object.values(ITEM_FAMILIES)) {
    for (const k of def.keywords) {
      rows.push({ id: def.id, k });
    }
  }
  rows.sort((a, b) => b.k.length - a.k.length);
  return rows;
}

const SORTED_FAMILY_KEYWORDS: { id: string; k: string }[] = collectKeywordsSorted();

function detectFamily(norm: string): string | null {
  for (const { id, k } of SORTED_FAMILY_KEYWORDS) {
    if (keywordMatchesNorm(norm, k)) return id;
  }
  return null;
}

/** Public: map a receipt line description to a staple family id (milk, eggs, bread, …) or null. */
export function detectItemFamilyId(rawName: string): string | null {
  const norm = normalizeName(rawName);
  return detectFamily(norm);
}

/** Receipt line contains any keyword for this family (for head-term basket + noisy OCR). */
function receiptLineHasFamilyId(norm: string, familyId: string): boolean {
  const def = Object.values(ITEM_FAMILIES).find((d) => d.id === familyId);
  if (!def) return false;
  const sorted = [...def.keywords].sort((a, b) => b.length - a.length);
  return sorted.some((kw) => keywordMatchesNorm(norm, kw));
}

/** Try plural/singular and common short basket forms. */
function basketSearchVariants(normalizedBasket: string): string[] {
  const u = new Set<string>([normalizedBasket]);
  const parts = normalizedBasket.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const w = parts[0];
    if (w.length >= 4 && w.endsWith("s") && !w.endsWith("ss")) {
      u.add(w.slice(0, -1));
    }
    const map: Record<string, string> = {
      chips: "chip",
      eggs: "egg",
      bananas: "banana",
      breads: "bread",
    };
    if (map[w]) u.add(map[w]);
  }
  return [...u];
}

function aliasOverlapScore(b: string, r: string): number {
  let best = 0;
  for (const group of ALIAS_GROUPS) {
    const bh = group.filter((g) => b.includes(g));
    const rh = group.filter((g) => r.includes(g));
    if (bh.length && rh.length) {
      const overlap = bh.some((x) => rh.includes(x));
      if (overlap) best = Math.max(best, 0.52);
    }
  }
  return best;
}

/**
 * Core scorer for normalized basket phrase `b` vs receipt line `r`.
 */
function matchBasketToReceiptNameCore(b: string, r: string): MatchDetail {
  const reasons: string[] = [];
  if (b === r) {
    return { score: 1, tier: "strong", reasons: ["exact_normalized"] };
  }

  const bCore = stripSizeAndUnits(b);
  const rCore = stripSizeAndUnits(r);
  if (bCore.length >= 2 && bCore === rCore) {
    return { score: 0.95, tier: "strong", reasons: ["stripped_equivalent"] };
  }

  const famB = detectFamily(b);
  const famR = detectFamily(r);
  let familyBoost = 0;
  let family: string | undefined;
  if (famB && famR && famB === famR) {
    familyBoost = 0.14;
    family = famB;
    reasons.push("same_family");
  } else if (famB && famR && famB !== famR) {
    familyBoost = 0.04;
    reasons.push("related_family");
  }

  let sub = 0;
  if (r.includes(b) || b.includes(r)) {
    sub = Math.max(sub, 0.68);
    reasons.push("substring");
  }
  if (bCore.length >= 2 && (r.includes(bCore) || b.includes(rCore) || rCore.includes(bCore) || bCore.includes(rCore))) {
    sub = Math.max(sub, 0.58);
    reasons.push("core_substring");
  }

  const basketTokens = bCore.split(/\s+/).filter((t) => t.length >= 2);
  let tokenScore = 0;
  if (basketTokens.length > 0) {
    const hits = basketTokens.filter((t) => r.includes(t) || rCore.includes(t)).length;
    tokenScore = (hits / basketTokens.length) * 0.48;
    if (tokenScore > 0.05) reasons.push("token_overlap");
  }

  const aliasSc = aliasOverlapScore(b, r);
  if (aliasSc > 0) reasons.push("alias");

  let score = Math.max(sub, tokenScore, aliasSc) + familyBoost;

  /** Short brand shorthands → common receipt wording */
  if (b === "coke" && (r.includes("coca") || r.includes("cola"))) {
    score = Math.max(score, 0.58);
    reasons.push("brand_soda_bridge");
  }
  if (b === "pepsi" && r.includes("pepsi")) {
    score = Math.max(score, 0.62);
    reasons.push("brand_pepsi");
  }

  /** Head-term basket (e.g. "milk") + receipt line contains any milk keyword (incl. OCR / bilingual). */
  const famHead = detectFamily(b);
  if (famHead && score < 0.42 && receiptLineHasFamilyId(r, famHead)) {
    score = Math.max(score, 0.42);
    reasons.push("family_keyword_floor");
  }

  score = Math.min(1, score);

  const tier: MatchTier =
    score >= TIER_STRONG ? "strong" : score >= TIER_MEDIUM ? "medium" : "weak";

  return { score, tier, reasons: reasons.length ? reasons : ["weak_signal"], family };
}

/**
 * Score how well a basket phrase matches a receipt line name.
 * Tries plural/singular variants of short basket lines (chips → chip).
 */
export function matchBasketToReceiptName(basketRaw: string, receiptRaw: string): MatchDetail {
  const r = normalizeName(receiptRaw);
  if (!r.length) {
    return { score: 0, tier: "weak", reasons: ["empty"] };
  }
  const b0 = normalizeName(basketRaw);
  if (!b0.length) {
    return { score: 0, tier: "weak", reasons: ["empty"] };
  }

  const variants = basketSearchVariants(b0);
  let best: MatchDetail | null = null;
  for (const b of variants) {
    const d = matchBasketToReceiptNameCore(b, r);
    if (!best || d.score > best.score) best = d;
  }
  return best ?? { score: 0, tier: "weak", reasons: ["weak_signal"] };
}

export function receiptLineMatchesBasketLineForCoverage(basketNorm: string, receiptName: string): boolean {
  const d = matchBasketToReceiptName(basketNorm, receiptName);
  return d.score >= MATCH_THRESHOLD_COVERAGE;
}

/** Used by basketInsightsService partition & counts — basket line vs Item row */
export function receiptLineMatchesBasketItem(
  basketNorm: string,
  item: { name: string }
): boolean {
  return receiptLineMatchesBasketLineForCoverage(basketNorm, item.name);
}

export function tierToNumericWeight(tier: MatchTier): number {
  switch (tier) {
    case "strong":
      return 1;
    case "medium":
      return 0.72;
    case "weak":
      return 0.45;
    default:
      return 0.4;
  }
}
