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

  // Build map: normalized product name -> list of { storeId, storeName, storeAddress, unitPrice }
  const priceByProductAndStore = new Map<
    string,
    Array<{ storeId: string; storeName: string; storeAddress: string | null; unitPrice: number }>
  >();

  for (const it of historicalItems) {
    const key = normalizeName(it.name);
    const entry = {
      storeId: it.receipt.storeId,
      storeName: it.receipt.store.name,
      storeAddress: it.receipt.store.address,
      unitPrice: it.unitPrice,
    };
    if (!priceByProductAndStore.has(key)) {
      priceByProductAndStore.set(key, []);
    }
    const arr = priceByProductAndStore.get(key)!;
    const existing = arr.find((e) => e.storeId === entry.storeId);
    if (!existing) arr.push(entry);
    else if (entry.unitPrice < existing.unitPrice) existing.unitPrice = entry.unitPrice;
  }

  // For each list item, find best price per store (min unit price at that store for that product)
  const listItemPrices = listItems.map((li) => {
    const key = normalizeName(li.name);
    const candidates = priceByProductAndStore.get(key) ?? [];
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
