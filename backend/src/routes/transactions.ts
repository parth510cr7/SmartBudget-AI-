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

    const totalSpent = receipts.reduce((sum, r) => sum + Number(r.total), 0);
    const storeIds = new Set(receipts.map((r) => r.storeId));
    const totalStores = storeIds.size;

    const categorySums: Record<string, number> = {};
    for (const r of receipts) {
      for (const item of r.items) {
        const cat = item.category ?? "Other";
        categorySums[cat] = (categorySums[cat] ?? 0) + Number(item.totalPrice);
      }
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
        data: { imageUrl: null },
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
