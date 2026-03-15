import { Router, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../lib/db";
import {
  computeSplits,
  normalizeParticipantIds,
  updateBalancesForExpense,
  reverseBalancesForExpense,
  type SplitType,
  type SplitInput,
} from "../services/expenseService";

const router = Router();

router.post("/add", async (req: AuthRequest, res: Response) => {
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
      groupId?: string;
      description?: string;
      amount?: number;
      paidByUserId?: string;
      receiptUrl?: string;
      category?: string;
      splitType?: SplitType;
      splitInput?: SplitInput;
    };

    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
    let paidByUserId = typeof body.paidByUserId === "string" ? body.paidByUserId : user.id;
    if (paidByUserId === "test-user-123") paidByUserId = user.id;
    const receiptUrl = typeof body.receiptUrl === "string" ? body.receiptUrl : null;
    const category = typeof body.category === "string" ? body.category : null;
    const splitType = (body.splitType ?? "equal") as SplitType;
    const splitInput = body.splitInput;

    if (!groupId || !description) {
      res.status(400).json({ error: "groupId and description are required" });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
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
    if (!memberIds.includes(user.id)) {
      res.status(403).json({ error: "Not a member of this group" });
      return;
    }
    if (!memberIds.includes(paidByUserId)) {
      res.status(400).json({ error: "paidByUserId must be a group member" });
      return;
    }

    let input: SplitInput;
    if (splitInput) {
      input = splitInput as SplitInput;
      if (input.type === "equal" && Array.isArray(input.participantIds)) {
        const deduped = normalizeParticipantIds(input.participantIds);
        const invalid = deduped.filter((pid) => !memberIds.includes(pid));
        if (invalid.length > 0) {
          res.status(400).json({ error: "All participantIds must be group members" });
          return;
        }
        if (deduped.length === 0) {
          res.status(400).json({ error: "At least one participant is required" });
          return;
        }
        input = { type: "equal", participantIds: deduped };
      }
    } else {
      input = { type: "equal", participantIds: [...new Set(memberIds)] };
    }
    const splits = computeSplits(amount, input);

    const expense = await prisma.expense.create({
      data: {
        description,
        amount,
        paidByUserId,
        createdByUserId: user.id,
        groupId,
        receiptUrl,
        category,
      },
    });
    await prisma.expenseSplit.createMany({
      data: splits.map((s) => ({
        expenseId: expense.id,
        userId: s.userId,
        amountOwed: s.amountOwed,
      })),
    });
    await updateBalancesForExpense(groupId, paidByUserId, splits);

    const actorName = user.name ?? user.email?.split("@")[0] ?? "Someone";
    const action = `${actorName} added ${description} expense $${amount.toFixed(2)}`;
    await prisma.activityLog.create({
      data: { groupId, userId: user.id, action },
    });
    const io = (req as unknown as { app: { get: (k: string) => unknown } }).app?.get?.("io");
    if (io && typeof (io as { to: (r: string) => { emit: (e: string) => void } }).to === "function") {
      (io as { to: (r: string) => { emit: (e: string) => void } }).to(groupId).emit("group_updated");
    }

    const withSplits = await prisma.expense.findUnique({
      where: { id: expense.id },
      include: { paidBy: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } }, splits: { include: { user: { select: { id: true, name: true } } } } },
    });
    res.status(201).json(withSplits);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add expense";
    const safe = message.includes("Invalid `") || message.includes("Prisma") ? "Something went wrong while creating the group expense." : message;
    res.status(500).json({ error: safe });
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
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: { splits: true, group: { include: { members: true } } },
    });
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    const memberIds = [expense.group.ownerId, ...expense.group.members.map((m) => m.userId)];
    if (!memberIds.includes(user.id)) {
      res.status(403).json({ error: "Not a member of this group" });
      return;
    }
    const body = req.body as { description?: string; amount?: number; paidByUserId?: string; category?: string; splitInput?: SplitInput };
    const description = typeof body.description === "string" ? body.description.trim() : expense.description;
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
    const paidByUserId = typeof body.paidByUserId === "string" ? body.paidByUserId : expense.paidByUserId;
    const category = typeof body.category === "string" ? body.category : expense.category;
    let splitInputResolved: SplitInput = body.splitInput ?? { type: "equal", participantIds: [...new Set(memberIds)] };
    if (splitInputResolved.type === "equal" && Array.isArray(splitInputResolved.participantIds)) {
      const deduped = normalizeParticipantIds(splitInputResolved.participantIds).filter((pid) => memberIds.includes(pid));
      if (deduped.length === 0) {
        res.status(400).json({ error: "At least one participant is required" });
        return;
      }
      splitInputResolved = { type: "equal", participantIds: deduped };
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }
    if (!memberIds.includes(paidByUserId)) {
      res.status(400).json({ error: "paidByUserId must be a group member" });
      return;
    }

    const splits = computeSplits(amount, splitInputResolved);
    const oldSplits = expense.splits.map((s) => ({ userId: s.userId, amountOwed: s.amountOwed }));

    await reverseBalancesForExpense(expense.groupId, expense.paidByUserId, oldSplits);
    await prisma.expenseSplit.deleteMany({ where: { expenseId: expense.id } });
    await prisma.expense.update({
      where: { id: expense.id },
      data: { description, amount, paidByUserId, category },
    });
    await prisma.expenseSplit.createMany({
      data: splits.map((s) => ({ expenseId: expense.id, userId: s.userId, amountOwed: s.amountOwed })),
    });
    await updateBalancesForExpense(expense.groupId, paidByUserId, splits);

    const updated = await prisma.expense.findUnique({
      where: { id: expense.id },
      include: { paidBy: { select: { id: true, name: true } }, splits: { include: { user: { select: { id: true, name: true } } } } },
    });
    res.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update expense";
    const safe = message.includes("Invalid `") || message.includes("Prisma") ? "Something went wrong. Please try again." : message;
    const status = message.includes("participant") || message.includes("amount") || message.includes("member") ? 400 : 500;
    res.status(status).json({ error: safe });
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
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: { splits: true, group: { include: { members: true } } },
    });
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    const memberIds = [expense.group.ownerId, ...expense.group.members.map((m) => m.userId)];
    if (!memberIds.includes(user.id)) {
      res.status(403).json({ error: "Not a member of this group" });
      return;
    }
    const oldSplits = expense.splits.map((s) => ({ userId: s.userId, amountOwed: s.amountOwed }));
    await reverseBalancesForExpense(expense.groupId, expense.paidByUserId, oldSplits);
    await prisma.expense.delete({ where: { id } });
    res.status(200).json({ message: "Expense deleted" });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Failed to delete expense";
    const safe = /Prisma|Invalid `|raw/.test(raw) ? "Could not delete this expense. Please try again." : raw;
    res.status(500).json({ error: safe });
  }
});

export default router;
