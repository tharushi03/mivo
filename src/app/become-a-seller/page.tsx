import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { auth } from "@/auth";
import { DELIVERY_FEE_PER_SHIPMENT } from "@/lib/pricing";
import { SellerSignupForm } from "./seller-signup-form";

export const metadata: Metadata = {
  title: "Sell on MIVO",
  description: "Open your boutique on MIVO and reach shoppers across Sri Lanka.",
};

const STEPS = [
  { title: "Apply in 2 minutes", text: "Tell us your boutique name and Instagram. You can start listing right away." },
  { title: "Get approved", text: "The MIVO team reviews your boutique, usually within 2 working days. Then your products go live." },
  { title: "Ship & get paid", text: "Pack each order, hand it to a courier and enter the tracking number. We pay you after delivery." },
];

export default function BecomeASellerPage() {
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[1fr_28rem] lg:py-16">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">For boutiques</p>
        <h1 className="mt-2 text-4xl font-bold leading-tight sm:text-5xl">Sell your clothing on MIVO</h1>
        <p className="mt-4 max-w-xl text-lg text-text-secondary">
          Reach shoppers across Sri Lanka. We handle the storefront, payments and customer emails. You focus on your
          pieces.
        </p>

        <ol className="mt-10 space-y-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-white">{i + 1}</span>
              <div>
                <h2 className="font-semibold">{s.title}</h2>
                <p className="text-sm text-text-secondary">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <ul className="mt-10 space-y-2 rounded-xl border border-border bg-surface p-5 text-sm">
          <li>✓ No listing fees. MIVO takes a commission only on items you sell.</li>
          <li>✓ Size-by-size stock tracking, so you never oversell.</li>
          <li>✓ Buyers pay LKR {DELIVERY_FEE_PER_SHIPMENT} delivery per package, and MIVO covers the courier.</li>
          <li>✓ Payouts to your bank account after delivery, with a full history in your dashboard.</li>
        </ul>
      </section>

      <div>
        <Suspense fallback={<SellerSignupForm />}>
          <Gate />
        </Suspense>
      </div>
    </main>
  );
}

/** Already signed in? Selling needs a separate boutique account. */
async function Gate() {
  await connection(); // request-time (see login page)
  const session = await auth();
  if (!session?.user) return <SellerSignupForm />;

  return (
    <div className="rounded-xl border border-border bg-surface p-6 text-sm sm:p-8">
      <h2 className="text-xl font-bold">You&apos;re signed in</h2>
      {session.user.role === "SELLER" ? (
        <>
          <p className="mt-2 text-text-secondary">You already have a boutique account.</p>
          <Link href="/seller/dashboard" className="mt-4 inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:bg-accent-hover">
            Go to my dashboard
          </Link>
        </>
      ) : (
        <p className="mt-2 text-text-secondary">
          You&apos;re signed in as {session.user.email}. Boutiques use a separate account. Sign out first, then apply
          with your boutique&apos;s email address.
        </p>
      )}
    </div>
  );
}
