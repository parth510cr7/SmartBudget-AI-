import { Router, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";
import type { Prisma } from "@prisma/client";

const router = Router();

const ALLOWED_SHARE_SCOPES = ["ALL", "STORE", "ITEM", "CATEGORY", "DATE_RANGE", "SELECTED_RECORDS"] as const;
type ShareScope = (typeof ALLOWED_SHARE_SCOPES)[number];

function parseScopeConfig(body: Record<string, unknown>): Record<string, unknown> | null {
  const storeNames = Array.isArray(body.storeNames) ? body.storeNames.filter((x): x is string => typeof x === "string") : undefined;
  const itemNames = Array.isArray(body.itemNames) ? body.itemNames.filter((x): x is string => typeof x === "string") : undefined;
  const categories = Array.isArray(body.categories) ? body.categories.filter((x): x is string => typeof x === "string") : undefined;
  const startDate = typeof body.startDate === "string" ? body.startDate : undefined;
  const endDate = typeof body.endDate === "string" ? body.endDate : undefined;
  const recordIds = Array.isArray(body.recordIds) ? body.recordIds.filter((x): x is string => typeof x === "string") : undefined;
  if (!storeNames?.length && !itemNames?.length && !categories?.length && !startDate && !endDate && !recordIds?.length) return null;
  return { storeNames, itemNames, categories, startDate, endDate, recordIds } as Record<string, unknown>;
}

/** POST /share/private – create a permission to share prices with a friend */
router.post("/share/private", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : null;
    const rawScope = typeof body.shareScope === "string" ? body.shareScope.trim().toUpperCase() : "ALL";
    const shareScope: ShareScope = ALLOWED_SHARE_SCOPES.includes(rawScope as ShareScope) ? (rawScope as ShareScope) : "ALL";
    if (!targetUserId) {
      res.status(400).json({ error: "targetUserId is required" });
      return;
    }
    const scopeConfig = parseScopeConfig(body);
    await prisma.priceSharePermission.create({
      data: {
        ownerUserId: user.id,
        targetUserId,
        targetGroupId: null,
        permissionType: "PRIVATE_SHARE",
        shareScope,
        scopeConfig: scopeConfig != null ? (scopeConfig as Prisma.InputJsonValue) : undefined,
      },
    });
    res.status(201).json({ success: true, message: "Share permission created" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create share permission";
    res.status(500).json({ error: message });
  }
});

/** GET /group – PriceRecords from all groups the current user is a member of (shareMode GROUP) */
router.get("/group", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const memberships = await prisma.groupMember.findMany({
      where: { userId: user.id },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId).filter(Boolean);
    if (groupIds.length === 0) {
      res.json([]);
      return;
    }
    const records = await prisma.priceRecord.findMany({
      where: { groupId: { in: groupIds }, shareMode: "GROUP" },
      orderBy: { purchaseDate: "desc" },
      take: 200,
      include: { createdBy: { select: { id: true, name: true, displayName: true } } },
    });
    res.json(records.map((r) => ({ ...r, createdByUser: r.createdBy ? { id: r.createdBy.id, name: r.createdBy.name ?? r.createdBy.displayName ?? "Unknown" } : undefined })));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch group prices";
    res.status(500).json({ error: message });
  }
});

/** GET /group/:groupId – PriceRecords for one group (user must be member) */
router.get("/group/:groupId", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const groupId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
    if (!groupId) {
      res.status(400).json({ error: "groupId is required" });
      return;
    }
    const group = await prisma.group.findFirst({
      where: { id: groupId },
      select: { ownerId: true, members: { select: { userId: true } } },
    });
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const isMember = group.ownerId === user.id || group.members.some((m: { userId: string }) => m.userId === user.id);
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this group" });
      return;
    }
    const records = await prisma.priceRecord.findMany({
      where: { groupId, shareMode: "GROUP" },
      orderBy: { purchaseDate: "desc" },
      take: 100,
      include: { createdBy: { select: { id: true, name: true, displayName: true } } },
    });
    const price_records = records.map((r) => ({
      id: r.id,
      canonicalItemName: r.canonicalItemName ?? undefined,
      canonicalStoreName: r.canonicalStoreName ?? r.storeName ?? undefined,
      rawItemName: r.rawItemName,
      rawStoreName: r.rawStoreName ?? r.storeName ?? undefined,
      price: r.price,
      normalizedUnitPrice: r.normalizedUnitPrice ?? undefined,
      purchaseDate: r.purchaseDate,
      createdByUserId: r.createdByUserId ?? undefined,
      createdByUser: r.createdBy ? { id: r.createdBy.id, name: r.createdBy.name ?? r.createdBy.displayName ?? "Unknown" } : undefined,
      cityOrArea: r.cityOrArea ?? undefined,
      confidenceScore: r.confidenceScore ?? undefined,
    }));
    res.json(price_records);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch group prices";
    res.status(500).json({ error: message });
  }
});

/** GET /shared – PriceRecords shared with the current user via non-revoked permissions */
router.get("/shared", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const permissions = await prisma.priceSharePermission.findMany({
      where: { targetUserId: user.id, revokedAt: null },
    });
    const ownerIds = [...new Set(permissions.map((p) => p.ownerUserId))];
    if (ownerIds.length === 0) {
      res.json([]);
      return;
    }
    const records = await prisma.priceRecord.findMany({
      where: {
        ownerUserId: { in: ownerIds },
        shareMode: "PRIVATE",
      },
      orderBy: { purchaseDate: "desc" },
      take: 200,
      include: { createdBy: { select: { id: true, name: true, displayName: true } } },
    });
    res.json(records.map((r) => ({ ...r, createdByUser: r.createdBy ? { id: r.createdBy.id, name: r.createdBy.name ?? r.createdBy.displayName ?? "Unknown" } : undefined })));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch shared prices";
    res.status(500).json({ error: message });
  }
});

/** POST /community/opt-in – set user's community opt-in (for contributing to aggregates) */
router.post("/community/opt-in", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { isCommunityOptIn: true },
    });
    res.json({ success: true, isCommunityOptIn: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to opt in";
    res.status(500).json({ error: message });
  }
});

/** POST /community/opt-out – opt-out stops future community contribution; existing aggregates follow system policy */
router.post("/community/opt-out", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { isCommunityOptIn: false },
    });
    res.json({ success: true, isCommunityOptIn: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to opt out";
    res.status(500).json({ error: message });
  }
});

/** GET /community – aggregated community prices (no raw rows) */
router.get("/community", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const aggregates = await prisma.communityPriceAggregate.findMany({
      orderBy: { dataPointCount: "desc" },
      take: 500,
    });
    res.json(aggregates);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch community aggregates";
    res.status(500).json({ error: message });
  }
});

/** POST /admin/run-aggregation – dev-only; runs community aggregation. Disabled in production. */
router.post("/admin/run-aggregation", async (req: AuthRequest, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not available" });
    return;
  }
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { generateCommunityAggregates } = await import("../services/communityService");
    const count = await generateCommunityAggregates();
    res.json({ success: true, aggregatesUpdated: count });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Aggregation failed";
    res.status(500).json({ error: message });
  }
});

export default router;
