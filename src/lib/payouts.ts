// Payout maths, shared by the admin dashboard and the "Mark as Paid" action so
// both always agree. Money is handled in integer cents to avoid rounding drift.
import { and, desc, eq, gt, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products, sellerAdjustments, sellerPayouts, sellerProfiles, shipments } from "@/db/schema";
import { toCents } from "@/lib/pricing";
import { SITE } from "@/lib/site";

/**
 * Days after delivery before a boutique can be paid for a package. Gives the buyer
 * time to report a damaged or wrong item, so MIVO can process a return BEFORE the
 * boutique has the money.
 */
export const PAYOUT_HOLD_DAYS = SITE.returnDays; // the return window promised in the Terms
const holdCutoff = sql`now() - make_interval(days => ${PAYOUT_HOLD_DAYS})`;

/** Joins an order item to its boutique's package in the same order. Needs `products` joined. */
export const shipmentOfItem = and(eq(shipments.orderId, orderItems.orderId), eq(shipments.sellerId, products.sellerId));

/** Delivered (not returned) and the order isn't cancelled. Needs `orders` joined. */
const deliveredShipment = and(eq(shipments.status, "DELIVERED"), ne(orders.orderStatus, "CANCELLED"));
/** Delivered and the return window is over: the boutique can be paid. */
export const releasedShipment = and(deliveredShipment, sql`${shipments.deliveredAt} <= ${holdCutoff}`);
/** Delivered but still inside the return window. */
const heldShipment = and(deliveredShipment, sql`${shipments.deliveredAt} > ${holdCutoff}`);

/** Items a boutique can be paid for now (each item at most once). Needs orders, products, shipments joined. */
export const payableItem = and(isNull(orderItems.payoutId), releasedShipment);

/**
 * Prepaid (bank transfer) packages: the boutique booked and paid the courier itself,
 * so MIVO repays the delivery fee the buyer paid for that package. COD packages go on
 * MIVO's courier accounts, so there is nothing to repay. Needs `orders` joined.
 */
const repayable = (window: SQL | undefined) =>
  and(isNull(shipments.payoutId), window, eq(orders.paymentMethod, "BANK_TRANSFER"), gt(shipments.deliveryFee, "0"));
export const reimbursableShipment = repayable(releasedShipment);

type ItemRow = { price: string; quantity: number; commissionRate: string };

/**
 * Commission uses the rate saved on each item at checkout, so changing a boutique's
 * rate only affects future orders. Rounded per item, in integer cents.
 */
export function computePayout(items: ItemRow[], deliveryFees: string[], adjustments: string[] = []) {
  let grossCents = 0;
  let commissionCents = 0;
  for (const i of items) {
    const g = toCents(i.price) * i.quantity;
    grossCents += g;
    commissionCents += Math.round((g * Number(i.commissionRate)) / 100);
  }
  const deliveryCents = deliveryFees.reduce((s, f) => s + toCents(f), 0);
  // Deductions (negative), e.g. a package returned after the boutique was paid for it.
  const adjustmentCents = adjustments.reduce((s, a) => s + toCents(a), 0);
  const rates = [...new Set(items.map((i) => Number(i.commissionRate)))];
  // One rate for every item -> that rate; mixed rates -> the effective average.
  const rate = rates.length === 1 ? rates[0] : grossCents > 0 ? Math.round((commissionCents / grossCents) * 10000) / 100 : 0;
  return { grossCents, commissionCents, deliveryCents, adjustmentCents, netCents: grossCents - commissionCents + deliveryCents + adjustmentCents, rate };
}

/** Per-boutique totals for the items and repayable delivery fees matching the given conditions. */
async function collect(itemWhere: SQL | undefined, shipmentWhere: SQL | undefined, sellerId?: string, withAdjustments = false) {
  const mine = (w: SQL | undefined) => (sellerId ? and(w, eq(shipments.sellerId, sellerId)) : w);
  const [items, fees, adjustments] = await Promise.all([
    db
      .select({
        sellerId: shipments.sellerId,
        orderId: orderItems.orderId,
        price: orderItems.priceAtPurchase,
        quantity: orderItems.quantity,
        commissionRate: orderItems.commissionRate,
        deliveredAt: shipments.deliveredAt,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(products, eq(orderItems.productId, products.id))
      .innerJoin(shipments, shipmentOfItem)
      .where(mine(itemWhere)),
    db
      .select({ sellerId: shipments.sellerId, fee: shipments.deliveryFee, deliveredAt: shipments.deliveredAt })
      .from(shipments)
      .innerJoin(orders, eq(shipments.orderId, orders.id))
      .where(mine(shipmentWhere)),
    withAdjustments
      ? db
          .select({ sellerId: sellerAdjustments.sellerId, amount: sellerAdjustments.amount })
          .from(sellerAdjustments)
          .where(and(isNull(sellerAdjustments.payoutId), sellerId ? eq(sellerAdjustments.sellerId, sellerId) : undefined))
      : Promise.resolve([] as { sellerId: string; amount: string }[]),
  ]);

  const ids = [...new Set([...items.map((i) => i.sellerId), ...fees.map((f) => f.sellerId), ...adjustments.map((a) => a.sellerId)])];
  return ids.map((id) => {
    const its = items.filter((i) => i.sellerId === id);
    const fs = fees.filter((f) => f.sellerId === id);
    const dates = [...its, ...fs].map((x) => x.deliveredAt?.getTime() ?? 0).filter(Boolean);
    return {
      sellerId: id,
      itemCount: its.reduce((s, i) => s + i.quantity, 0),
      orderCount: new Set(its.map((i) => i.orderId)).size,
      packageCount: fs.length,
      oldestDeliveredAt: dates.length ? new Date(Math.min(...dates)) : null,
      ...computePayout(its, fs.map((f) => f.fee), adjustments.filter((a) => a.sellerId === id).map((a) => a.amount)),
    };
  });
}

const RECENT_BANK_CHANGE_MS = 7 * 24 * 60 * 60 * 1000;

/** What MIVO owes each boutique right now (or just one boutique, with `sellerId`). */
export async function getPendingPayouts(sellerId?: string) {
  const totals = await collect(payableItem, reimbursableShipment, sellerId, true);
  if (totals.length === 0) return [];
  const sellers = await db
    .select({
      id: sellerProfiles.id,
      shopName: sellerProfiles.shopName,
      bankName: sellerProfiles.bankName,
      bankBranch: sellerProfiles.bankBranch,
      bankAccountName: sellerProfiles.bankAccountName,
      bankAccountNumber: sellerProfiles.bankAccountNumber,
      bankDetailsUpdatedAt: sellerProfiles.bankDetailsUpdatedAt,
    })
    .from(sellerProfiles)
    .where(inArray(sellerProfiles.id, totals.map((t) => t.sellerId)));

  const now = Date.now();
  return totals
    .map((t) => {
      const s = sellers.find((x) => x.id === t.sellerId)!;
      // A just-changed account is the classic payout-fraud pattern: flag it for the admin.
      const changedAt = s.bankDetailsUpdatedAt ? new Date(s.bankDetailsUpdatedAt).getTime() : 0;
      return { ...s, ...t, bankChangedRecently: changedAt > 0 && now - changedAt < RECENT_BANK_CHANGE_MS };
    })
    .sort((a, b) => a.shopName.localeCompare(b.shopName));
}

/** Money for delivered packages still inside the return window, with the next release date. */
export async function getHeldPayouts(sellerId?: string) {
  const totals = await collect(and(isNull(orderItems.payoutId), heldShipment), repayable(heldShipment), sellerId);
  return totals.map((t) => ({
    sellerId: t.sellerId,
    netCents: t.netCents,
    itemCount: t.itemCount,
    // The oldest held delivery is released first.
    nextReleaseAt: t.oldestDeliveredAt ? new Date(t.oldestDeliveredAt.getTime() + PAYOUT_HOLD_DAYS * 86_400_000) : null,
  }));
}

export async function getRecentPayouts(limit = 20) {
  return db
    .select({
      id: sellerPayouts.id,
      shopName: sellerProfiles.shopName,
      grossAmount: sellerPayouts.grossAmount,
      commissionRate: sellerPayouts.commissionRate,
      commissionAmount: sellerPayouts.commissionAmount,
      deliveryAmount: sellerPayouts.deliveryAmount,
      adjustmentAmount: sellerPayouts.adjustmentAmount,
      amount: sellerPayouts.amount,
      itemCount: sellerPayouts.itemCount,
      reference: sellerPayouts.reference,
      bankName: sellerPayouts.bankName,
      bankAccountNumber: sellerPayouts.bankAccountNumber,
      paidAt: sellerPayouts.paidAt,
    })
    .from(sellerPayouts)
    .innerJoin(sellerProfiles, eq(sellerPayouts.sellerId, sellerProfiles.id))
    .where(eq(sellerPayouts.status, "PAID"))
    .orderBy(desc(sellerPayouts.paidAt))
    .limit(limit);
}

/** One boutique's own payout history, newest first (read-only, for the seller). */
export async function getSellerPayouts(sellerId: string, page: number, pageSize: number) {
  const where = eq(sellerPayouts.sellerId, sellerId);
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: sellerPayouts.id,
        status: sellerPayouts.status,
        grossAmount: sellerPayouts.grossAmount,
        commissionRate: sellerPayouts.commissionRate,
        commissionAmount: sellerPayouts.commissionAmount,
        deliveryAmount: sellerPayouts.deliveryAmount,
        adjustmentAmount: sellerPayouts.adjustmentAmount,
        amount: sellerPayouts.amount,
        itemCount: sellerPayouts.itemCount,
        reference: sellerPayouts.reference,
        bankName: sellerPayouts.bankName,
        bankAccountNumber: sellerPayouts.bankAccountNumber,
        paidAt: sellerPayouts.paidAt,
        createdAt: sellerPayouts.createdAt,
      })
      .from(sellerPayouts)
      .where(where)
      .orderBy(desc(sellerPayouts.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({
        count: sql<number>`count(*)::int`,
        paid: sql<string>`coalesce(sum(${sellerPayouts.amount}) filter (where ${sellerPayouts.status} = 'PAID'), 0)`,
      })
      .from(sellerPayouts)
      .where(where),
  ]);
  return { rows, total: totals.count, paidToDate: totals.paid };
}
