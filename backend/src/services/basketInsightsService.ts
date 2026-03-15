import { prisma } from "../lib/db";
import { optimizeBasket } from "./optimizationService";

const MULTI_STORE_SAVINGS_ABSOLUTE = Number(process.env.MULTI_STORE_SAVINGS_ABSOLUTE) || 10;
const MULTI_STORE_SAVINGS_PERCENT = Number(process.env.MULTI_STORE_SAVINGS_PERCENT) || 5;

/** Minimum basket items required before we recommend a specific store (avoid thin data). */
const MIN_BASKET_ITEMS_FOR_STORE = 2;
/** Minimum fraction of basket items that must have price data (0–1). */
const MIN_COVERAGE_RATIO = 0.5;
const FALLBACK_MESSAGE = "Don't have best pick yet 🥶";

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
}

export interface BestTotalStoreSection {
  storeName: string;
  estimatedTotal: number;
  storeAddress?: string | null;
  storeArea?: string | null;
}

export interface YourHistoryEntry {
  itemName: string;
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
  groupPrices: GroupPriceEntry[];
  sharedFriendPrices: SharedFriendPriceEntry[];
  nearbyCommunityAverage: NearbyCommunityAverageEntry[] | null;
  multiStoreRecommendation: MultiStoreRecommendationSection;
  topSpendCategories: TopSpendCategory[];
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
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

  const emptyResponse: BasketInsightsResponse = {
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

  // 2. Your history: from user's receipt items matching basket (used for confidence and estimatedTotalKnownData)
  const historicalItems = await prisma.item.findMany({
    where: { receipt: { userId } },
    include: { receipt: { include: { store: true } } },
  });
  const byProduct = new Map<string, { storeName: string; unitPrice: number; unit: string }>();
  for (const it of historicalItems) {
    const key = normalizeName(it.name);
    if (!basketNorm.some((b) => key.includes(b) || b.includes(key))) continue;
    const entry = {
      storeName: it.receipt.store.name,
      unitPrice: it.unitPrice,
      unit: it.unit ?? "item",
    };
    const cur = byProduct.get(key);
    if (!cur || it.unitPrice < cur.unitPrice) byProduct.set(key, entry);
  }
  response.yourHistory = [...byProduct.entries()].map(([itemName, v]) => ({
    itemName,
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
  if (groupIds.length > 0) {
    const records = await prisma.priceRecord.findMany({
      where: { groupId: { in: groupIds }, shareMode: "GROUP" },
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
      where: { ownerUserId: { in: ownerIds }, shareMode: "PRIVATE" },
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

  // 5. Nearby community average (regionBucket from community aggregates; no geo-radius filter)
  if (
    req.lat != null &&
    req.lng != null &&
    typeof req.lat === "number" &&
    typeof req.lng === "number" &&
    !Number.isNaN(req.lat) &&
    !Number.isNaN(req.lng)
  ) {
    const aggregates = await prisma.communityPriceAggregate.findMany({
      orderBy: { dataPointCount: "desc" },
      take: 500,
    });
    const filtered = aggregates.filter((a) =>
      itemMatchesBasket(normalizeName(a.canonicalItemName), basketNorm)
    );
    response.nearbyCommunityAverage = filtered.map((a) => ({
      canonicalItemName: a.canonicalItemName,
      canonicalStoreName: a.canonicalStoreName ?? undefined,
      regionBucket: a.regionBucket,
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
