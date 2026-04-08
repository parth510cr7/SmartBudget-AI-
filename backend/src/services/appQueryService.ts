import { prisma } from "../lib/db";

export interface AppQueryResult {
  answer: string;
  data?: {
    byStore?: { storeName: string; totalSpent: number; visits: number }[];
    byCategory?: { category: string; amount: number }[];
    topCategory?: { name: string; amount: number };
    recentPurchases?: { storeName: string; total: number; date: string }[];
    cheapestStore?: { itemName: string; storeName: string; unitPrice: number; unit?: string | null }[];
    groupSummary?: { groupName: string; expenseCount: number; totalSpent: number }[];
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Detect intent from natural query (lowercase, trimmed).
 * Returns a label we can switch on.
 */
function detectIntent(q: string): string {
  const lower = q.toLowerCase().trim();
  if (!lower) return "general";
  // Safety: explicit category queries should never route to store intent.
  if (/\bcategory\b/.test(lower)) return "spend_by_category";
  // Single short item-like query (e.g. "milk", "eggs") should use item lookup instead of generic summary.
  if (lower.length <= 32 && !/\b(by|top|recent|group|shared|split)\b/.test(lower) && !/[?]/.test(lower)) {
    const wordCount = lower.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 3 && /[a-z]/.test(lower)) return "item_lookup";
  }
  // how much at [store] / spend at [store] (natural phrasing for single store)
  if (/\b(how much|spent|spend|spending)(?:\s+(?:did i|have i))?\s+at\s+/.test(lower)) return "spend_at_store";
  // spend by store / by store
  if (/\b(spend|spent|spending)\s+by\s+store\b/.test(lower) || /\bby\s+store\b/.test(lower) || lower.includes("spend by store")) return "spend_by_store";
  // by category / spend by category
  if (/\b(spend|spent|spending)\s+by\s+category\b/.test(lower) || /\bby\s+category\b/.test(lower) || lower.includes("spend by category")) return "spend_by_category";
  // top category
  if (/\btop\s+category\b/.test(lower) || /\bhighest\s+category\b/.test(lower) || lower.includes("top category")) return "top_category";
  // recent purchase(s)
  if (/\brecent\b/.test(lower) && (/\bpurchase\b/.test(lower) || /\breceipt\b/.test(lower) || /\btransaction\b/.test(lower) || /\bspending\b/.test(lower))) return "recent_purchase";
  if (/\blast\s+(purchase|receipt|transaction)\b/.test(lower)) return "recent_purchase";
  // cheapest store for [item] / where to buy [item]
  const cheapestMatch = lower.match(/\b(cheapest|best\s+price|where\s+to\s+buy|price\s+of)\s+(?:store\s+for\s+)?(.+)/);
  if (cheapestMatch) return "cheapest_store";
  if (/\bcheapest\b/.test(lower) || /\bbest\s+price\b/.test(lower) || /\bwhere\s+to\s+buy\b/.test(lower)) return "cheapest_store";
  // group / shared
  if (/\b(group|shared|split)\s+(expense|spend|price)/.test(lower) || /\bgroup\s+spending\b/.test(lower) || lower.includes("group expense")) return "group_summary";
  if (/\bmy\s+groups\b/.test(lower) || /\bgroup\s+summary\b/.test(lower)) return "group_summary";
  return "general";
}

/**
 * Extract item name for "cheapest store for X" from query.
 */
function extractItemForCheapest(query: string): string | null {
  const lower = query.toLowerCase().trim();
  const forMatch = lower.match(/(?:cheapest|best\s+price|where\s+to\s+buy)\s+(?:store\s+for\s+)?(.+?)(?:\?|$)/);
  if (forMatch) return forMatch[1].trim() || null;
  const onMatch = lower.match(/(?:price\s+of|cost\s+of)\s+(.+?)(?:\?|$)/);
  if (onMatch) return onMatch[1].trim() || null;
  return null;
}

/**
 * Extract store name for "how much at X" / "spend at X" from query.
 */
function extractStoreForSpendAt(query: string): string | null {
  const lower = query.toLowerCase().trim();
  const atMatch = lower.match(/(?:how much|spent|spend|spending)(?:\s+(?:did i|have i))?\s+at\s+(.+?)(?:\?|\.|$)/);
  if (atMatch) return atMatch[1].trim() || null;
  const atOnly = lower.match(/\bat\s+(.+?)(?:\?|\.|$)/);
  if (atOnly) return atOnly[1].trim() || null;
  return null;
}

export async function runAppQuery(userId: string, query: string): Promise<AppQueryResult> {
  const receipts = await prisma.receipt.findMany({
    where: { userId, status: "VERIFIED" },
    include: { store: true, items: true },
    orderBy: { date: "desc" },
  });

  const intent = detectIntent(query);

  // Build by-store aggregate
  const byStoreMap: Record<string, { totalSpent: number; visits: number }> = {};
  for (const r of receipts) {
    const name = r.store?.name ?? "Unknown";
    if (!byStoreMap[name]) byStoreMap[name] = { totalSpent: 0, visits: 0 };
    byStoreMap[name].totalSpent += Number(r.total);
    byStoreMap[name].visits += 1;
  }
  const byStore = Object.entries(byStoreMap)
    .map(([storeName, v]) => ({ storeName, totalSpent: round2(v.totalSpent), visits: v.visits }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  // Build by-category aggregate (from priced line items, plus remainder into Other so it reconciles with totals)
  const categoryMap: Record<string, number> = {};
  for (const r of receipts) {
    let attributed = 0;
    for (const item of r.items) {
      const itemTotal = Number(item.totalPrice);
      if (!Number.isFinite(itemTotal) || itemTotal <= 0) continue;
      const cat = (item.category ?? "").trim() || "Other";
      categoryMap[cat] = (categoryMap[cat] ?? 0) + itemTotal;
      attributed += itemTotal;
    }
    const receiptTotal = Number(r.total);
    const remainder = Number.isFinite(receiptTotal) ? receiptTotal - attributed : 0;
    if (remainder > 0.01) categoryMap["Other"] = (categoryMap["Other"] ?? 0) + remainder;
  }
  const byCategory = Object.entries(categoryMap)
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const topCategory = byCategory.length > 0 ? { name: byCategory[0].category, amount: byCategory[0].amount } : null;

  // Recent purchases (last 10 receipts)
  const recentPurchases = receipts.slice(0, 10).map((r) => ({
    storeName: r.store?.name ?? "Unknown",
    total: round2(Number(r.total)),
    date: r.date ? new Date(r.date).toISOString().slice(0, 10) : "",
  }));

  // Per-item cheapest store: from items with unitPrice or totalPrice
  const itemPrices: { itemName: string; storeName: string; unitPrice: number; totalPrice: number; unit?: string | null }[] = [];
  for (const r of receipts) {
    const storeName = r.store?.name ?? "Unknown";
    for (const item of r.items) {
      const name = (item.name ?? item.rawName ?? "").trim() || "—";
      const totalPrice = Number(item.totalPrice);
      if (!Number.isFinite(totalPrice) || totalPrice <= 0) continue;
      const qty = Number(item.quantity) || 1;
      const unitPrice = totalPrice / qty;
      itemPrices.push({
        itemName: name,
        storeName,
        unitPrice: round2(unitPrice),
        totalPrice: round2(totalPrice),
        unit: item.unit ?? null,
      });
    }
  }

  // Group summary: user's groups and their expenses (with receipt when present)
  const groups = await prisma.group.findMany({
    where: {
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    include: {
      expenses: { include: { receipt: { include: { store: true } } } },
    },
  });
  const groupSummary = groups.map((g) => {
    const totalSpent = g.expenses.reduce((s, e) => s + Number(e.amount), 0);
    return {
      groupName: g.name,
      expenseCount: g.expenses.length,
      totalSpent: round2(totalSpent),
    };
  });

  switch (intent) {
    case "item_lookup": {
      const q = query.toLowerCase().trim();
      if (!q) return { answer: "Try searching for an item like \"milk\" or asking \"cheapest store for milk\"." };
      if (itemPrices.length === 0) {
        return { answer: "No item-level prices found yet. Scan receipts with visible line-item prices to enable item search." };
      }
      const matches = itemPrices.filter((r) => r.itemName.toLowerCase().includes(q)).slice(0, 50);
      if (matches.length === 0) {
        return {
          answer: `No item matches found for "${query}". Try a shorter term (e.g. "milk") or check spelling.`,
          data: { byStore: byStore.slice(0, 5), byCategory: byCategory.slice(0, 5), topCategory: topCategory ?? undefined, recentPurchases: recentPurchases.slice(0, 3) },
        };
      }
      const byItem: Record<string, { count: number; min: number; max: number; sum: number; stores: Set<string> }> = {};
      for (const m of matches) {
        const key = m.itemName;
        if (!byItem[key]) byItem[key] = { count: 0, min: Number.POSITIVE_INFINITY, max: 0, sum: 0, stores: new Set() };
        byItem[key].count += 1;
        byItem[key].min = Math.min(byItem[key].min, m.unitPrice);
        byItem[key].max = Math.max(byItem[key].max, m.unitPrice);
        byItem[key].sum += m.unitPrice;
        byItem[key].stores.add(m.storeName);
      }
      const rows = Object.entries(byItem)
        .map(([itemName, v]) => ({
          itemName,
          seen: v.count,
          avgUnitPrice: round2(v.sum / Math.max(1, v.count)),
          minUnitPrice: round2(v.min === Number.POSITIVE_INFINITY ? 0 : v.min),
          maxUnitPrice: round2(v.max),
          storeCount: v.stores.size,
        }))
        .sort((a, b) => b.seen - a.seen)
        .slice(0, 10);
      const lines = rows
        .map((r) => `• ${r.itemName}: avg $${r.avgUnitPrice.toFixed(2)} (min $${r.minUnitPrice.toFixed(2)}), seen ${r.seen}× across ${r.storeCount} store(s)`)
        .join("\n");
      return {
        answer: `Matches for "${query}":\n\n${lines}\n\nTip: ask "cheapest store for ${query}" to compare stores.`,
        data: { cheapestStore: rows.map((r) => ({ itemName: r.itemName, storeName: "—", unitPrice: r.minUnitPrice })) as any },
      };
    }
    case "spend_at_store": {
      const storeHint = extractStoreForSpendAt(query);
      if (byStore.length === 0) {
        return { answer: "You don't have any spending by store yet. Add receipts from the Scan tab to see breakdown by store." };
      }
      const hint = storeHint?.toLowerCase().replace(/\s+/g, " ").trim();
      const matching = hint
        ? byStore.filter((s) => s.storeName.toLowerCase().includes(hint) || hint.includes(s.storeName.toLowerCase()))
        : byStore;
      if (matching.length === 0) {
        return { answer: storeHint ? `No receipts found for "${storeHint}". Try "spend by store" to see all stores.` : "You don't have any spending by store yet." };
      }
      const total = matching.reduce((s, x) => s + x.totalSpent, 0);
      const visits = matching.reduce((s, x) => s + x.visits, 0);
      const storeLabel = matching.length === 1 ? matching[0].storeName : (storeHint ?? "Matching stores");
      return {
        answer: `At ${storeLabel}: $${round2(total).toFixed(2)} (${visits} visit${visits !== 1 ? "s" : ""}).`,
        data: { byStore: matching },
      };
    }
    case "spend_by_store": {
      if (byStore.length === 0) {
        return { answer: "You don't have any spending by store yet. Add receipts from the Scan tab to see breakdown by store." };
      }
      const lines = byStore.slice(0, 15).map((s) => `• ${s.storeName}: $${s.totalSpent.toFixed(2)} (${s.visits} visit${s.visits !== 1 ? "s" : ""})`).join("\n");
      const total = byStore.reduce((s, x) => s + x.totalSpent, 0);
      return {
        answer: `Spend by store:\n\n${lines}\n\nTotal across stores: $${round2(total).toFixed(2)}.`,
        data: { byStore },
      };
    }
    case "spend_by_category": {
      if (byCategory.length === 0) {
        return { answer: "You don't have spending by category yet. Receipts with line items will show categories." };
      }
      const lines = byCategory.slice(0, 15).map((c) => `• ${c.category}: $${c.amount.toFixed(2)}`).join("\n");
      const total = byCategory.reduce((s, x) => s + x.amount, 0);
      return {
        answer: `Spend by category:\n\n${lines}\n\nTotal: $${round2(total).toFixed(2)}.`,
        data: { byCategory },
      };
    }
    case "top_category": {
      if (!topCategory) {
        return { answer: "No category data yet. Add receipts with line items to see top category." };
      }
      return {
        answer: `Your top spending category is **${topCategory.name}** with $${topCategory.amount.toFixed(2)}.`,
        data: { topCategory },
      };
    }
    case "recent_purchase": {
      if (recentPurchases.length === 0) {
        return { answer: "No recent purchases. Scan or upload receipts to see them here." };
      }
      const lines = recentPurchases.slice(0, 8).map((p) => `• ${p.storeName}: $${p.total.toFixed(2)}${p.date ? ` (${p.date})` : ""}`).join("\n");
      return {
        answer: `Recent purchases:\n\n${lines}`,
        data: { recentPurchases },
      };
    }
    case "cheapest_store": {
      const itemHint = extractItemForCheapest(query);
      if (itemPrices.length === 0) {
        return { answer: "No item-level prices yet. Add receipts with line items to compare prices across stores." };
      }
      // If user mentioned an item, filter and find cheapest for that item
      const normalizedHint = itemHint?.toLowerCase().replace(/\s+/g, " ").trim();
      const matchingItems = normalizedHint
        ? itemPrices.filter((i) => i.itemName.toLowerCase().includes(normalizedHint) || normalizedHint.includes(i.itemName.toLowerCase()))
        : itemPrices;
      if (matchingItems.length === 0 && itemHint) {
        return { answer: `No prices found for "${itemHint}". Try another item or add more receipts.` };
      }
      const toSearch = matchingItems.length > 0 ? matchingItems : itemPrices;
      const byItemName: Record<string, typeof itemPrices> = {};
      for (const row of toSearch) {
        const key = row.itemName.toLowerCase();
        if (!byItemName[key]) byItemName[key] = [];
        byItemName[key].push(row);
      }
      type CheapestRow = { itemName: string; storeName: string; unitPrice: number; unit?: string | null };
      const cheapest: CheapestRow[] = [];
      for (const rows of Object.values(byItemName)) {
        const best = rows.sort((a: { unitPrice: number }, b: { unitPrice: number }) => a.unitPrice - b.unitPrice)[0];
        cheapest.push({
          itemName: best.itemName,
          storeName: best.storeName,
          unitPrice: best.unitPrice,
          unit: best.unit,
        });
      }
      const sortedCheapest = cheapest.sort((a: CheapestRow, b: CheapestRow) => a.unitPrice - b.unitPrice).slice(0, 10);
      const label = itemHint ? `Best prices for "${itemHint}"` : "Cheapest store by item (from your receipts)";
      const lines = sortedCheapest.map((c: CheapestRow) => `• ${c.itemName}: ${c.storeName} — $${c.unitPrice.toFixed(2)}${c.unit ? ` per ${c.unit}` : ""}`).join("\n");
      return {
        answer: `${label}:\n\n${lines}`,
        data: { cheapestStore: sortedCheapest },
      };
    }
    case "group_summary": {
      if (groupSummary.length === 0) {
        return { answer: "You're not in any groups yet. Create or join a group from the Shared tab to see group spending." };
      }
      const lines = groupSummary.map((g) => `• ${g.groupName}: ${g.expenseCount} expense(s), $${g.totalSpent.toFixed(2)} total`).join("\n");
      return {
        answer: `Your groups:\n\n${lines}`,
        data: { groupSummary },
      };
    }
    default: {
      // General: short summary so AI or follow-up can elaborate
      const totalSpent = receipts.reduce((s, r) => s + Number(r.total), 0);
      const storeCount = new Set(receipts.map((r) => r.store?.name ?? "")).size;
      if (receipts.length === 0) {
        return { answer: "You don't have any receipts yet. Use the Scan tab to add receipts, then ask things like \"spend by store\", \"top category\", or \"recent purchases\"." };
      }
      let general = `You have ${receipts.length} receipt(s), $${round2(totalSpent).toFixed(2)} total spent across ${storeCount} store(s).`;
      if (topCategory) general += ` Top category: ${topCategory.name} ($${topCategory.amount.toFixed(2)}).`;
      general += " Try: \"spend by store\", \"by category\", \"top category\", \"recent purchases\", \"cheapest store for [item]\", or \"group spending\".";
      return {
        answer: general,
        data: { byStore: byStore.slice(0, 5), byCategory: byCategory.slice(0, 5), topCategory: topCategory ?? undefined, recentPurchases: recentPurchases.slice(0, 3), groupSummary },
      };
    }
  }
}
