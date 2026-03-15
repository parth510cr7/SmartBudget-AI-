import { Router, Request, Response } from "express";
import crypto from "crypto";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";
import {
  getBalancesForGroup,
  simplifyDebts,
  computeSplits,
  updateBalancesForExpense,
} from "../services/expenseService";

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

    const memberships = await prisma.groupMember.findMany({
      where: { userId: user.id },
      include: { group: true },
    });
    const owned = await prisma.group.findMany({
      where: { ownerId: user.id },
      include: { members: true },
    });

    const groupIds = new Set<string>();
    const list: { id: string; name: string; createdAt: string; isOwner: boolean }[] = [];
    for (const g of owned) {
      if (!groupIds.has(g.id)) {
        groupIds.add(g.id);
        list.push({
          id: g.id,
          name: g.name,
          createdAt: g.createdAt.toISOString(),
          isOwner: true,
        });
      }
    }
    for (const m of memberships) {
      if (!groupIds.has(m.group.id)) {
        groupIds.add(m.group.id);
        list.push({
          id: m.group.id,
          name: m.group.name,
          createdAt: m.group.createdAt.toISOString(),
          isOwner: m.group.ownerId === user.id,
        });
      }
    }

    res.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list groups";
    res.status(500).json({ error: message });
  }
});

/** POST /join/:token — add current user to group using invite token (no auth required for the link, but joining requires auth). */
router.post("/join/:token", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const currentUser = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const invite = await prisma.groupInviteLink.findUnique({
      where: { token },
      include: { group: { include: { members: true } } },
    });
    if (!invite || invite.expiresAt < new Date()) {
      res.status(404).json({ error: "Invite link invalid or expired" });
      return;
    }
    const { group } = invite;
    const alreadyMember =
      group.ownerId === currentUser.id || group.members.some((m) => m.userId === currentUser.id);
    if (alreadyMember) {
      res.status(200).json({ message: "Already in group", groupId: group.id });
      return;
    }
    await prisma.groupMember.create({
      data: { groupId: group.id, userId: currentUser.id, role: "MEMBER" },
    });
    res.status(200).json({ message: "Joined group", groupId: group.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to join group";
    res.status(500).json({ error: message });
  }
});

router.delete("/:id/members/:userId", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const currentUser = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const groupId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const group = await prisma.group.findFirst({
      where: { id: groupId },
      include: { members: true },
    });
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (group.ownerId !== currentUser.id) {
      res.status(403).json({ error: "Only group owner can remove members" });
      return;
    }
    const member = group.members.find((m) => m.userId === targetUserId);
    if (!member) {
      res.status(404).json({ error: "Member not found in this group" });
      return;
    }
    const outstanding = await prisma.balance.findMany({
      where: {
        groupId,
        OR: [{ user1Id: targetUserId }, { user2Id: targetUserId }],
      },
    });
    const hasBalance = outstanding.some((b) => Math.abs(b.balanceAmount) >= 0.01);
    if (hasBalance) {
      res.status(400).json({ error: "This member has unsettled balances and can't be removed yet." });
      return;
    }
    await prisma.groupMember.deleteMany({ where: { groupId, userId: targetUserId } });
    res.status(200).json({ message: "Member removed" });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Failed to remove member";
    const safe = /Prisma|Invalid `|raw/.test(raw) ? "Could not remove this member. Please try again." : raw;
    res.status(500).json({ error: safe });
  }
});

/** GET /:id/members/:userId/details — member stats (groups count). Caller must be in the same group. */
router.get("/:id/members/:userId/details", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const currentUser = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const groupId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const group = await prisma.group.findFirst({
      where: { id: groupId },
      include: { members: true },
    });
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const isInGroup = group.ownerId === currentUser.id || group.members.some((m) => m.userId === currentUser.id);
    if (!isInGroup) {
      res.status(403).json({ error: "Not a member of this group" });
      return;
    }
    const ownedCount = await prisma.group.count({ where: { ownerId: targetUserId } });
    const memberCount = await prisma.groupMember.count({ where: { userId: targetUserId } });
    const groupsCount = ownedCount + memberCount;
    res.json({ groupsCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get member details";
    res.status(500).json({ error: message });
  }
});

router.post("/:id/members", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const currentUser = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const groupId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const nameOnly = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
    const group = await prisma.group.findFirst({
      where: { id: groupId },
      include: { members: true },
    });
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const isAdmin = group.ownerId === currentUser.id || group.members.some((m) => m.userId === currentUser.id && m.role === "ADMIN");
    if (!isAdmin) {
      res.status(403).json({ error: "Only group admins can add members" });
      return;
    }
    let existingUser: { id: string; name: string | null; email: string } | null = null;
    if (email) {
      existingUser = await prisma.user.findUnique({ where: { email } });
      if (!existingUser) {
        // Invite by email: create placeholder user so they appear in the group until they sign up
        const ghostEmail = email;
        existingUser = await prisma.user.create({
          data: {
            firebaseId: `ghost-${Date.now()}-${groupId}-invite`,
            email: ghostEmail,
            name: nameOnly || email.split("@")[0],
            customCategories: [],
          },
        });
      }
    } else if (nameOnly) {
      const ghostEmail = `ghost-${Date.now()}@local.com`;
      existingUser = await prisma.user.create({
        data: {
          firebaseId: `ghost-${Date.now()}-${groupId}`,
          email: ghostEmail,
          name: nameOnly,
          customCategories: [],
        },
      });
    } else {
      res.status(400).json({ error: "Provide email or name to add a member" });
      return;
    }
    const alreadyMember = group.ownerId === existingUser.id || group.members.some((m) => m.userId === existingUser!.id);
    if (alreadyMember) {
      res.status(400).json({ error: "That user is already in the group" });
      return;
    }
    await prisma.groupMember.create({
      data: { groupId, userId: existingUser.id, role: "MEMBER" },
    });
    const updated = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.status(201).json({
      message: "Member added",
      members: updated.map((m) => ({ id: m.user.id, userId: m.userId, name: m.user.name, email: m.user.email, role: m.role })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add member";
    res.status(500).json({ error: message });
  }
});

/** POST /:id/invite-link — create invite link for group (admin only). */
router.post("/:id/invite-link", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const currentUser = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const groupId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const group = await prisma.group.findFirst({
      where: { id: groupId },
      include: { members: true },
    });
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const isAdmin = group.ownerId === currentUser.id || group.members.some((m) => m.userId === currentUser.id && m.role === "ADMIN");
    if (!isAdmin) {
      res.status(403).json({ error: "Only group admins can create invite links" });
      return;
    }
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.groupInviteLink.create({
      data: { token, groupId, expiresAt },
    });
    const baseUrl = (req.get("origin") || req.get("referer") || "https://smartbudget.ai").replace(/\/$/, "");
    const inviteUrl = `${baseUrl}/join/${token}`;
    res.status(201).json({ inviteUrl, token, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create invite link";
    res.status(500).json({ error: message });
  }
});

router.post("/:id/leave", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const currentUser = await prisma.user.findUnique({ where: { firebaseId: req.auth.uid } });
    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const groupId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const group = await prisma.group.findFirst({
      where: { id: groupId },
      include: { members: true },
    });
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (group.ownerId === currentUser.id) {
      res.status(400).json({ error: "Owner cannot leave. Delete the group if you no longer need it." });
      return;
    }
    const membership = group.members.find((m) => m.userId === currentUser.id);
    if (!membership) {
      res.status(403).json({ error: "Not a member of this group" });
      return;
    }
    const outstanding = await prisma.balance.findMany({
      where: {
        groupId,
        OR: [{ user1Id: currentUser.id }, { user2Id: currentUser.id }],
      },
    });
    const hasBalance = outstanding.some((b) => Math.abs(b.balanceAmount) >= 0.01);
    if (hasBalance) {
      res.status(400).json({ error: "Settle your balances before leaving the group." });
      return;
    }
    await prisma.groupMember.deleteMany({ where: { groupId, userId: currentUser.id } });
    res.status(200).json({ message: "Left the group" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to leave group";
    res.status(500).json({ error: message });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const group = await prisma.group.findFirst({ where: { id } });
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (group.ownerId !== user.id) {
      res.status(403).json({ error: "Only group owner can delete the group" });
      return;
    }
    await prisma.$transaction([
      prisma.expenseSplit.deleteMany({ where: { expense: { groupId: id } } }),
      prisma.expense.deleteMany({ where: { groupId: id } }),
      prisma.balance.deleteMany({ where: { groupId: id } }),
      prisma.payment.deleteMany({ where: { groupId: id } }),
      prisma.activityLog.deleteMany({ where: { groupId: id } }),
      prisma.groupMember.deleteMany({ where: { groupId: id } }),
      prisma.group.delete({ where: { id } }),
    ]);
    res.status(200).json({ message: "Group deleted" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete group";
    res.status(500).json({ error: message });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const group = await prisma.group.findFirst({
      where: { id },
      include: { members: true },
    });
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const isAdmin = group.ownerId === user.id || group.members.some((m) => m.userId === user.id && m.role === "ADMIN");
    if (!isAdmin) {
      res.status(403).json({ error: "Only group admins can edit the group" });
      return;
    }
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
    const description = req.body?.description !== undefined ? (typeof req.body.description === "string" ? req.body.description.trim() : null) : undefined;
    const updates: { name?: string; description?: string | null } = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Provide name and/or description to update" });
      return;
    }
    const updated = await prisma.group.update({
      where: { id },
      data: updates,
    });
    res.json({ id: updated.id, name: updated.name, description: updated.description });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update group";
    res.status(500).json({ error: message });
  }
});

router.get("/:id/dashboard", async (req: AuthRequest, res: Response) => {
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
    const groupId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const group = await prisma.group.findFirst({
      where: { id: groupId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        activityLogs: { orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { id: true, name: true } } } },
      },
    });
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const isMember = group.ownerId === user.id || (group.members && group.members.some((m) => m.userId === user.id));
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this group" });
      return;
    }
    let recent_expenses: unknown[] = [];
    let simplifiedBalances: { fromUserId: string; toUserId: string; amount: number }[] = [];
    let totalExpenses: { _sum: { amount: number | null } } = { _sum: { amount: 0 } };
    try {
      const [expenses, balancesRaw] = await Promise.all([
        prisma.expense.findMany({
          where: { groupId },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            paidBy: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
            splits: { include: { user: { select: { id: true, name: true } } } },
            receipt: {
              include: {
                store: true,
                items: true,
                user: { select: { id: true, name: true } },
              },
            },
          },
        }),
        getBalancesForGroup(groupId).catch(() => []),
      ]);
      recent_expenses = Array.isArray(expenses) ? expenses : [];
      const balancesSafe = Array.isArray(balancesRaw) ? balancesRaw : [];
      simplifiedBalances = simplifyDebts(balancesSafe);
      totalExpenses = await prisma.expense.aggregate({
        where: { groupId },
        _sum: { amount: true },
      });
    } catch (_) {
      recent_expenses = [];
      simplifiedBalances = [];
      totalExpenses = { _sum: { amount: 0 } };
    }
    const priceRecordsRaw = await prisma.priceRecord.findMany({
      where: { groupId, shareMode: "GROUP" },
      orderBy: { purchaseDate: "desc" },
      take: 100,
      include: { createdBy: { select: { id: true, name: true, displayName: true } } },
    });
    const price_records = priceRecordsRaw.map((r) => ({
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
    const ownerAsMember = {
      ...group.owner,
      id: group.owner.id,
      userId: group.owner.id,
      role: "ADMIN" as const,
    };
    const otherMembers = Array.isArray(group.members)
      ? group.members.filter((m) => m.userId !== group.ownerId).map((m) => ({ ...m.user, id: m.user.id, userId: m.userId, role: m.role }))
      : [];
    const members = [ownerAsMember, ...otherMembers];
    const activityLog = Array.isArray(group.activityLogs)
      ? group.activityLogs.map((a) => ({
          id: a.id,
          userId: a.userId,
          user: a.user,
          action: a.action,
          createdAt: a.createdAt.toISOString(),
        }))
      : [];
    const currentUserIsAdmin =
      group.ownerId === user.id ||
      (Array.isArray(group.members) && group.members.some((m) => m.userId === user.id && m.role === "ADMIN"));
    res.json({
      group: { id: group.id, name: group.name, description: group.description ?? null, ownerId: group.ownerId },
      currentUserId: user.id,
      isAdmin: currentUserIsAdmin,
      members,
      recent_expenses: recent_expenses || [],
      balances: simplifiedBalances || [],
      total_group_expenses: totalExpenses._sum?.amount ?? 0,
      activity_log: activityLog || [],
      price_records: price_records || [],
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Failed to fetch group dashboard";
    const safe = /Prisma|Invalid `|raw/.test(raw) ? "Could not load this group. Please try again." : raw;
    res.status(500).json({ error: safe });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
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
    const group = await prisma.group.findFirst({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        expenses: {
          orderBy: { createdAt: "desc" },
          include: {
            paidBy: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
            splits: { include: { user: { select: { id: true, name: true } } } },
            receipt: {
              include: {
                store: true,
                items: true,
                user: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const isMember = group.ownerId === user.id || group.members.some((m) => m.userId === user.id);
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this group" });
      return;
    }
    res.json({
      id: group.id,
      name: group.name,
      createdBy: group.ownerId,
      createdAt: group.createdAt.toISOString(),
      owner: group.owner,
      members: group.members.map((m) => ({ ...m.user, role: m.role })),
      expenses: group.expenses,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get group";
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

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "Group name is required" });
      return;
    }
    const type = typeof req.body?.type === "string" && ["Office", "Trip", "Party", "Other"].includes(req.body.type)
      ? req.body.type
      : "Other";

    const group = await prisma.group.create({
      data: { name, type, ownerId: user.id, description: null, currency: "USD" },
    });
    await prisma.groupMember.create({
      data: { groupId: group.id, userId: user.id, role: "ADMIN" },
    });

    res.status(201).json({
      id: group.id,
      name: group.name,
      createdAt: group.createdAt.toISOString(),
      isOwner: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create group";
    res.status(500).json({ error: message });
  }
});

/** POST /seed-test-group — creates "Weekend Trip (Test)" with current user as ADMIN, 2 fake members (Alice, Bob), 3 expenses; returns groupId. */
router.post("/seed-test-group", async (req: AuthRequest, res: Response) => {
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

    const group = await prisma.group.create({
      data: {
        name: "Weekend Trip (Test)",
        ownerId: user.id,
        description: null,
        currency: "USD",
      },
    });
    await prisma.groupMember.create({
      data: { groupId: group.id, userId: user.id, role: "ADMIN" },
    });

    const alice = await prisma.user.upsert({
      where: { firebaseId: "seed-alice" },
      create: {
        firebaseId: "seed-alice",
        email: "alice@seed.test",
        name: "Alice",
        customCategories: [],
      },
      update: { name: "Alice" },
    });
    const bob = await prisma.user.upsert({
      where: { firebaseId: "seed-bob" },
      create: {
        firebaseId: "seed-bob",
        email: "bob@seed.test",
        name: "Bob",
        customCategories: [],
      },
      update: { name: "Bob" },
    });

    await prisma.groupMember.createMany({
      data: [
        { groupId: group.id, userId: alice.id, role: "MEMBER" },
        { groupId: group.id, userId: bob.id, role: "MEMBER" },
      ],
    });

    const memberIds = [user.id, alice.id, bob.id];
    const expenses: { amount: number; description: string; paidByUserId: string }[] = [
      { amount: 150, description: "Dinner", paidByUserId: user.id },
      { amount: 45, description: "Uber", paidByUserId: alice.id },
      { amount: 300, description: "Airbnb", paidByUserId: bob.id },
    ];

    for (const { amount, description, paidByUserId } of expenses) {
      const splits = computeSplits(amount, { type: "equal", participantIds: memberIds });
      const expense = await prisma.expense.create({
        data: {
          description,
          amount,
          paidByUserId,
          createdByUserId: user.id,
          groupId: group.id,
        },
      });
      await prisma.expenseSplit.createMany({
        data: splits.map((s) => ({
          expenseId: expense.id,
          userId: s.userId,
          amountOwed: s.amountOwed,
        })),
      });
      await updateBalancesForExpense(group.id, paidByUserId, splits);
    }

    res.status(201).json({ groupId: group.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to seed test group";
    res.status(500).json({ error: message });
  }
});

export default router;
