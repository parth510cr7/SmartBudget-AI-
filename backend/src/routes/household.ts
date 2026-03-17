import { Router, Response } from "express";
import crypto from "crypto";
import { prisma } from "../lib/db";
import { AuthRequest } from "../middlewares/auth";
import { ReceiptVisibility } from "@prisma/client";

const router = Router();

const MAX_MEMBERS_DEFAULT = 5;

async function getCurrentUser(req: AuthRequest) {
  if (!req.auth) return null;
  return prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
}

async function getActiveMemberCount(householdId: string): Promise<number> {
  return prisma.householdMember.count({
    where: { householdId, status: "active" },
  });
}

async function getUserHouseholdMembership(userId: string) {
  return prisma.householdMember.findFirst({
    where: { userId, status: "active" },
    include: { household: true },
  });
}

function baseUrl(req: AuthRequest): string {
  return `${req.protocol}://${req.get("host") ?? ""}`.replace(/\/$/, "");
}

/** GET /me — returns active household membership (or null). */
router.get("/me", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const membership = await getUserHouseholdMembership(user.id);
    if (!membership) {
      res.json({ household: null });
      return;
    }
    res.json({
      household: {
        id: membership.household.id,
        name: membership.household.name,
        ownerUserId: membership.household.ownerUserId,
        maxMembers: membership.household.maxMembers,
        role: membership.role,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load household" });
  }
});

/** POST / — create a household. User can only be in one active household. */
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const existing = await getUserHouseholdMembership(user.id);
    if (existing) {
      res.status(400).json({ error: "You are already in a household. Leave it before creating a new one." });
      return;
    }
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "Household name is required" });
      return;
    }

    const household = await prisma.household.create({
      data: {
        name,
        ownerUserId: user.id,
        maxMembers: MAX_MEMBERS_DEFAULT,
        members: {
          create: {
            userId: user.id,
            role: "owner",
            status: "active",
          },
        },
      },
      include: { members: true },
    });
    res.status(201).json({ household });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create household";
    res.status(500).json({ error: msg });
  }
});

/** POST /invite — create a join token (owner only). */
router.post("/invite", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const membership = await getUserHouseholdMembership(user.id);
    if (!membership) {
      res.status(404).json({ error: "You are not in a household" });
      return;
    }
    if (membership.role !== "owner") {
      res.status(403).json({ error: "Only the household owner can invite members" });
      return;
    }

    const activeCount = await getActiveMemberCount(membership.householdId);
    if (activeCount >= (membership.household.maxMembers ?? MAX_MEMBERS_DEFAULT)) {
      res.status(400).json({ error: "Household is full (max 5 members)." });
      return;
    }

    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14); // 14 days
    const invite = await prisma.householdInvite.create({
      data: {
        token,
        householdId: membership.householdId,
        expiresAt,
      },
    });
    const inviteUrl = `${baseUrl(req)}/household/join/${invite.token}`;
    res.status(201).json({ token: invite.token, inviteUrl, expiresAt: invite.expiresAt.toISOString() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create invite" });
  }
});

/** POST /join/:token — join household by token. */
router.post("/join/:token", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const existing = await getUserHouseholdMembership(user.id);
    if (existing) {
      res.status(400).json({ error: "You are already in a household. Leave it before joining another." });
      return;
    }
    const invite = await prisma.householdInvite.findUnique({
      where: { token },
      include: { household: true },
    });
    if (!invite || invite.expiresAt < new Date()) {
      res.status(404).json({ error: "Invite link invalid or expired" });
      return;
    }
    const household = invite.household;
    const activeCount = await getActiveMemberCount(household.id);
    if (activeCount >= (household.maxMembers ?? MAX_MEMBERS_DEFAULT)) {
      res.status(400).json({ error: "Household is full (max 5 members)." });
      return;
    }
    await prisma.householdMember.create({
      data: {
        householdId: household.id,
        userId: user.id,
        role: "member",
        status: "active",
      },
    });
    res.status(200).json({ message: "Joined household", householdId: household.id });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to join household" });
  }
});

/** POST /leave — leave current household (owner cannot leave). */
router.post("/leave", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const membership = await prisma.householdMember.findFirst({
      where: { userId: user.id, status: "active" },
    });
    if (!membership) {
      res.status(200).json({ message: "Not in a household" });
      return;
    }
    if (membership.role === "owner") {
      res.status(400).json({ error: "Owner cannot leave the household." });
      return;
    }
    await prisma.householdMember.update({
      where: { id: membership.id },
      data: { status: "left" },
    });
    res.status(200).json({ message: "Left household" });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to leave household" });
  }
});

/** DELETE /members/:userId — owner removes a member (no ownership transfer). */
router.delete("/members/:userId", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const membership = await prisma.householdMember.findFirst({
      where: { userId: user.id, status: "active" },
      include: { household: true },
    });
    if (!membership) {
      res.status(404).json({ error: "You are not in a household" });
      return;
    }
    if (membership.role !== "owner") {
      res.status(403).json({ error: "Only the household owner can remove members" });
      return;
    }
    const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    if (!targetUserId) {
      res.status(400).json({ error: "userId required" });
      return;
    }
    const target = await prisma.householdMember.findFirst({
      where: { householdId: membership.householdId, userId: targetUserId, status: "active" },
    });
    if (!target) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (target.role === "owner") {
      res.status(400).json({ error: "Cannot remove household owner" });
      return;
    }
    await prisma.householdMember.update({ where: { id: target.id }, data: { status: "removed" } });
    res.status(200).json({ message: "Member removed" });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to remove member" });
  }
});

/** GET /members — list active household members (with names) */
router.get("/members", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const membership = await getUserHouseholdMembership(user.id);
    if (!membership) {
      res.json({ members: [], household: null });
      return;
    }
    const members = await prisma.householdMember.findMany({
      where: { householdId: membership.householdId, status: "active" },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    });
    res.json({
      household: {
        id: membership.householdId,
        name: membership.household.name,
        ownerUserId: membership.household.ownerUserId,
        maxMembers: membership.household.maxMembers,
      },
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        name: m.user.displayName ?? m.user.name ?? m.user.email ?? "User",
        email: m.user.email,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list members" });
  }
});

/** GET /receipts — list household shared receipts for Library (full receipt with store, items, imageUrl). */
router.get("/receipts", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const membership = await getUserHouseholdMembership(user.id);
    if (!membership) {
      res.json([]);
      return;
    }
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const receipts = await prisma.receipt.findMany({
      where: {
        householdId: membership.householdId,
        visibilityType: ReceiptVisibility.HOUSEHOLD,
        status: "VERIFIED",
      },
      include: { store: true, items: true, uploadedByUser: true },
      orderBy: { date: "desc" },
      take: limit,
    });
    const base = baseUrl(req);
    const payload = receipts.map((r) => {
      const rec = r as { imageDataBase64?: string | null; [k: string]: unknown };
      const hasStoredImage = typeof rec.imageDataBase64 === "string" && rec.imageDataBase64.length > 0;
      return {
        id: r.id,
        date: r.date.toISOString(),
        total: Number(r.total ?? 0),
        status: r.status,
        store: r.store ? { id: r.storeId, name: r.store.name } : { id: r.storeId, name: "Store" },
        items: r.items,
        uploadedBy: {
          userId: r.uploadedByUserId ?? r.userId,
          name: r.uploadedByUser?.displayName ?? r.uploadedByUser?.name ?? r.uploadedByUser?.email ?? "User",
        },
        imageUrl: hasStoredImage ? `${base}/api/receipts/${r.id}/image` : (r.imageUrl ?? null),
      };
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load household receipts" });
  }
});

/** GET /dashboard — shared household analytics (household receipts only). */
router.get("/dashboard", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const membership = await getUserHouseholdMembership(user.id);
    if (!membership) {
      res.json({
        household: null,
        totals: { totalSpend: 0 },
        categoryTotals: [],
        storeTotals: [],
        recentReceipts: [],
      });
      return;
    }

    const householdId = membership.householdId;

    const receipts = await prisma.receipt.findMany({
      where: {
        householdId,
        visibilityType: ReceiptVisibility.HOUSEHOLD,
        status: "VERIFIED",
      },
      include: {
        store: true,
        items: true,
        uploadedByUser: true,
      },
      orderBy: { date: "desc" },
      take: 30,
    });

    const totalSpend = receipts.reduce((s, r) => s + Number(r.total ?? 0), 0);

    const categoryMap = new Map<string, number>();
    const storeMap = new Map<string, { storeId: string; storeName: string; total: number }>();

    for (const r of receipts) {
      const storeKey = r.storeId;
      const existingStore = storeMap.get(storeKey) ?? {
        storeId: r.storeId,
        storeName: r.store?.name ?? "Store",
        total: 0,
      };
      existingStore.total += Number(r.total ?? 0);
      storeMap.set(storeKey, existingStore);

      for (const it of r.items ?? []) {
        const cat = (it.category ?? "Other").trim() || "Other";
        categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + Number(it.totalPrice ?? 0));
      }
    }

    const categoryTotals = Array.from(categoryMap.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);

    const storeTotals = Array.from(storeMap.values()).sort((a, b) => b.total - a.total);

    const recentReceipts = receipts.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      total: Number(r.total ?? 0),
      store: { id: r.storeId, name: r.store?.name ?? "Store" },
      uploadedBy: {
        userId: r.uploadedByUserId ?? r.userId,
        name: r.uploadedByUser?.displayName ?? r.uploadedByUser?.name ?? r.uploadedByUser?.email ?? "User",
      },
    }));

    res.json({
      household: {
        id: membership.householdId,
        name: membership.household.name,
        ownerUserId: membership.household.ownerUserId,
        maxMembers: membership.household.maxMembers,
      },
      totals: { totalSpend },
      categoryTotals,
      storeTotals,
      recentReceipts,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load dashboard" });
  }
});

export default router;

