import { Router, Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";
import { optimizeBasket } from "../services/optimizationService";

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
    const lists = await prisma.smartList.findMany({
      where: { userId: user.id },
      include: { items: true },
      orderBy: { updatedAt: "desc" },
    });
    res.json(lists);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch smart lists";
    res.status(500).json({ error: message });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
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
    const body = req.body as {
      name?: string;
      estimatedTotalSnapshot?: unknown;
      items?: { name: string; quantity?: number }[];
    };
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Shopping list";
    const rawItems = Array.isArray(body.items) ? body.items : [];
    let estimatedTotalSnapshot: number | undefined;
    if (typeof body.estimatedTotalSnapshot === "number" && Number.isFinite(body.estimatedTotalSnapshot)) {
      estimatedTotalSnapshot = body.estimatedTotalSnapshot;
    }
    const list = await prisma.smartList.create({
      data: {
        userId: user.id,
        name,
        ...(estimatedTotalSnapshot !== undefined ? { estimatedTotalSnapshot } : {}),
      },
    });
    if (rawItems.length > 0) {
      await prisma.smartListItem.createMany({
        data: rawItems.map((it) => ({
          smartListId: list.id,
          name: typeof it.name === "string" ? it.name.trim() || "Item" : "Item",
          quantity: typeof it.quantity === "number" && it.quantity > 0 ? it.quantity : 1,
        })),
      });
    }
    const withItems = await prisma.smartList.findUnique({
      where: { id: list.id },
      include: { items: true },
    });
    res.status(201).json(withItems);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create smart list";
    res.status(500).json({ error: message });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const smartListId = typeof req.params.id === "string" ? req.params.id : req.params.id[0];
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const deleted = await prisma.smartList.deleteMany({
      where: { id: smartListId, userId: user.id },
    });
    if (deleted.count === 0) {
      res.status(404).json({ error: "List not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete list";
    res.status(500).json({ error: message });
  }
});

router.post("/:id/optimize", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const smartListId = typeof req.params.id === "string" ? req.params.id : req.params.id[0];
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const result = await optimizeBasket(user.id, smartListId);
    if (!result) {
      res.status(404).json({
        error: "Smart list not found, has no items, or no historical prices for these items",
      });
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Optimization failed";
    res.status(500).json({ error: message });
  }
});

export default router;
