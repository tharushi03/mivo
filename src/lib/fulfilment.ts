// Order and package state changes shared by the buyer, admin and cron actions.
// Not a Server Action file: callers check who the user is first.
//
//   whole order cancelled  -> cancelOrderTx     (buyer before anything ships, admin, unpaid-order expiry)
//   one package cancelled  -> cancelShipmentTx  (admin: boutique can't send it, buyer refused it, ...)
//   one package returned   -> returnShipmentTx  (admin: delivered, then sent back)
//   items physically back  -> restockShipmentTx (admin or the boutique: "Back in stock", once per package)
//
// Every function locks the order row first (the same lock dispatch and delivery take)
// and records any money MIVO owes the buyer as a row in `refunds`.
import { and, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, productVariants, products, refunds, sellerAdjustments, shipments } from "@/db/schema";
import { fromCents, toCents } from "@/lib/pricing";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ShipmentStatus = (typeof shipments.$inferSelect)["status"];

/** Order status follows its packages. Cancelled packages don't count; returned ones count as finished. */
export async function syncOrderStatus(tx: Tx, orderId: string) {
  const [s] = await tx
    .select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) filter (where ${shipments.status} in ('DISPATCHED', 'DELIVERED', 'RETURNED'))::int`,
      done: sql<number>`count(*) filter (where ${shipments.status} in ('DELIVERED', 'RETURNED'))::int`,
    })
    .from(shipments)
    .where(and(eq(shipments.orderId, orderId), ne(shipments.status, "CANCELLED")));

  const next =
    s.total > 0 && s.done === s.total
      ? "DELIVERED"
      : s.total > 0 && s.sent === s.total
        ? "DISPATCHED"
        : s.sent > 0
          ? "PARTIALLY_DISPATCHED"
          : "PENDING";

  const nowSql = sql`${new Date().toISOString()}::timestamptz`;
  await tx
    .update(orders)
    .set({
      orderStatus: next,
      dispatchedAt: next === "DISPATCHED" || next === "DELIVERED" ? sql`coalesce(${orders.dispatchedAt}, ${nowSql})` : null,
      deliveredAt: next === "DELIVERED" ? sql`coalesce(${orders.deliveredAt}, ${nowSql})` : null,
      // Every courier has handed over the cash: the COD order is fully paid.
      ...(next === "DELIVERED"
        ? {
            paymentStatus: sql`case when ${orders.paymentMethod} = 'COD' then 'PAID'::payment_status else ${orders.paymentStatus} end`,
            paidAt: sql`coalesce(${orders.paidAt}, ${nowSql})`,
          }
        : {}),
    })
    .where(and(eq(orders.id, orderId), ne(orders.orderStatus, "CANCELLED")));
  return next;
}

/**
 * The buyer may cancel only while NO boutique has handed its package to a courier:
 * every (non-cancelled) package must still be PENDING.
 */
export function buyerCanCancel(orderStatus: string, packageStatuses: ShipmentStatus[]) {
  const open = packageStatuses.filter((s) => s !== "CANCELLED");
  return orderStatus === "PENDING" && open.length > 0 && open.every((s) => s === "PENDING");
}

async function lockOrder(tx: Tx, orderId: string) {
  const [o] = await tx
    .select({
      buyerId: orders.buyerId,
      status: orders.orderStatus,
      method: orders.paymentMethod,
      payment: orders.paymentStatus,
      slip: orders.paymentSlipUrl,
      total: orders.totalAmount,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update");
  return o ?? null;
}

/** One boutique's items in an order. */
function itemsOfPackage(tx: Tx, orderId: string, sellerIds: string[]) {
  if (sellerIds.length === 0) return Promise.resolve([]);
  return tx
    .select({
      productId: orderItems.productId,
      size: orderItems.selectedSize,
      quantity: orderItems.quantity,
      price: orderItems.priceAtPurchase,
      commissionRate: orderItems.commissionRate,
      payoutId: orderItems.payoutId,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(and(eq(orderItems.orderId, orderId), inArray(products.sellerId, sellerIds)));
}

/** Puts items back into the exact sizes they were bought in. Sorted so rows lock in the same order as checkout. */
async function restock(tx: Tx, items: { productId: string; size: string; quantity: number }[]) {
  const sorted = [...items].sort((a, b) => a.productId.localeCompare(b.productId) || a.size.localeCompare(b.size));
  for (const i of sorted) {
    await tx
      .insert(productVariants)
      // If the seller removed that size meanwhile, it is re-created rather than lost.
      .values({ productId: i.productId, size: i.size, stock: i.quantity, position: 999 })
      .onConflictDoUpdate({
        target: [productVariants.productId, productVariants.size],
        set: { stock: sql`${productVariants.stock} + ${i.quantity}` },
      });
  }
}

/** Payment status of a cancelled order, from its refunds. */
async function paymentStatusAfterCancel(tx: Tx, orderId: string) {
  const [r] = await tx
    .select({
      pending: sql<number>`count(*) filter (where ${refunds.status} = 'PENDING')::int`,
      refunded: sql<number>`count(*) filter (where ${refunds.status} = 'REFUNDED')::int`,
    })
    .from(refunds)
    .where(eq(refunds.orderId, orderId));
  return r.pending > 0 ? "REFUND_PENDING" : r.refunded > 0 ? "REFUNDED" : "VOIDED";
}

/** Called after a refund is settled: a cancelled order's payment status follows its refunds. */
export async function syncCancelledPayment(tx: Tx, orderId: string) {
  const [o] = await tx.select({ status: orders.orderStatus }).from(orders).where(eq(orders.id, orderId)).for("update");
  if (o?.status !== "CANCELLED") return;
  const next = await paymentStatusAfterCancel(tx, orderId);
  await tx
    .update(orders)
    .set({ paymentStatus: next, refundedAt: next === "REFUNDED" ? new Date() : null })
    .where(eq(orders.id, orderId));
}

// ---------------------------------------------------------------- Whole order

export type CancelOutcome =
  | { error: string }
  | {
      error?: undefined;
      /** Boutiques whose open package was cancelled AND who had been told to ship it ("don't send" email). */
      notifySellerIds: string[];
      /** Boutiques whose package was already with a courier (admin cancellations only). */
      dispatchedSellerIds: string[];
      refundDue: boolean;
    };

/**
 * Cancels an order: order -> CANCELLED, open packages cancelled, their items returned
 * to the exact sizes bought, and a refund recorded if MIVO may have the buyer's money.
 */
export async function cancelOrderTx(
  tx: Tx,
  orderId: string,
  by:
    | { role: "BUYER"; buyerId: string }
    // onlyIfUnpaid: the payment-deadline job. Re-checked under the lock, so a slip
    // uploaded (or a payment verified) a moment ago always wins.
    | { role: "ADMIN"; reason?: string; onlyIfUnpaid?: boolean },
): Promise<CancelOutcome> {
  const order = await lockOrder(tx, orderId);
  // Someone else's order looks exactly like a missing one.
  if (!order || (by.role === "BUYER" && order.buyerId !== by.buyerId)) return { error: "Order not found." };
  if (order.status === "CANCELLED") return { error: "This order is already cancelled." };
  if (order.status === "DELIVERED") return { error: "This order was already delivered." };
  if (by.role === "ADMIN" && by.onlyIfUnpaid && (order.status !== "PENDING" || order.payment !== "PENDING" || order.slip)) {
    return { error: "Payment or slip received; not expiring." };
  }

  const pkgs = await tx.select({ sellerId: shipments.sellerId, status: shipments.status }).from(shipments).where(eq(shipments.orderId, orderId));

  if (by.role === "BUYER") {
    if (!buyerCanCancel(order.status, pkgs.map((p) => p.status))) {
      return { error: "A boutique has already sent part of this order, so it can't be cancelled here. Please contact MIVO support." };
    }
  } else if (pkgs.some((p) => p.status === "DELIVERED")) {
    return { error: "A package in this order was already delivered. Cancel the other packages one by one instead." };
  }

  // Money: COD is only collected on delivery, so nothing was paid. A bank transfer
  // that MIVO verified, or whose slip was uploaded, may have reached MIVO: record a
  // refund for whatever hasn't already been refunded package by package.
  const mayHaveMoney = order.method === "BANK_TRANSFER" && (order.payment === "PAID" || Boolean(order.slip));
  let refundDue = false;
  if (mayHaveMoney) {
    const [{ already }] = await tx
      .select({ already: sql<string>`coalesce(sum(${refunds.amount}), 0)` })
      .from(refunds)
      .where(and(eq(refunds.orderId, orderId), ne(refunds.status, "VOIDED")));
    const owedCents = toCents(order.total) - toCents(already);
    if (owedCents > 0) {
      await tx.insert(refunds).values({
        orderId,
        amount: fromCents(owedCents),
        reason: by.role === "BUYER" ? "Cancelled by the buyer" : (by.reason ?? "Cancelled by MIVO"),
      });
      refundDue = true;
    }
  }
  // Boutiques were emailed to ship once the order was ready (COD at once, bank transfer when verified).
  const sellersWereNotified = order.method === "COD" || order.payment === "PAID";

  // Packages that never left go straight back to stock. Packages already with a
  // courier come back later: someone presses "Back in stock" when they arrive.
  const now = new Date();
  const unsent = await tx
    .update(shipments)
    .set({ status: "CANCELLED", restockedAt: now })
    .where(and(eq(shipments.orderId, orderId), eq(shipments.status, "PENDING")))
    .returning({ sellerId: shipments.sellerId });
  const inTransit = await tx
    .update(shipments)
    .set({ status: "CANCELLED" })
    .where(and(eq(shipments.orderId, orderId), eq(shipments.status, "DISPATCHED")))
    .returning({ sellerId: shipments.sellerId });
  const cancelled = [...unsent, ...inTransit];
  await restock(tx, await itemsOfPackage(tx, orderId, unsent.map((c) => c.sellerId)));

  await tx
    .update(orders)
    .set({
      orderStatus: "CANCELLED",
      cancelledAt: now,
      cancelledBy: by.role,
      cancelReason: by.role === "ADMIN" ? (by.reason ?? null) : null,
      paymentStatus: await paymentStatusAfterCancel(tx, orderId),
    })
    .where(eq(orders.id, orderId));

  return {
    notifySellerIds: sellersWereNotified ? cancelled.map((c) => c.sellerId) : [],
    dispatchedSellerIds: pkgs.filter((p) => p.status === "DISPATCHED").map((p) => p.sellerId),
    refundDue,
  };
}

// ---------------------------------------------------------------- One package

export type PackageOutcome =
  | { error: string }
  | {
      error?: undefined;
      orderId: string;
      sellerId: string;
      refundCents: number;
      restocked: boolean;
      wasDispatched: boolean;
      /** Returns after the boutique was paid: amount taken back from its next payout. */
      clawbackCents: number;
    };

async function lockPackage(tx: Tx, shipmentId: string) {
  const [ref] = await tx.select({ orderId: shipments.orderId }).from(shipments).where(eq(shipments.id, shipmentId));
  if (!ref) return null;
  const order = await lockOrder(tx, ref.orderId); // order first, then the package (same order as dispatch)
  const [pkg] = await tx
    .select({ sellerId: shipments.sellerId, status: shipments.status, deliveryFee: shipments.deliveryFee, payoutId: shipments.payoutId })
    .from(shipments)
    .where(eq(shipments.id, shipmentId))
    .for("update");
  return order && pkg ? { orderId: ref.orderId, order, pkg } : null;
}

/**
 * Admin cancels ONE boutique's package while the rest of the order goes ahead
 * (the boutique can't send it, the buyer refused it at the door, ...).
 * - Not yet sent: items go straight back to stock.
 * - Already with the courier: back to stock only if `restockNow` (tick once the
 *   boutique has it back); otherwise "Back in stock" is pressed when it arrives.
 * - Prepaid orders: the package's items and delivery fee are refunded.
 */
export async function cancelShipmentTx(tx: Tx, shipmentId: string, opts: { reason: string; restockNow: boolean }): Promise<PackageOutcome> {
  const found = await lockPackage(tx, shipmentId);
  if (!found) return { error: "Package not found." };
  const { orderId, order, pkg } = found;

  if (order.status === "CANCELLED") return { error: "This order is already cancelled." };
  if (pkg.status !== "PENDING" && pkg.status !== "DISPATCHED") return { error: "Only packages that haven't been delivered can be cancelled." };
  if (order.method === "BANK_TRANSFER" && order.payment !== "PAID") {
    return { error: "This order isn't paid yet. Cancel the whole order instead, or verify the payment first." };
  }
  const [{ others }] = await tx
    .select({ others: sql<number>`count(*)::int` })
    .from(shipments)
    .where(and(eq(shipments.orderId, orderId), ne(shipments.id, shipmentId), notInArray(shipments.status, ["CANCELLED", "RETURNED"])));
  if (others === 0) return { error: "This is the last package in the order. Cancel the whole order instead." };

  const items = await itemsOfPackage(tx, orderId, [pkg.sellerId]);
  const restocked = pkg.status === "PENDING" || opts.restockNow;
  if (restocked) await restock(tx, items);

  let refundCents = 0;
  if (order.method === "BANK_TRANSFER") {
    // Prepaid: the buyer paid for this package and won't get it. COD: nothing was collected.
    refundCents = items.reduce((s, i) => s + toCents(i.price) * i.quantity, 0) + toCents(pkg.deliveryFee);
    await tx.insert(refunds).values({ orderId, shipmentId, amount: fromCents(refundCents), reason: `Package cancelled: ${opts.reason}` });
  }

  await tx
    .update(shipments)
    .set({ status: "CANCELLED", resolutionNote: opts.reason, restockedAt: restocked ? new Date() : null })
    .where(eq(shipments.id, shipmentId));
  await syncOrderStatus(tx, orderId);
  return { orderId, sellerId: pkg.sellerId, refundCents, restocked, wasDispatched: pkg.status === "DISPATCHED", clawbackCents: 0 };
}

/**
 * Admin records that a DELIVERED package came back (damaged, wrong item, ...). The
 * buyer is refunded the items (plus delivery if it was faulty or wrong), and the
 * boutique isn't paid for them. If the boutique was ALREADY paid, what it received
 * for this package is recorded as a deduction from its next payout(s).
 */
export async function returnShipmentTx(
  tx: Tx,
  shipmentId: string,
  opts: { reason: string; restockNow: boolean; refundDelivery: boolean },
): Promise<PackageOutcome> {
  const found = await lockPackage(tx, shipmentId);
  if (!found) return { error: "Package not found." };
  const { orderId, order, pkg } = found;

  if (order.status === "CANCELLED") return { error: "This order is cancelled." };
  if (pkg.status !== "DELIVERED") return { error: "Only delivered packages can be returned." };

  const items = await itemsOfPackage(tx, orderId, [pkg.sellerId]);
  if (opts.restockNow) await restock(tx, items);

  // Already paid out? Take back exactly what the boutique received for it: each paid
  // item's price minus its commission (rounded per item, as in the payout), plus the
  // delivery fee if that was repaid.
  const paidItems = items.filter((i) => i.payoutId);
  const clawbackCents =
    paidItems.reduce((s, i) => {
      const g = toCents(i.price) * i.quantity;
      return s + g - Math.round((g * Number(i.commissionRate)) / 100);
    }, 0) + (pkg.payoutId ? toCents(pkg.deliveryFee) : 0);
  if (clawbackCents > 0) {
    await tx.insert(sellerAdjustments).values({
      sellerId: pkg.sellerId,
      shipmentId,
      amount: fromCents(-clawbackCents),
      reason: `Return after payout: ${opts.reason}`,
    });
  }

  // Delivered means paid: COD cash reached MIVO, or the bank transfer was verified.
  // The delivery fee is refunded too only when the item was faulty or wrong (Terms).
  const refundCents = items.reduce((s, i) => s + toCents(i.price) * i.quantity, 0) + (opts.refundDelivery ? toCents(pkg.deliveryFee) : 0);
  await tx.insert(refunds).values({ orderId, shipmentId, amount: fromCents(refundCents), reason: `Package returned: ${opts.reason}` });

  const now = new Date();
  await tx
    .update(shipments)
    .set({ status: "RETURNED", returnedAt: now, resolutionNote: opts.reason, restockedAt: opts.restockNow ? now : null })
    .where(eq(shipments.id, shipmentId));
  await syncOrderStatus(tx, orderId);
  return { orderId, sellerId: pkg.sellerId, refundCents, restocked: opts.restockNow, wasDispatched: true, clawbackCents };
}

/**
 * The items of a cancelled or returned package are physically back with the boutique:
 * put them back into stock. Works once per package (restockedAt), so a double click
 * or the admin and boutique both pressing it can't add the stock twice.
 * `sellerId`: when the boutique does it, only for its own packages.
 */
export async function restockShipmentTx(tx: Tx, shipmentId: string, sellerId: string | null) {
  const [pkg] = await tx
    .update(shipments)
    .set({ restockedAt: new Date() })
    .where(
      and(
        eq(shipments.id, shipmentId),
        inArray(shipments.status, ["CANCELLED", "RETURNED"]),
        isNull(shipments.restockedAt),
        ...(sellerId ? [eq(shipments.sellerId, sellerId)] : []),
      ),
    )
    .returning({ orderId: shipments.orderId, sellerId: shipments.sellerId });
  if (!pkg) return { error: "Nothing to restock: this package was already put back in stock." } as const;
  const items = await itemsOfPackage(tx, pkg.orderId, [pkg.sellerId]);
  await restock(tx, items);
  return { orderId: pkg.orderId, items: items.reduce((s, i) => s + i.quantity, 0) } as const;
}
