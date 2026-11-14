import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getShop } from "@/lib/catalog";
import { productLinkPath, whatsappLink } from "@/lib/shop-links";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";

// A boutique's own shop page: mivo.lk/s/<slug>. Shows only this boutique, so a
// customer it sends here isn't shown other boutiques' clothes.

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getShop(slug);
  return shop
    ? { title: shop.shopName, description: `Shop ${shop.shopName}'s collection. Island-wide delivery.` }
    : { title: "Shop not found" };
}

export default function ShopPage({ params }: PageProps<"/s/[slug]">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
      <Suspense fallback={<div className="mt-10 h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <Shop params={params} />
      </Suspense>
    </main>
  );
}

async function Shop({ params }: Pick<PageProps<"/s/[slug]">, "params">) {
  const { slug } = await params;
  const shop = await getShop(slug); // cached; null unless verified and not suspended
  if (!shop) notFound();

  return (
    <>
      <header className="py-10 text-center sm:py-14">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-text-secondary">Boutique</p>
        <h1 className="mt-2 text-4xl font-bold leading-tight sm:text-5xl">{shop.shopName}</h1>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm">
          {shop.whatsappNumber && (
            <a
              href={whatsappLink(shop.whatsappNumber, `Hi ${shop.shopName}, I saw your shop on MIVO.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-success px-4 py-2 font-medium text-white hover:opacity-90"
            >
              Ask us on WhatsApp
            </a>
          )}
          {shop.instagramUrl && (
            <a
              href={shop.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border bg-surface px-4 py-2 font-medium hover:border-accent hover:text-accent-hover"
            >
              Instagram
            </a>
          )}
        </div>
        <p className="mt-4 text-xs text-text-secondary">Secure checkout and island-wide delivery powered by MIVO</p>
      </header>

      <section aria-labelledby="collection">
        <div className="mb-6 flex items-baseline justify-between border-b border-border pb-3">
          <h2 id="collection" className="text-xl font-bold">
            Collection
          </h2>
          <span className="text-sm text-text-secondary">
            {shop.items.length} {shop.items.length === 1 ? "piece" : "pieces"}
          </span>
        </div>
        {shop.items.length === 0 ? (
          <EmptyState icon="hanger" title="New pieces coming soon">
            {shop.shopName} is adding its collection. Check back soon.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {shop.items.map((p, i) => (
              <li key={p.id}>
                {/* Through the short link, so the order is recorded as this boutique's own sale. */}
                <ProductCard product={p} priority={i < 4} href={productLinkPath(p.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
