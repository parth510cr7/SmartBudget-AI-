import { Router, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";
import { getBasketInsights } from "../services/basketInsightsService";
import { getBasketSuggestions, recordBasketTermPreference } from "../services/basketSuggestionService";
import { apiLog } from "../lib/apiLog";
import { API_VERSION } from "../constants/api";

const router = Router();

/** POST /insights – basket-first price intelligence (best store, your history, group, shared, nearby community, multi-store) */
router.post("/insights", async (req: AuthRequest, res: Response) => {
  try {
    const requestId = typeof (req as unknown as { requestId?: unknown }).requestId === "string"
      ? ((req as unknown as { requestId: string }).requestId)
      : undefined;
    const meta = { ...(requestId ? { requestId } : {}), apiVersion: API_VERSION };
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized", meta });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found", meta });
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

    apiLog("basket.insights", "request", {
      requestId,
      itemCount: itemNames.length,
      sampleItems: itemNames.slice(0, 6),
      hasLatLng: typeof lat === "number" && typeof lng === "number",
      locationAccuracy,
    });

    const result = await getBasketInsights(user.id, {
      itemNames,
      lat,
      lng,
      locationAccuracy,
    });

    apiLog("basket.insights", "response", {
      requestId,
      receiptCount: result.receiptCount ?? null,
      enabled: Boolean(result.bestStore?.enabled),
      est: result.estimatedTotalKnownData,
      itemsMatchedCount: result.bestStore?.itemsMatchedCount ?? null,
      itemsTotalCount: result.bestStore?.itemsTotalCount ?? null,
      why: result.bestStore?.whyNoRecommendation ?? null,
      unmatched: (result.unmatchedBasketLines ?? []).slice(0, 8),
    });
    res.json({
      ...result,
      meta,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Basket insights failed";
    res.status(500).json({ error: message, meta: { apiVersion: API_VERSION } });
  }
});

/** POST /suggestions — receipt-history item suggestions for the current basket input */
router.post("/suggestions", async (req: AuthRequest, res: Response) => {
  try {
    const requestId = typeof (req as unknown as { requestId?: unknown }).requestId === "string"
      ? ((req as unknown as { requestId: string }).requestId)
      : undefined;
    const meta = { ...(requestId ? { requestId } : {}), apiVersion: API_VERSION };
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized", meta });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found", meta });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const query = typeof body.query === "string" ? body.query : "";
    const limit = typeof body.limit === "number" && body.limit > 0 ? Math.min(body.limit, 25) : 12;

    apiLog("basket.suggestions", "request", {
      requestId,
      qLen: query.trim().length,
      qSample: query.trim().slice(0, 40),
      limit,
    });

    const suggestions = await getBasketSuggestions(user.id, query, limit);

    apiLog("basket.suggestions", "response", {
      requestId,
      count: Array.isArray(suggestions) ? suggestions.length : 0,
      top: Array.isArray(suggestions)
        ? suggestions.slice(0, 6).map((s) => ({ label: s.label, score: s.matchScore, freq: s.frequency }))
        : [],
    });
    res.json({ suggestions, meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Suggestions failed";
    res.status(500).json({ error: message, meta: { apiVersion: API_VERSION } });
  }
});

/** POST /preference — record that user chose a specific label for a broad typed term */
router.post("/preference", async (req: AuthRequest, res: Response) => {
  try {
    const requestId = typeof (req as unknown as { requestId?: unknown }).requestId === "string"
      ? ((req as unknown as { requestId: string }).requestId)
      : undefined;
    const meta = { ...(requestId ? { requestId } : {}), apiVersion: API_VERSION };
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized", meta });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { firebaseId: req.auth.uid },
    });
    if (!user) {
      res.status(404).json({ error: "User not found", meta });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const termKey = typeof body.termKey === "string" ? body.termKey : "";
    const pickedLabel = typeof body.pickedLabel === "string" ? body.pickedLabel : "";
    await recordBasketTermPreference(user.id, termKey, pickedLabel);
    res.json({ ok: true, meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preference save failed";
    res.status(500).json({ error: message, meta: { apiVersion: API_VERSION } });
  }
});

export default router;
