import { Router, Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";

const router = Router();

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    // MANDATORY: store + items required for Insights Basket price comparison (buildItemPricesFromReceipts)
    const receipts = await prisma.receipt.findMany({
      where: { userId: user.id },
      include: { store: true, items: true },
      orderBy: { date: "desc" },
    });
    res.json(receipts);
    // Note: analytics (summary, stores) use only VERIFIED receipts below.
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch transactions";
    res.status(500).json({ error: message });
  }
});

router.get("/stores", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const receipts = await prisma.receipt.findMany({
      where: { userId: user.id, status: "VERIFIED" },
      include: { store: true },
    });
    const byStore: Record<string, { name: string; visits: number; totalSpent: number }> = {};
    for (const r of receipts) {
      const name = r.store?.name ?? "Unknown";
      if (!byStore[name]) {
        byStore[name] = { name, visits: 0, totalSpent: 0 };
      }
      byStore[name].visits += 1;
      byStore[name].totalSpent += Number(r.total);
    }
    const list = Object.values(byStore).sort((a, b) => b.totalSpent - a.totalSpent);
    res.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch stores";
    res.status(500).json({ error: message });
  }
});

router.get("/summary", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const receipts = await prisma.receipt.findMany({
      where: { userId: user.id, status: "VERIFIED" },
      include: { store: true, items: true },
    });

    let totalSpent = receipts.reduce((sum, r) => sum + Number(r.total), 0);
    const storeIds = new Set(receipts.map((r) => r.storeId));
    let totalStores = storeIds.size;

    const categorySums: Record<string, number> = {};
    // Category aggregation should reconcile with receipt totals even when item extraction is partial.
    // We attribute priced line items to their categories, and place any un-attributed remainder into Other.
    for (const r of receipts) {
      let attributed = 0;
      for (const item of r.items) {
        const itemTotal = Number(item.totalPrice);
        if (!Number.isFinite(itemTotal) || itemTotal <= 0) continue;
        const cat = (item.category ?? "").trim() || "Other";
        categorySums[cat] = (categorySums[cat] ?? 0) + itemTotal;
        attributed += itemTotal;
      }
      const receiptTotal = Number(r.total);
      const remainder = Number.isFinite(receiptTotal) ? receiptTotal - attributed : 0;
      if (remainder > 0.01) {
        categorySums["Other"] = (categorySums["Other"] ?? 0) + remainder;
      }
    }

    // Include user's share of group expenses in total and categories
    const mySplits = await prisma.expenseSplit.findMany({
      where: { userId: user.id },
      include: { expense: { select: { category: true } } },
    });
    for (const split of mySplits) {
      const amount = Number(split.amountOwed);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      totalSpent += amount;
      const cat = (split.expense?.category ?? "").trim() || "Other";
      categorySums[cat] = (categorySums[cat] ?? 0) + amount;
    }

    const categories = Object.entries(categorySums)
      .map(([name, amount]) => ({
        name,
        amount,
        progress: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    res.json({
      totalSpent,
      totalStores,
      categories,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get summary";
    res.status(500).json({ error: message });
  }
});

/** GET /search-stats — snapshot for Search tab empty state (VERIFIED receipts; 30-day window in UTC). */
router.get("/search-stats", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const receipts = await prisma.receipt.findMany({
      where: { userId: user.id, status: "VERIFIED" },
      include: { store: true, items: true },
    });

    // Most visited store (receipt count per store)
    const byStoreKey = new Map<string, { name: string; visits: number }>();
    for (const r of receipts) {
      const key = r.storeId;
      const name = r.store?.name ?? "Unknown";
      const cur = byStoreKey.get(key) ?? { name, visits: 0 };
      cur.visits += 1;
      byStoreKey.set(key, cur);
    }
    let mostVisitedStore: { name: string; visits: number } | null = null;
    for (const v of byStoreKey.values()) {
      if (!mostVisitedStore || v.visits > mostVisitedStore.visits) {
        mostVisitedStore = { name: v.name, visits: v.visits };
      }
    }

    // Top category — same receipt + split rules as GET /summary
    const categorySums: Record<string, number> = {};
    for (const r of receipts) {
      let attributed = 0;
      for (const item of r.items) {
        const itemTotal = Number(item.totalPrice);
        if (!Number.isFinite(itemTotal) || itemTotal <= 0) continue;
        const cat = (item.category ?? "").trim() || "Other";
        categorySums[cat] = (categorySums[cat] ?? 0) + itemTotal;
        attributed += itemTotal;
      }
      const receiptTotal = Number(r.total);
      const remainder = Number.isFinite(receiptTotal) ? receiptTotal - attributed : 0;
      if (remainder > 0.01) {
        categorySums["Other"] = (categorySums["Other"] ?? 0) + remainder;
      }
    }
    const mySplits = await prisma.expenseSplit.findMany({
      where: { userId: user.id },
      include: { expense: { select: { category: true } } },
    });
    for (const split of mySplits) {
      const amount = Number(split.amountOwed);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const cat = (split.expense?.category ?? "").trim() || "Other";
      categorySums[cat] = (categorySums[cat] ?? 0) + amount;
    }
    const sortedCats = Object.entries(categorySums).sort((a, b) => b[1] - a[1]);
    const topCategory =
      sortedCats.length > 0 ? { name: sortedCats[0][0], amount: sortedCats[0][1] } : null;

    // Last 30 calendar days (UTC): sum VERIFIED receipt totals, avg per day = total / 30
    const now = new Date();
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30));
    let totalSpend30 = 0;
    for (const r of receipts) {
      const d = r.date;
      if (d >= cutoff) {
        totalSpend30 += Number(r.total);
      }
    }
    const avgPerDay = totalSpend30 / 30;
    const last30Days = {
      totalSpend: totalSpend30,
      avgPerDay: Number.isFinite(avgPerDay) ? avgPerDay : 0,
    };

    // Community: weighted average price across aggregates (global, not user-specific)
    const aggRows = await prisma.communityPriceAggregate.findMany({
      select: { averagePrice: true, dataPointCount: true },
    });
    let weightedSum = 0;
    let weightTotal = 0;
    for (const row of aggRows) {
      const w = row.dataPointCount;
      if (!Number.isFinite(w) || w <= 0) continue;
      weightedSum += row.averagePrice * w;
      weightTotal += w;
    }
    const community =
      weightTotal > 0 ? { weightedAvgPrice: weightedSum / weightTotal } : null;

    res.json({
      mostVisitedStore,
      topCategory,
      last30Days,
      community,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get search stats";
    res.status(500).json({ error: message });
  }
});

router.delete("/purge/all", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const ownedGroupIds = (await prisma.group.findMany({ where: { ownerId: user.id }, select: { id: true } })).map((g) => g.id);
    if (ownedGroupIds.length > 0) {
      await prisma.activityLog.deleteMany({ where: { groupId: { in: ownedGroupIds } } });
      await prisma.expenseSplit.deleteMany({ where: { expense: { groupId: { in: ownedGroupIds } } } });
      await prisma.expense.deleteMany({ where: { groupId: { in: ownedGroupIds } } });
      await prisma.payment.deleteMany({ where: { groupId: { in: ownedGroupIds } } });
      await prisma.balance.deleteMany({ where: { groupId: { in: ownedGroupIds } } });
      await prisma.groupMember.deleteMany({ where: { groupId: { in: ownedGroupIds } } });
      await prisma.group.deleteMany({ where: { id: { in: ownedGroupIds } } });
    }

    await prisma.receipt.deleteMany({ where: { userId: user.id } });

    res.status(200).json({ message: "All data erased successfully." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Purge failed";
    res.status(500).json({ error: message });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const modeRaw = req.query.mode;
    const mode = (Array.isArray(modeRaw) ? modeRaw[0] : modeRaw) ?? "all";

    const receipt = await prisma.receipt.findFirst({
      where: { id, userId: user.id },
    });
    if (!receipt) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    if (mode === "imageOnly") {
      await prisma.receipt.update({
        where: { id },
        // "Photo only" must clear all stored image sources so Library thumbnail actually disappears.
        data: { imageUrl: null, imageDataBase64: null },
      });
    } else {
      await prisma.receipt.delete({
        where: { id },
      });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    res.status(500).json({ error: message });
  }
});

export default router;
