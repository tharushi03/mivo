"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart, type CartItem } from "@/store/cart";
import { formatLKR } from "@/lib/format";
import { Toast } from "@/components/toast";

type Props = {
  product: Omit<CartItem, "quantity" | "size" | "maxQuantity">;
  href: string;
  /** In-stock sizes only. */
  sizes: { size: string; stock: number }[];
};

/** One "Style It With" row: photo, name, price, size, + ADD (adds 1 to the cart, stays on the page). */
export function StyleWithItem({ product, href, sizes }: Props) {
  const addItem = useCart((s) => s.addItem);
  const [size, setSize] = useState(sizes.length === 1 ? sizes[0].size : "");
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const sizeId = useId();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function add() {
    if (!size) {
      setToast({ text: `Choose a size for ${product.title} first.`, ok: false });
      return;
    }
    const stock = sizes.find((v) => v.size === size)?.stock ?? 0;
    const added = addItem({ ...product, size, maxQuantity: stock }, 1);
    setToast(
      added === 0
        ? { text: `You already have all ${stock} in size ${size} in your cart.`, ok: false }
        : { text: `Added ${product.title} · Size ${size}`, ok: true },
    );
  }

  return (
    <li className="flex gap-4 py-4 first:pt-0 last:pb-0 md:py-0">
      <Link href={href} className="relative aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-lg bg-muted sm:w-28">
        <Image src={product.imageUrl} alt={product.title} fill sizes="112px" className="object-cover" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-2">
          <Link href={href} className="line-clamp-2 font-medium hover:text-accent-hover">
            {product.title}
          </Link>
          <p className="text-sm font-semibold">{formatLKR(product.price)}</p>
          {sizes.length > 1 ? (
            <>
              <label htmlFor={sizeId} className="sr-only">
                Size for {product.title}
              </label>
              <select
                id={sizeId}
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full max-w-[12rem] rounded-full border border-border bg-surface px-4 py-2 text-xs uppercase tracking-wide outline-none focus:border-accent"
              >
                <option value="" disabled>
                  Choose size
                </option>
                {sizes.map((v) => (
                  <option key={v.size} value={v.size}>
                    {v.size}
                    {v.stock <= 3 ? ` (only ${v.stock} left)` : ""}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p className="text-xs uppercase tracking-wide text-text-secondary">{sizes[0]?.size}</p>
          )}
        </div>
        <button
          type="button"
          onClick={add}
          aria-label={`Add ${product.title} to cart`}
          className="w-fit shrink-0 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition-opacity hover:opacity-85"
        >
          + Add
        </button>
      </div>

      {toast && (
        <Toast tone={toast.ok ? "success" : "error"}>
          <span>{toast.text}</span>
          {toast.ok && (
            <Link href="/cart" className="shrink-0 font-semibold underline underline-offset-2">
              View cart
            </Link>
          )}
        </Toast>
      )}
    </li>
  );
}
