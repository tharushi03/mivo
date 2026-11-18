// Public storefront queries. Only active products from verified boutiques are
// ever returned, and only public fields (never seller bank details etc.).
// Results are cached and tagged "products"; Server Actions that change products
// or seller verification call updateTag("products") to refresh them.
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, between, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { productPairings, productVariants, products, sellerProfiles } from "@/db/schema";
import { PRODUCT_CODE, SLUG } from "@/lib/shop-links";
import { REVIEWS_TAG } from "@/lib/reviews";

export const PRODUCTS_TAG = "products";

const publicFields = {
  id: products.id,
  title: products.title,
  price: products.price,
  department: products.department,
  category: products.category,
  subcategory: products.subcategory,
  imageUrl: products.imageUrl,
  // Total across all sizes (0 = "Sold out" badge).
  stockQuantity: sql<number>`(select coalesce(sum(${productVariants.stock}), 0)::int from ${productVariants} where ${productVariants.productId} = ${products.id})`,
  sellerId: products.sellerId, // groups cart items into packages (one per boutique)
  shopName: sellerProfiles.shopName,
  shopSlug: sellerProfiles.slug,
  // Star rating on product cards (0 reviews = no stars shown).
  ratingAverage: sql<number>`(select coalesce(round(avg(r.rating)::numeric, 1), 0)::float from reviews r where r.product_id = ${products.id})`,
  ratingCount: sql<number>`(select count(*)::int from reviews r where r.product_id = ${products.id})`,
};

// Visible: active product, approved boutique, owner not suspended.
const isPublic = and(
  eq(products.isActive, true),
  eq(sellerProfiles.isVerified, true),
  sql`not exists (select 1 from users u where u.id = ${sellerProfiles.userId} and u.suspended_at is not null)`,
);

export async function getStorefrontProducts() {
  "use cache";
  cacheTag(PRODUCTS_TAG, REVIEWS_TAG); // cards show star ratings
  cacheLife("hours");

  return db
    .select(publicFields)
    .from(products)
    .innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
    .where(isPublic)
    .orderBy(desc(products.createdAt));
}

export const SORTS = { new: "Newest", "price-asc": "Price: low to high", "price-desc": "Price: high to low" } as const;
export type Sort = keyof typeof SORTS;

/**
 * A menu page (/c/women, /c/women/dresses, /c/women/dresses/frocks): visible products in that
 * department, optionally one category and one sub-category. Callers pass slugs already checked
 * against src/lib/categories.ts.
 */
export async function getCategoryProducts(department: string, category: string | null, subcategory: string | null, sort: Sort) {
  "use cache";
  cacheTag(PRODUCTS_TAG, REVIEWS_TAG); // cards show star ratings
  cacheLife("hours");

  const order =
    sort === "price-asc" ? [asc(products.price), desc(products.createdAt)]
    : sort === "price-desc" ? [desc(products.price), desc(products.createdAt)]
    : [desc(products.createdAt)];
  return db
    .select(publicFields)
    .from(products)
    .innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
    .where(
      and(
        isPublic,
        eq(products.department, department),
        category ? eq(products.category, category) : undefined,
        subcategory ? eq(products.subcategory, subcategory) : undefined,
      ),
    )
    .orderBy(...order);
}

// "Style It With" when the boutique hasn't picked anything: categories that go with this one.
const GOES_WITH: Record<string, string[]> = {
  tops: ["bottoms", "accessories"],
  shirts: ["bottoms", "accessories"],
  "t-shirts": ["bottoms", "accessories"],
  bottoms: ["tops", "shirts", "t-shirts", "accessories"],
  dresses: ["accessories"],
  ethnic: ["accessories"],
  activewear: ["activewear"],
  accessories: ["dresses", "tops", "shirts"],
  girls: ["accessories"],
  boys: ["accessories"],
  teen: ["accessories"],
};
const MAX_STYLE_WITH = 4;

/**
 * Up to 4 in-stock pieces from the SAME boutique to show under "Style It With" (same
 * boutique = one package, one delivery fee). The boutique's own picks come first; if it
 * picked none (or they're all sold out or hidden), matching categories fill in.
 * Each item comes with its in-stock sizes for the size dropdown.
 */
export async function getStyleWith(productId: string, sellerId: string, department: string, category: string | null) {
  "use cache";
  cacheTag(PRODUCTS_TAG); // pairings are saved with the product, which refreshes this tag
  cacheLife("hours");

  const inStock = gt(publicFields.stockQuantity, 0);
  let items = await db
    .select(publicFields)
    .from(productPairings)
    .innerJoin(products, eq(productPairings.pairedProductId, products.id))
    .innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
    .where(and(eq(productPairings.productId, productId), eq(products.sellerId, sellerId), isPublic, inStock))
    .orderBy(asc(productPairings.position))
    .limit(MAX_STYLE_WITH);

  if (items.length === 0) {
    const matches = GOES_WITH[category ?? ""] ?? ["accessories"];
    items = await db
      .select(publicFields)
      .from(products)
      .innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
      .where(
        and(
          eq(products.sellerId, sellerId),
          ne(products.id, productId),
          eq(products.department, department),
          inArray(products.category, matches),
          isPublic,
          inStock,
        ),
      )
      .orderBy(desc(products.createdAt))
      .limit(MAX_STYLE_WITH);
  }
  if (items.length === 0) return [];

  const sizes = await db
    .select({ productId: productVariants.productId, size: productVariants.size, stock: productVariants.stock })
    .from(productVariants)
    .where(and(inArray(productVariants.productId, items.map((i) => i.id)), gt(productVariants.stock, 0)))
    .orderBy(asc(productVariants.position), asc(productVariants.size));
  return items.map((i) => ({ ...i, sizes: sizes.filter((v) => v.productId === i.id).map(({ size, stock }) => ({ size, stock })) }));
}

export type StorefrontProduct = Awaited<ReturnType<typeof getStorefrontProducts>>[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getStorefrontProduct(id: string) {
  "use cache";
  cacheTag(PRODUCTS_TAG, REVIEWS_TAG); // cards show star ratings
  cacheLife("hours");

  if (!UUID.test(id)) return null;

  const [row] = await db
    .select({
      ...publicFields,
      description: products.description,
      whatsappNumber: sellerProfiles.whatsappNumber,
      instagramUrl: sellerProfiles.instagramUrl,
    })
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

/** A boutique's public page (mivo.lk/s/<slug>): its details and visible products. */
export async function getShop(slug: string) {
  "use cache";
  cacheTag(PRODUCTS_TAG, REVIEWS_TAG); // cards show star ratings
  cacheLife("hours");

  if (!SLUG.test(slug)) return null;
  const [shop] = await db
    .select({
      id: sellerProfiles.id,
      shopName: sellerProfiles.shopName,
      slug: sellerProfiles.slug,
      instagramUrl: sellerProfiles.instagramUrl,
      whatsappNumber: sellerProfiles.whatsappNumber,
    })
    .from(sellerProfiles)
    .where(
      and(
        eq(sellerProfiles.slug, slug),
        eq(sellerProfiles.isVerified, true),
        sql`not exists (select 1 from users u where u.id = ${sellerProfiles.userId} and u.suspended_at is not null)`,
      ),
    )
    .limit(1);
  if (!shop) return null;

  const items = await db
    .select(publicFields)
    .from(products)
    .innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
    .where(and(isPublic, eq(products.sellerId, shop.id)))
    .orderBy(desc(products.createdAt));
  return { ...shop, items };
}

/**
 * Short product link: the visible product whose id starts with `code` (8 hex characters).
 * Uses the primary key index (a range scan). Returns null if none, or if two products
 * share the prefix (rare: 1 in 4 billion), so a link never opens the wrong product.
 */
export async function findProductByCode(code: string) {
  if (!PRODUCT_CODE.test(code)) return null;
  const rows = await db
    .select({ id: products.id, sellerId: products.sellerId })
    .from(products)
    .innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.id))
    .where(and(isPublic, between(products.id, `${code}-0000-0000-0000-000000000000`, `${code}-ffff-ffff-ffff-ffffffffffff`)))
    .limit(2);
  return rows.length === 1 ? rows[0] : null;
}
