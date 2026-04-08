import { prisma } from "../lib/db";
import { STAPLE_BENCHMARKS } from "../config/referenceStaplePrices";
import { detectItemFamilyId, normalizeName, stripSizeAndUnits } from "./basketMatcherEngine";

export type OverpaidInsightConfidence = "high" | "medium" | "low" | "none";

export type OverpaidLineBasis = "your_history" | "reference_prices";

export interface OverpaidLineInsight {
  itemName: string;
  quantity: number;
  youPaid: number;
  benchmarkTotal: number;
  delta: number;
  basis: OverpaidLineBasis;
}

export interface OverpaidInsightResult {
  receiptId: string;
  storeName: string | null;
  receiptTotal: number;
  /** Sum of line totals we could benchmark (subset of receipt). */
  comparedActualTotal: number;
  /** Sum of benchmark totals for those lines. */
  comparedBenchmarkTotal: number;
  /** Positive = paid more than benchmark on compared lines. */
  netDelta: number;
  confidence: OverpaidInsightConfidence;
  headline: string;
  subtext: string;
  lines: OverpaidLineInsight[];
}

function median(nums: number[]): number | null {
  const valid = nums.filter((n) => Number.isFinite(n) && n > 0);
  if (valid.length === 0) return null;
  const s = [...valid].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function effectiveUnitPrice(unitPrice: number, totalPrice: number, quantity: number): number {
  const q = quantity > 0 ? quantity : 1;
  if (Number.isFinite(unitPrice) && unitPrice > 0) return unitPrice;
  const t = Number(totalPrice);
  if (Number.isFinite(t) && t > 0) return t / q;
  return 0;
}

/**
 * Compare this receipt's lines to (1) your historical unit prices for the same item/family,
 * else (2) static staple benchmarks. Intended for post-scan motivation, not accounting.
 */
export async function getOverpaidInsight(userId: string, receiptId: string): Promise<OverpaidInsightResult | null> {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, userId },
    include: { store: true, items: true },
  });
  if (!receipt) return null;

  const historical = await prisma.item.findMany({
    where: {
      receipt: { userId, id: { not: receiptId }, status: "VERIFIED" },
      totalPrice: { gt: 0 },
    },
    select: {
      name: true,
      rawName: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
    },
  });

  const byFamily = new Map<string, number[]>();
  const byStripped = new Map<string, number[]>();

  for (const h of historical) {
    const label = (h.name ?? h.rawName ?? "").trim() || "Item";
    const fam = detectItemFamilyId(label);
    const eu = effectiveUnitPrice(Number(h.unitPrice), Number(h.totalPrice), Number(h.quantity) || 1);
    if (eu <= 0) continue;
    if (fam) {
      if (!byFamily.has(fam)) byFamily.set(fam, []);
      byFamily.get(fam)!.push(eu);
    }
    const sk = stripSizeAndUnits(normalizeName(label));
    if (sk.length >= 4) {
      if (!byStripped.has(sk)) byStripped.set(sk, []);
      byStripped.get(sk)!.push(eu);
    }
  }

  const lines: OverpaidLineInsight[] = [];
  let comparedActual = 0;
  let comparedBench = 0;

  for (const it of receipt.items) {
    const name = (it.name ?? it.rawName ?? "").trim() || "Item";
    const qty = Number(it.quantity) > 0 ? Number(it.quantity) : 1;
    const paid = Number(it.totalPrice);
    if (!Number.isFinite(paid) || paid <= 0) continue;

    const eu = effectiveUnitPrice(Number(it.unitPrice), paid, qty);
    if (eu <= 0) continue;

    const fam = detectItemFamilyId(name);
    const sk = stripSizeAndUnits(normalizeName(name));

    let benchmarkUnit: number | null = null;
    let basis: OverpaidLineBasis = "reference_prices";

    const histFamily = fam ? byFamily.get(fam) ?? [] : [];
    const histStrip = sk.length >= 4 ? byStripped.get(sk) ?? [] : [];
    const histPool = histFamily.length >= histStrip.length ? histFamily : histStrip;
    const medHist = median(histPool);

    if (medHist !== null && histPool.length >= 2) {
      benchmarkUnit = medHist;
      basis = "your_history";
    } else if (fam && STAPLE_BENCHMARKS[fam]) {
      const st = STAPLE_BENCHMARKS[fam];
      benchmarkUnit = st.refTotalUsd / st.refQty;
    } else if (medHist !== null && histPool.length === 1) {
      benchmarkUnit = medHist;
      basis = "your_history";
    }

    if (benchmarkUnit === null || benchmarkUnit <= 0) continue;

    const benchTotal = Math.round(benchmarkUnit * qty * 100) / 100;
    const delta = Math.round((paid - benchTotal) * 100) / 100;
    lines.push({
      itemName: name,
      quantity: qty,
      youPaid: paid,
      benchmarkTotal: benchTotal,
      delta,
      basis,
    });
    comparedActual += paid;
    comparedBench += benchTotal;
  }

  const netDelta = Math.round((comparedActual - comparedBench) * 100) / 100;
  const itemSum = receipt.items.reduce((s, x) => s + (Number(x.totalPrice) > 0 ? Number(x.totalPrice) : 0), 0);
  const coverage = itemSum > 0 ? comparedActual / itemSum : 0;

  let confidence: OverpaidInsightConfidence = "none";
  if (lines.length === 0) confidence = "none";
  else if (lines.length >= 3 || coverage >= 0.5) confidence = "high";
  else if (lines.length >= 1 && coverage >= 0.2) confidence = "medium";
  else confidence = "low";

  const storeName = receipt.store?.name ?? null;
  const receiptTotal = Number(receipt.total);

  let headline: string;
  let subtext: string;
  if (lines.length === 0) {
    headline = "Baseline building";
    subtext =
      "Scan a few more receipts with clear line prices — we'll compare your next trip to your own history and typical staple prices.";
  } else if (netDelta > 0.15) {
    headline = `About $${netDelta.toFixed(2)} more than typical on ${lines.length} item(s) we could compare`;
    subtext =
      confidence === "high"
        ? "Compared to your past buys and staple benchmarks for the same kinds of products."
        : "Based on partial coverage of this receipt — add more history for sharper insights.";
  } else if (netDelta < -0.15) {
    const saved = Math.abs(netDelta);
    headline = `About $${saved.toFixed(2)} better than typical on compared items`;
    subtext = "Nice — your usual prices for these lines were higher than this trip.";
  } else {
    headline = "In line with what you usually pay";
    subtext = `On ${lines.length} comparable line(s), prices match your history or typical staples.`;
  }

  return {
    receiptId: receipt.id,
    storeName,
    receiptTotal,
    comparedActualTotal: Math.round(comparedActual * 100) / 100,
    comparedBenchmarkTotal: Math.round(comparedBench * 100) / 100,
    netDelta,
    confidence,
    headline,
    subtext,
    lines,
  };
}
