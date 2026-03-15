import { prisma } from "../lib/db";

export type SplitType = "equal" | "exact" | "percentage" | "shares";

export type SplitInput =
  | { type: "equal"; participantIds: string[] }
  | { type: "exact"; splits: { userId: string; amount: number }[] }
  | { type: "percentage"; splits: { userId: string; percent: number }[] }
  | { type: "shares"; splits: { userId: string; shares: number }[] };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Deduplicate and validate participant ids. Ensures exactly one split per user per expense.
 */
export function normalizeParticipantIds(participantIds: string[]): string[] {
  const valid = (participantIds ?? []).filter((id) => typeof id === "string" && id.trim() !== "");
  return [...new Set(valid)];
}

/**
 * Equal: amount / participants.length for each. Deduplicates participantIds to prevent duplicate ExpenseSplit rows.
 */
export function splitEqual(amount: number, participantIds: string[]): { userId: string; amountOwed: number }[] {
  const unique = normalizeParticipantIds(participantIds);
  if (unique.length === 0) return [];
  const each = round2(amount / unique.length);
  const sum = each * unique.length;
  const diff = round2(amount - sum);
  return unique.map((userId, i) => ({
    userId,
    amountOwed: i === 0 ? round2(each + diff) : each,
  }));
}

/**
 * Exact: validate sum(splits) === total, return as amountOwed list
 */
export function splitExact(
  amount: number,
  splits: { userId: string; amount: number }[]
): { userId: string; amountOwed: number }[] {
  const sum = splits.reduce((s, x) => s + x.amount, 0);
  if (Math.abs(sum - amount) > 0.01) throw new Error("Exact splits must sum to total amount");
  return splits.map(({ userId, amount: amt }) => ({ userId, amountOwed: round2(amt) }));
}

/**
 * Percentage: validate sum(percentages) === 100, then (amount * pct / 100) per user
 */
export function splitPercentage(
  amount: number,
  splits: { userId: string; percent: number }[]
): { userId: string; amountOwed: number }[] {
  const sumPct = splits.reduce((s, x) => s + x.percent, 0);
  if (Math.abs(sumPct - 100) > 0.01) throw new Error("Percentages must sum to 100");
  const result = splits.map(({ userId, percent }) => ({
    userId,
    amountOwed: round2((amount * percent) / 100),
  }));
  const total = result.reduce((s, x) => s + x.amountOwed, 0);
  const diff = round2(amount - total);
  if (diff !== 0 && result.length > 0) result[0].amountOwed = round2(result[0].amountOwed + diff);
  return result;
}

/**
 * Shares: (amount / totalShares) * userShares per user
 */
export function splitShares(
  amount: number,
  splits: { userId: string; shares: number }[]
): { userId: string; amountOwed: number }[] {
  const totalShares = splits.reduce((s, x) => s + x.shares, 0);
  if (totalShares <= 0) throw new Error("Total shares must be positive");
  const result = splits.map(({ userId, shares }) => ({
    userId,
    amountOwed: round2((amount * shares) / totalShares),
  }));
  const total = result.reduce((s, x) => s + x.amountOwed, 0);
  const diff = round2(amount - total);
  if (diff !== 0 && result.length > 0) result[0].amountOwed = round2(result[0].amountOwed + diff);
  return result;
}

export function computeSplits(
  amount: number,
  input: SplitInput
): { userId: string; amountOwed: number }[] {
  switch (input.type) {
    case "equal": {
      const ids = normalizeParticipantIds(input.participantIds ?? []);
      if (ids.length === 0) throw new Error("At least one participant is required");
      return splitEqual(amount, ids);
    }
    case "exact":
      return splitExact(amount, input.splits);
    case "percentage":
      return splitPercentage(amount, input.splits);
    case "shares":
      return splitShares(amount, input.splits);
    default:
      throw new Error("Unknown split type");
  }
}

/** Normalize pair (a,b) so user1Id < user2Id for consistent balance key */
function balanceKey(u1: string, u2: string): [string, string] {
  return u1 < u2 ? [u1, u2] : [u2, u1];
}

/** Get or create Balance for (user1, user2, groupId). Convention: positive = user2 owes user1. */
async function getOrCreateBalance(
  user1Id: string,
  user2Id: string,
  groupId: string
): Promise<{ id: string; user1Id: string; user2Id: string; balanceAmount: number }> {
  const [u1, u2] = balanceKey(user1Id, user2Id);
  let b = await prisma.balance.findUnique({
    where: { user1Id_user2Id_groupId: { user1Id: u1, user2Id: u2, groupId } },
  });
  if (!b) {
    b = await prisma.balance.create({
      data: { user1Id: u1, user2Id: u2, groupId, balanceAmount: 0 },
    });
  }
  return b;
}

/** Add debt: creditorId is owed, debtorId owes. Positive balanceAmount = user2 owes user1. */
async function addDebt(creditorId: string, debtorId: string, groupId: string, amount: number): Promise<void> {
  if (creditorId === debtorId || amount <= 0) return;
  const [u1, u2] = balanceKey(creditorId, debtorId);
  const b = await getOrCreateBalance(u1, u2, groupId);
  const sign = creditorId === u1 ? 1 : -1;
  const newAmount = round2(b.balanceAmount + sign * amount);
  await prisma.balance.update({
    where: { id: b.id },
    data: { balanceAmount: newAmount },
  });
}

/** Reverse debt (for expense delete or edit): creditor was owed, debtor owed. */
async function reverseDebt(creditorId: string, debtorId: string, groupId: string, amount: number): Promise<void> {
  await addDebt(debtorId, creditorId, groupId, amount);
}

/**
 * When expense is added: paidBy is owed by each participant. Update balances (participant owes paidBy).
 */
export async function updateBalancesForExpense(
  groupId: string,
  paidByUserId: string,
  splits: { userId: string; amountOwed: number }[]
): Promise<void> {
  for (const { userId, amountOwed } of splits) {
    if (userId === paidByUserId) continue;
    if (amountOwed <= 0) continue;
    await addDebt(paidByUserId, userId, groupId, amountOwed);
  }
}

/** Reverse balances for an expense (on delete or before edit). */
export async function reverseBalancesForExpense(
  groupId: string,
  paidByUserId: string,
  splits: { userId: string; amountOwed: number }[]
): Promise<void> {
  for (const { userId, amountOwed } of splits) {
    if (userId === paidByUserId) continue;
    if (amountOwed <= 0) continue;
    await reverseDebt(paidByUserId, userId, groupId, amountOwed);
  }
}

/**
 * Debt simplification: positive balanceAmount = user2 owes user1.
 * Net: net[user] > 0 means user is owed; net[user] < 0 means user owes.
 * Returns minimal list of payments: fromUserId (debtor) pays toUserId (creditor).
 * Rounds to 2 decimals and ignores |amount| < 0.01 to avoid floating-point deadlock.
 */
export function simplifyDebts(
  balances: { user1Id: string; user2Id: string; balanceAmount: number }[]
): { fromUserId: string; toUserId: string; amount: number }[] {
  const rounded = balances
    .map((b) => ({ ...b, balanceAmount: round2(b.balanceAmount) }))
    .filter((b) => Math.abs(b.balanceAmount) >= 0.01);

  const net: Record<string, number> = {};
  for (const b of rounded) {
    net[b.user1Id] = round2((net[b.user1Id] ?? 0) + b.balanceAmount);
    net[b.user2Id] = round2((net[b.user2Id] ?? 0) - b.balanceAmount);
  }
  const debtors = Object.entries(net)
    .filter(([, v]) => v < -0.01)
    .map(([id, v]) => ({ id, amount: round2(-v) }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0.01)
    .map(([id, v]) => ({ id, amount: round2(v) }))
    .sort((a, b) => b.amount - a.amount);

  const payments: { fromUserId: string; toUserId: string; amount: number }[] = [];
  let i = 0,
    j = 0;
  const MAX_ITERATIONS = 1000;
  let iterations = 0;
  while (i < debtors.length && j < creditors.length) {
    if (++iterations > MAX_ITERATIONS) {
      console.warn("[simplifyDebts] Deadlock safeguard: exceeded 1000 iterations, breaking.");
      break;
    }
    const d = debtors[i];
    const c = creditors[j];
    const amount = round2(Math.min(d.amount, c.amount));
    if (amount >= 0.01) {
      payments.push({ fromUserId: d.id, toUserId: c.id, amount });
      d.amount = round2(d.amount - amount);
      c.amount = round2(c.amount - amount);
      if (d.amount < 0.01) d.amount = 0;
      if (c.amount < 0.01) c.amount = 0;
    }
    if (d.amount < 0.01) i++;
    if (c.amount < 0.01) j++;
  }
  return payments;
}

export async function getBalancesForGroup(groupId: string): Promise<{ user1Id: string; user2Id: string; balanceAmount: number }[]> {
  const list = await prisma.balance.findMany({
    where: { groupId },
  });
  return list.map((b) => ({ user1Id: b.user1Id, user2Id: b.user2Id, balanceAmount: b.balanceAmount }));
}

/** Convention: positive balanceAmount = user2 owes user1. So user1 is owed by user2. */
export async function getBalancesForUser(userId: string): Promise<{ groupId: string; otherUserId: string; balanceAmount: number; youOwe: boolean }[]> {
  const result: { groupId: string; otherUserId: string; balanceAmount: number; youOwe: boolean }[] = [];
  const as1 = await prisma.balance.findMany({ where: { user1Id: userId } });
  const as2 = await prisma.balance.findMany({ where: { user2Id: userId } });
  for (const b of as1) {
    if (Math.abs(b.balanceAmount) >= 0.01)
      result.push({ groupId: b.groupId, otherUserId: b.user2Id, balanceAmount: b.balanceAmount, youOwe: false });
  }
  for (const b of as2) {
    if (Math.abs(b.balanceAmount) >= 0.01)
      result.push({ groupId: b.groupId, otherUserId: b.user1Id, balanceAmount: b.balanceAmount, youOwe: true });
  }
  return result;
}

/** Record a payment: payer (debtor) pays receiver (creditor); reduce balance. */
export async function settlePayment(
  groupId: string,
  payerId: string,
  receiverId: string,
  amount: number
): Promise<void> {
  if (payerId === receiverId) return;
  const amt = round2(amount);
  if (amt <= 0) return;
  await reverseDebt(receiverId, payerId, groupId, amt);
  await prisma.payment.create({
    data: { payerId, receiverId, groupId, amount: amt },
  });
}
