import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefrontProduct } from "@/lib/catalog";
import { formatLKR } from "@/lib/format";
import { AddToCart } from "./add-to-cart";
import { getProductReviews } from "@/lib/reviews";
import { formatDate } from "@/lib/format";
import { Stars } from "@/components/stars";

export async function generateMetadata({ params }: PageProps<"/product/[id]">): Promise<Metadata> {
  const { id } = await params;
  const product = await getStorefrontProduct(id);
  return product
    ? { title: product.title, description: product.description?.slice(0, 160) ?? `${product.title} from ${product.shopName}` }
    : { title: "Product not found" };
}

export default function ProductPage({ params }: PageProps<"/product/[id]">) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <Link href="/" className="text-sm text-text-secondary hover:text-accent">
        ← Back to shop
      </Link>
      <Suspense fallback={<ProductSkeleton />}>
        <ProductDetails params={params} />
      </Suspense>
    </main>
  );
}

async function ProductDetails({ params }: Pick<PageProps<"/product/[id]">, "params">) {
  const { id } = await params;
  // Both cached; product is null unless active + from a verified seller.
  const [product, reviews] = await Promise.all([getStorefrontProduct(id), getProductReviews(id)]);
  if (!product) notFound();

  return (
    <div className="mt-6 grid gap-8 md:grid-cols-2 md:gap-12">
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-muted">
        <Image
          src={product.imageUrl}
          alt={product.title}
          fill
          priority
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
        />
      </div>

      <div className="md:py-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-secondary">{product.shopName}</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{product.title}</h1>
        <p className="mt-4 text-2xl font-semibold text-accent-hover">{formatLKR(product.price)}</p>
        {reviews.count > 0 ? (
          <a href="#reviews" className="mt-2 inline-flex items-center gap-2 text-sm hover:text-accent-hover">
            <Stars rating={reviews.average} />
            <span>
              <strong>{reviews.average.toFixed(1)}</strong> from {reviews.count} {reviews.count === 1 ? "review" : "reviews"}
            </span>
          </a>
        ) : (
          <p className="mt-2 text-sm text-text-secondary">No reviews yet</p>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-border py-4 text-sm">
          <div>
            <dt className="text-text-secondary">Category</dt>
            <dd className="font-medium">{product.category ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Sizes</dt>
            <dd className="font-medium">{product.sizes.length > 0 ? product.sizes.map((v) => v.size).join(", ") : "Sold out"}</dd>
          </div>
        </dl>

        <AddToCart
          product={{
            productId: product.id,
            title: product.title,
            price: Number(product.price),
            imageUrl: product.imageUrl,
            shopName: product.shopName,
            sellerId: product.sellerId,
          }}
          sizes={product.sizes}
        />

        {product.description && (
          <section className="mt-10">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Details</h2>
            <p className="whitespace-pre-line leading-relaxed text-text-secondary">{product.description}</p>
          </section>
        )}

        <ul className="mt-8 space-y-1 text-sm text-text-secondary">
          <li>· Island-wide delivery by trusted local couriers</li>
          <li>· Cash on delivery or bank transfer</li>
        </ul>
      </div>

      <ReviewsSection reviews={reviews} />
    </div>
  );
}

function ReviewsSection({ reviews }: { reviews: Awaited<ReturnType<typeof getProductReviews>> }) {
  return (
    <section id="reviews" className="scroll-mt-24 border-t border-border pt-8 md:col-span-2">
      <h2 className="text-2xl font-bold">Customer reviews</h2>
      {reviews.count === 0 ? (
        <p className="mt-2 text-text-secondary">
          No reviews yet. Reviews come only from buyers whose order was delivered.
        </p>
      ) : (
        <div className="mt-6 grid gap-8 md:grid-cols-[16rem_1fr]">
          <div>
            <p className="text-4xl font-bold">{reviews.average.toFixed(1)}</p>
            <Stars rating={reviews.average} className="mt-1 text-xl" />
            <p className="mt-1 text-sm text-text-secondary">
              {reviews.count} verified {reviews.count === 1 ? "review" : "reviews"}
            </p>
            <ul className="mt-4 space-y-1.5" aria-label="Rating breakdown">
              {reviews.breakdown.map((n, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-6 text-right">{5 - i}★</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${(n / reviews.count) * 100}%` }} />
                  </span>
                  <span className="w-6 text-text-secondary">{n}</span>
                </li>
              ))}
            </ul>
          </div>
          <ul className="divide-y divide-border">
            {reviews.latest.map((r) => (
              <li key={r.id} className="py-4 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars rating={r.rating} className="text-sm" />
                  <span className="text-sm font-semibold">{r.name}</span>
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">Verified purchase</span>
                  <span className="text-xs text-text-secondary">{formatDate(r.createdAt)}</span>
                </div>
                {r.comment && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-secondary">{r.comment}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ProductSkeleton() {
  return (
    <div className="mt-6 grid animate-pulse gap-8 md:grid-cols-2 md:gap-12">
      <div className="aspect-[3/4] rounded-2xl bg-muted" />
      <div className="space-y-4 md:py-4">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-9 w-3/4 rounded bg-muted" />
        <div className="h-7 w-32 rounded bg-muted" />
        <div className="h-40 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
