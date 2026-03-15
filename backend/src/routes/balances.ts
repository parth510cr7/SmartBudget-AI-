import { Router, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";
import { getBalancesForUser, getBalancesForGroup, simplifyDebts } from "../services/expenseService";

const router = Router();

router.get("/user/:id", async (req: AuthRequest, res: Response) => {
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
    if (id !== user.id) {
      res.status(403).json({ error: "Can only view own balances" });
      return;
    }
    const balances = await getBalancesForUser(id);
    res.json(balances);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get balances";
    res.status(500).json({ error: message });
  }
});

router.get("/group/:groupId", async (req: AuthRequest, res: Response) => {
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
    const groupId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
    const group = await prisma.group.findFirst({
      where: { id: groupId },
      include: { members: true },
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
    const balances = await getBalancesForGroup(groupId);
    const simplified = simplifyDebts(balances);
    res.json({ balances, simplified });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Failed to get group balances";
    const safe = /Prisma|Invalid `|raw/.test(raw) ? "Could not load balances. Please try again." : raw;
    res.status(500).json({ error: safe });
  }
});

export default router;
