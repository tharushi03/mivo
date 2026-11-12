import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getBuyerOrders } from "@/lib/orders";
import { orderRef } from "@/lib/payments";
import { formatDate, formatLKR } from "@/lib/format";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { SignOutButton } from "@/components/sign-out-button";
import { EmptyState } from "@/components/empty-state";
import { getReviewableItems } from "@/lib/reviews";
import Image from "next/image";
import { ReviewButton } from "./review-button";

export const metadata: Metadata = { title: "My orders" };

export default function OrdersPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl border border-border bg-surface" />}>
        <OrdersList />
      </Suspense>
    </main>
  );
}

async function OrdersList() {
  const user = await requireUser();
  const [list, reviewable] = await Promise.all([getBuyerOrders(user.id), getReviewableItems(user.id)]);

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">My orders</h1>
          <p className="mt-1 text-text-secondary">Signed in as {user.email}</p>
        </div>
        <SignOutButton />
      </header>

      {list.length === 0 ? (
        <EmptyState icon="box" title="No orders found" action={{ href: "/", label: "Start shopping" }}>
          You haven&apos;t placed any orders yet.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {list.map((o) => {
            const items = reviewable.get(o.id);
            return (
              <li key={o.id}>
                <Link href={`/order/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/30">
                  <div>
                    <p className="font-mono font-semibold">{orderRef(o.id)}</p>
                    <p className="text-sm text-text-secondary">
                      {formatDate(o.createdAt)} ·{" "}
                      {o.paymentMethod === "COD" ? "Cash on Delivery" : "Bank Transfer"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <OrderStatusBadge status={o.orderStatus} />
                    <span className="font-semibold">{formatLKR(o.totalAmount)}</span>
                  </div>
                </Link>
                {/* Delivered orders: each product can be reviewed. */}
                {items && items.length > 0 && (
                  <ul className="space-y-2 border-t border-dashed border-border bg-background/60 px-4 py-3">
                    {items.map((i) => (
                      <li key={i.productId} className="flex items-center gap-3">
                        <div className="relative aspect-[3/4] w-9 shrink-0 overflow-hidden rounded bg-muted">
                          <Image src={i.imageUrl} alt="" fill sizes="36px" className="object-cover" />
                        </div>
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="truncate font-medium">{i.title}</p>
                          <p className="text-xs text-text-secondary">Size {i.sizes.join(", ")}</p>
                        </div>
                        <ReviewButton orderId={o.id} productId={i.productId} title={i.title} existing={i.review} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
