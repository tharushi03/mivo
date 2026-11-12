"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useCart, type CartItem } from "@/store/cart";
import { Toast } from "@/components/toast";

type Props = {
  product: Omit<CartItem, "quantity" | "size" | "maxQuantity">;
  /** In-stock sizes only (sold-out sizes are filtered out on the server). */
  sizes: { size: string; stock: number }[];
};

export function AddToCart({ product, sizes }: Props) {
  const addItem = useCart((s) => s.addItem);
  const [size, setSize] = useState(sizes.length === 1 ? sizes[0].size : "");
  const [qty, setQty] = useState(1);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const sizeId = useId();

  // Stock of the chosen size. Before a size is chosen, quantity is locked at 1.
  const stock = sizes.find((v) => v.size === size)?.stock ?? 0;
  const soldOut = sizes.length === 0;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function handleAdd() {
    if (!size) {
      setToast({ text: "Please choose a size first.", ok: false });
      return;
    }
    const added = addItem({ ...product, size, maxQuantity: stock }, qty);
    if (added === 0) {
      setToast({ text: `You already have all ${stock} available in size ${size} in your cart.`, ok: false });
    } else {
      setToast({
        text:
          added < qty
            ? `Added ${added} (only ${stock} in size ${size})`
            : `Added ${added} × ${product.title} · Size ${size}`,
        ok: true,
      });
      setQty(1);
    }
  }

  if (soldOut) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4 text-center font-medium">
        Sold out
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <div>
        <label htmlFor={sizeId} className="mb-2 block text-sm font-medium">
          Size
        </label>
        <select
          id={sizeId}
          value={size}
          onChange={(e) => {
            const next = e.target.value;
            setSize(next);
            // Keep the quantity within the new size's stock.
            const max = sizes.find((v) => v.size === next)?.stock ?? 1;
            setQty((q) => Math.min(q, Math.max(1, max)));
          }}
          className="w-full rounded-lg border border-border bg-surface p-3 outline-none focus:border-accent"
        >
          <option value="" disabled>
            Choose a size
          </option>
          {sizes.map((v) => (
            <option key={v.size} value={v.size}>
              {v.size}
              {v.stock <= 3 ? ` (only ${v.stock} left)` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium">Quantity</span>
        <div className="flex items-center gap-4">
          <div className="inline-flex items-center rounded-lg border border-border bg-surface">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              className="px-4 py-2.5 text-lg disabled:opacity-40"
            >
              −
            </button>
            <span className="w-10 text-center font-medium" aria-live="polite">
              {qty}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQty((q) => Math.min(stock, q + 1))}
              disabled={!size || qty >= stock}
              className="px-4 py-2.5 text-lg disabled:opacity-40"
            >
              +
            </button>
          </div>
          <span className="text-sm text-text-secondary">
            {!size ? "Choose a size" : stock <= 5 ? `Only ${stock} left in ${size}` : "In stock"}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="w-full rounded-xl bg-accent py-4 font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        Add to Cart
      </button>

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
    </div>
  );
}
