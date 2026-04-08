import { prisma } from "../lib/db";
import {
  matchBasketToReceiptName,
  MATCH_THRESHOLD_PRICE,
  tierToNumericWeight,
  type MatchTier,
} from "./basketMatcherEngine";
import { getItemWhereForUserReceipts } from "./basketReceiptScope";
import { appendFile } from "node:fs/promises";

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
  /** No single store had every item; we chose the store covering the most items (tie-break: lower sum for covered lines). */
  partialMatch?: boolean;
  itemsCoveredAtStore?: number;
  basketItemCount?: number;
  /** Why this store won vs alternatives (evidence-weighted ranking). */
  evidenceSummary?: string;
  /** Aggregate match quality at the chosen store. */
  matchQuality?: "strong" | "mixed" | "weak";
}

type HistoricalRow = {
  name: string;
  unitPrice: number;
  totalPrice?: number;
  quantity?: number;
  receipt: { storeId: string; date: Date; store: { name: string; address: string | null } };
};

type Candidate = {
  storeId: string;
  storeName: string;
  storeAddress: string | null;
  unitPrice: number;
  receiptItemName: string;
  matchScore: number;
  tier: MatchTier;
  receiptDate: Date;
};

function recencyMultiplier(date: Date): number {
  const days = Math.max(0, (Date.now() - date.getTime()) / 86400000);
  return Math.max(0.38, 1 - Math.min(days, 730) / 730);
}

function pickBetter(a: Candidate, b: Candidate): Candidate {
  const wa = a.matchScore * tierToNumericWeight(a.tier) * recencyMultiplier(a.receiptDate);
  const wb = b.matchScore * tierToNumericWeight(b.tier) * recencyMultiplier(b.receiptDate);
  if (Math.abs(wa - wb) > 0.015) return wa >= wb ? a : b;
  return a.unitPrice <= b.unitPrice ? a : b;
}

// #region agent log
function debugLog(hypothesisId: string, message: string, data: Record<string, unknown>) {
  const line =
    JSON.stringify({
      sessionId: "6bad93",
      location: "services/optimizationService.ts",
      runId: "baseline",
      hypothesisId,
      message,
      data,
      timestamp: Date.now(),
    }) + "\n";
  appendFile("debug-6bad93.log", line).catch(() => {});
}
// #endregion

/**
 * Find best single store: evidence-weighted matches (not just coverage + raw subtotal).
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

  const itemWhere = await getItemWhereForUserReceipts(userId);
  const historicalItems = (await prisma.item.findMany({
    where: itemWhere,
    include: {
      receipt: {
        include: { store: true },
      },
    },
  })) as HistoricalRow[];

  // #region agent log
  debugLog("H2", "optimizeBasket inputs", {
    listItemCount: listItems.length,
    historicalItemCount: historicalItems.length,
  });
  // #endregion

  /** For each basket line: best candidate per store */
  const listItemCandidates: { name: string; quantity: number; byStore: Map<string, Candidate> }[] = [];

  for (const li of listItems) {
    const byStore = new Map<string, Candidate>();
    for (const hi of historicalItems) {
      const m = matchBasketToReceiptName(li.name, hi.name);
      if (m.score < MATCH_THRESHOLD_PRICE) continue;
      const qty = Number(hi.quantity) || 1;
      const total = Number(hi.totalPrice) || 0;
      const effectiveUnitPrice =
        Number(hi.unitPrice) > 0 ? Number(hi.unitPrice) : total > 0 && qty > 0 ? total / qty : 0;
      // Critical: never use zero-priced line items for basket estimates.
      if (!Number.isFinite(effectiveUnitPrice) || effectiveUnitPrice <= 0) continue;
      const cand: Candidate = {
        storeId: hi.receipt.storeId,
        storeName: hi.receipt.store.name,
        storeAddress: hi.receipt.store.address,
        unitPrice: effectiveUnitPrice,
        receiptItemName: hi.name,
        matchScore: m.score,
        tier: m.tier,
        receiptDate: hi.receipt.date,
      };
      const prev = byStore.get(cand.storeId);
      if (!prev) byStore.set(cand.storeId, cand);
      else byStore.set(cand.storeId, pickBetter(cand, prev));
    }
    listItemCandidates.push({
      name: li.name,
      quantity: li.quantity,
      byStore,
    });
  }

  const storeIds = new Set<string>();
  for (const row of listItemCandidates) {
    for (const sid of row.byStore.keys()) storeIds.add(sid);
  }
  if (storeIds.size === 0) return null;

  /** Use store rows already joined on receipt lines. A second Store query filtered by userId could drop valid stores if data ever diverged. */
  const storeMap = new Map<string, { name: string; address: string | null }>();
  for (const hi of historicalItems) {
    const sid = hi.receipt.storeId;
    if (!storeIds.has(sid) || storeMap.has(sid)) continue;
    storeMap.set(sid, { name: hi.receipt.store.name, address: hi.receipt.store.address });
  }
  for (const sid of storeIds) {
    if (!storeMap.has(sid)) {
      const row = await prisma.store.findFirst({ where: { id: sid, userId } });
      if (row) storeMap.set(sid, { name: row.name, address: row.address });
    }
  }

  type StoreEval = {
    storeId: string;
    hasAllItems: boolean;
    storeTotal: number;
    evidenceScore: number;
    breakdown: BasketItemPrice[];
    covered: number;
    strongCount: number;
    weakCount: number;
  };

  function evalStore(storeId: string): StoreEval | null {
    const info = storeMap.get(storeId);
    if (!info) return null;

    let storeTotal = 0;
    let evidenceScore = 0;
    let covered = 0;
    let strongCount = 0;
    let weakCount = 0;
    const breakdown: BasketItemPrice[] = [];
    let hasAllItems = true;

    for (const row of listItemCandidates) {
      const cand = row.byStore.get(storeId);
      if (!cand) {
        hasAllItems = false;
        breakdown.push({
          itemName: row.name,
          quantity: row.quantity,
          unitPrice: 0,
          totalPrice: 0,
          storeName: info.name,
        });
        continue;
      }
      covered++;
      const w = cand.matchScore * tierToNumericWeight(cand.tier) * recencyMultiplier(cand.receiptDate);
      evidenceScore += w;
      if (cand.tier === "strong") strongCount++;
      else if (cand.tier === "weak") weakCount++;

      const totalPrice = row.quantity * cand.unitPrice;
      storeTotal += totalPrice;
      breakdown.push({
        itemName: row.name,
        quantity: row.quantity,
        unitPrice: cand.unitPrice,
        totalPrice,
        storeName: info.name,
      });
    }

    return {
      storeId,
      hasAllItems,
      storeTotal,
      evidenceScore,
      breakdown,
      covered,
      strongCount,
      weakCount,
    };
  }

  const evaluations: StoreEval[] = [];
  for (const sid of storeIds) {
    const ev = evalStore(sid);
    if (ev && ev.covered > 0) evaluations.push(ev);
  }
  if (evaluations.length === 0) return null;

  /** Rank: prefer higher evidence score, then lower subtotal for same coverage band */
  function rankFull(a: StoreEval, b: StoreEval): number {
    if (a.hasAllItems !== b.hasAllItems) return a.hasAllItems ? -1 : 1;
    const evDiff = b.evidenceScore - a.evidenceScore;
    if (Math.abs(evDiff) > 0.08) return evDiff;
    return a.storeTotal - b.storeTotal;
  }

  const fullCandidates = evaluations
    .filter((e) => e.hasAllItems && e.covered > 0)
    .sort((a, b) => rankFull(a, b));

  let chosen: StoreEval | null = fullCandidates[0] ?? null;
  let usedPartialFallback = false;

  if (!chosen) {
    usedPartialFallback = true;
    const maxCov = Math.max(...evaluations.map((e) => e.covered));
    const partialPool = evaluations.filter((e) => e.covered === maxCov && e.covered > 0);
    partialPool.sort((a, b) => {
      const evDiff = b.evidenceScore - a.evidenceScore;
      if (Math.abs(evDiff) > 0.06) return evDiff;
      return a.storeTotal - b.storeTotal;
    });
    chosen = partialPool[0] ?? null;
  }

  if (!chosen) return null;

  // #region agent log
  debugLog("H2", "optimizeBasket chosen store", {
    storeId: chosen.storeId,
    hasAllItems: chosen.hasAllItems,
    covered: chosen.covered,
    storeTotal: chosen.storeTotal,
    evidenceScore: chosen.evidenceScore,
  });
  // #endregion

  const bestStore = storeMap.get(chosen.storeId)!;
  const itemsCoveredAtStore = chosen.covered;
  const basketItemCount = listItems.length;
  const partialMatch = usedPartialFallback || itemsCoveredAtStore < basketItemCount;

  let matchQuality: "strong" | "mixed" | "weak" = "mixed";
  if (chosen.strongCount >= Math.ceil(chosen.covered * 0.6) && chosen.weakCount <= 1) matchQuality = "strong";
  else if (chosen.weakCount >= Math.ceil(chosen.covered * 0.45)) matchQuality = "weak";

  const evidenceSummary = partialMatch
    ? `Partial trip: ${itemsCoveredAtStore} of ${basketItemCount} lines matched at this store with ${matchQuality} confidence (receipt history + recency).`
    : `Full basket at this store: ${matchQuality} match quality from your receipts (weighted by strength and how recent prices are).`;

  const theoreticalMinimumFixed = listItemCandidates.reduce((sum, row, idx) => {
    const li = listItems[idx];
    const prices = [...row.byStore.values()].map((c) => c.unitPrice);
    if (prices.length === 0) return sum;
    return sum + li.quantity * Math.min(...prices);
  }, 0);

  return {
    bestStoreId: chosen.storeId,
    bestStoreName: bestStore.name,
    bestStoreAddress: bestStore.address,
    estimatedTotal: chosen.storeTotal,
    theoreticalMinimum: theoreticalMinimumFixed,
    estimatedSavings: Math.max(0, theoreticalMinimumFixed - chosen.storeTotal),
    itemBreakdown: chosen.breakdown,
    partialMatch: partialMatch || itemsCoveredAtStore < basketItemCount,
    itemsCoveredAtStore,
    basketItemCount,
    evidenceSummary,
    matchQuality,
  };
}
