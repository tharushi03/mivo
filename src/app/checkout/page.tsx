import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { CheckoutForm } from "./checkout-form";
import { isEmailConfirmed } from "@/lib/email-verification";
import { ConfirmEmailBanner } from "@/components/confirm-email-banner";
import { codAvailable } from "@/lib/couriers";

export const metadata: Metadata = { title: "Checkout" };

export default function CheckoutPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <h1 className="mb-8 text-3xl font-bold">Checkout</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <CheckoutGate />
      </Suspense>
    </main>
  );
}

// Protected: the proxy redirects guests to /login, and this re-checks on the server.
async function CheckoutGate() {
  const user = await requireUser();
  const [confirmed, cod] = await Promise.all([isEmailConfirmed(user.id), codAvailable()]);
  return (
    <>
      {!confirmed && <ConfirmEmailBanner email={user.email ?? ""} reason="You can place your order once it's confirmed." />}
      <CheckoutForm defaultName={user.name ?? ""} codAvailable={cod} />
    </>
  );
}
