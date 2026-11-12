"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products, reviews, sellerProfiles } from "@/db/schema";
import { requireUser } from "@/lib/dal";
import { MAX_COMMENT, REVIEWS_TAG } from "@/lib/reviews";

export type ReviewState = { ok?: boolean; error?: string; values?: { rating?: string; comment?: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Saves (or updates) the buyer's review of a product.
 * Allowed only for a product in one of THEIR orders that was DELIVERED, so every
 * review on MIVO is from a real, completed purchase.
 */
export async function submitReview(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const user = await requireUser();

  const productId = String(formData.get("productId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const rating = Number(formData.get("rating"));
  // Normalise line breaks and trim runs of blank lines; React escapes it when shown.
  const comment = String(formData.get("comment") ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const values = { rating: String(formData.get("rating") ?? ""), comment };

  if (!UUID.test(productId) || !UUID.test(orderId)) return { error: "Invalid request.", values };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Choose a rating from 1 to 5 stars.", values };
  if (comment.length > MAX_COMMENT) return { error: `Keep your review under ${MAX_COMMENT} characters.`, values };

  // Proof of purchase: this buyer's order, delivered, containing this product.
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
        eq(orders.buyerId, user.id),
        eq(orders.orderStatus, "DELIVERED"),
      ),
    )
    .limit(1);
  if (!proof) return { error: "You can review a product once its order has been delivered to you.", values };
  if (proof.sellerUserId === user.id) return { error: "You can't review your own product.", values };

  await db
    .insert(reviews)
    .values({ productId, buyerId: user.id, orderId, rating, comment: comment || null })
    .onConflictDoUpdate({
      target: [reviews.buyerId, reviews.productId], // one review per buyer per product
      set: { rating, comment: comment || null, orderId, updatedAt: new Date() },
    });

  updateTag(REVIEWS_TAG); // product page rating + review list
  revalidatePath("/orders");
  return { ok: true, values };
}
