import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { couriers, orderItems, orders, products, refunds, sellerProfiles, shipments, users } from "@/db/schema";
import { isValidGuestKey } from "@/lib/guest-orders";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One order with its items, only if it belongs to `buyerId`. */
export async function getBuyerOrder(orderId: string, buyerId: string) {
  return getOrderWithItems(orderId, { buyerId });
}

/** A guest order opened through its secret link. Null if the key is wrong or it isn't a guest order. */
export async function getGuestOrder(orderId: string, key: string) {
  if (!UUID.test(orderId) || !isValidGuestKey(orderId, key)) return null;
  return getOrderWithItems(orderId, { guest: true });
}

/** Who may see an order: its account, or (after the link's key was checked) its guest. */
export type OrderOwner = { buyerId: string } | { guest: true };

/**
 * One order with its items and the buyer's details (account, or guest email). With
 * `owner`, only returns the order if it belongs to them. Callers without `owner` must
 * check access themselves (e.g. admin only).
 */
export async function getOrderWithItems(orderId: string, owner?: OrderOwner) {
  if (!UUID.test(orderId)) return null;

  const ownedBy = !owner ? undefined : "buyerId" in owner ? eq(orders.buyerId, owner.buyerId) : isNull(orders.buyerId);
  const [row] = await db
    .select({
      order: orders,
      buyerName: sql<string>`coalesce(${users.name}, ${orders.recipientName})`,
      buyerEmail: sql<string>`coalesce(${users.email}, ${orders.guestEmail})`,
      referrerSlug: sql<string | null>`(select r.slug from seller_profiles r where r.id = ${orders.referrerSellerId})`,
      referrerName: sql<string | null>`(select r.shop_name from seller_profiles r where r.id = ${orders.referrerSellerId})`,
    })
    .from(orders)
    .leftJoin(users, eq(orders.buyerId, users.id))
    .where(and(eq(orders.id, orderId), ownedBy))
    .limit(1);
  if (!row) return null;
  const order = { ...row.order, buyerName: row.buyerName, buyerEmail: row.buyerEmail, referrerSlug: row.referrerSlug, referrerName: row.referrerName };

  const items = await db
    .select({
      id: orderItems.id,
      quantity: orderItems.quantity,
      size: orderItems.selectedSize,
      price: orderItems.priceAtPurchase,
      productId: products.id,
      title: orderItems.productTitle,
      imageUrl: orderItems.productImageUrl,
      sellerId: sellerProfiles.id,
      shopName: sellerProfiles.shopName,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
    .where(eq(orderItems.orderId, order.id));

  // One package per boutique, with its items attached.
  const shipmentRows = await db
    .select({
      id: shipments.id,
      sellerId: shipments.sellerId,
      shopName: sellerProfiles.shopName,
      status: shipments.status,
      courierName: couriers.name,
      trackingNumber: shipments.trackingNumber,
      deliveryFee: shipments.deliveryFee,
      packedAt: shipments.packedAt,
      inHubAt: shipments.inHubAt,
      dispatchedAt: shipments.dispatchedAt,
      deliveredAt: shipments.deliveredAt,
      returnedAt: shipments.returnedAt,
      resolutionNote: shipments.resolutionNote,
    })
    .from(shipments)
    .innerJoin(sellerProfiles, eq(shipments.sellerId, sellerProfiles.id))
    .leftJoin(couriers, eq(shipments.courierId, couriers.id))
    .where(eq(shipments.orderId, order.id))
    .orderBy(asc(sellerProfiles.shopName));

  const packages = shipmentRows.map((s) => {
    const its = items.filter((i) => i.sellerId === s.sellerId);
    const itemsTotal = its.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
    return { ...s, items: its, itemsTotal, packageTotal: itemsTotal + Number(s.deliveryFee) };
  });

  const refundRows = await db
    .select({ id: refunds.id, shipmentId: refunds.shipmentId, amount: refunds.amount, status: refunds.status, reason: refunds.reason, settledAt: refunds.settledAt })
    .from(refunds)
    .where(eq(refunds.orderId, order.id))
    .orderBy(asc(refunds.createdAt));

  return { ...order, items, packages, refunds: refundRows };
}

export async function getBuyerOrders(buyerId: string) {
  return db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      totalAmount: orders.totalAmount,
      orderStatus: orders.orderStatus,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
    })
    .from(orders)
    .where(eq(orders.buyerId, buyerId))
    .orderBy(desc(orders.createdAt));
}

export const STATUS_LABEL = {
  PENDING: "Order received",
  PARTIALLY_DISPATCHED: "Partly shipped",
  DISPATCHED: "All shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
} as const;

/** Human label for an order's payment state. */
export function paymentLabel(method: "COD" | "BANK_TRANSFER", status: (typeof orders.$inferSelect)["paymentStatus"]) {
  switch (status) {
    case "PAID":
      return "Paid";
    case "VOIDED":
      return "Not charged";
    case "REFUND_PENDING":
      return "Refund pending";
    case "REFUNDED":
      return "Refunded";
    case "FAILED":
      return "Payment failed";
    default:
      return method === "COD" ? "Pay on delivery" : "Payment pending";
  }
}
