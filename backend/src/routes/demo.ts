import { Router, Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";

const router = Router();

const DEMO_STORES = [
  { name: "Walmart", address: "123 Main St" },
  { name: "Target", address: "456 Oak Ave" },
];

const DEMO_ITEMS = [
  { name: "Milk 2%", rawName: "Milk 2%", quantity: 1, unit: "item", unitPrice: 3.99, totalPrice: 3.99, category: "Groceries" },
  { name: "Bread", rawName: "Whole Wheat Bread", quantity: 1, unit: "item", unitPrice: 2.49, totalPrice: 2.49, category: "Groceries" },
  { name: "Eggs", rawName: "Dozen Eggs", quantity: 1, unit: "item", unitPrice: 4.29, totalPrice: 4.29, category: "Groceries" },
  { name: "Bananas", rawName: "Organic Bananas", quantity: 1.2, unit: "lb", unitPrice: 0.79, totalPrice: 0.95, category: "Groceries" },
  { name: "Chicken Breast", rawName: "Chicken Breast 1lb", quantity: 1, unit: "lb", unitPrice: 5.99, totalPrice: 5.99, category: "Groceries" },
  { name: "Paper Towels", rawName: "Bounty Paper Towels", quantity: 1, unit: "item", unitPrice: 12.99, totalPrice: 12.99, category: "Household" },
  { name: "Dish Soap", rawName: "Dawn Dish Soap", quantity: 1, unit: "item", unitPrice: 4.49, totalPrice: 4.49, category: "Household" },
  { name: "Apples", rawName: "Gala Apples", quantity: 2, unit: "item", unitPrice: 1.29, totalPrice: 2.58, category: "Groceries" },
];

function randomItems(count: number) {
  const shuffled = [...DEMO_ITEMS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

router.post("/seed", async (req: AuthRequest, res: Response) => {
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

    const storeIds: string[] = [];
    for (const s of DEMO_STORES) {
      const store = await prisma.store.upsert({
        where: { userId_name: { userId: user.id, name: s.name } },
        create: { userId: user.id, name: s.name, address: s.address ?? undefined },
        update: {},
      });
      storeIds.push(store.id);
    }

    const receiptCount = 8;
    const now = new Date();
    for (let i = 0; i < receiptCount; i++) {
      const storeId = storeIds[i % storeIds.length];
      const items = randomItems(3 + (i % 4));
      const subtotal = items.reduce((sum, it) => sum + it.totalPrice, 0);
      const tax = Math.round(subtotal * 0.08 * 100) / 100;
      const total = Math.round((subtotal + tax) * 100) / 100;
      const date = new Date(now);
      date.setDate(date.getDate() - i * 2);

      const receipt = await prisma.receipt.create({
        data: {
          userId: user.id,
          storeId,
          date,
          subtotal,
          tax,
          total,
        },
      });
      await prisma.item.createMany({
        data: items.map((it) => ({
          receiptId: receipt.id,
          name: it.name,
          rawName: it.rawName,
          quantity: it.quantity,
          unit: (it as { unit?: string }).unit ?? "item",
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
          category: it.category,
        })),
      });
    }

    res.status(200).json({ ok: true, receipts: receiptCount, stores: storeIds.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Seed failed";
    res.status(500).json({ error: message });
  }
});

export default router;
