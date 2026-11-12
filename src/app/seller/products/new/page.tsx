import Link from "next/link";
import { ProductForm } from "../_form/product-form";

// Static page: access is guarded by src/proxy.ts, and the createProduct
// action re-checks the seller session before saving anything.
export default function NewProductPage() {
  return (
    <div className="min-h-screen bg-background p-4 text-text sm:p-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/seller/dashboard" className="text-sm text-text-secondary hover:text-accent">
          ← Back to dashboard
        </Link>
        <h1 className="mb-1 mt-3 text-3xl font-bold">Add a product</h1>
        <p className="mb-8 text-text-secondary">List a new piece on the MIVO marketplace.</p>
        <ProductForm />
      </div>
    </div>
  );
}
