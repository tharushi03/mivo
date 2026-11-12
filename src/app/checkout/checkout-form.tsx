"use client";

import { useActionState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { placeOrder, type PlaceOrderState } from "@/app/actions/order";
import { selectTotal, useCart, useCartHydrated } from "@/store/cart";
import { countBoutiques, deliveryFeeFor } from "@/lib/pricing";
import { formatLKR } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";

const input =
  "w-full rounded-md border border-border bg-background p-2.5 outline-none transition-colors focus:border-accent";

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-error">{msg}</p> : null;
}

export function CheckoutForm({ defaultName, codAvailable }: { defaultName: string; codAvailable: boolean }) {
  const router = useRouter();
  const hydrated = useCartHydrated();
  const items = useCart((s) => s.items);
  const subtotal = useCart(selectTotal);
  const packages = countBoutiques(items);
  const delivery = deliveryFeeFor(packages);
  const [state, formAction, pending] = useActionState<PlaceOrderState, FormData>(placeOrder, {});
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};

  // Success: clear the cart and go to the confirmation page.
  useEffect(() => {
    if (!state.orderId) return;
    useCart.getState().clearCart();
    router.replace(`/order/${state.orderId}`);
  }, [state.orderId, router]);

  // Conflict: apply the server's fresh prices/stock to the cart.
  useEffect(() => {
    if (!state.problems) return;
    const { syncProduct, removeItem } = useCart.getState();
    for (const p of state.problems) {
      if (p.fix.removeLine) removeItem(p.productId, p.size);
      else syncProduct(p.productId, p.size, p.fix);
    }
  }, [state.problems]);

  if (!hydrated) return <div className="h-96 animate-pulse rounded-xl border border-border bg-surface" />;

  if (state.orderId) {
    return <p className="rounded-xl border border-border bg-surface p-8 text-center">Order placed! Redirecting…</p>;
  }

  if (items.length === 0) {
    return (
      <EmptyState icon="bag" title="Your cart is empty" action={{ href: "/", label: "Continue shopping" }}>
        {state.problems ? <ProblemList problems={state.problems} /> : "Add something to your cart to check out."}
      </EmptyState>
    );
  }

  const payload = JSON.stringify(
    items.map((i) => ({ productId: i.productId, size: i.size, quantity: i.quantity, price: i.price })),
  );

  return (
    <form action={formAction} className="grid gap-8 pb-24 lg:grid-cols-[1fr_340px] lg:pb-0">
      <input type="hidden" name="items" value={payload} />

      <div className="space-y-8">
        {state.error && (
          <div role="alert" className="rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">
            <p>{state.error}</p>
            {state.problems && <ProblemList problems={state.problems} />}
          </div>
        )}

        <fieldset className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <legend className="px-1 text-lg font-bold">Delivery details</legend>

          <div>
            <label htmlFor="recipientName" className="mb-1 block text-sm font-medium">Recipient name</label>
            <input id="recipientName" name="recipientName" defaultValue={v.recipientName ?? defaultName} autoComplete="name" required className={input} />
            <FieldError msg={e.recipientName} />
          </div>

          <div>
            <label htmlFor="phoneNumber" className="mb-1 block text-sm font-medium">Phone number</label>
            <input id="phoneNumber" name="phoneNumber" defaultValue={v.phoneNumber} type="tel" inputMode="tel" autoComplete="tel" placeholder="077 123 4567" required className={input} />
            <p className="mt-1 text-xs text-text-secondary">The courier will call this number before delivery.</p>
            <FieldError msg={e.phoneNumber} />
          </div>

          <div>
            <label htmlFor="address" className="mb-1 block text-sm font-medium">Address</label>
            <textarea id="address" name="address" defaultValue={v.address} rows={3} autoComplete="street-address" placeholder="House no, street, area" required className={input} />
            <FieldError msg={e.address} />
          </div>

          <div>
            <label htmlFor="city" className="mb-1 block text-sm font-medium">City / Town</label>
            <input id="city" name="city" defaultValue={v.city} autoComplete="address-level2" placeholder="Colombo 05" required className={input} />
            <FieldError msg={e.city} />
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-border bg-surface p-6">
          <legend className="px-1 text-lg font-bold">Payment method</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {codAvailable && (
              <PaymentOption value="COD" title="Cash on Delivery" hint="Pay the courier when your order arrives." defaultChecked={v.paymentMethod !== "BANK_TRANSFER"} />
            )}
            <PaymentOption
              value="BANK_TRANSFER"
              title="Bank Transfer"
              hint="We'll show our bank details after you order."
              defaultChecked={!codAvailable || v.paymentMethod === "BANK_TRANSFER"}
            />
          </div>
          {!codAvailable && <p className="mt-3 text-sm text-text-secondary">Cash on delivery isn&apos;t available right now.</p>}
          <FieldError msg={e.paymentMethod} />
        </fieldset>
      </div>

      <aside className="h-fit rounded-xl border border-border bg-surface p-6 lg:sticky lg:top-24">
        <h2 className="mb-4 text-lg font-bold">Order summary</h2>
        <ul className="mb-4 max-h-80 space-y-3 overflow-y-auto">
          {items.map((i) => (
            <li key={`${i.productId}-${i.size}`} className="flex gap-3">
              <div className="relative aspect-[3/4] w-12 shrink-0 overflow-hidden rounded bg-muted">
                <Image src={i.imageUrl} alt="" fill sizes="48px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">{i.title}</p>
                <p className="text-text-secondary">Size {i.size} · Qty {i.quantity}</p>
              </div>
              <p className="shrink-0 text-sm font-medium">{formatLKR(i.price * i.quantity)}</p>
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Subtotal</span>
            <span>{formatLKR(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">
              Delivery ({packages} {packages === 1 ? "package" : "packages"})
            </span>
            <span>{formatLKR(delivery)}</span>
          </div>
          {packages > 1 && (
            <p className="text-xs text-text-secondary">Each boutique ships separately, so packages may arrive on different days.</p>
          )}
          <div className="flex justify-between border-t border-border pt-3 text-base font-bold">
            <span>Total</span>
            <span>{formatLKR(subtotal + delivery)}</span>
          </div>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="mt-6 hidden w-full rounded-xl bg-accent py-3.5 font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60 lg:block"
        >
          {pending ? "Placing order…" : "Place Order"}
        </button>
        <p className="mt-3 text-center text-xs text-text-secondary">
          By placing your order you agree to our{" "}
          <Link href="/terms" className="underline hover:text-accent">Terms</Link> (including returns) and{" "}
          <Link href="/privacy" className="underline hover:text-accent">Privacy Policy</Link>.
        </p>
        <Link href="/cart" className="mt-3 block text-center text-sm text-text-secondary hover:text-accent">
          Back to cart
        </Link>
      </aside>

      {/* Phones: total + Place Order always within thumb reach. */}
      <div data-fixed-bottom-bar className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="text-xs text-text-secondary">Total incl. delivery</p>
            <p className="text-lg font-bold">{formatLKR(subtotal + delivery)}</p>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-accent px-6 py-3 font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Placing…" : "Place Order"}
          </button>
        </div>
      </div>
    </form>
  );
}

function PaymentOption({ value, title, hint, defaultChecked }: { value: string; title: string; hint: string; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-4 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/5">
      <input type="radio" name="paymentMethod" value={value} defaultChecked={defaultChecked} required className="mt-1 accent-[var(--color-accent)]" />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-text-secondary">{hint}</span>
      </span>
    </label>
  );
}

function ProblemList({ problems }: { problems: NonNullable<PlaceOrderState["problems"]> }) {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-left">
      {problems.map((p) => (
        <li key={`${p.productId}-${p.size}`}>
          <strong>{p.title}</strong> (size {p.size}) {p.message}
        </li>
      ))}
    </ul>
  );
}
