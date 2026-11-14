// Database helpers for boutique shop links (see lib/shop-links.ts for the link formats).
import { like, or, eq } from "drizzle-orm";
import { db } from "@/db";
import { sellerProfiles } from "@/db/schema";
import { slugify } from "@/lib/shop-links";

type Q = Pick<typeof db, "select">;

/** A free shop link for a new boutique: "colombo-batik", else "colombo-batik-2", "-3", ... */
export async function freeSlug(shopName: string, q: Q = db) {
  const base = slugify(shopName).slice(0, 45).replace(/-+$/, "");
  const taken = new Set(
    (
      await q
        .select({ slug: sellerProfiles.slug })
        .from(sellerProfiles)
        .where(or(eq(sellerProfiles.slug, base), like(sellerProfiles.slug, `${base}-%`)))
    ).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
