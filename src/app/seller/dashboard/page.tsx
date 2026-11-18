import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, productVariants, products, shipments } from "@/db/schema";
import { requireSeller } from "@/lib/dal";
import { SignOutButton } from "@/components/sign-out-button";
import { ConfirmEmailBanner } from "@/components/confirm-email-banner";
import { isEmailConfirmed } from "@/lib/email-verification";
import { CopyLink } from "@/components/copy-link";
import { appUrl } from "@/lib/email/templates";
import { categoryLabel, isValidPlacement } from "@/lib/categories";
import { productLinkPath, shopPath } from "@/lib/shop-links";

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
  const [[revenue], [toShip], [active], [fromLink]] = await Promise.all([
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
      // Packages to pack: COD, or bank transfer that MIVO has confirmed, not yet marked Ready.
      .where(
        and(
          eq(shipments.sellerId, sellerId),
          eq(shipments.status, "PENDING"),
          isNull(shipments.packedAt),
          or(eq(orders.paymentMethod, "COD"), eq(orders.paymentStatus, "PAID")),
        ),
      ),
    db
      .select({ n: count() })
      .from(products)
      .where(and(eq(products.sellerId, sellerId), eq(products.isActive, true))),
    // Where this boutique's orders came from: its own link, or the MIVO website (no boutique link).
    // An order through ANOTHER boutique's link that included this boutique's item counts as neither.
    db
      .select({
        mine: sql<number>`count(*) filter (where ${orders.referrerSellerId} = ${sellerId})::int`,
        website: sql<number>`count(*) filter (where ${orders.referrerSellerId} is null)::int`,
      })
      .from(shipments)
      .innerJoin(orders, eq(shipments.orderId, orders.id))
      .where(and(eq(shipments.sellerId, sellerId), sql`${orders.orderStatus} <> 'CANCELLED'`)),
  ]);
  return { revenue: Number(revenue.total), toShip: toShip.n, activeProducts: active.n, ordersFromLink: fromLink.mine, ordersFromWebsite: fromLink.website };
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
    : [{ revenue: 0, toShip: 0, activeProducts: 0, ordersFromLink: 0, ordersFromWebsite: 0 }, []];

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
    { label: "Total Sales", value: lkr.format(stats.revenue), hint: "From your delivered packages", href: "/seller/payouts" },
    { label: "Packages to Pack", value: stats.toShip, hint: "Paid orders for you to pack", href: "/seller/orders" },
    { label: "Active Products", value: stats.activeProducts, hint: "Visible to buyers once verified" },
    { label: "Orders from your link", value: stats.ordersFromLink, hint: "Customers you sent your MIVO link to" },
    { label: "Orders from MIVO website", value: stats.ordersFromWebsite, hint: "New customers who found you on MIVO" },
  ];
  const shopUrl = profile?.slug ? appUrl(shopPath(profile.slug)) : null;

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

      {profile && shopUrl && (
        <section className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-accent/40 bg-accent/5 p-5">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-text-secondary">Your shop link</h2>
            <p className="mt-1 truncate font-mono text-sm font-semibold">{shopUrl}</p>
            <p className="mt-1 text-xs text-text-secondary">
              {profile.isVerified
                ? "Share it with your customers. It shows only your boutique. Each product below has its own link too."
                : "It starts working once MIVO approves your boutique."}{" "}
              <Link href="/seller/settings" className="text-accent hover:underline">
                Change link or add WhatsApp
              </Link>
            </p>
          </div>
          <CopyLink url={shopUrl} label="Copy shop link" shareText={`Shop ${profile.shopName}:`} />
        </section>
      )}

      <div className="mb-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
                  <p className="mt-1 truncate text-xs text-text-secondary" title={categoryLabel(p.department, p.category, p.subcategory)}>
                    {categoryLabel(p.department, p.category, p.subcategory)}
                  </p>
                  <p className="text-xs text-text-secondary">{p.totalStock} in stock</p>
                  {/* Older products (before Women / Men / Kids) may need a sub-category to show in the menu. */}
                  {!isValidPlacement(p.department, p.category ?? "", p.subcategory ?? "") && (
                    <Link href={`/seller/products/${p.id}/edit`} className="mt-1 block text-xs font-medium text-error underline">
                      Choose its category so it shows in the menu
                    </Link>
                  )}
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
                  {/* Short link straight to this product: the customer picks a size and pays. */}
                  {p.isActive && profile?.isVerified && (
                    <CopyLink
                      url={appUrl(productLinkPath(p.id))}
                      shareText={`${p.title} · ${lkr.format(Number(p.price))}`}
                      className="mt-2 [&>*]:flex-1"
                    />
                  )}
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
