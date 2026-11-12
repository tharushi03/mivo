"use server";

// Distributed fulfilment: every boutique ships its own package straight to the buyer.
//
//   order placed ──▶ one shipment per boutique (PENDING)
//   boutique enters courier + tracking ──▶ shipment DISPATCHED (buyer emailed)
//   admin confirms delivery / COD cash received ──▶ shipment DELIVERED
//
//   order.orderStatus is derived from its shipments (syncOrderStatus):
//     none sent → PENDING · some sent → PARTIALLY_DISPATCHED · all sent → DISPATCHED · all delivered → DELIVERED
//
//   Bank transfer orders must be PAID before any boutique can dispatch.
//   Admin can cancel the whole order until any package is delivered, cancel one
//   package, or record a return of a delivered package (src/lib/fulfilment.ts).
//
// Every change runs under a lock on the order row and uses conditional UPDATEs
// ("... WHERE status = expected"), so double clicks and concurrent users can't skip steps.

import { revalidatePath, updateTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { couriers, orders, refunds, sellerProfiles, shipments } from "@/db/schema";
import { requireAdmin, requireSeller, requireUser } from "@/lib/dal";
import { PRODUCTS_TAG } from "@/lib/catalog";
import { normaliseTracking } from "@/lib/shipments";
import { cancelOrderTx, cancelShipmentTx, restockShipmentTx, returnShipmentTx, syncCancelledPayment, syncOrderStatus, type Tx } from "@/lib/fulfilment";
import { audit } from "@/lib/audit";
import { orderRef } from "@/lib/payments";
import { formatLKR } from "@/lib/format";
import { fromCents } from "@/lib/pricing";
import { refreshOrderPages } from "@/lib/revalidate-orders";
import {
  notifyBuyerPaymentVerified,
  notifyBuyerShipmentDispatched,
  notifyBuyerTrackingUpdated,
  notifyLater,
  notifyOrderCancelled,
  notifyPackageResolved,
  notifySellersOfNewOrder,
} from "@/lib/email/notify";

export type ActionResult = { ok?: boolean; error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readId(formData: FormData, key: string) {
  const id = String(formData.get(key) ?? "");
  return UUID.test(id) ? id : null;
}

/** Locks the order row; returns its status fields, or null if it doesn't exist. */
const COD_COURIER_ONLY =
  "This is a cash-on-delivery package: it must be booked on MIVO's account with one of the couriers in the list, so the cash comes to MIVO.";

async function lockOrder(tx: Tx, orderId: string) {
  const [order] = await tx
    .select({ status: orders.orderStatus, method: orders.paymentMethod, payment: orders.paymentStatus })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update");
  return order ?? null;
}

/** "Colombo Batik House package of MIVO-1A2B3C4D", for the activity log. */
async function packageLabel(shipmentId: string) {
  const [p] = await db
    .select({ shop: sellerProfiles.shopName, orderId: shipments.orderId })
    .from(shipments)
    .innerJoin(sellerProfiles, eq(shipments.sellerId, sellerProfiles.id))
    .where(eq(shipments.id, shipmentId));
  return p ? `${p.shop} package of ${orderRef(p.orderId)}` : "package";
}

/** Looks up which order a shipment belongs to (no lock; callers lock the order next). */
async function orderIdOfShipment(shipmentId: string) {
  const [row] = await db.select({ orderId: shipments.orderId }).from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
  return row?.orderId ?? null;
}

// ---------------------------------------------------------------- Admin

/** Admin confirms a bank transfer was received. Boutiques can then ship. */
export async function verifyPayment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const orderId = readId(formData, "orderId");
  if (!orderId) return { error: "Invalid order." };

  const updated = await db
    .update(orders)
    .set({ paymentStatus: "PAID", paidAt: new Date() })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.paymentMethod, "BANK_TRANSFER"),
        eq(orders.paymentStatus, "PENDING"),
        eq(orders.orderStatus, "PENDING"),
      ),
    )
    .returning({ id: orders.id });

  if (updated.length === 0) return { error: "This payment can't be verified (already paid, cancelled or not a bank transfer)." };
  refreshOrderPages(orderId);
  // Only the request that actually flipped PENDING -> PAID gets here, so these send once.
  notifyLater("payment verified (buyer)", () => notifyBuyerPaymentVerified(orderId));
  notifyLater("new order (sellers)", () => notifySellersOfNewOrder(orderId)); // now they can ship it
  await audit(admin.id, "verify_payment", { type: "order", id: orderId }, `Verified the bank transfer for ${orderRef(orderId)}`);
  return { ok: true };
}

/**
 * Admin confirms one package reached the buyer (for COD: the courier has passed
 * the cash to MIVO). The order becomes DELIVERED when its last package is.
 */
export async function markShipmentDelivered(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const shipmentId = readId(formData, "shipmentId");
  if (!shipmentId) return { error: "Invalid package." };
  const orderId = await orderIdOfShipment(shipmentId);
  if (!orderId) return { error: "Package not found." };

  const error = await db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order || order.status === "CANCELLED") return "This order was cancelled.";

    const updated = await tx
      .update(shipments)
      .set({ status: "DELIVERED", deliveredAt: new Date() })
      .where(and(eq(shipments.id, shipmentId), eq(shipments.status, "DISPATCHED")))
      .returning({ id: shipments.id });
    if (updated.length === 0) return "Only packages that are on the way can be marked delivered.";

    await syncOrderStatus(tx, orderId);
    return null;
  });

  if (error) return { error };
  refreshOrderPages(orderId);
  await audit(admin.id, "mark_delivered", { type: "shipment", id: shipmentId }, `Marked the ${await packageLabel(shipmentId)} delivered`);
  return { ok: true };
}

/**
 * Admin cancels an order: stock returned, open packages cancelled, payment voided
 * (or flagged as a refund owed). Not possible once any package is delivered.
 */
export async function cancelOrder(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const orderId = readId(formData, "orderId");
  if (!orderId) return { error: "Invalid order." };

  const result = await db.transaction((tx) => cancelOrderTx(tx, orderId, { role: "ADMIN" }));
  if (result.error !== undefined) return { error: result.error };

  updateTag(PRODUCTS_TAG); // stock is back on the storefront
  refreshOrderPages(orderId);
  notifyLater("order cancelled", () => notifyOrderCancelled(orderId, { by: "ADMIN", ...result }));
  await audit(admin.id, "cancel_order", { type: "order", id: orderId }, `Cancelled ${orderRef(orderId)}${result.refundDue ? " (refund recorded)" : ""}`);
  return { ok: true };
}

/**
 * Admin settles one refund: REFUNDED once the money was sent back, or VOIDED if a
 * slip turned out to be for a transfer that never arrived (only possible for a
 * whole-order refund whose payment MIVO never verified).
 */
export async function settleRefund(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const refundId = readId(formData, "refundId");
  const outcome = String(formData.get("outcome") ?? "");
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 100) || null;
  if (!refundId) return { error: "Invalid refund." };
  if (outcome !== "REFUNDED" && outcome !== "NOT_RECEIVED") return { error: "Invalid choice." };

  const result = await db.transaction(async (tx): Promise<{ error: string } | { orderId: string; amount: string }> => {
    const [r] = await tx
      .select({ orderId: refunds.orderId, shipmentId: refunds.shipmentId, status: refunds.status, paidAt: orders.paidAt, amount: refunds.amount })
      .from(refunds)
      .innerJoin(orders, eq(refunds.orderId, orders.id))
      .where(eq(refunds.id, refundId))
      .for("update", { of: refunds });
    if (!r) return { error: "Refund not found." };
    if (r.status !== "PENDING") return { error: "This refund was already settled." };
    // A verified payment definitely arrived, and a package refund means the order was paid.
    if (outcome === "NOT_RECEIVED" && (r.paidAt || r.shipmentId)) {
      return { error: "MIVO received this payment, so it must be refunded." };
    }
    await tx
      .update(refunds)
      .set({ status: outcome === "REFUNDED" ? "REFUNDED" : "VOIDED", reference, settledAt: new Date() })
      .where(eq(refunds.id, refundId));
    await syncCancelledPayment(tx, r.orderId);
    return { orderId: r.orderId, amount: r.amount };
  });
  if ("error" in result) return { error: result.error };
  refreshOrderPages(result.orderId);
  await audit(
    admin.id,
    "settle_refund",
    { type: "refund", id: refundId },
    outcome === "REFUNDED"
      ? `Refunded ${formatLKR(result.amount)} for ${orderRef(result.orderId)}${reference ? ` (ref ${reference})` : ""}`
      : `Voided the ${formatLKR(result.amount)} refund for ${orderRef(result.orderId)}: payment never arrived`,
  );
  return { ok: true };
}

function readResolution(formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  return { reason, restockNow: formData.get("restockNow") === "on", refundDelivery: formData.get("refundDelivery") === "on" };
}

/** Admin cancels ONE package; the rest of the order goes ahead. */
export async function cancelShipment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const shipmentId = readId(formData, "shipmentId");
  const opts = readResolution(formData);
  if (!shipmentId) return { error: "Invalid package." };
  if (opts.reason.length < 3) return { error: "Say why (the boutique and buyer see this)." };

  const r = await db.transaction((tx) => cancelShipmentTx(tx, shipmentId, opts));
  if (r.error !== undefined) return { error: r.error };
  if (r.restocked) updateTag(PRODUCTS_TAG);
  refreshOrderPages(r.orderId);
  notifyLater("package cancelled", () => notifyPackageResolved(shipmentId, "CANCELLED", r));
  await audit(admin.id, "cancel_package", { type: "shipment", id: shipmentId }, `Cancelled the ${await packageLabel(shipmentId)}: ${opts.reason}`);
  return { ok: true };
}

/** Admin records that a delivered package came back (deducted from the boutique if it was already paid). */
export async function returnShipment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const shipmentId = readId(formData, "shipmentId");
  const opts = readResolution(formData);
  if (!shipmentId) return { error: "Invalid package." };
  if (opts.reason.length < 3) return { error: "Say why it was returned (the boutique and buyer see this)." };

  const r = await db.transaction((tx) => returnShipmentTx(tx, shipmentId, opts));
  if (r.error !== undefined) return { error: r.error };
  if (r.restocked) updateTag(PRODUCTS_TAG);
  refreshOrderPages(r.orderId);
  notifyLater("package returned", () => notifyPackageResolved(shipmentId, "RETURNED", r));
  await audit(
    admin.id,
    "return_package",
    { type: "shipment", id: shipmentId },
    `Recorded a return of the ${await packageLabel(shipmentId)}: ${opts.reason}${r.clawbackCents ? ` (LKR ${fromCents(r.clawbackCents)} deducted from the boutique)` : ""}`,
  );
  return { ok: true };
}

/**
 * The items of a cancelled / returned package are physically back: put them into
 * stock. The admin can do it for any package, a boutique for its own.
 */
export async function restockShipment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  let sellerId: string | null = null;
  if (user.role === "SELLER") {
    const [p] = await db.select({ id: sellerProfiles.id }).from(sellerProfiles).where(eq(sellerProfiles.userId, user.id));
    if (!p) return { error: "No boutique profile." };
    sellerId = p.id;
  } else if (user.role !== "ADMIN") {
    return { error: "Package not found." };
  }
  const shipmentId = readId(formData, "shipmentId");
  if (!shipmentId) return { error: "Invalid package." };

  const r = await db.transaction((tx) => restockShipmentTx(tx, shipmentId, sellerId));
  if ("error" in r) return { error: r.error };
  updateTag(PRODUCTS_TAG);
  refreshOrderPages(r.orderId);
  revalidatePath("/seller/dashboard");
  if (user.role === "ADMIN") {
    await audit(user.id, "restock_package", { type: "shipment", id: shipmentId }, `Put ${r.items} item(s) from the ${await packageLabel(shipmentId)} back in stock`);
  }
  return { ok: true };
}

// ---------------------------------------------------------------- Seller

/**
 * A boutique hands ITS package to a courier: records the courier and tracking
 * number, marks the shipment DISPATCHED and emails the buyer.
 */
export async function dispatchShipment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { profile } = await requireSeller();
  if (!profile) return { error: "No boutique profile." };

  const shipmentId = readId(formData, "shipmentId");
  const courierId = readId(formData, "courierId");
  const tracking = normaliseTracking(String(formData.get("trackingNumber") ?? ""));
  if (!shipmentId) return { error: "Invalid package." };
  if (!courierId) return { error: "Choose the courier." };
  if (!tracking) return { error: "Enter the tracking number exactly as on the courier receipt (letters, numbers and dashes)." };

  const orderId = await orderIdOfShipment(shipmentId);
  if (!orderId) return { error: "Package not found." };

  const error = await db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order) return "Order not found.";
    if (order.status === "CANCELLED") return "This order was cancelled. Don't send it.";
    if (order.method === "BANK_TRANSFER" && order.payment !== "PAID") return "Wait until MIVO confirms the bank transfer.";

    const [courier] = await tx
      .select({ id: couriers.id, supportsCod: couriers.supportsCod })
      .from(couriers)
      .where(and(eq(couriers.id, courierId), eq(couriers.isActive, true)))
      .for("share"); // so the admin can't switch off its COD account mid-dispatch
    if (!courier) return "Choose a courier from the list.";
    if (order.method === "COD") {
      // The cash goes to whoever owns the account the parcel is booked on: it must be MIVO.
      if (!courier.supportsCod) return COD_COURIER_ONLY;
      if (formData.get("bookedOnMivoAccount") !== "on") return "Confirm you booked it on MIVO's account with the cash-on-delivery amount shown.";
    }

    const [pkg] = await tx
      .select({ sellerId: shipments.sellerId, status: shipments.status })
      .from(shipments)
      .where(eq(shipments.id, shipmentId))
      .for("update");
    // Another boutique's package looks the same as a missing one.
    if (!pkg || pkg.sellerId !== profile.id) return "Package not found.";
    if (pkg.status !== "PENDING") return "This package was already dispatched.";

    await tx
      .update(shipments)
      .set({ status: "DISPATCHED", courierId, trackingNumber: tracking, dispatchedAt: new Date() })
      .where(eq(shipments.id, shipmentId));

    await syncOrderStatus(tx, orderId);
    return null;
  });

  if (error) return { error };
  refreshOrderPages(orderId);
  notifyLater("package dispatched (buyer)", () => notifyBuyerShipmentDispatched(shipmentId));
  return { ok: true };
}

/**
 * Corrects the courier and/or tracking number of a package that is on the way
 * (typos happen). Allowed for the boutique that owns the package and for the admin,
 * only while it is DISPATCHED. The buyer is emailed the corrected details.
 */
export async function updateTracking(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  let sellerId: string | null = null; // null = admin, may edit any package
  if (user.role === "SELLER") {
    const [p] = await db.select({ id: sellerProfiles.id }).from(sellerProfiles).where(eq(sellerProfiles.userId, user.id));
    if (!p) return { error: "No boutique profile." };
    sellerId = p.id;
  } else if (user.role !== "ADMIN") {
    return { error: "Package not found." };
  }

  const shipmentId = readId(formData, "shipmentId");
  const courierId = readId(formData, "courierId");
  const tracking = normaliseTracking(String(formData.get("trackingNumber") ?? ""));
  if (!shipmentId) return { error: "Invalid package." };
  if (!courierId) return { error: "Choose the courier." };
  if (!tracking) return { error: "Enter the tracking number exactly as on the courier receipt (letters, numbers and dashes)." };

  const orderId = await orderIdOfShipment(shipmentId);
  if (!orderId) return { error: "Package not found." };

  const result = await db.transaction(async (tx): Promise<string | "unchanged" | null> => {
    const order = await lockOrder(tx, orderId);
    if (!order) return "Order not found.";

    const [pkg] = await tx
      .select({ sellerId: shipments.sellerId, status: shipments.status, courierId: shipments.courierId, tracking: shipments.trackingNumber })
      .from(shipments)
      .where(eq(shipments.id, shipmentId))
      .for("update");
    if (!pkg || (sellerId !== null && pkg.sellerId !== sellerId)) return "Package not found.";
    if (order.status === "CANCELLED" || pkg.status === "CANCELLED") return "This order was cancelled.";
    if (pkg.status !== "DISPATCHED") {
      return pkg.status === "DELIVERED"
        ? "This package was already delivered, so its tracking can't be changed."
        : "This package hasn't been dispatched yet.";
    }
    if (pkg.courierId === courierId && pkg.tracking === tracking) return "unchanged";

    // Keeping the current courier is fine even if it was deactivated since; switching
    // needs an active one, and for cash on delivery one where MIVO has a COD account.
    if (courierId !== pkg.courierId) {
      const [courier] = await tx
        .select({ id: couriers.id, supportsCod: couriers.supportsCod })
        .from(couriers)
        .where(and(eq(couriers.id, courierId), eq(couriers.isActive, true)))
        .for("share");
      if (!courier) return "Choose a courier from the list.";
      if (order.method === "COD" && !courier.supportsCod) return COD_COURIER_ONLY;
    }

    await tx.update(shipments).set({ courierId, trackingNumber: tracking }).where(eq(shipments.id, shipmentId));
    return null;
  });

  if (result === "unchanged") return { ok: true };
  if (result) return { error: result };
  refreshOrderPages(orderId);
  if (sellerId === null) {
    await audit(user.id, "edit_tracking", { type: "shipment", id: shipmentId }, `Changed the tracking of the ${await packageLabel(shipmentId)} to ${tracking}`);
  }
  notifyLater("tracking updated (buyer)", () => notifyBuyerTrackingUpdated(shipmentId));
  return { ok: true };
}
