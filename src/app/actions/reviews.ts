"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products, reviews, sellerProfiles } from "@/db/schema";
import { requireUser } from "@/lib/dal";
import { isValidGuestKey } from "@/lib/guest-orders";
import { MAX_COMMENT, REVIEWS_TAG, itemPackageDelivered } from "@/lib/reviews";
import { isFit } from "@/lib/review-fit";

export type ReviewState = { ok?: boolean; error?: string; values?: { rating?: string; comment?: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Saves (or updates) the buyer's review of a product: stars, how it fitted, a comment.
 * Allowed only for a product in one of THEIR orders whose package was DELIVERED, so
 * every review on MIVO is from a real, completed purchase. Guests (no account) send
 * the key from their secret order link instead of being logged in.
 */
export async function submitReview(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const guestKey = formData.get("key");
  const isGuest = typeof guestKey === "string" && guestKey !== "";
  const user = isGuest ? null : await requireUser();

  const productId = String(formData.get("productId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const rating = Number(formData.get("rating"));
  // Normalise line breaks and trim runs of blank lines; React escapes it when shown.
  const comment = String(formData.get("comment") ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const values = { rating: String(formData.get("rating") ?? ""), comment };
  const fitRaw = formData.get("fit");
  const fit = isFit(fitRaw) ? fitRaw : null; // optional

  if (!UUID.test(productId) || !UUID.test(orderId)) return { error: "Invalid request.", values };
  if (isGuest && !isValidGuestKey(orderId, guestKey)) return { error: "This review link isn't valid.", values };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Choose a rating from 1 to 5 stars.", values };
  if (comment.length > MAX_COMMENT) return { error: `Keep your review under ${MAX_COMMENT} characters.`, values };

  // Proof of purchase: this buyer's order, containing this product, its package delivered.
  const [proof] = await db
    .select({ sellerUserId: sellerProfiles.userId })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
    .where(
      and(
        eq(orderItems.orderId, orderId),
        eq(orderItems.productId, productId),
        user ? eq(orders.buyerId, user.id) : isNull(orders.buyerId),
        itemPackageDelivered,
      ),
    )
    .limit(1);
  if (!proof) return { error: "You can review a product once it has been delivered to you.", values };
  if (user && proof.sellerUserId === user.id) return { error: "You can't review your own product.", values };

  const saved = { rating, fit, comment: comment || null, orderId, updatedAt: new Date() };
  if (user) {
    await db
      .insert(reviews)
      .values({ productId, buyerId: user.id, orderId, rating, fit, comment: comment || null })
      .onConflictDoUpdate({ target: [reviews.buyerId, reviews.productId], set: saved }); // one review per buyer per product
  } else {
    await db
      .insert(reviews)
      .values({ productId, buyerId: null, orderId, rating, fit, comment: comment || null })
      .onConflictDoUpdate({ target: [reviews.orderId, reviews.productId], set: saved }); // guests: one per product per order
  }

  updateTag(REVIEWS_TAG); // product page rating + review list, product cards
  revalidatePath("/orders");
  revalidatePath(`/order/${orderId}`);
  return { ok: true, values };
}
