import { Router, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";
import { runAppQuery } from "../services/appQueryService";
import { API_VERSION } from "../constants/api";

const router = Router();

function buildReceiptContext(receipts: { date: Date; total: number; store: { name: string }; items: { name: string; rawName: string; totalPrice: number }[] }[]): string {
  if (!receipts.length) return "The user has no receipts or transactions yet.";
  const lines: string[] = [];
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  let totalAll = 0;
  const byStore: Record<string, number> = {};
  for (const r of receipts) {
    const date = new Date(r.date);
    const total = Number(r.total);
    totalAll += total;
    const storeName = r.store?.name ?? "Unknown";
    byStore[storeName] = (byStore[storeName] ?? 0) + total;
    const dateStr = date.toISOString().slice(0, 10);
    const itemSummary = (r.items ?? []).slice(0, 20).map((i) => `${i.name ?? i.rawName}: $${Number(i.totalPrice).toFixed(2)}`).join(", ");
    lines.push(`- ${dateStr} | ${storeName} | $${total.toFixed(2)} | Items: ${itemSummary || "—"}`);
  }
  const last30Total = receipts.filter((r) => new Date(r.date) >= last30).reduce((s, r) => s + Number(r.total), 0);
  const storeSummary = Object.entries(byStore).map(([name, amt]) => `${name}: $${amt.toFixed(2)}`).join("; ");
  return [
    `User has ${receipts.length} receipt(s). Total spent (all time): $${totalAll.toFixed(2)}. Total in last 30 days: $${last30Total.toFixed(2)}. By store: ${storeSummary}.`,
    "Receipts (date | store | total | items):",
    ...lines.slice(0, 50),
  ].join("\n");
}

router.post("/chat", async (req: AuthRequest, res: Response) => {
  try {
    const requestId = typeof (req as unknown as { requestId?: unknown }).requestId === "string"
      ? ((req as unknown as { requestId: string }).requestId)
      : undefined;
    const meta = { ...(requestId ? { requestId } : {}), apiVersion: API_VERSION };
    const { message } = (req.body as { message?: string }) ?? {};
    const userMessage = typeof message === "string" ? message.trim() : "";
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized", meta });
      return;
    }
    const user = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!user) {
      res.status(404).json({ error: "User not found", meta });
      return;
    }
    const receipts = await prisma.receipt.findMany({
      where: { userId: user.id },
      include: { store: true, items: true },
      orderBy: { date: "desc" },
    });
    // Cloud chat is disabled; provide a deterministic, item-aware fallback instead of a generic error.
    // This keeps Search useful for queries like "Milk" without requiring an LLM.
    const q = userMessage || "summary";
    const app = await runAppQuery(user.id, q);
    const context = buildReceiptContext(receipts);
    const reply = [app.answer, "", "—", "", "Data source: your verified receipts.", `Receipts analyzed: ${receipts.length}.`].join("\n");
    res.json({
      reply,
      data: app.data,
      debug: { mode: "fallback_app_query", contextPreview: context.slice(0, 500) },
      meta,
    });
  } catch (err) {
    console.error("AI chat failed:", err);
    res.json({
      reply: "I couldn't analyze your receipts right now. If this keeps happening, try adding more verified receipts with readable line-item prices.",
      meta: { apiVersion: API_VERSION },
    });
  }
});

export default router;
