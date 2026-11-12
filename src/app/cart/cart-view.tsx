"use client";

import Image from "next/image";
import Link from "next/link";
import { selectCount, selectTotal, useCart, useCartHydrated } from "@/store/cart";
import { formatLKR } from "@/lib/format";
import { countBoutiques, deliveryFeeFor } from "@/lib/pricing";
import { EmptyState } from "@/components/empty-state";

export function CartView() {
  const hydrated = useCartHydrated();
  const items = useCart((s) => s.items);
  const count = useCart(selectCount);
  const total = useCart(selectTotal);
  const packages = countBoutiques(items);
  const delivery = deliveryFeeFor(packages);
  const { removeItem, updateQuantity, clearCart } = useCart.getState();

  if (!hydrated) {
    return <div className="h-64 animate-pulse rounded-xl border border-border bg-surface" />;
  }

  if (items.length === 0) {
    return (
      <EmptyState icon="bag" title="Your cart is empty" action={{ href: "/", label: "Start shopping" }}>
        Find something you love from our boutiques.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section aria-label="Cart items">
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {items.map((item) => (
            <li key={`${item.productId}-${item.size}`} className="flex gap-4 p-4">
              <Link
                href={`/product/${item.productId}`}
                className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:w-24"
              >
                <Image src={item.imageUrl} alt={item.title} fill sizes="96px" className="object-cover" />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">{item.shopName}</p>
                    <Link href={`/product/${item.productId}`} className="block truncate font-medium hover:text-accent-hover">
                      {item.title}
                    </Link>
                    <p className="text-sm text-text-secondary">Size {item.size}</p>
                  </div>
                  <p className="shrink-0 font-semibold">{formatLKR(item.price * item.quantity)}</p>
                </div>

                <div className="mt-auto flex items-center justify-between pt-3">
                  <div className="inline-flex items-center rounded-lg border border-border">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${item.title}`}
                      onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="px-3 py-1.5 disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${item.title}`}
                      onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)}
                      disabled={item.quantity >= item.maxQuantity}
                      className="px-3 py-1.5 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.productId, item.size)}
                    className="text-sm text-text-secondary underline-offset-2 hover:text-error hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            if (confirm("Remove all items from your cart?")) clearCart();
          }}
          className="mt-3 text-sm text-text-secondary hover:text-error"
        >
          Clear cart
        </button>
      </section>

      <aside className="h-fit rounded-xl border border-border bg-surface p-6 lg:sticky lg:top-24">
        <h2 className="mb-4 text-lg font-bold">Order summary</h2>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">
            Subtotal ({count} {count === 1 ? "item" : "items"})
          </span>
          <span className="font-semibold">{formatLKR(total)}</span>
        </div>
        <div className="mt-2 flex justify-between text-sm">
          <span className="text-text-secondary">
            Delivery ({packages} {packages === 1 ? "package" : "packages"})
          </span>
          <span>{formatLKR(delivery)}</span>
        </div>
        {packages > 1 && (
          <p className="mt-1 text-xs text-text-secondary">
            Each boutique ships its own package (LKR 400 each). They may arrive on different days.
          </p>
        )}
        <div className="mt-4 flex justify-between border-t border-border pt-4 text-base font-bold">
          <span>Total</span>
          <span>{formatLKR(total + delivery)}</span>
        </div>
        <Link
          href="/checkout"
          className="mt-6 block w-full rounded-xl bg-accent py-3.5 text-center font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          Proceed to Checkout
        </Link>
        <Link href="/" className="mt-3 block text-center text-sm text-text-secondary hover:text-accent">
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}
