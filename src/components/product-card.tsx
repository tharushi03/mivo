import Image from "next/image";
import Link from "next/link";
import type { StorefrontProduct } from "@/lib/catalog";
import { formatLKR } from "@/lib/format";

export function ProductCard({ product, priority }: { product: StorefrontProduct; priority?: boolean }) {
  const soldOut = product.stockQuantity <= 0;

  return (
    <Link href={`/product/${product.id}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted">
        <Image
          src={product.imageUrl}
          alt={product.title}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
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
      </div>
    </Link>
  );
}
