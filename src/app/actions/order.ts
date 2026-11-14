"use server";

import { revalidatePath, updateTag } from "next/cache";
import { cookies, headers } from "next/headers";
import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { couriers, orderItems, orders, productVariants, products, sellerProfiles, shipments, users } from "@/db/schema";
import { currentUser } from "@/lib/dal";
import { PRODUCTS_TAG } from "@/lib/catalog";
import { deliveryFeeFor, DELIVERY_FEE_PER_SHIPMENT, fromCents, toCents } from "@/lib/pricing";
import { notifyBuyerOrderPlaced, notifyLater, notifySellersOfNewOrder } from "@/lib/email/notify";
import { blockedFor, clientIp, hit, minutesText } from "@/lib/rate-limit";
import { buyerOrderPath, checkFormStamp } from "@/lib/guest-orders";
import { REF_COOKIE, normalizePhone } from "@/lib/shop-links";
import { isEmailConfirmed } from "@/lib/email-verification";

// ---------- Types shared with the checkout form ----------
export type CheckoutLine = { productId: string; size: string; quantity: number; price: number };

export type CartProblem = {
  productId: string;
  size: string;
  title: string;
  message: string;
  /** Fresh values the client should apply to its cart. */
  fix: { price?: number; available?: number; removeLine?: boolean };
};

type Field = "email" | "recipientName" | "phoneNumber" | "address" | "city" | "paymentMethod";

export type PlaceOrderState = {
  orderId?: string;
  /** Where to send the buyer: their account's order page, or a guest's secret link. */
  orderUrl?: string;
  error?: string;
  fieldErrors?: Partial<Record<Field, string>>;
  problems?: CartProblem[];
  /** Echo of what the buyer typed, so the form keeps it after an error. */
  values?: Partial<Record<Field, string>>;
};

/** Most cash-on-delivery orders one account can have open (not yet delivered) at once. */
const MAX_OPEN_COD_ORDERS = 3;

/** Most unpaid guest orders one email address or phone number can have at once (they hold stock). */
const MAX_UNPAID_GUEST_ORDERS = 2;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A rule stops this order (shown to the buyer as is, nothing is saved). */
class CheckoutRefused extends Error {}

class CheckoutConflict extends Error {
  constructor(public problems: CartProblem[]) {
    super("Cart is out of date");
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LINES = 50;
const MAX_QTY_PER_LINE = 100;

function parseLines(raw: FormDataEntryValue | null): CheckoutLine[] | null {
  try {
    const data: unknown = JSON.parse(String(raw ?? ""));
    if (!Array.isArray(data) || data.length === 0 || data.length > MAX_LINES) return null;
    const lines = data.map((l) => ({
      productId: String(l?.productId ?? ""),
      size: String(l?.size ?? "").slice(0, 20),
      quantity: Number(l?.quantity),
      price: Number(l?.price),
    }));
    const valid = lines.every(
      (l) =>
        UUID.test(l.productId) &&
        l.size.length > 0 &&
        Number.isInteger(l.quantity) &&
        l.quantity >= 1 &&
        l.quantity <= MAX_QTY_PER_LINE &&
        Number.isFinite(l.price),
    );
    return valid ? lines : null;
  } catch {
    return null;
  }
}

export async function placeOrder(_prev: PlaceOrderState, formData: FormData): Promise<PlaceOrderState> {
  // Logged-in buyer, or null for a guest (no account: bank transfer only).
  const user = await currentUser();
  const text = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const ip = clientIp(await headers());
  const guestEmail = user ? null : text("email", 255).toLowerCase();
  const tooMany = (ms: number) => ({
    error: `You've placed several orders in a short time. Please try again in ${minutesText(ms)}, or contact us if you need help.`,
  });

  if (user) {
    // Order emails include the delivery address: make sure the address belongs to the buyer.
    if (!(await isEmailConfirmed(user.id))) {
      return { error: `Please confirm your email first: open the link we sent to ${user.email}. You can resend it from the top of this page.` };
    }
    // Stops one account (or a script) placing dozens of orders to lock up the stock.
    const waitMs = blockedFor("order", user.id);
    if (waitMs > 0) return tooMany(waitMs);
  } else {
    // Bots: a hidden field people never see or fill, and a signed "form opened at" time
    // (posting within 3 seconds, or replaying a form older than 6 hours, is refused).
    if (text("website", 200) !== "" || !checkFormStamp(formData.get("stamp"))) {
      return { error: "Something went wrong with the form. Please refresh the page and try again." };
    }
    const waitMs = Math.max(blockedFor("guestOrderIp", ip), guestEmail ? blockedFor("guestOrderEmail", guestEmail) : 0);
    if (waitMs > 0) return tooMany(waitMs);
  }

  // ---------- 1. Validate the form ----------
  const recipientName = text("recipientName", 255);
  const address = text("address", 500);
  const city = text("city", 100);
  const phone = normalizePhone(text("phoneNumber", 30));
  const paymentMethod = formData.get("paymentMethod");
  const values = {
    email: guestEmail ?? "",
    recipientName,
    phoneNumber: text("phoneNumber", 30),
    address,
    city,
    paymentMethod: String(paymentMethod ?? ""),
  };

  const fieldErrors: PlaceOrderState["fieldErrors"] = {};
  if (guestEmail !== null && !EMAIL.test(guestEmail)) fieldErrors.email = "Enter your email. We'll send your order link and receipt there.";
  if (recipientName.length < 2) fieldErrors.recipientName = "Enter the recipient's name.";
  if (!phone) fieldErrors.phoneNumber = "Enter a valid Sri Lankan phone number, e.g. 077 123 4567.";
  if (address.length < 5) fieldErrors.address = "Enter the full delivery address.";
  if (city.length < 2) fieldErrors.city = "Enter the city or town.";
  if (paymentMethod !== "BANK_TRANSFER" && paymentMethod !== "COD") fieldErrors.paymentMethod = "Choose a payment method.";
  // No cash on delivery without an account: a fake COD order costs MIVO the courier fee.
  // (The database refuses it too: orders_guest_bank_transfer_only.)
  else if (!user && paymentMethod === "COD") fieldErrors.paymentMethod = "Cash on delivery needs a MIVO account. Log in, or pay by bank transfer.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values };

  const lines = parseLines(formData.get("items"));
  if (!lines) return { error: "Your cart is empty or invalid. Please review it and try again.", values };

  // Merge duplicate product+size lines. Stock is tracked per size, so each
  // product+size line is checked against its own variant's stock.
  const merged = new Map<string, CheckoutLine>();
  for (const l of lines) {
    const key = `${l.productId}::${l.size}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, quantity: prev.quantity + l.quantity } : { ...l });
  }
  const finalLines = [...merged.values()];
  const productIds = [...new Set(finalLines.map((l) => l.productId))].sort();
  // Came through a boutique's own link (mivo.lk/p/...)? Checked against the order's boutiques below.
  const refSellerId = (await cookies()).get(REF_COOKIE)?.value ?? null;

  // ---------- 2. Transaction: lock, re-check, insert, deduct ----------
  try {
    const orderId = await db.transaction(async (tx) => {
      // Unpaid guest orders hold stock for up to 3 days. One email address or phone
      // number may have only a few at once. The advisory locks make two tabs (or a
      // script) wait for each other, so they can't both slip under the cap.
      if (!user && guestEmail) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"guest-email:" + guestEmail}))`);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"guest-phone:" + phone}))`);
        const [{ unpaid }] = await tx
          .select({ unpaid: sql<number>`count(*)::int` })
          .from(orders)
          .where(
            and(
              isNull(orders.buyerId),
              or(eq(orders.guestEmail, guestEmail), eq(orders.phoneNumber, phone!)),
              eq(orders.paymentStatus, "PENDING"),
              eq(orders.orderStatus, "PENDING"),
              isNull(orders.paymentSlipUrl),
            ),
          );
        if (unpaid >= MAX_UNPAID_GUEST_ORDERS) {
          throw new CheckoutRefused(
            "You already have unpaid orders. Please pay for them (or cancel them) using the link in your order email, then try again.",
          );
        }
      }

      // Fake COD orders cost nothing to place but hold stock for days. Cap the number
      // open at once. The user row is locked first, so two tabs can't both slip under the cap.
      if (paymentMethod === "COD") {
        // COD needs a courier where MIVO has a merchant account (the cash is paid to
        // that account). FOR SHARE: the admin can't switch the last one off mid-checkout.
        const [codCourier] = await tx
          .select({ id: couriers.id })
          .from(couriers)
          .where(and(eq(couriers.isActive, true), eq(couriers.supportsCod, true)))
          .limit(1)
          .for("share");
        if (!codCourier) throw new CheckoutRefused("Cash on delivery isn't available right now. Please pay by bank transfer.");

        if (!user) throw new CheckoutRefused("Cash on delivery needs a MIVO account. Log in, or pay by bank transfer.");
        await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
        const [{ open }] = await tx
          .select({ open: sql<number>`count(*)::int` })
          .from(orders)
          .where(
            and(
              eq(orders.buyerId, user.id),
              eq(orders.paymentMethod, "COD"),
              inArray(orders.orderStatus, ["PENDING", "PARTIALLY_DISPATCHED", "DISPATCHED"]),
            ),
          );
        if (open >= MAX_OPEN_COD_ORDERS) {
          throw new CheckoutRefused(
            `You already have ${open} cash-on-delivery orders on the way. Please wait for one to arrive, or pay by bank transfer.`,
          );
        }
      }

      // Product rows: FOR SHARE so the price/visibility can't change mid-checkout,
      // without making two buyers of different sizes wait for each other.
      const rows = await tx
        .select({
          id: products.id,
          title: products.title,
          imageUrl: products.imageUrl,
          price: products.price,
          sellerId: products.sellerId,
          commissionRate: sellerProfiles.commissionRate,
          isActive: products.isActive,
          sellerVerified: sql<boolean>`(${sellerProfiles.isVerified} and not exists (select 1 from users u where u.id = ${sellerProfiles.userId} and u.suspended_at is not null))`,
        })
        .from(products)
        .innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
        .where(inArray(products.id, productIds))
        .orderBy(products.id)
        .for("share", { of: products });

      // Size rows: FOR UPDATE, so two buyers can't both take the last Medium.
      // Locked in a fixed order (product, size) to avoid deadlocks.
      const variants = await tx
        .select({ id: productVariants.id, productId: productVariants.productId, size: productVariants.size, stock: productVariants.stock })
        .from(productVariants)
        .where(inArray(productVariants.productId, productIds))
        .orderBy(productVariants.productId, productVariants.size)
        .for("update");

      const byId = new Map(rows.map((r) => [r.id, r]));
      const variantFor = new Map(variants.map((v) => [`${v.productId}::${v.size}`, v]));
      const problems: CartProblem[] = [];

      for (const l of finalLines) {
        const p = byId.get(l.productId);
        if (!p || !p.isActive || !p.sellerVerified) {
          problems.push({ productId: l.productId, size: l.size, title: p?.title ?? "An item", message: "is no longer available.", fix: { available: 0 } });
          continue;
        }
        const v = variantFor.get(`${l.productId}::${l.size}`);
        if (!v) {
          problems.push({ productId: p.id, size: l.size, title: p.title, message: `is no longer offered in size ${l.size}.`, fix: { removeLine: true } });
          continue;
        }
        if (l.quantity > v.stock) {
          problems.push({
            productId: p.id,
            size: l.size,
            title: p.title,
            message: v.stock === 0 ? `is sold out in size ${l.size}.` : `only has ${v.stock} left in size ${l.size}.`,
            fix: { available: v.stock },
          });
          continue;
        }
        if (toCents(p.price) !== toCents(l.price)) {
          problems.push({
            productId: p.id,
            size: l.size,
            title: p.title,
            message: `changed price to Rs. ${Number(p.price).toLocaleString("en-LK")}.`,
            fix: { price: Number(p.price) },
          });
        }
      }

      if (problems.length > 0) throw new CheckoutConflict(problems); // rolls back

      // Totals from DATABASE prices only. Each boutique ships its own package,
      // so the delivery fee is charged once per boutique.
      const subtotalCents = finalLines.reduce((sum, l) => sum + toCents(byId.get(l.productId)!.price) * l.quantity, 0);
      const sellerIds = [...new Set(finalLines.map((l) => byId.get(l.productId)!.sellerId))].sort();
      const deliveryCents = toCents(deliveryFeeFor(sellerIds.length));

      const [order] = await tx
        .insert(orders)
        .values({
          buyerId: user?.id ?? null,
          guestEmail: user ? null : guestEmail,
          // Only a boutique that is actually in this order counts as the referrer.
          referrerSellerId: refSellerId && sellerIds.includes(refSellerId) ? refSellerId : null,
          recipientName,
          phoneNumber: phone!,
          shippingAddress: `${address}\n${city}`,
          paymentMethod: paymentMethod as "BANK_TRANSFER" | "COD",
          deliveryFee: fromCents(deliveryCents),
          totalAmount: fromCents(subtotalCents + deliveryCents),
        })
        .returning({ id: orders.id });

      await tx.insert(orderItems).values(
        finalLines.map((l) => ({
          orderId: order.id,
          productId: l.productId,
          quantity: l.quantity,
          selectedSize: l.size,
          priceAtPurchase: byId.get(l.productId)!.price,
          // Snapshots: history and payouts never change when the product or rate does later.
          productTitle: byId.get(l.productId)!.title,
          productImageUrl: byId.get(l.productId)!.imageUrl,
          commissionRate: byId.get(l.productId)!.commissionRate,
        })),
      );

      // One package (shipment) per boutique, waiting to be dispatched.
      await tx.insert(shipments).values(
        sellerIds.map((sellerId) => ({ orderId: order.id, sellerId, deliveryFee: fromCents(toCents(DELIVERY_FEE_PER_SHIPMENT)) })),
      );

      // Deduct from the exact size bought. The `stock >= qty` guard (plus the
      // CHECK constraint on the table) means stock can never go below zero.
      for (const l of finalLines) {
        const v = variantFor.get(`${l.productId}::${l.size}`)!;
        const updated = await tx
          .update(productVariants)
          .set({ stock: sql`${productVariants.stock} - ${l.quantity}` })
          .where(and(eq(productVariants.id, v.id), gte(productVariants.stock, l.quantity)))
          .returning({ id: productVariants.id });
        if (updated.length !== 1) throw new Error(`Stock deduction failed for variant ${v.id}`);
      }

      return order.id;
    });

    // Counts placed orders only.
    if (user) hit("order", user.id);
    else {
      hit("guestOrderIp", ip);
      if (guestEmail) hit("guestOrderEmail", guestEmail);
    }
    // Stock changed: refresh the storefront ("Sold out" badges, stock limits).
    updateTag(PRODUCTS_TAG);
    revalidatePath("/seller/dashboard");
    // Cash on delivery: boutiques can pack right away. Bank transfer orders can't be
    // packed until payment is verified, so their sellers are emailed in verifyPayment.
    if (paymentMethod === "COD") notifyLater("new order (sellers)", () => notifySellersOfNewOrder(orderId));
    // The buyer's receipt, with the link to their order (a guest's only way back to it).
    notifyLater("order placed (buyer)", () => notifyBuyerOrderPlaced(orderId));
    return { orderId, orderUrl: buyerOrderPath(orderId, !user) };
  } catch (err) {
    if (err instanceof CheckoutRefused) return { error: err.message, values };
    if (err instanceof CheckoutConflict) {
      return {
        problems: err.problems,
        values,
        error: "Some items in your cart changed. We've updated your cart. Please review it and place the order again.",
      };
    }
    console.error("placeOrder failed", err);
    return { error: "We couldn't place your order. Please try again.", values };
  }
}
