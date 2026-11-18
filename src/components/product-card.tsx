import Image from "next/image";
import Link from "next/link";
import type { StorefrontProduct } from "@/lib/catalog";
import { formatLKR } from "@/lib/format";
import { Stars } from "@/components/stars";

/** `href` overrides the link, e.g. a boutique page links through its short product links. */
export function ProductCard({ product, priority, href }: { product: StorefrontProduct; priority?: boolean; href?: string }) {
  const soldOut = product.stockQuantity <= 0;

  return (
    <Link href={href ?? `/product/${product.id}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted">
        <Image
          src={product.imageUrl}
          alt={product.title}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-primary/85 px-2.5 py-1 text-xs font-medium text-white">
            Sold out
          </span>
        )}
      </div>
      <div className="mt-3 space-y-0.5">
        <p className="text-xs uppercase tracking-wide text-text-secondary">{product.shopName}</p>
        <h3 className="truncate font-medium group-hover:text-accent-hover">{product.title}</h3>
        <p className="font-semibold">{formatLKR(product.price)}</p>
        {product.ratingCount > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Stars rating={product.ratingAverage} className="text-sm" />
            <span>
              {product.ratingAverage.toFixed(1)} ({product.ratingCount})
            </span>
          </p>
        )}
      </div>
    </Link>
  );
}
