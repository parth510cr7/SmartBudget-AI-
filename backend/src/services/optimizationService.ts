import { prisma } from "../lib/db";

export interface BasketItemPrice {
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  storeName: string;
}

export interface OptimizeBasketResult {
  bestStoreId: string;
  bestStoreName: string;
  bestStoreAddress: string | null;
  estimatedTotal: number;
  theoreticalMinimum: number;
  estimatedSavings: number;
  itemBreakdown: BasketItemPrice[];
}

/**
 * Normalize item name for matching (lowercase, trim, collapse spaces).
 */
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Strip size/units and common modifiers so "Milk 2% 1L" and "Organic Milk" both match "milk". */
function stripSizeAndUnits(normalized: string): string {
  return normalized
    .replace(/\b\d*\.?\d+\s*(l|liter|litre|ml|g|kg|lb|oz|mg|ml)\b/gi, " ")
    .replace(/\b\d+%\s*/g, " ")
    .replace(/\b(organic|whole|skim|2%|1%|fat\s*free|low\s*fat|large|medium|small|dozen|pack|ct|pk|ea)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || normalized;
}

/**
 * Find the best single store to visit for the entire basket (Best Overall Basket):
 * - For each list item, get historical unit prices by store from past receipts.
 * - For each store that has at least one matching item, compute total basket cost.
 * - Best store = store with minimum total. Also compute theoretical minimum
 *   (sum over items of quantity * min unit price across all stores) for savings.
 */
export async function optimizeBasket(
  userId: string,
  smartListId: string
): Promise<OptimizeBasketResult | null> {
  const list = await prisma.smartList.findFirst({
    where: { id: smartListId, userId },
    include: { items: true },
  });
  if (!list || list.items.length === 0) return null;

  const listItems = list.items;

  // Fetch all items from user's receipts with store info (historical prices)
  const historicalItems = await prisma.item.findMany({
    where: { receipt: { userId } },
    include: {
      receipt: {
        include: { store: true },
      },
    },
  });

  type PriceEntry = {
    storeId: string;
    storeName: string;
    storeAddress: string | null;
    unitPrice: number;
    receiptItemName?: string;
  };
  const priceByProductAndStore = new Map<string, PriceEntry[]>();

  for (const it of historicalItems) {
    const key = normalizeName(it.name);
    const coreKey = stripSizeAndUnits(key);
    const entry = {
      storeId: it.receipt.storeId,
      storeName: it.receipt.store.name,
      storeAddress: it.receipt.store.address,
      unitPrice: it.unitPrice,
      receiptItemName: it.name,
    };
    for (const k of [key, coreKey].filter(Boolean)) {
      if (!priceByProductAndStore.has(k)) priceByProductAndStore.set(k, []);
      const arr = priceByProductAndStore.get(k)!;
      const existing = arr.find((e) => e.storeId === entry.storeId);
      if (!existing) arr.push({ ...entry });
      else if (entry.unitPrice < existing.unitPrice) existing.unitPrice = entry.unitPrice;
    }
  }

  /** Match basket item to receipt items: exact key, core key (strip size/units), or substring. */
  function getCandidatesForBasketItem(basketKey: string): Array<{ storeId: string; storeName: string; storeAddress: string | null; unitPrice: number; receiptItemName?: string }> {
    const coreBasket = stripSizeAndUnits(basketKey);
    const results = new Map<string, { storeId: string; storeName: string; storeAddress: string | null; unitPrice: number; receiptItemName?: string }>();
    for (const [receiptKey, entries] of priceByProductAndStore) {
      const coreReceipt = stripSizeAndUnits(receiptKey);
      const match =
        basketKey.length >= 2 &&
        (receiptKey.includes(basketKey) ||
          basketKey.includes(receiptKey) ||
          coreReceipt.includes(coreBasket) ||
          coreBasket.includes(coreReceipt));
      if (!match) continue;
      for (const e of entries) {
        const cur = results.get(e.storeId);
        if (!cur || e.unitPrice < cur.unitPrice) results.set(e.storeId, { ...e });
      }
    }
    return [...results.values()];
  }

  // For each list item, find best price per store (exact → core → substring)
  const listItemPrices = listItems.map((li) => {
    const key = normalizeName(li.name);
    const coreKey = stripSizeAndUnits(key);
    const candidates =
      priceByProductAndStore.get(key) ??
      priceByProductAndStore.get(coreKey) ??
      getCandidatesForBasketItem(key);
    return {
      name: li.name,
      quantity: li.quantity,
      pricesPerStore: candidates,
    };
  });

  // All stores that appear in at least one item's history
  const storeIds = new Set<string>();
  for (const lip of listItemPrices) {
    for (const p of lip.pricesPerStore) storeIds.add(p.storeId);
  }
  if (storeIds.size === 0) return null;

  const storeInfo = await prisma.store.findMany({
    where: { id: { in: [...storeIds] }, userId },
  });
  const storeMap = new Map(storeInfo.map((s) => [s.id, { name: s.name, address: s.address }]));

  let bestStoreId: string | null = null;
  let bestStoreTotal = Infinity;
  let bestItemBreakdown: BasketItemPrice[] = [];

  for (const storeId of storeIds) {
    const info = storeMap.get(storeId);
    if (!info) continue;

    let storeTotal = 0;
    const breakdown: BasketItemPrice[] = [];

    let hasAllItems = true;
    for (const lip of listItemPrices) {
      const atStore = lip.pricesPerStore.find((p) => p.storeId === storeId);
      const unitPrice = atStore ? atStore.unitPrice : Infinity;
      if (!atStore) hasAllItems = false;
      const totalPrice = unitPrice !== Infinity ? lip.quantity * unitPrice : 0;
      storeTotal += totalPrice;
      breakdown.push({
        itemName: lip.name,
        quantity: lip.quantity,
        unitPrice: unitPrice === Infinity ? 0 : unitPrice,
        totalPrice,
        storeName: info.name,
      });
    }

    if (hasAllItems && storeTotal < bestStoreTotal && storeTotal > 0) {
      bestStoreTotal = storeTotal;
      bestStoreId = storeId;
      bestItemBreakdown = breakdown;
    }
  }

  if (bestStoreId === null) return null;

  const theoreticalMinimum = listItemPrices.reduce((sum, lip) => {
    if (lip.pricesPerStore.length === 0) return sum;
    const minUnit = Math.min(...lip.pricesPerStore.map((p) => p.unitPrice));
    return sum + lip.quantity * minUnit;
  }, 0);

  const bestStore = storeMap.get(bestStoreId)!;

  return {
    bestStoreId,
    bestStoreName: bestStore.name,
    bestStoreAddress: bestStore.address,
    estimatedTotal: bestStoreTotal,
    theoreticalMinimum,
    estimatedSavings: Math.max(0, theoreticalMinimum - bestStoreTotal),
    itemBreakdown: bestItemBreakdown,
  };
}
