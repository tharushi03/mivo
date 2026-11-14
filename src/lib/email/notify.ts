// Order notifications. Each function re-reads the order from the database (after
// the change is committed) and sends its emails. Call them through notifyLater()
// from a Server Action, so the buyer/seller/admin never waits for the mail server.
import { after } from "next/server";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { couriers, orderItems, orders, products, refunds, sellerProfiles, shipments, users } from "@/db/schema";
import { getPlatformBankDetails, orderRef, paymentDeadline } from "@/lib/payments";
import { buyerOrderPath } from "@/lib/guest-orders";
import { formatDateTime } from "@/lib/format";
import { fromCents, toCents } from "@/lib/pricing";
import { getCodCouriers } from "@/lib/couriers";
import { sendEmail } from "./send";
import {
  buyerSlipRejectedEmail,
  buyerOrderPlacedEmail,
  buyerOrderCancelledEmail,
  buyerPackageDispatchedEmail,
  buyerPackageResolvedEmail,
  buyerPaymentReminderEmail,
  buyerPaymentVerifiedEmail,
  buyerTrackingUpdatedEmail,
  passwordResetEmail,
  sellerPackageResolvedEmail,
  sellerNewOrderEmail,
  sellerOrderCancelledEmail,
} from "./templates";

type Item = { title: string; size: string; quantity: number };

// The buyer of an order, for queries that LEFT JOIN users on orders.buyerId:
// an account's email and name, or a guest's email and the recipient name.
const buyer = {
  email: sql<string>`coalesce(${users.email}, ${orders.guestEmail})`,
  name: sql<string>`coalesce(${users.name}, ${orders.recipientName})`,
  guest: sql<boolean>`(${orders.buyerId} is null)`,
  // Orders from a boutique's own link carry its name on the buyer's emails.
  brand: sql<string | null>`(select r.shop_name from seller_profiles r where r.id = ${orders.referrerSellerId})`,
};

/** orderPath + brand for a buyer email template. */
const buyerLink = (orderId: string, b: { guest: boolean; brand: string | null }) => ({
  orderPath: buyerOrderPath(orderId, b.guest),
  brand: b.brand,
});

/** One boutique's items in an order, plus their total in cents. */
async function itemsOf(orderId: string, sellerId: string) {
  const rows = await db
    .select({ title: orderItems.productTitle, size: orderItems.selectedSize, quantity: orderItems.quantity, price: orderItems.priceAtPurchase })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(and(eq(orderItems.orderId, orderId), eq(products.sellerId, sellerId)));
  const totalCents = rows.reduce((s, r) => s + toCents(r.price) * r.quantity, 0);
  return { items: rows.map(({ title, size, quantity }): Item => ({ title, size, quantity })), totalCents };
}

/**
 * Trigger 1: tell each boutique in the order what to ship and where.
 * Each boutique sees only ITS OWN items, plus the delivery details it needs to ship.
 */
export async function notifySellersOfNewOrder(orderId: string) {
  const [order] = await db
    .select({
      recipientName: orders.recipientName,
      shippingAddress: orders.shippingAddress,
      phoneNumber: orders.phoneNumber,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
    })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order) return;

  const packages = await db
    .select({
      sellerId: shipments.sellerId,
      deliveryFee: shipments.deliveryFee,
      shopName: sellerProfiles.shopName,
      email: users.email,
    })
    .from(shipments)
    .innerJoin(sellerProfiles, eq(shipments.sellerId, sellerProfiles.id))
    .innerJoin(users, eq(sellerProfiles.userId, users.id))
    .where(and(eq(shipments.orderId, orderId), eq(shipments.status, "PENDING")));

  const ref = orderRef(orderId);
  const cod = order.paymentMethod === "COD" && order.paymentStatus !== "PAID";
  const codCouriers = cod ? await getCodCouriers() : [];
  await Promise.all(
    packages.map(async (p) => {
      const { items, totalCents } = await itemsOf(orderId, p.sellerId);
      return sendEmail(
        sellerNewOrderEmail({
          to: p.email,
          shopName: p.shopName,
          orderRef: ref,
          items,
          shipTo: { name: order.recipientName, address: order.shippingAddress, phone: order.phoneNumber },
          codAmount: cod ? fromCents(totalCents + toCents(p.deliveryFee)) : null,
          deliveryFee: p.deliveryFee,
          codCouriers,
        }),
      );
    }),
  );
}

/** The buyer's receipt when the order is placed, with the link to the order (and bank details). */
export async function notifyBuyerOrderPlaced(orderId: string) {
  const [o] = await db
    .select({
      email: buyer.email,
      name: buyer.name,
      guest: buyer.guest,
      brand: buyer.brand,
      total: orders.totalAmount,
      method: orders.paymentMethod,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .leftJoin(users, eq(orders.buyerId, users.id))
    .where(eq(orders.id, orderId));
  if (!o) return;
  const items = await db
    .select({ title: orderItems.productTitle, size: orderItems.selectedSize, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  const bankTransfer = o.method === "BANK_TRANSFER";
  await sendEmail(
    buyerOrderPlacedEmail({
      ...buyerLink(orderId, o),
      to: o.email,
      name: o.name,
      orderId,
      orderRef: orderRef(orderId),
      items,
      total: o.total,
      paymentMethod: o.method,
      bank: bankTransfer ? getPlatformBankDetails() : null,
      deadline: bankTransfer ? formatDateTime(paymentDeadline(o.createdAt)) : null,
      guest: o.guest,
    }),
  );
}

/** Trigger 2: one boutique's package left with the courier. */
export async function notifyBuyerShipmentDispatched(shipmentId: string) {
  const [s] = await db
    .select({
      orderId: shipments.orderId,
      sellerId: shipments.sellerId,
      deliveryFee: shipments.deliveryFee,
      tracking: shipments.trackingNumber,
      courier: couriers.name,
      shopName: sellerProfiles.shopName,
      email: buyer.email,
      name: buyer.name,
      guest: buyer.guest,
      brand: buyer.brand,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
    })
    .from(shipments)
    .innerJoin(orders, eq(shipments.orderId, orders.id))
    .leftJoin(users, eq(orders.buyerId, users.id))
    .innerJoin(sellerProfiles, eq(shipments.sellerId, sellerProfiles.id))
    .leftJoin(couriers, eq(shipments.courierId, couriers.id))
    .where(eq(shipments.id, shipmentId));
  if (!s || !s.tracking || !s.courier) return;

  const [{ items, totalCents }, all] = await Promise.all([
    itemsOf(s.orderId, s.sellerId),
    db.select({ id: shipments.id }).from(shipments).where(eq(shipments.orderId, s.orderId)),
  ]);
  await sendEmail(
    buyerPackageDispatchedEmail({
      ...buyerLink(s.orderId, s),
      to: s.email,
      name: s.name,
      orderId: s.orderId,
      orderRef: orderRef(s.orderId),
      shopName: s.shopName,
      courier: s.courier,
      tracking: s.tracking,
      items,
      packageCount: all.length,
      codAmount: s.paymentMethod === "COD" && s.paymentStatus !== "PAID" ? fromCents(totalCents + toCents(s.deliveryFee)) : null,
    }),
  );
}

/** Trigger 3: the admin confirmed the bank transfer. */
export async function notifyBuyerPaymentVerified(orderId: string) {
  const [o] = await db
    .select({ id: orders.id, email: buyer.email, name: buyer.name, guest: buyer.guest, brand: buyer.brand, totalAmount: orders.totalAmount })
    .from(orders)
    .leftJoin(users, eq(orders.buyerId, users.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!o) return;
  await sendEmail(
    buyerPaymentVerifiedEmail({ ...buyerLink(o.id, o), to: o.email, name: o.name, orderId: o.id, orderRef: orderRef(o.id), amount: o.totalAmount }),
  );
}

/** The admin rejected the buyer's bank slip: tell them why and ask for a new one. */
export async function notifyBuyerSlipRejected(orderId: string) {
  const [o] = await db
    .select({
      id: orders.id,
      email: buyer.email,
      name: buyer.name,
      guest: buyer.guest,
      brand: buyer.brand,
      totalAmount: orders.totalAmount,
      reason: orders.slipRejectReason,
      createdAt: orders.createdAt,
      rejectedAt: orders.slipRejectedAt,
    })
    .from(orders)
    .leftJoin(users, eq(orders.buyerId, users.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!o || !o.reason) return; // a new slip arrived meanwhile
  await sendEmail(
    buyerSlipRejectedEmail({
      ...buyerLink(o.id, o),
      to: o.email,
      name: o.name,
      orderId: o.id,
      orderRef: orderRef(o.id),
      amount: o.totalAmount,
      reason: o.reason,
      deadline: formatDateTime(paymentDeadline(o.createdAt, o.rejectedAt)),
    }),
  );
}

/**
 * Trigger 4: an order was cancelled. Boutiques that had been told to ship get a
 * "don't send" email (with their own items only); the buyer gets a confirmation.
 */
export async function notifyOrderCancelled(
  orderId: string,
  d: { by: "BUYER" | "ADMIN"; notifySellerIds: string[]; dispatchedSellerIds: string[]; refundDue: boolean },
) {
  const [o] = await db
    .select({ email: buyer.email, name: buyer.name, guest: buyer.guest, brand: buyer.brand, reason: orders.cancelReason })
    .from(orders)
    .leftJoin(users, eq(orders.buyerId, users.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!o) return;
  const ref = orderRef(orderId);
  // The whole-order refund created by this cancellation (package refunds were announced separately).
  const [refund] = d.refundDue
    ? await db
        .select({ amount: refunds.amount })
        .from(refunds)
        .where(and(eq(refunds.orderId, orderId), isNull(refunds.shipmentId)))
        .orderBy(desc(refunds.createdAt))
        .limit(1)
    : [];

  const sellers = d.notifySellerIds.length
    ? await db
        .select({ id: sellerProfiles.id, shopName: sellerProfiles.shopName, email: users.email })
        .from(sellerProfiles)
        .innerJoin(users, eq(sellerProfiles.userId, users.id))
        .where(inArray(sellerProfiles.id, d.notifySellerIds))
    : [];

  await Promise.all([
    sendEmail(buyerOrderCancelledEmail({ ...buyerLink(orderId, o), to: o.email, name: o.name, orderId, orderRef: ref, by: d.by, reason: o.reason, refund: refund?.amount ?? null })),
    ...sellers.map(async (s) => {
      const { items } = await itemsOf(orderId, s.id);
      return sendEmail(
        sellerOrderCancelledEmail({ to: s.email, shopName: s.shopName, orderRef: ref, items, by: d.by, alreadySent: d.dispatchedSellerIds.includes(s.id) }),
      );
    }),
  ]);
}

/** Trigger 5: a boutique or the admin corrected a package's courier / tracking number. */
export async function notifyBuyerTrackingUpdated(shipmentId: string) {
  const [s] = await db
    .select({
      orderId: shipments.orderId,
      tracking: shipments.trackingNumber,
      courier: couriers.name,
      shopName: sellerProfiles.shopName,
      email: buyer.email,
      name: buyer.name,
      guest: buyer.guest,
      brand: buyer.brand,
    })
    .from(shipments)
    .innerJoin(orders, eq(shipments.orderId, orders.id))
    .leftJoin(users, eq(orders.buyerId, users.id))
    .innerJoin(sellerProfiles, eq(shipments.sellerId, sellerProfiles.id))
    .leftJoin(couriers, eq(shipments.courierId, couriers.id))
    .where(eq(shipments.id, shipmentId));
  if (!s || !s.tracking || !s.courier) return;
  await sendEmail(
    buyerTrackingUpdatedEmail({
      ...buyerLink(s.orderId, s),
      to: s.email,
      name: s.name,
      orderId: s.orderId,
      orderRef: orderRef(s.orderId),
      shopName: s.shopName,
      courier: s.courier,
      tracking: s.tracking,
    }),
  );
}

/** One package was cancelled or returned by MIVO: tell its boutique and the buyer. */
export async function notifyPackageResolved(
  shipmentId: string,
  kind: "CANCELLED" | "RETURNED",
  r: { refundCents: number; restocked: boolean; wasDispatched: boolean; clawbackCents: number },
) {
  const [s] = await db
    .select({
      orderId: shipments.orderId,
      sellerId: shipments.sellerId,
      reason: shipments.resolutionNote,
      shopName: sellerProfiles.shopName,
      sellerUserId: sellerProfiles.userId,
      buyerEmail: buyer.email,
      buyerName: buyer.name,
      guest: buyer.guest,
      brand: buyer.brand,
    })
    .from(shipments)
    .innerJoin(orders, eq(shipments.orderId, orders.id))
    .leftJoin(users, eq(orders.buyerId, users.id))
    .innerJoin(sellerProfiles, eq(shipments.sellerId, sellerProfiles.id))
    .where(eq(shipments.id, shipmentId));
  if (!s) return;
  const [seller] = await db.select({ email: users.email }).from(users).where(eq(users.id, s.sellerUserId));
  const { items } = await itemsOf(s.orderId, s.sellerId);
  const ref = orderRef(s.orderId);
  const reason = s.reason ?? "";
  await Promise.all([
    seller &&
      sendEmail(
        sellerPackageResolvedEmail({
          to: seller.email,
          shopName: s.shopName,
          orderRef: ref,
          items,
          kind,
          reason,
          wasDispatched: r.wasDispatched,
          restocked: r.restocked,
          clawback: r.clawbackCents > 0 ? fromCents(r.clawbackCents) : null,
        }),
      ),
    sendEmail(
      buyerPackageResolvedEmail({
        ...buyerLink(s.orderId, s),
        to: s.buyerEmail,
        name: s.buyerName,
        orderId: s.orderId,
        orderRef: ref,
        shopName: s.shopName,
        kind,
        reason,
        refund: r.refundCents > 0 ? fromCents(r.refundCents) : null,
      }),
    ),
  ]);
}

/** Unpaid bank transfer, ~24 hours old: remind the buyer of the deadline. */
export async function notifyPaymentReminder(orderId: string, deadline: Date) {
  const [o] = await db
    .select({ email: buyer.email, name: buyer.name, guest: buyer.guest, brand: buyer.brand, amount: orders.totalAmount })
    .from(orders)
    .leftJoin(users, eq(orders.buyerId, users.id))
    .where(eq(orders.id, orderId));
  if (!o) return;
  await sendEmail(
    buyerPaymentReminderEmail({ ...buyerLink(orderId, o), to: o.email, name: o.name, orderId, orderRef: orderRef(orderId), amount: o.amount, deadline: formatDateTime(deadline) }),
  );
}

export async function sendPasswordReset(d: { to: string; name: string; link: string; minutes: number }) {
  await sendEmail(passwordResetEmail(d));
}

/**
 * Runs a notification after the response has been sent. Errors are logged, never
 * thrown: the change is already committed and must not look like it failed.
 */
export function notifyLater(label: string, fn: () => Promise<unknown>) {
  after(async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`[email] ${label} failed`, err);
    }
  });
}
