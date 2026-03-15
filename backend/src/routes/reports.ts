import { Router, Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";

const router = Router();

function getDateRange(period: "Weekly" | "Monthly"): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (period === "Weekly") {
    start.setDate(start.getDate() - 7);
  } else {
    start.setMonth(start.getMonth() - 1);
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

router.post("/generate", async (req: AuthRequest, res: Response) => {
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

    const period = (req.body?.period as string) ?? "Monthly";
    const validPeriod = period === "Weekly" || period === "Monthly" ? period : "Monthly";
    const { start, end } = getDateRange(validPeriod);

    const receipts = await prisma.receipt.findMany({
      where: {
        userId: user.id,
        status: "VERIFIED",
        date: { gte: start, lte: end },
      },
      include: { items: true },
    });

    const totalSpent = receipts.reduce((sum, r) => sum + Number(r.total), 0);
    const categorySums: Record<string, number> = {};
    for (const r of receipts) {
      for (const item of r.items) {
        const cat = item.category ?? "Other";
        categorySums[cat] = (categorySums[cat] ?? 0) + Number(item.totalPrice);
      }
    }
    const topCategories = Object.entries(categorySums)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const prevRange = validPeriod === "Weekly"
      ? { start: new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000), end: new Date(start.getTime() - 1) }
      : { start: new Date(start.getFullYear(), start.getMonth() - 1, 1), end: new Date(start.getTime() - 1) };
    const prevReceipts = await prisma.receipt.findMany({
      where: {
        userId: user.id,
        status: "VERIFIED",
        date: { gte: prevRange.start, lte: prevRange.end },
      },
      include: { items: true },
    });
    const prevCategorySums: Record<string, number> = {};
    for (const r of prevReceipts) {
      for (const item of r.items) {
        const cat = item.category ?? "Other";
        prevCategorySums[cat] = (prevCategorySums[cat] ?? 0) + Number(item.totalPrice);
      }
    }

    let smartSuggestion = "Keep tracking to get personalized suggestions.";
    const topCat = topCategories[0];
    if (topCat && prevCategorySums[topCat.name] != null && prevCategorySums[topCat.name] > 0) {
      const prevVal = prevCategorySums[topCat.name];
      const pct = Math.round(((topCat.amount - prevVal) / prevVal) * 100);
      if (pct > 0) {
        smartSuggestion = `You spent ${pct}% more on ${topCat.name} than ${validPeriod === "Weekly" ? "last week" : "last month"}.`;
      } else if (pct < 0) {
        smartSuggestion = `You spent ${Math.abs(pct)}% less on ${topCat.name} than ${validPeriod === "Weekly" ? "last week" : "last month"}.`;
      }
    }

    res.status(200).json({
      period: validPeriod,
      totalSpent,
      totalSaved: 0,
      topCategories,
      smartSuggestion,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Report generation failed";
    res.status(500).json({ error: message });
  }
});

export default router;
