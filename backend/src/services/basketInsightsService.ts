import { prisma } from "../lib/db";
import { optimizeBasket } from "./optimizationService";
import { getEssentialCategoriesForPriceTracking } from "../config/categories";
import {
  normalizeName,
  matchBasketToReceiptName,
  receiptLineMatchesBasketItem,
} from "./basketMatcherEngine";
import { getItemWhereForUserReceipts, getReceiptWhereForUser } from "./basketReceiptScope";

const MULTI_STORE_SAVINGS_ABSOLUTE = Number(process.env.MULTI_STORE_SAVINGS_ABSOLUTE) || 10;
const MULTI_STORE_SAVINGS_PERCENT = Number(process.env.MULTI_STORE_SAVINGS_PERCENT) || 5;

/** Radius in km for "nearby community" pricing (configurable). */
const COMMUNITY_RADIUS_KM = Number(process.env.COMMUNITY_RADIUS_KM) || 30;

/** Minimum basket items required before we recommend a specific store (avoid thin data). */
const MIN_BASKET_ITEMS_FOR_STORE = 1;

/** Haversine distance in km between two points. */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
/** Minimum fraction of basket items that must have price data for a full (non-partial) recommendation (0–1). */
const MIN_COVERAGE_RATIO = 0.33;
const FALLBACK_MESSAGE = "Don't have best pick yet 🥶";

// #region agent log
function debugLog(hypothesisId: string, message: string, data: Record<string, unknown>) {
  try {
    const f = (globalThis as unknown as { fetch?: typeof fetch }).fetch;
    if (typeof f !== "function") return;
    f("http://127.0.0.1:7261/ingest/eb273f8c-3496-4ab0-bbc2-95ac1e39d959", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6bad93" },
      body: JSON.stringify({
        sessionId: "6bad93",
        location: "basketInsightsService.ts",
        runId: "baseline",
        hypothesisId,
        message,
        data,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}
// #endregion

function buildWhyNoRecommendation(
  itemNames: string[],
  itemsMatched: number,
  hasEnoughItems: boolean,
  hasEnoughCoverage: boolean,
  bestResult: unknown,
  hasReceiptLineHistory: boolean
): string {
  if (itemNames.length < MIN_BASKET_ITEMS_FOR_STORE)
    return "Add at least one item to get a store recommendation.";
  if (itemsMatched === 0) {
    if (!hasReceiptLineHistory) {
      return `We need prices from your receipts. Scan receipts with items like "${itemNames.slice(0, 3).join('", "')}", then try again.`;
    }
    return `We couldn't match these lines to your receipt history (${itemNames.slice(0, 3).join(", ")}…). Try wording closer to a past receipt, or shorter words like milk, eggs, bread.`;
  }
  if (!hasEnoughCoverage)
    return `We have prices for ${itemsMatched} of ${itemNames.length} basket lines. Add more receipts or narrow names to match what you usually buy.`;
  if (!bestResult) {
    if (itemsMatched > 0 && hasReceiptLineHistory) {
      return "Some items match your receipts, but no store in your history has enough of them priced together for a confident single-store trip. Try fewer items or more receipts from one store.";
    }
    return "No store in your history covers this full basket yet. Try fewer items or scan more receipts from one store.";
  }
  return FALLBACK_MESSAGE;
}

export interface BasketInsightsRequest {
  itemNames: string[];
  lat?: number;
  lng?: number;
  locationAccuracy?: "precise" | "approximate" | null;
}

export interface BestStoreBlock {
  enabled: boolean;
  confidence: number;
  storeName?: string | null;
  storeAddress?: string | null;
  storeArea?: string | null;
  fallbackMessage?: string | null;
  /** When disabled: why we couldn't recommend (actionable message). */
  whyNoRecommendation?: string | null;
  /** When enabled but partial: short hint (e.g. how many items priced at this store). */
  partialNote?: string | null;
  /** Human-readable evidence summary for the chosen store. */
  evidenceSummary?: string | null;
  /** strong = mostly high-confidence line matches; mixed / weak otherwise */
  matchQuality?: "strong" | "mixed" | "weak";
  /** Number of basket items we have price data for. */
  itemsMatchedCount?: number;
  /** Total basket items. */
  itemsTotalCount?: number;
}

export interface BestTotalStoreSection {
  storeName: string;
  estimatedTotal: number;
  storeAddress?: string | null;
  storeArea?: string | null;
}

export interface YourHistoryEntry {
  itemName: string;
  /** Matched receipt line (e.g. "Milk 2% 1L") for display as "milk → Milk 2% 1L at Store X". */
  matchedReceiptItemName?: string | null;
  storeName: string;
  unitPrice: number;
  unit?: string;
}

export interface GroupPriceEntry {
  id: string;
  canonicalItemName?: string;
  rawItemName: string;
  canonicalStoreName?: string | null;
  rawStoreName?: string | null;
  storeName?: string | null;
  price: number;
  normalizedUnitPrice?: number | null;
  createdByUser?: { id: string; name: string };
}

export interface SharedFriendPriceEntry {
  id: string;
  canonicalItemName?: string;
  rawItemName: string;
  canonicalStoreName?: string | null;
  rawStoreName?: string | null;
  storeName?: string | null;
  price: number;
  normalizedUnitPrice?: number | null;
  createdByUser?: { id: string; name: string };
}

export interface NearbyCommunityAverageEntry {
  canonicalItemName: string;
  canonicalStoreName?: string | null;
  regionBucket: string;
  averagePrice: number;
  lowestPrice: number;
  highestPrice: number;
  dataPointCount: number;
}

export interface MultiStoreStore {
  storeName: string;
  storeAddress?: string | null;
  storeArea?: string | null;
  items: { itemName: string; quantity: number; unitPrice: number; totalPrice: number }[];
  estimatedSubtotal: number;
}

export interface MultiStoreRecommendationSection {
  enabled: boolean;
  stores?: MultiStoreStore[];
  combinedTotal?: number;
  savingsVsBestSingleStore?: number;
  reasonShown?: string;
}

export interface TopSpendCategory {
  name: string;
  amount: number;
}

export interface BasketInsightsResponse {
  estimatedTotalKnownData: number;
  bestStore: BestStoreBlock;
  bestTotalStore: BestTotalStoreSection | null;
  yourHistory: YourHistoryEntry[];
  /** Basket lines that matched at least one receipt line (same rules as coverage). */
  matchedBasketLines?: string[];
  /** Basket lines with no receipt match (refinement targets). */
  unmatchedBasketLines?: string[];
  /** Number of receipts used for insights (for "Based on X receipts"). */
  receiptCount?: number;
  groupPrices: GroupPriceEntry[];
  sharedFriendPrices: SharedFriendPriceEntry[];
  nearbyCommunityAverage: NearbyCommunityAverageEntry[] | null;
  multiStoreRecommendation: MultiStoreRecommendationSection;
  topSpendCategories: TopSpendCategory[];
}

function itemMatchesBasket(normalizedItem: string, basketNorm: string[]): boolean {
  return basketNorm.some((b) => normalizedItem.includes(b) || b.includes(normalizedItem));
}

/** How many basket lines have at least one matching receipt item (per basket item, not distinct receipt rows). */
function countBasketItemsWithReceiptMatch(
  basketNorm: string[],
  historicalItems: { name: string }[]
): number {
  let n = 0;
  for (const b of basketNorm) {
    const hit = historicalItems.some((it) => receiptLineMatchesBasketItem(b, it));
    if (hit) n++;
  }
  return n;
}

function partitionBasketLinesByReceiptMatch(
  itemNames: string[],
  basketNorm: string[],
  historicalItems: { name: string }[]
): { matched: string[]; unmatched: string[] } {
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (let i = 0; i < itemNames.length; i++) {
    const norm = basketNorm[i] ?? normalizeName(itemNames[i] ?? "");
    const hit = historicalItems.some((it) => receiptLineMatchesBasketItem(norm, it));
    if (hit) matched.push(itemNames[i]);
    else unmatched.push(itemNames[i]);
  }
  return { matched, unmatched };
}

/** Top spending categories from user's receipt items (category -> sum totalPrice). */
async function getTopSpendCategories(userId: string, limit: number): Promise<TopSpendCategory[]> {
  const itemWhere = await getItemWhereForUserReceipts(userId);
  const items = await prisma.item.findMany({
    where: itemWhere,
    select: { category: true, totalPrice: true },
  });
  const byCategory = new Map<string, number>();
  for (const it of items) {
    const cat = (it.category ?? "Other").trim() || "Other";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number(it.totalPrice) || 0);
  }
  return [...byCategory.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/**
 * Orchestrate basket insights: confidence-aware best store, estimated total from known data only,
 * your history, group, shared, nearby community, optional multi-store, and top spend categories.
 */
export async function getBasketInsights(
  userId: string,
  req: BasketInsightsRequest
): Promise<BasketInsightsResponse> {
  const itemNames = Array.isArray(req.itemNames)
    ? req.itemNames.map((n) => (typeof n === "string" ? n.trim() : "")).filter(Boolean)
    : [];
  const basketNorm = itemNames.map(normalizeName);

  const topSpendCategories = await getTopSpendCategories(userId, 6);

  const receiptWhereForUser = await getReceiptWhereForUser(userId);
  const receiptCountForEmpty = await prisma.receipt.count({ where: receiptWhereForUser });
  const emptyResponse: BasketInsightsResponse = {
    estimatedTotalKnownData: 0,
    bestStore: { enabled: false, confidence: 0, fallbackMessage: FALLBACK_MESSAGE, whyNoRecommendation: "Add at least one item to get a store recommendation.", itemsTotalCount: 0, itemsMatchedCount: 0 },
    bestTotalStore: null,
    yourHistory: [],
    matchedBasketLines: [],
    unmatchedBasketLines: [],
    receiptCount: receiptCountForEmpty,
    groupPrices: [],
    sharedFriendPrices: [],
    nearbyCommunityAverage: null,
    multiStoreRecommendation: { enabled: false },
    topSpendCategories,
  };

  if (itemNames.length === 0) return emptyResponse;

  const response: BasketInsightsResponse = {
    estimatedTotalKnownData: 0,
    bestStore: { enabled: false, confidence: 0, fallbackMessage: FALLBACK_MESSAGE },
    bestTotalStore: null,
    yourHistory: [],
    matchedBasketLines: [],
    unmatchedBasketLines: [],
    groupPrices: [],
    sharedFriendPrices: [],
    nearbyCommunityAverage: null,
    multiStoreRecommendation: { enabled: false },
    topSpendCategories,
  };

  // 2. Your history: from user's receipt items matching basket (own + household receipts)
  const itemWhereScoped = await getItemWhereForUserReceipts(userId);
  const historicalItems = await prisma.item.findMany({
    where: itemWhereScoped,
    include: { receipt: { include: { store: true } } },
  });

  // #region agent log
  debugLog("H1", "historical items loaded", {
    userIdPresent: Boolean(userId),
    basketItemCount: itemNames.length,
    historicalItemCount: historicalItems.length,
    sampleReceiptCount: new Set(historicalItems.map((it) => it.receiptId)).size,
  });
  // #endregion

  const receiptIds = new Set(historicalItems.map((it) => it.receiptId));
  response.receiptCount = receiptIds.size;

  const partition = partitionBasketLinesByReceiptMatch(itemNames, basketNorm, historicalItems);
  response.matchedBasketLines = partition.matched;
  response.unmatchedBasketLines = partition.unmatched;
  const hasReceiptLineHistory = historicalItems.length > 0;

  const byProduct = new Map<string, { storeName: string; unitPrice: number; unit: string; matchedReceiptItemName: string }>();
  for (const it of historicalItems) {
    const key = normalizeName(it.name);
    const matches = basketNorm.some((b) => receiptLineMatchesBasketItem(b, it));
    if (!matches) continue;
    const entry = {
      storeName: it.receipt.store.name,
      unitPrice: it.unitPrice,
      unit: it.unit ?? "item",
      matchedReceiptItemName: it.name,
    };
    const cur = byProduct.get(key);
    if (!cur || it.unitPrice < cur.unitPrice) byProduct.set(key, entry);
  }
  response.yourHistory = [...byProduct.entries()].map(([itemName, v]) => ({
    itemName,
    matchedReceiptItemName: v.matchedReceiptItemName,
    storeName: v.storeName,
    unitPrice: v.unitPrice,
    unit: v.unit,
  }));

  // Estimated total from known data only (sum of best known price per matched basket item; quantity 1 per item)
  let estimatedFromKnown = 0;
  for (const [itemName, v] of byProduct) {
    const qty = 1;
    estimatedFromKnown += v.unitPrice * qty;
  }
  response.estimatedTotalKnownData = Math.round(estimatedFromKnown * 100) / 100;

  const itemsMatched = countBasketItemsWithReceiptMatch(basketNorm, historicalItems);
  const coverageRatio = itemNames.length > 0 ? itemsMatched / itemNames.length : 0;

  // #region agent log
  if (itemNames.length > 0 && historicalItems.length > 0) {
    const sample = historicalItems.slice(0, 800).map((x) => x.name);
    const perBasket = itemNames.slice(0, 12).map((raw) => {
      const best: { score: number; tier: "strong" | "medium" | "weak"; receiptName: string; reasons: string[] } = {
        score: 0,
        tier: "weak",
        receiptName: "",
        reasons: [],
      };
      for (const rn of sample) {
        const d = matchBasketToReceiptName(raw, rn);
        if (d.score > best.score) {
          best.score = d.score;
          best.tier = d.tier;
          best.receiptName = rn;
          best.reasons = d.reasons;
        }
      }
      return { basket: raw, best };
    });
    debugLog("H1", "coverage summary", {
      itemsMatched,
      basketItemCount: itemNames.length,
      coverageRatio,
      matchedBasketLines: partition.matched.slice(0, 8),
      unmatchedBasketLines: partition.unmatched.slice(0, 8),
      bestPerBasket: perBasket,
    });
  }
  // #endregion

  // 1. Best total store: full match when coverage is strong; else partial (store with most items in your history).
  let tempListId: string | null = null;
  try {
    const list = await prisma.smartList.create({
      data: { userId, name: "Basket insights temp" },
    });
    tempListId = list.id;
    await prisma.smartListItem.createMany({
      data: itemNames.map((name) => ({ smartListId: list.id, name, quantity: 1 })),
    });
    const bestResult = await optimizeBasket(userId, list.id);

    const hasEnoughItems = itemNames.length >= MIN_BASKET_ITEMS_FOR_STORE;
    const hasEnoughCoverage = coverageRatio >= MIN_COVERAGE_RATIO;
    /** If the optimizer found a full basket at one store, that is authoritative (coverage ratio uses the same matcher but must not block this). */
    const fullRecommendation =
      !!bestResult && !bestResult.partialMatch && hasEnoughItems;
    const partialRecommendation =
      !!bestResult &&
      bestResult.partialMatch === true &&
      (bestResult.itemsCoveredAtStore ?? 0) > 0;

    if (bestResult && (fullRecommendation || partialRecommendation)) {
      response.bestStore = {
        enabled: true,
        confidence: coverageRatio,
        storeName: bestResult.bestStoreName,
        storeAddress: bestResult.bestStoreAddress ?? undefined,
        storeArea: bestResult.bestStoreAddress ? undefined : "in your area",
        fallbackMessage: undefined,
        whyNoRecommendation: undefined,
        partialNote: bestResult.partialMatch
          ? `${bestResult.itemsCoveredAtStore} of ${itemNames.length} items priced at this store in your history. Est. total is for those items only.`
          : undefined,
        evidenceSummary: bestResult.evidenceSummary ?? undefined,
        matchQuality: bestResult.matchQuality ?? undefined,
        itemsMatchedCount: itemsMatched,
        itemsTotalCount: itemNames.length,
      };
      response.bestTotalStore = {
        storeName: bestResult.bestStoreName,
        estimatedTotal: bestResult.estimatedTotal,
        storeAddress: bestResult.bestStoreAddress ?? undefined,
        storeArea: bestResult.bestStoreAddress ? undefined : "in your area",
      };
      response.estimatedTotalKnownData = Math.round(bestResult.estimatedTotal * 100) / 100;
    } else {
      response.bestStore = {
        enabled: false,
        confidence: coverageRatio,
        fallbackMessage: FALLBACK_MESSAGE,
        whyNoRecommendation: buildWhyNoRecommendation(
          itemNames,
          itemsMatched,
          hasEnoughItems,
          hasEnoughCoverage,
          bestResult,
          hasReceiptLineHistory
        ),
        itemsMatchedCount: itemsMatched,
        itemsTotalCount: itemNames.length,
      };
      response.bestTotalStore = null;
    }
  } finally {
    if (tempListId) {
      await prisma.smartListItem.deleteMany({ where: { smartListId: tempListId } });
      await prisma.smartList.delete({ where: { id: tempListId } }).catch(() => {});
    }
  }

  // 3. Group prices
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId).filter(Boolean);
  const essentialList = [...getEssentialCategoriesForPriceTracking()];
  const essentialFilter =
    essentialList.length > 0 ? { itemCategory: { in: essentialList } } : {};
  if (groupIds.length > 0) {
    const records = await prisma.priceRecord.findMany({
      where: { groupId: { in: groupIds }, shareMode: "GROUP", ...essentialFilter },
      orderBy: { purchaseDate: "desc" },
      take: 200,
      include: { createdBy: { select: { id: true, name: true, displayName: true } } },
    });
    const filtered = records.filter((r) => {
      const name = normalizeName((r.canonicalItemName ?? r.rawItemName ?? "").trim());
      return name && itemMatchesBasket(name, basketNorm);
    });
    response.groupPrices = filtered.map((r) => ({
      id: r.id,
      canonicalItemName: r.canonicalItemName ?? undefined,
      rawItemName: r.rawItemName,
      canonicalStoreName: r.canonicalStoreName ?? r.storeName ?? undefined,
      rawStoreName: r.rawStoreName ?? undefined,
      storeName: r.storeName ?? undefined,
      price: r.price,
      normalizedUnitPrice: r.normalizedUnitPrice ?? undefined,
      createdByUser: r.createdBy
        ? { id: r.createdBy.id, name: r.createdBy.name ?? r.createdBy.displayName ?? "Unknown" }
        : undefined,
    }));
  }

  // 4. Shared friend prices
  const permissions = await prisma.priceSharePermission.findMany({
    where: { targetUserId: userId, revokedAt: null },
  });
  const ownerIds = [...new Set(permissions.map((p) => p.ownerUserId))];
  if (ownerIds.length > 0) {
    const records = await prisma.priceRecord.findMany({
      where: { ownerUserId: { in: ownerIds }, shareMode: "PRIVATE", ...essentialFilter },
      orderBy: { purchaseDate: "desc" },
      take: 200,
      include: { createdBy: { select: { id: true, name: true, displayName: true } } },
    });
    const filtered = records.filter((r) => {
      const name = normalizeName((r.canonicalItemName ?? r.rawItemName ?? "").trim());
      return name && itemMatchesBasket(name, basketNorm);
    });
    response.sharedFriendPrices = filtered.map((r) => ({
      id: r.id,
      canonicalItemName: r.canonicalItemName ?? undefined,
      rawItemName: r.rawItemName,
      canonicalStoreName: r.canonicalStoreName ?? r.storeName ?? undefined,
      rawStoreName: r.rawStoreName ?? undefined,
      storeName: r.storeName ?? undefined,
      price: r.price,
      normalizedUnitPrice: r.normalizedUnitPrice ?? undefined,
      createdByUser: r.createdBy
        ? { id: r.createdBy.id, name: r.createdBy.name ?? r.createdBy.displayName ?? "Unknown" }
        : undefined,
    }));
  }

  // 5. Nearby community average: only PriceRecords with lat/lng within COMMUNITY_RADIUS_KM (e.g. 30km)
  if (
    req.lat != null &&
    req.lng != null &&
    typeof req.lat === "number" &&
    typeof req.lng === "number" &&
    !Number.isNaN(req.lat) &&
    !Number.isNaN(req.lng)
  ) {
    const essentialSet = getEssentialCategoriesForPriceTracking();
    const essentialList = essentialSet.size > 0 ? [...essentialSet] : null;
    const communityRecords = await prisma.priceRecord.findMany({
      where: {
        shareMode: "COMMUNITY",
        lat: { not: null },
        lng: { not: null },
        normalizedUnitPrice: { not: null },
        canonicalItemName: { not: null },
        ...(essentialList != null && essentialList.length > 0
          ? { itemCategory: { in: essentialList } }
          : {}),
      },
      select: {
        canonicalItemName: true,
        canonicalStoreName: true,
        normalizedUnitPrice: true,
        lat: true,
        lng: true,
      },
    });
    const userLat = req.lat;
    const userLng = req.lng;
    const withinRadius = communityRecords.filter((r) => {
      const lat = r.lat ?? 0;
      const lng = r.lng ?? 0;
      return haversineKm(userLat, userLng, lat, lng) <= COMMUNITY_RADIUS_KM;
    });
    const byKey = new Map<
      string,
      { canonicalItemName: string; canonicalStoreName: string | null; prices: number[] }
    >();
    for (const r of withinRadius) {
      const price = r.normalizedUnitPrice;
      if (price == null || !Number.isFinite(price) || price <= 0) continue;
      const item = (r.canonicalItemName ?? "").trim() || null;
      const store = (r.canonicalStoreName ?? "").trim() || null;
      if (!item) continue;
      const key = `${item}\t${store ?? ""}`;
      if (!byKey.has(key)) {
        byKey.set(key, { canonicalItemName: item, canonicalStoreName: store || null, prices: [] });
      }
      byKey.get(key)!.prices.push(price);
    }
    const aggregated = [...byKey.entries()]
      .map(([, g]) => ({
        canonicalItemName: g.canonicalItemName,
        canonicalStoreName: g.canonicalStoreName,
        averagePrice: g.prices.reduce((a, b) => a + b, 0) / g.prices.length,
        lowestPrice: Math.min(...g.prices),
        highestPrice: Math.max(...g.prices),
        dataPointCount: g.prices.length,
      }))
      .filter((a) => itemMatchesBasket(normalizeName(a.canonicalItemName), basketNorm));
    response.nearbyCommunityAverage = aggregated.map((a) => ({
      canonicalItemName: a.canonicalItemName,
      canonicalStoreName: a.canonicalStoreName ?? undefined,
      regionBucket: `Within ${COMMUNITY_RADIUS_KM} km`,
      averagePrice: a.averagePrice,
      lowestPrice: a.lowestPrice,
      highestPrice: a.highestPrice,
      dataPointCount: a.dataPointCount,
    }));
  }

  // 6. Multi-store: only when confidence is strong (reuse same threshold)
  response.multiStoreRecommendation = {
    enabled: false,
    reasonShown: response.bestStore.enabled ? "Not computed" : "Insufficient data for split",
  };

  return response;
}
