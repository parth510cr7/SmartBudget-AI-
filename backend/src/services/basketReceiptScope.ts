import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";

async function receiptOrClause(userId: string): Promise<Prisma.ReceiptWhereInput[]> {
  const householdRows = await prisma.householdMember.findMany({
    where: { userId, status: "active" },
    select: { householdId: true },
  });
  const householdIds = householdRows.map((r) => r.householdId);

  const receiptOr: Prisma.ReceiptWhereInput[] = [{ userId }];
  if (householdIds.length > 0) {
    receiptOr.push({ householdId: { in: householdIds } });
  }
  return receiptOr;
}

/** Receipts visible to this user (owned + active household). */
export async function getReceiptWhereForUser(userId: string): Promise<Prisma.ReceiptWhereInput> {
  const or = await receiptOrClause(userId);
  return { OR: or };
}

/**
 * Items the user can use for basket intelligence: own receipts + household receipts they can access.
 */
export async function getItemWhereForUserReceipts(userId: string): Promise<Prisma.ItemWhereInput> {
  const receiptOr = await receiptOrClause(userId);
  return { receipt: { OR: receiptOr } };
}
