import { getStorefrontProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";

export default async function HomePage() {
  // Cached ("use cache" + "products" tag), so this page is served from the static shell.
  const items = await getStorefrontProducts();

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
      <section className="py-12 sm:py-16">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-accent-hover">
          Curated Sri Lankan boutiques
        </p>
        <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
          Pieces you won&apos;t find on every rack.
        </h1>
        <p className="mt-4 max-w-xl text-text-secondary">
          Handpicked clothing from independent local boutiques, delivered island-wide. Cash on delivery available.
        </p>
      </section>

      <section aria-labelledby="new-in">
        <div className="mb-6 flex items-baseline justify-between border-b border-border pb-3">
          <h2 id="new-in" className="text-xl font-bold">
            New in
          </h2>
          <span className="text-sm text-text-secondary">
            {items.length} {items.length === 1 ? "piece" : "pieces"}
          </span>
        </div>

        {items.length === 0 ? (
          <EmptyState icon="hanger" title="The racks are being filled">
            Our boutiques are adding their first pieces. Check back soon.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {items.map((p, i) => (
              <li key={p.id}>
                <ProductCard product={p} priority={i < 4} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
