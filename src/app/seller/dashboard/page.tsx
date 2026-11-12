import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, productVariants, products, shipments } from "@/db/schema";
import { requireSeller } from "@/lib/dal";
import { SignOutButton } from "@/components/sign-out-button";
import { ConfirmEmailBanner } from "@/components/confirm-email-banner";
import { isEmailConfirmed } from "@/lib/email-verification";

const lkr = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });

export default function SellerDashboardPage({ searchParams }: PageProps<"/seller/dashboard">) {
  return (
    <div className="min-h-screen bg-background p-4 text-text sm:p-8">
      <div className="mx-auto max-w-5xl">
        <Suspense fallback={<DashboardSkeleton />}>
          <SellerDashboard searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function getSellerStats(sellerId: string) {
  const [[revenue], [toShip], [active]] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${orderItems.priceAtPurchase} * ${orderItems.quantity}), 0)` })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      // Revenue counts once THIS boutique's package is delivered.
      .innerJoin(shipments, and(eq(shipments.orderId, orderItems.orderId), eq(shipments.sellerId, products.sellerId)))
      .where(and(eq(products.sellerId, sellerId), eq(shipments.status, "DELIVERED"))),
    db
      .select({ n: count() })
      .from(shipments)
      .innerJoin(orders, eq(shipments.orderId, orders.id))
      // Packages ready to ship: COD, or bank transfer that MIVO has confirmed.
      .where(
        and(
          eq(shipments.sellerId, sellerId),
          eq(shipments.status, "PENDING"),
          or(eq(orders.paymentMethod, "COD"), eq(orders.paymentStatus, "PAID")),
        ),
      ),
    db
      .select({ n: count() })
      .from(products)
      .where(and(eq(products.sellerId, sellerId), eq(products.isActive, true))),
  ]);
  return { revenue: Number(revenue.total), toShip: toShip.n, activeProducts: active.n };
}

async function SellerDashboard({ searchParams }: Pick<PageProps<"/seller/dashboard">, "searchParams">) {
  const { user, profile } = await requireSeller();
  const saved = (await searchParams).saved === "1";
  const confirmed = await isEmailConfirmed(user.id);

  const [stats, productRows] = profile
    ? await Promise.all([
        getSellerStats(profile.id),
        db.select().from(products).where(eq(products.sellerId, profile.id)).orderBy(desc(products.createdAt)),
      ])
    : [{ revenue: 0, toShip: 0, activeProducts: 0 }, []];

  // Stock per size for every product.
  const variants = productRows.length
    ? await db
        .select({ productId: productVariants.productId, size: productVariants.size, stock: productVariants.stock })
        .from(productVariants)
        .where(inArray(productVariants.productId, productRows.map((p) => p.id)))
        .orderBy(asc(productVariants.position), asc(productVariants.size))
    : [];
  const items = productRows.map((p) => {
    const sizes = variants.filter((v) => v.productId === p.id);
    return { ...p, sizes, totalStock: sizes.reduce((n, v) => n + v.stock, 0) };
  });

  const cards = [
    { label: "Total Revenue", value: lkr.format(stats.revenue), hint: "From your delivered packages" },
    { label: "Packages to Ship", value: stats.toShip, hint: "Ready for you to send", href: "/seller/orders" },
    { label: "Active Products", value: stats.activeProducts, hint: "Visible to buyers once verified" },
  ];

  return (
    <>
      {!confirmed && (
        <ConfirmEmailBanner email={user.email ?? ""} reason="MIVO can approve your boutique once your email is confirmed." />
      )}
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold">{profile?.shopName ?? "Seller Dashboard"}</h1>
          <p className="mt-1 text-text-secondary">Welcome back, {user.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {profile && items.length > 0 && (
            <Link
              href="/seller/products/new"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              + Add Product
            </Link>
          )}
          <SignOutButton />
        </div>
      </header>

      {saved && (
        <p role="status" className="mb-8 rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-success">
          ✓ Product saved.
        </p>
      )}

      {!profile && (
        <div className="mb-8 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">
          Your account has no boutique profile yet. Please contact MIVO support.
        </div>
      )}
      {profile && !profile.isVerified && (
        <div className="mb-8 rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm">
          <strong>Awaiting approval.</strong> The MIVO team is reviewing your boutique. You can add
          products now — they&apos;ll appear on the storefront once you&apos;re verified.
        </div>
      )}

      <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {cards.map((c) => {
          const body = (
            <>
              <h3 className="text-sm font-medium text-text-secondary">{c.label}</h3>
              <p className="mt-2 text-2xl font-bold">{c.value}</p>
              <p className="mt-1 text-xs text-text-secondary">{c.hint}</p>
            </>
          );
          const cls = "rounded-xl border border-border bg-surface p-6 shadow-sm";
          return "href" in c && c.href ? (
            <Link key={c.label} href={c.href} className={`${cls} transition-colors hover:border-accent`}>
              {body}
            </Link>
          ) : (
            <div key={c.label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      {profile && items.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <h2 className="mb-2 text-xl font-bold">No products yet</h2>
          <p className="mb-6 text-text-secondary">Start adding your clothing items to the MIVO marketplace.</p>
          <Link
            href="/seller/products/new"
            className="inline-block rounded-lg bg-accent px-6 py-3 font-medium text-white transition-colors hover:bg-accent-hover"
          >
            + Add Your First Product
          </Link>
        </div>
      )}

      {items.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Your products ({items.length})</h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="relative aspect-[3/4] bg-muted">
                  <Image src={p.imageUrl} alt={p.title} fill sizes="(min-width: 1024px) 240px, 50vw" className="object-cover" />
                  {!p.isActive && (
                    <span className="absolute left-2 top-2 rounded-full bg-primary/80 px-2 py-0.5 text-xs text-white">Archived</span>
                  )}
                  {p.totalStock === 0 && (
                    <span className="absolute right-2 top-2 rounded-full bg-error px-2 py-0.5 text-xs text-white">Sold out</span>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate font-medium" title={p.title}>
                    {p.title}
                  </p>
                  <p className="text-sm font-semibold text-accent-hover">{lkr.format(Number(p.price))}</p>
                  <p className="mt-1 truncate text-xs text-text-secondary">
                    {p.category} · {p.totalStock} in stock
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1" aria-label="Stock per size">
                    {p.sizes.map((v) => (
                      <li
                        key={v.size}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          v.stock === 0 ? "bg-error/10 text-error line-through" : v.stock <= 2 ? "bg-accent/15 text-accent-hover" : "bg-muted"
                        }`}
                        title={v.stock === 0 ? `${v.size}: sold out` : `${v.size}: ${v.stock} left`}
                      >
                        {v.size} · {v.stock}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/seller/products/${p.id}/edit`}
                    className="mt-3 block rounded-md border border-border py-1.5 text-center text-xs font-medium transition-colors hover:border-accent hover:text-accent-hover"
                  >
                    Edit / Restock
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-10 h-[73px] border-b border-border" />
      <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 rounded-xl border border-border bg-surface" />
        ))}
      </div>
      <div className="h-48 rounded-xl border border-border bg-surface" />
    </div>
  );
}
