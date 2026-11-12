// Public storefront queries. Only active products from verified boutiques are
// ever returned, and only public fields (never seller bank details etc.).
// Results are cached and tagged "products"; Server Actions that change products
// or seller verification call updateTag("products") to refresh them.
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { productVariants, products, sellerProfiles } from "@/db/schema";

export const PRODUCTS_TAG = "products";

const publicFields = {
  id: products.id,
  title: products.title,
  price: products.price,
  category: products.category,
  imageUrl: products.imageUrl,
  // Total across all sizes (0 = "Sold out" badge).
  stockQuantity: sql<number>`(select coalesce(sum(${productVariants.stock}), 0)::int from ${productVariants} where ${productVariants.productId} = ${products.id})`,
  sellerId: products.sellerId, // groups cart items into packages (one per boutique)
  shopName: sellerProfiles.shopName,
};

// Visible: active product, approved boutique, owner not suspended.
const isPublic = and(
  eq(products.isActive, true),
  eq(sellerProfiles.isVerified, true),
  sql`not exists (select 1 from users u where u.id = ${sellerProfiles.userId} and u.suspended_at is not null)`,
);

export async function getStorefrontProducts() {
  "use cache";
  cacheTag(PRODUCTS_TAG);
  cacheLife("hours");

  return db
    .select(publicFields)
    .from(products)
    .innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
    .where(isPublic)
    .orderBy(desc(products.createdAt));
}

export type StorefrontProduct = Awaited<ReturnType<typeof getStorefrontProducts>>[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getStorefrontProduct(id: string) {
  "use cache";
  cacheTag(PRODUCTS_TAG);
  cacheLife("hours");

  if (!UUID.test(id)) return null;

  const [row] = await db
    .select({ ...publicFields, description: products.description })
    .from(products)
    .innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
    .where(and(isPublic, eq(products.id, id)))
    .limit(1);

  if (!row) return null;

  // Only sizes that are in stock; sold-out sizes are hidden from buyers.
  const sizes = await db
    .select({ size: productVariants.size, stock: productVariants.stock })
    .from(productVariants)
    .where(and(eq(productVariants.productId, id), gt(productVariants.stock, 0)))
    .orderBy(asc(productVariants.position), asc(productVariants.size));

  return { ...row, sizes };
}
