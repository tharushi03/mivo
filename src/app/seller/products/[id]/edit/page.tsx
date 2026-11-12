import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productVariants, products } from "@/db/schema";
import { requireSeller } from "@/lib/dal";
import { ProductForm } from "../../_form/product-form";

export const metadata: Metadata = { title: "Edit product", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function EditProductPage({ params }: PageProps<"/seller/products/[id]/edit">) {
  return (
    <div className="min-h-screen bg-background p-4 text-text sm:p-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/seller/dashboard" className="text-sm text-text-secondary hover:text-accent">
          ← Back to dashboard
        </Link>
        <h1 className="mb-1 mt-3 text-3xl font-bold">Edit product</h1>
        <p className="mb-8 text-text-secondary">Update details, restock sizes, add new sizes or archive the product.</p>
        <Suspense fallback={<div className="h-[40rem] animate-pulse rounded-xl border border-border bg-surface" />}>
          <EditForm params={params} />
        </Suspense>
      </div>
    </div>
  );
}

async function EditForm({ params }: Pick<PageProps<"/seller/products/[id]/edit">, "params">) {
  const { profile } = await requireSeller();
  const { id } = await params;
  if (!profile || !UUID.test(id)) notFound();

  // Only the seller's own product; anyone else's looks like it doesn't exist.
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, id), eq(products.sellerId, profile.id)),
  });
  if (!product) notFound();

  const variants = await db
    .select({ size: productVariants.size, stock: productVariants.stock })
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .orderBy(asc(productVariants.position), asc(productVariants.size));

  return (
    <ProductForm
      product={{
        id: product.id,
        title: product.title,
        description: product.description ?? "",
        price: Number(product.price).toString(),
        category: product.category ?? "",
        isActive: product.isActive,
        imageUrl: product.imageUrl,
        variants: variants.map((v) => ({ size: v.size, stock: String(v.stock), original: v.stock })),
      }}
    />
  );
}
