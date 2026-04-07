import { Router, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";
import { getBasketInsights } from "../services/basketInsightsService";
import { getBasketSuggestions, recordBasketTermPreference } from "../services/basketSuggestionService";

const router = Router();

/** POST /insights – basket-first price intelligence (best store, your history, group, shared, nearby community, multi-store) */
router.post("/insights", async (req: AuthRequest, res: Response) => {
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
    const body = (req.body ?? {}) as Record<string, unknown>;
    const itemNames = Array.isArray(body.itemNames)
      ? (body.itemNames as unknown[]).map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean)
      : [];
    const lat = typeof body.lat === "number" && !Number.isNaN(body.lat) ? body.lat : undefined;
    const lng = typeof body.lng === "number" && !Number.isNaN(body.lng) ? body.lng : undefined;
    const locationAccuracy =
      body.locationAccuracy === "precise" || body.locationAccuracy === "approximate"
        ? body.locationAccuracy
        : null;

    const result = await getBasketInsights(user.id, {
      itemNames,
      lat,
      lng,
      locationAccuracy,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Basket insights failed";
    res.status(500).json({ error: message });
  }
});

/** POST /suggestions — receipt-history item suggestions for the current basket input */
router.post("/suggestions", async (req: AuthRequest, res: Response) => {
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
    const body = (req.body ?? {}) as Record<string, unknown>;
    const query = typeof body.query === "string" ? body.query : "";
    const limit = typeof body.limit === "number" && body.limit > 0 ? Math.min(body.limit, 25) : 12;
    const suggestions = await getBasketSuggestions(user.id, query, limit);
    res.json({ suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Suggestions failed";
    res.status(500).json({ error: message });
  }
});

/** POST /preference — record that user chose a specific label for a broad typed term */
router.post("/preference", async (req: AuthRequest, res: Response) => {
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
    const body = (req.body ?? {}) as Record<string, unknown>;
    const termKey = typeof body.termKey === "string" ? body.termKey : "";
    const pickedLabel = typeof body.pickedLabel === "string" ? body.pickedLabel : "";
    await recordBasketTermPreference(user.id, termKey, pickedLabel);
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preference save failed";
    res.status(500).json({ error: message });
  }
});

export default router;
