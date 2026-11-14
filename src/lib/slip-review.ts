// Admin slip checking: the queue of uploaded bank slips waiting for a decision, and
// warnings when a slip (same image) or a bank reference was already used on another order.
import { and, asc, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";

/** Bank transfer orders with a slip that the admin hasn't verified or rejected yet. */
export const slipToCheck = and(
  eq(orders.paymentMethod, "BANK_TRANSFER"),
  eq(orders.paymentStatus, "PENDING"),
  eq(orders.orderStatus, "PENDING"),
  isNotNull(orders.paymentSlipUrl),
);

export async function slipsToCheckCount() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(orders).where(slipToCheck);
  return n;
}

/** The slip that has waited longest, other than `exceptOrderId`. */
export async function nextSlipToCheck(exceptOrderId: string) {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(slipToCheck, ne(orders.id, exceptOrderId)))
    .orderBy(asc(orders.slipUploadedAt), asc(orders.createdAt))
    .limit(1);
  return row?.id ?? null;
}

export type SlipDuplicate = {
  id: string;
  sameImage: boolean;
  sameReference: boolean;
  paymentStatus: (typeof orders.$inferSelect)["paymentStatus"];
  orderStatus: (typeof orders.$inferSelect)["orderStatus"];
};

/**
 * Other orders that used the same slip image or the same bank transaction reference.
 * One bank transfer can only pay for one order, so any match needs a closer look.
 */
export async function slipDuplicates(orderId: string, hash: string | null, reference: string | null): Promise<SlipDuplicate[]> {
  const matches = [hash ? eq(orders.slipHash, hash) : undefined, reference ? eq(orders.slipReference, reference) : undefined].filter(
    (m) => m !== undefined,
  );
  if (matches.length === 0) return [];
  return db
    .select({
      id: orders.id,
      sameImage: hash ? sql<boolean>`(${orders.slipHash} = ${hash})` : sql<boolean>`false`,
      sameReference: reference ? sql<boolean>`(${orders.slipReference} = ${reference})` : sql<boolean>`false`,
      paymentStatus: orders.paymentStatus,
      orderStatus: orders.orderStatus,
    })
    .from(orders)
    .where(and(ne(orders.id, orderId), or(...matches)))
    .orderBy(asc(orders.createdAt))
    .limit(10);
}
