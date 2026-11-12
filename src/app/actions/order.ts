"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { couriers, orderItems, orders, productVariants, products, sellerProfiles, shipments, users } from "@/db/schema";
import { requireUser } from "@/lib/dal";
import { PRODUCTS_TAG } from "@/lib/catalog";
import { deliveryFeeFor, DELIVERY_FEE_PER_SHIPMENT, fromCents, toCents } from "@/lib/pricing";
import { notifyLater, notifySellersOfNewOrder } from "@/lib/email/notify";
import { blockedFor, hit, minutesText } from "@/lib/rate-limit";
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

type Field = "recipientName" | "phoneNumber" | "address" | "city" | "paymentMethod";

export type PlaceOrderState = {
  orderId?: string;
  error?: string;
  fieldErrors?: Partial<Record<Field, string>>;
  problems?: CartProblem[];
  /** Echo of what the buyer typed, so the form keeps it after an error. */
  values?: Partial<Record<Field, string>>;
};

/** Most cash-on-delivery orders one account can have open (not yet delivered) at once. */
const MAX_OPEN_COD_ORDERS = 3;

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

/** Sri Lankan numbers: 0771234567, 077 123 4567, +94771234567, 94771234567 -> "0771234567". */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  const m = digits.match(/^(?:\+?94|0)(\d{9})$/);
  return m ? `0${m[1]}` : null;
}

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
  const user = await requireUser(); // any logged-in user

  // Order emails include the delivery address: make sure the address belongs to the buyer.
  if (!(await isEmailConfirmed(user.id))) {
    return { error: `Please confirm your email first: open the link we sent to ${user.email}. You can resend it from the top of this page.` };
  }

  // Stops one account (or a script) placing dozens of orders to lock up the stock.
  const waitMs = blockedFor("order", user.id);
  if (waitMs > 0) {
    return { error: `You've placed several orders in a short time. Please try again in ${minutesText(waitMs)}, or contact us if you need help.` };
  }

  // ---------- 1. Validate the form ----------
  const text = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const recipientName = text("recipientName", 255);
  const address = text("address", 500);
  const city = text("city", 100);
  const phone = normalizePhone(text("phoneNumber", 30));
  const paymentMethod = formData.get("paymentMethod");
  const values = {
    recipientName,
    phoneNumber: text("phoneNumber", 30),
    address,
    city,
    paymentMethod: String(paymentMethod ?? ""),
  };

  const fieldErrors: PlaceOrderState["fieldErrors"] = {};
  if (recipientName.length < 2) fieldErrors.recipientName = "Enter the recipient's name.";
  if (!phone) fieldErrors.phoneNumber = "Enter a valid Sri Lankan phone number, e.g. 077 123 4567.";
  if (address.length < 5) fieldErrors.address = "Enter the full delivery address.";
  if (city.length < 2) fieldErrors.city = "Enter the city or town.";
  if (paymentMethod !== "BANK_TRANSFER" && paymentMethod !== "COD") fieldErrors.paymentMethod = "Choose a payment method.";
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

  // ---------- 2. Transaction: lock, re-check, insert, deduct ----------
  try {
    const orderId = await db.transaction(async (tx) => {
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
          buyerId: user.id,
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

    hit("order", user.id); // counts placed orders only
    // Stock changed: refresh the storefront ("Sold out" badges, stock limits).
    updateTag(PRODUCTS_TAG);
    revalidatePath("/seller/dashboard");
    // Cash on delivery: boutiques can pack right away. Bank transfer orders can't be
    // packed until payment is verified, so their sellers are emailed in verifyPayment.
    if (paymentMethod === "COD") notifyLater("new order (sellers)", () => notifySellersOfNewOrder(orderId));
    return { orderId };
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
