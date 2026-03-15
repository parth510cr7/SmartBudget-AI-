import { Router, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";
import { settlePayment } from "../services/expenseService";

const router = Router();

router.post("/settle", async (req: AuthRequest, res: Response) => {
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

    const body = req.body as { groupId?: string; payerId?: string; receiverId?: string; amount?: number };
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    const payerId = typeof body.payerId === "string" ? body.payerId.trim() : user.id;
    const receiverId = typeof body.receiverId === "string" ? body.receiverId.trim() : "";
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);

    if (!groupId || !receiverId || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "groupId, receiverId, and positive amount are required" });
      return;
    }

    const group = await prisma.group.findFirst({
      where: { id: groupId },
      include: { members: true },
    });
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const memberIds = [group.ownerId, ...group.members.map((m) => m.userId)];
    if (!memberIds.includes(payerId) || !memberIds.includes(receiverId)) {
      res.status(400).json({ error: "Payer and receiver must be group members" });
      return;
    }
    if (payerId !== user.id) {
      res.status(403).json({ error: "You can only record payments you made" });
      return;
    }

    await settlePayment(groupId, payerId, receiverId, amount);
    res.status(200).json({ message: "Payment recorded" });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Failed to settle payment";
    const safe = /Prisma|Invalid `|raw/.test(raw) ? "Could not settle this balance. Please try again." : raw;
    const status = /member|amount|required|only record/.test(raw) ? 400 : 500;
    res.status(status).json({ error: safe });
  }
});

export default router;
