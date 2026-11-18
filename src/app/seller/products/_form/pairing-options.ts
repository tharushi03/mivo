import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productPairings, products } from "@/db/schema";
import type { PairingOption } from "./pairing-picker";

/** The boutique's products to choose from in "Style it with" (not the product itself). */
export async function getPairingOptions(sellerId: string, excludeId?: string): Promise<PairingOption[]> {
  const rows = await db
    .select({ id: products.id, title: products.title, imageUrl: products.imageUrl, isActive: products.isActive })
    .from(products)
    .where(eq(products.sellerId, sellerId))
    .orderBy(desc(products.isActive), desc(products.createdAt));
  return rows.filter((r) => r.id !== excludeId);
}

/** The product's current "Style it with" ids, in order. */
export async function getPairedIds(productId: string) {
  const rows = await db
    .select({ id: productPairings.pairedProductId })
    .from(productPairings)
    .where(eq(productPairings.productId, productId))
    .orderBy(asc(productPairings.position));
  return rows.map((r) => r.id);
}
