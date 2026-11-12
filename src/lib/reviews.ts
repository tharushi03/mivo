// Reviews: public reads for the product page (cached), and the buyer's
// "what can I review" list for My Orders.
import { cacheLife, cacheTag } from "next/cache";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products, reviews, users } from "@/db/schema";

export const REVIEWS_TAG = "reviews";
export const MAX_COMMENT = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Tharushi Dilara" -> "Tharushi D." (reviews never show full names or emails). */
function publicName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "MIVO shopper";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** Average, count, star breakdown and the latest reviews for one product. */
export async function getProductReviews(productId: string, limit = 10) {
  "use cache";
  cacheTag(REVIEWS_TAG);
  cacheLife("hours");

  if (!UUID.test(productId)) return { count: 0, average: 0, breakdown: [0, 0, 0, 0, 0], latest: [] };

  const [[summary], perStar, latest] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int`, average: sql<string | null>`avg(${reviews.rating})` })
      .from(reviews)
      .where(eq(reviews.productId, productId)),
    db
      .select({ rating: reviews.rating, n: sql<number>`count(*)::int` })
      .from(reviews)
      .where(eq(reviews.productId, productId))
      .groupBy(reviews.rating),
    db
      .select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, name: users.name, createdAt: reviews.createdAt })
      .from(reviews)
      .innerJoin(users, eq(reviews.buyerId, users.id))
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt))
      .limit(limit),
  ]);

  const breakdown = [5, 4, 3, 2, 1].map((star) => perStar.find((p) => p.rating === star)?.n ?? 0);
  return {
    count: summary.count,
    average: summary.average ? Math.round(Number(summary.average) * 10) / 10 : 0,
    breakdown, // counts for 5★, 4★, 3★, 2★, 1★
    latest: latest.map((r) => ({ ...r, name: publicName(r.name) })),
  };
}

/**
 * Items the buyer can review: products from their DELIVERED orders, with their
 * existing review if any. Keyed by order id for the My Orders page.
 */
export async function getReviewableItems(buyerId: string) {
  const items = await db
    .select({
      orderId: orders.id,
      productId: products.id,
      title: products.title,
      imageUrl: products.imageUrl,
      size: orderItems.selectedSize,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(and(eq(orders.buyerId, buyerId), eq(orders.orderStatus, "DELIVERED")));

  const productIds = [...new Set(items.map((i) => i.productId))];
  const mine = productIds.length
    ? await db
        .select({ productId: reviews.productId, rating: reviews.rating, comment: reviews.comment })
        .from(reviews)
        .where(and(eq(reviews.buyerId, buyerId), inArray(reviews.productId, productIds)))
    : [];
  const reviewByProduct = new Map(mine.map((r) => [r.productId, r]));

  const byOrder = new Map<string, { productId: string; title: string; imageUrl: string; sizes: string[]; review: { rating: number; comment: string | null } | null }[]>();
  for (const i of items) {
    const list = byOrder.get(i.orderId) ?? [];
    const existing = list.find((x) => x.productId === i.productId); // same product, two sizes -> one review
    if (existing) existing.sizes.push(i.size);
    else list.push({ productId: i.productId, title: i.title, imageUrl: i.imageUrl, sizes: [i.size], review: reviewByProduct.get(i.productId) ?? null });
    byOrder.set(i.orderId, list);
  }
  return byOrder;
}
