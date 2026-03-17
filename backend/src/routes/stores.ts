import { Router, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";

const router = Router();

/** GET / — list stores from user's receipts (id, name, address) for "My stores" / edit address. */
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
    const stores = await prisma.store.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, address: true },
      orderBy: { name: "asc" },
    });
    res.json(stores);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch stores";
    res.status(500).json({ error: message });
  }
});

/** PATCH /:id — update store address (for Maps / "My stores"). */
router.patch("/:id", async (req: AuthRequest, res: Response) => {
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
    const storeId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!storeId) {
      res.status(400).json({ error: "Store ID required" });
      return;
    }
    const body = (req.body ?? {}) as { address?: string };
    const address = typeof body.address === "string" ? body.address.trim() || null : undefined;
    if (address === undefined) {
      res.status(400).json({ error: "Provide address (string) to update" });
      return;
    }
    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: user.id },
    });
    if (!store) {
      res.status(404).json({ error: "Store not found" });
      return;
    }
    const updated = await prisma.store.update({
      where: { id: storeId },
      data: { address: address ?? null },
    });
    res.json({ id: updated.id, name: updated.name, address: updated.address });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update store";
    res.status(500).json({ error: message });
  }
});

export default router;
