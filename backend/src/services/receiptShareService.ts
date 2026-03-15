import type { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/db";
import { computeSplits, normalizeParticipantIds, type SplitInput } from "./expenseService";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function balanceKey(u1: string, u2: string): [string, string] {
  return u1 < u2 ? [u1, u2] : [u2, u1];
}

async function addDebtWithTx(
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">,
  creditorId: string,
  debtorId: string,
  groupId: string,
  amount: number
): Promise<void> {
  if (creditorId === debtorId || amount <= 0) return;
  const [u1, u2] = balanceKey(creditorId, debtorId);
  let b = await tx.balance.findUnique({
    where: { user1Id_user2Id_groupId: { user1Id: u1, user2Id: u2, groupId } },
  });
  if (!b) {
    b = await tx.balance.create({
      data: { user1Id: u1, user2Id: u2, groupId, balanceAmount: 0 },
    });
  }
  const sign = creditorId === u1 ? 1 : -1;
  const newAmount = round2(b.balanceAmount + sign * amount);
  await tx.balance.update({
    where: { id: b.id },
    data: { balanceAmount: newAmount },
  });
}

async function updateBalancesWithTx(
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">,
  groupId: string,
  paidByUserId: string,
  splits: { userId: string; amountOwed: number }[]
): Promise<void> {
  for (const { userId, amountOwed } of splits) {
    if (userId === paidByUserId) continue;
    if (amountOwed <= 0) continue;
    await addDebtWithTx(tx, paidByUserId, userId, groupId, amountOwed);
  }
}

export type ShareReceiptToGroupResult = {
  expenseId: string;
  alreadyShared: boolean;
};

/**
 * Atomically share a receipt to a group: create expense, splits, update balances,
 * link receipt to group. Uses Prisma transaction.
 *
 * Business rule: one receipt can create one expense per group.
 * - Same receipt + same group = idempotent (return alreadyShared: true, no duplicate).
 * - Same receipt + different group = new expense allowed.
 * - Schema: @@unique([receiptId, groupId]) on Expense.
 */
export async function shareReceiptToGroup(
  receiptId: string,
  groupId: string,
  userId: string,
  participantIds?: string[]
): Promise<ShareReceiptToGroupResult> {
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.receipt.findFirst({
      where: { id: receiptId, userId },
      include: { store: true },
    });
    if (!receipt) {
      throw new Error("Receipt not found");
    }

    const group = await tx.group.findFirst({
      where: { id: groupId },
      include: { members: true },
    });
    if (!group) {
      throw new Error("Group not found");
    }

    const allMemberIds = [...new Set([group.ownerId, ...group.members.map((m) => m.userId)])];
    if (!allMemberIds.includes(userId)) {
      throw new Error("Not a member of this group");
    }

    const existingExpense = await tx.expense.findFirst({
      where: { receiptId, groupId },
    });
    if (existingExpense) {
      return { expenseId: existingExpense.id, alreadyShared: true };
    }

    const amount = Number(receipt.total);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Receipt total must be positive");
    }

    const ids =
      Array.isArray(participantIds) && participantIds.length > 0
        ? normalizeParticipantIds(participantIds).filter((id) => allMemberIds.includes(id))
        : allMemberIds;
    if (ids.length === 0) {
      throw new Error("At least one participant is required");
    }
    const splitInput: SplitInput = { type: "equal", participantIds: ids };
    const splits = computeSplits(amount, splitInput);

    const description = `Shared: ${receipt.store?.name ?? "Receipt"} (from Library)`;

    const expense = await tx.expense.create({
      data: {
        description,
        amount,
        paidByUserId: userId,
        createdByUserId: userId,
        groupId,
        receiptId,
        receiptUrl: receipt.imageUrl,
      },
    });

    await tx.expenseSplit.createMany({
      data: splits.map((s) => ({
        expenseId: expense.id,
        userId: s.userId,
        amountOwed: s.amountOwed,
      })),
    });

    await updateBalancesWithTx(tx, groupId, userId, splits);

    await tx.receipt.update({
      where: { id: receiptId },
      data: { groupId },
    });

    const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    const actorName = user?.name ?? user?.email?.split("@")[0] ?? "Someone";
    const action = `${actorName} added ${description} expense $${amount.toFixed(2)}`;
    await tx.activityLog.create({
      data: { groupId, userId, action },
    });

    return { expenseId: expense.id, alreadyShared: false };
  });
}
