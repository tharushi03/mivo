import { Suspense } from "react";
import Link from "next/link";
import { requireSeller } from "@/lib/dal";
import { ProductForm } from "../_form/product-form";
import { getPairingOptions } from "../_form/pairing-options";

// Access is guarded by src/proxy.ts; the page reads the boutique's products for
// "Style it with", and the createProduct action re-checks the seller session.
export default function NewProductPage() {
  return (
    <div className="min-h-screen bg-background p-4 text-text sm:p-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/seller/dashboard" className="text-sm text-text-secondary hover:text-accent">
          ← Back to dashboard
        </Link>
        <h1 className="mb-1 mt-3 text-3xl font-bold">Add a product</h1>
        <p className="mb-8 text-text-secondary">List a new piece on the MIVO marketplace.</p>
        <Suspense fallback={<div className="h-[40rem] animate-pulse rounded-xl border border-border bg-surface" />}>
          <NewForm />
        </Suspense>
      </div>
    </div>
  );
}

async function NewForm() {
  const { profile } = await requireSeller();
  const pairingOptions = profile ? await getPairingOptions(profile.id) : [];
  return <ProductForm pairingOptions={pairingOptions} />;
}
