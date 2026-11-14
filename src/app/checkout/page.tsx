import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/dal";
import { CheckoutForm, type BuyNowItem } from "./checkout-form";
import { isEmailConfirmed } from "@/lib/email-verification";
import { ConfirmEmailBanner } from "@/components/confirm-email-banner";
import { codAvailable } from "@/lib/couriers";
import { getStorefrontProduct } from "@/lib/catalog";
import { formStamp } from "@/lib/guest-orders";

export const metadata: Metadata = { title: "Checkout" };

export default function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <h1 className="mb-8 text-3xl font-bold">Checkout</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <CheckoutGate searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * "Buy Now" (?buy=<productId>&size=M&qty=1): checkout for that one item, built from the
 * database (the visible product and its in-stock size), never from the URL's numbers.
 */
async function buyNowItem(sp: Awaited<PageProps<"/checkout">["searchParams"]>): Promise<BuyNowItem | null | "gone"> {
  if (typeof sp.buy !== "string") return null;
  const product = await getStorefrontProduct(sp.buy);
  const size = typeof sp.size === "string" ? sp.size : "";
  const variant = product?.sizes.find((v) => v.size === size);
  if (!product || !variant) return "gone";
  const qty = Math.min(Math.max(1, Math.floor(Number(sp.qty)) || 1), variant.stock);
  return {
    productId: product.id,
    title: product.title,
    price: Number(product.price),
    imageUrl: product.imageUrl,
    shopName: product.shopName,
    sellerId: product.sellerId,
    size: variant.size,
    quantity: qty,
    maxQuantity: variant.stock,
  };
}

// Open to everyone. Logged-in buyers: as before (confirmed email, COD allowed).
// Guests: email + delivery details, bank transfer only.
//
// Always the same shape (notice + form), even when the Buy Now item is gone: placing an
// order refreshes this page, and buying the LAST item makes it "gone" at that moment.
// The form must stay mounted so it can still send the buyer to their new order.
async function CheckoutGate({ searchParams }: Pick<PageProps<"/checkout">, "searchParams">) {
  const [user, sp] = await Promise.all([currentUser(), searchParams]);
  const item = await buyNowItem(sp);
  const buyNow = item === "gone" ? null : item;
  const unavailable = item === "gone" ? { href: typeof sp.buy === "string" ? `/product/${sp.buy}` : "/" } : undefined;

  if (!user) {
    const here = `/checkout${typeof sp.buy === "string" ? `?${new URLSearchParams(sp as Record<string, string>)}` : ""}`;
    return (
      <>
        <p className="mb-6 rounded-xl border border-border bg-surface p-4 text-sm">
          <strong>No account needed.</strong> Enter your details below and pay by bank transfer. Have a MIVO account?{" "}
          <Link href={`/login?callbackUrl=${encodeURIComponent(here)}`} className="font-medium text-accent hover:underline">
            Log in
          </Link>{" "}
          to use cash on delivery.
        </p>
        <CheckoutForm guest stamp={formStamp()} defaultName="" codAvailable={false} buyNow={buyNow} unavailable={unavailable} />
      </>
    );
  }

  const [confirmed, cod] = await Promise.all([isEmailConfirmed(user.id), codAvailable()]);
  return (
    <>
      {!confirmed ? <ConfirmEmailBanner email={user.email ?? ""} reason="You can place your order once it's confirmed." /> : null}
      <CheckoutForm guest={false} defaultName={user.name ?? ""} codAvailable={cod} buyNow={buyNow} unavailable={unavailable} />
    </>
  );
}
