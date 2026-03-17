import { prisma } from "../lib/db";
import { optimizeBasket } from "./optimizationService";
import { getEssentialCategoriesForPriceTracking } from "../config/categories";

const MULTI_STORE_SAVINGS_ABSOLUTE = Number(process.env.MULTI_STORE_SAVINGS_ABSOLUTE) || 10;
const MULTI_STORE_SAVINGS_PERCENT = Number(process.env.MULTI_STORE_SAVINGS_PERCENT) || 5;

/** Radius in km for "nearby community" pricing (configurable). */
const COMMUNITY_RADIUS_KM = Number(process.env.COMMUNITY_RADIUS_KM) || 30;

/** Minimum basket items required before we recommend a specific store (avoid thin data). */
const MIN_BASKET_ITEMS_FOR_STORE = 2;

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
/** Minimum fraction of basket items that must have price data (0–1). */
const MIN_COVERAGE_RATIO = 0.5;
const FALLBACK_MESSAGE = "Don't have best pick yet 🥶";

function buildWhyNoRecommendation(
  itemNames: string[],
  itemsMatched: number,
  hasEnoughItems: boolean,
  hasEnoughCoverage: boolean,
  bestResult: unknown
): string {
  if (itemNames.length < MIN_BASKET_ITEMS_FOR_STORE)
    return "Add at least 2 items to get a store recommendation.";
  if (itemsMatched === 0)
    return `We need prices from your receipts. Scan receipts with items like "${itemNames.slice(0, 3).join('", "')}", then try again.`;
  if (!hasEnoughCoverage)
    return `We have prices for ${itemsMatched} of ${itemNames.length} items. Scan more receipts or use shorter names (e.g. milk, eggs).`;
  if (!bestResult)
    return "No single store has all these items in your history yet. Try fewer items or scan more receipts from one store.";
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
  /** Number of receipts used for insights (for "Based on X receipts"). */
  receiptCount?: number;
  groupPrices: GroupPriceEntry[];
  sharedFriendPrices: SharedFriendPriceEntry[];
  nearbyCommunityAverage: NearbyCommunityAverageEntry[] | null;
  multiStoreRecommendation: MultiStoreRecommendationSection;
  topSpendCategories: TopSpendCategory[];
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function stripSizeAndUnits(normalized: string): string {
  return normalized
    .replace(/\b\d*\.?\d+\s*(l|liter|litre|ml|g|kg|lb|oz|mg)\b/gi, " ")
    .replace(/\b\d+%\s*/g, " ")
    .replace(/\b(organic|whole|skim|2%|1%|fat\s*free|low\s*fat|large|medium|small|dozen|pack|ct|pk|ea)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || normalized;
}

function itemMatchesBasket(normalizedItem: string, basketNorm: string[]): boolean {
  return basketNorm.some((b) => normalizedItem.includes(b) || b.includes(normalizedItem));
}

/** Top spending categories from user's receipt items (category -> sum totalPrice). */
async function getTopSpendCategories(userId: string, limit: number): Promise<TopSpendCategory[]> {
  const items = await prisma.item.findMany({
    where: { receipt: { userId } },
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

  const receiptCountForEmpty = await prisma.receipt.count({ where: { userId } });
  const emptyResponse: BasketInsightsResponse = {
    estimatedTotalKnownData: 0,
    bestStore: { enabled: false, confidence: 0, fallbackMessage: FALLBACK_MESSAGE, whyNoRecommendation: "Add at least 2 items to get a store recommendation.", itemsTotalCount: 0, itemsMatchedCount: 0 },
    bestTotalStore: null,
    yourHistory: [],
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
    groupPrices: [],
    sharedFriendPrices: [],
    nearbyCommunityAverage: null,
    multiStoreRecommendation: { enabled: false },
    topSpendCategories,
  };

  // 2. Your history: from user's receipt items matching basket (substring + strip size/units)
  const historicalItems = await prisma.item.findMany({
    where: { receipt: { userId } },
    include: { receipt: { include: { store: true } } },
  });
  const receiptIds = new Set(historicalItems.map((it) => it.receiptId));
  response.receiptCount = receiptIds.size;

  const byProduct = new Map<string, { storeName: string; unitPrice: number; unit: string; matchedReceiptItemName: string }>();
  for (const it of historicalItems) {
    const key = normalizeName(it.name);
    const coreKey = stripSizeAndUnits(key);
    const matches = basketNorm.some(
      (b) =>
        key.includes(b) ||
        b.includes(key) ||
        coreKey.includes(stripSizeAndUnits(b)) ||
        stripSizeAndUnits(b).includes(coreKey)
    );
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

  const itemsMatched = byProduct.size;
  const coverageRatio = itemNames.length > 0 ? itemsMatched / itemNames.length : 0;

  // 1. Best total store: only when confidence is sufficient (enough items, enough coverage)
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
    const storeConfidenceStrong = hasEnoughItems && hasEnoughCoverage && !!bestResult;

    if (bestResult && storeConfidenceStrong) {
      response.bestStore = {
        enabled: true,
        confidence: coverageRatio,
        storeName: bestResult.bestStoreName,
        storeAddress: bestResult.bestStoreAddress ?? undefined,
        storeArea: bestResult.bestStoreAddress ? undefined : "in your area",
        fallbackMessage: undefined,
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
          bestResult
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
