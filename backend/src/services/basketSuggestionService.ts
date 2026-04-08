import { prisma } from "../lib/db";
import { matchBasketToReceiptName, MATCH_THRESHOLD_PRICE, normalizeName } from "./basketMatcherEngine";
import { getItemWhereForUserReceipts } from "./basketReceiptScope";

export type BasketSuggestionRow = {
  label: string;
  matchScore: number;
  frequency: number;
  preferenceBoost: number;
  rank: number;
};

/**
 * History-powered suggestions: aggregate receipt lines that match the typed query, rank by
 * frequency, recency, match strength, and optional user preferences.
 */
export async function getBasketSuggestions(
  userId: string,
  query: string,
  limit: number
): Promise<BasketSuggestionRow[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const termKey = normalizeName(q);

  const itemWhere = await getItemWhereForUserReceipts(userId);
  const [items, prefs] = await Promise.all([
    prisma.item.findMany({
      where: itemWhere,
      include: { receipt: true },
      orderBy: { createdAt: "desc" },
      take: 4000,
    }),
    prisma.basketTermPreference.findMany({
      where: { userId, termKey },
    }),
  ]);

  const prefWeight = new Map<string, number>();
  for (const p of prefs) {
    prefWeight.set(normalizeName(p.pickedLabel), p.pickCount);
  }

  type Agg = { label: string; count: number; lastAt: number; bestScore: number };
  const agg = new Map<string, Agg>();

  for (const it of items) {
    const total = Number(it.totalPrice);
    const qty = Number(it.quantity) || 1;
    const effectiveUnitPrice = Number((it as any).unitPrice) > 0 ? Number((it as any).unitPrice) : total > 0 ? total / qty : 0;
    // Do not suggest price-less / zero-priced OCR noise lines.
    if (!Number.isFinite(effectiveUnitPrice) || effectiveUnitPrice <= 0) continue;
    const m = matchBasketToReceiptName(q, it.name);
    if (m.score < MATCH_THRESHOLD_PRICE) continue;
    const label = it.name.trim();
    if (label.length < 2) continue;
    const key = normalizeName(label);
    const t = it.receipt.date.getTime();
    const cur = agg.get(key);
    if (!cur) {
      agg.set(key, { label, count: 1, lastAt: t, bestScore: m.score });
    } else {
      cur.count++;
      cur.lastAt = Math.max(cur.lastAt, t);
      cur.bestScore = Math.max(cur.bestScore, m.score);
    }
  }

  const now = Date.now();
  const rows: BasketSuggestionRow[] = [...agg.values()].map((a) => {
    const days = Math.max(0, (now - a.lastAt) / 86400000);
    const recency = Math.max(0.25, 1 - Math.min(days, 400) / 400);
    const pref = prefWeight.get(normalizeName(a.label)) ?? 0;
    const rank =
      a.bestScore * 2.2 +
      Math.log(1 + a.count) * 1.35 +
      recency * 0.9 +
      pref * 2.5;
    return {
      label: a.label,
      matchScore: a.bestScore,
      frequency: a.count,
      preferenceBoost: pref,
      rank,
    };
  });

  rows.sort((a, b) => b.rank - a.rank);
  return rows.slice(0, Math.min(Math.max(limit, 1), 25));
}

export async function recordBasketTermPreference(
  userId: string,
  termKeyRaw: string,
  pickedLabel: string
): Promise<void> {
  const termKey = normalizeName(termKeyRaw);
  const label = pickedLabel.trim();
  if (termKey.length < 1 || label.length < 1) return;

  await prisma.basketTermPreference.upsert({
    where: {
      userId_termKey_pickedLabel: {
        userId,
        termKey,
        pickedLabel: label,
      },
    },
    create: {
      userId,
      termKey,
      pickedLabel: label,
      pickCount: 1,
      lastPickedAt: new Date(),
    },
    update: {
      pickCount: { increment: 1 },
      lastPickedAt: new Date(),
    },
  });
}
