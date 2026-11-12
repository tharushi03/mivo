import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { couriers, orderItems, orders, products, shipments } from "@/db/schema";
import { requireSeller } from "@/lib/dal";
import { orderRef } from "@/lib/payments";
import { formatDateTime, formatLKR } from "@/lib/format";
import { codCouriers, getActiveCouriers } from "@/lib/couriers";
import { DispatchForm } from "@/components/dispatch-form";
import { isOverdue } from "@/lib/shipments";
import { ShipmentStatusBadge } from "@/components/shipment-status-badge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PAGE_SIZE, Pagination, parsePage } from "@/components/pagination";
import { restockShipment } from "@/app/actions/admin-orders";
import { EditTracking } from "@/components/edit-tracking";

export const metadata: Metadata = { title: "Seller orders" };

const TABS = {
  ship: { label: "To ship", statuses: ["PENDING"] },
  sent: { label: "On the way", statuses: ["DISPATCHED"] },
  done: { label: "Delivered", statuses: ["DELIVERED", "RETURNED"] },
  all: { label: "All", statuses: null },
} as const;
type Tab = keyof typeof TABS;

export default function SellerOrdersPage({ searchParams }: PageProps<"/seller/orders">) {
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <h1 className="text-3xl font-bold">Orders</h1>
      <p className="mb-6 mt-1 text-text-secondary">
        Pack each order, hand it to a courier, then enter the courier and tracking number. We email the buyer for you.
      </p>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl border border-border bg-surface" />}>
        <SellerOrders searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SellerOrders({ searchParams }: Pick<PageProps<"/seller/orders">, "searchParams">) {
  const { profile } = await requireSeller();
  if (!profile) return <p className="text-error">Your account has no boutique profile.</p>;

  const sp = await searchParams;
  const tab: Tab = typeof sp.tab === "string" && sp.tab in TABS ? (sp.tab as Tab) : "ship";
  const page = parsePage(sp.page);
  const statuses = TABS[tab].statuses;

  // Only THIS boutique's packages, so sellers never see other shops' items or totals.
  const mine = eq(shipments.sellerId, profile.id);
  const where: SQL | undefined = statuses ? and(mine, inArray(shipments.status, [...statuses])) : mine;

  const [counts, list, courierList] = await Promise.all([
    db.select({ status: shipments.status, n: count() }).from(shipments).where(mine).groupBy(shipments.status),
    db
      .select({
        id: shipments.id,
        orderId: orders.id,
        status: shipments.status,
        deliveryFee: shipments.deliveryFee,
        courierId: shipments.courierId,
        courierName: couriers.name,
        trackingNumber: shipments.trackingNumber,
        dispatchedAt: shipments.dispatchedAt,
        deliveredAt: shipments.deliveredAt,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
        recipientName: orders.recipientName,
        shippingAddress: orders.shippingAddress,
        phoneNumber: orders.phoneNumber,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        cancelledBy: orders.cancelledBy,
        resolutionNote: shipments.resolutionNote,
        restockedAt: shipments.restockedAt,
      })
      .from(shipments)
      .innerJoin(orders, eq(shipments.orderId, orders.id))
      .leftJoin(couriers, eq(shipments.courierId, couriers.id))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    getActiveCouriers(),
  ]);

  const items = list.length
    ? await db
        .select({
          orderId: orderItems.orderId,
          id: orderItems.id,
          title: orderItems.productTitle,
          size: orderItems.selectedSize,
          quantity: orderItems.quantity,
          price: orderItems.priceAtPurchase,
        })
        .from(orderItems)
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(and(inArray(orderItems.orderId, list.map((s) => s.orderId)), eq(products.sellerId, profile.id)))
    : [];
  const itemsByOrder = Map.groupBy(items, (i) => i.orderId);

  const countOf = (t: Tab) => {
    const st = TABS[t].statuses as readonly string[] | null;
    return counts.filter((c) => !st || st.includes(c.status)).reduce((s, c) => s + c.n, 0);
  };
  const href = (t: Tab, p = 1) => {
    const qs = new URLSearchParams();
    if (t !== "ship") qs.set("tab", t);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/seller/orders?${s}` : "/seller/orders";
  };

  return (
    <>
      <nav aria-label="Filter packages" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={href(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t ? "border-primary bg-primary text-white" : "border-border bg-surface hover:bg-muted"
            }`}
          >
            {TABS[t].label} <span className={tab === t ? "text-white/70" : "text-text-secondary"}>{countOf(t)}</span>
          </Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <EmptyState icon="box" title={tab === "ship" ? "Nothing to ship right now" : "No packages here"}>
          {tab === "ship"
            ? "New orders for your pieces appear here. You'll also get an email."
            : "Packages appear here as you ship them."}
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {list.map((s) => {
            const its = itemsByOrder.get(s.orderId) ?? [];
            const itemsTotal = its.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
            const cod = s.paymentMethod === "COD" && s.paymentStatus !== "PAID";
            const awaitingPayment = s.paymentMethod === "BANK_TRANSFER" && s.paymentStatus !== "PAID";
            const readySince = s.paymentMethod === "BANK_TRANSFER" ? s.paidAt : s.createdAt;
            const late = s.status === "PENDING" && !awaitingPayment && isOverdue(readySince);
            const cancelled = s.status === "CANCELLED";

            return (
              <li key={s.id} className={`rounded-xl border bg-surface p-4 sm:p-5 ${late ? "border-error/50" : "border-border"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono font-semibold">{orderRef(s.orderId)}</p>
                    <p className="text-xs text-text-secondary">Ordered {formatDateTime(s.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {late && <span className="rounded-full bg-error/10 px-2.5 py-1 text-xs font-medium text-error">Overdue</span>}
                    <ShipmentStatusBadge status={s.status} />
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="text-sm">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">Your items</h3>
                    <ul className="space-y-0.5">
                      {its.map((i) => (
                        <li key={i.id}>
                          {i.quantity} × {i.title} <span className="text-text-secondary">· Size {i.size}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 font-semibold">{formatLKR(itemsTotal)}</p>
                  </div>

                  <div className="text-sm">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">Ship to</h3>
                    {cancelled ? (
                      <p className="text-text-secondary">Order cancelled. Don&apos;t send.</p>
                    ) : (
                      <>
                        <p className="font-medium">{s.recipientName}</p>
                        <p className="whitespace-pre-line text-text-secondary">{s.shippingAddress}</p>
                        <a href={`tel:${s.phoneNumber}`} className="text-accent hover:underline">
                          {s.phoneNumber}
                        </a>
                      </>
                    )}
                  </div>

                  <div className="text-sm">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">Payment</h3>
                    {cod ? (
                      <p>
                        Courier collects <strong>{formatLKR(itemsTotal + Number(s.deliveryFee))}</strong>
                        <span className="block text-xs text-text-secondary">Cash on delivery (items + LKR {Number(s.deliveryFee)} delivery)</span>
                      </p>
                    ) : awaitingPayment ? (
                      <p className="font-medium text-accent-hover">Waiting for MIVO to confirm the bank transfer. Don&apos;t ship yet.</p>
                    ) : (
                      <p className="text-success">
                        Paid. The courier collects nothing.
                        <span className="block text-xs text-text-secondary">
                          Book any courier: MIVO repays the {formatLKR(s.deliveryFee)} delivery fee with your payout.
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 border-t border-border pt-4">
                  {s.status === "PENDING" && !awaitingPayment && (
                    <DispatchForm
                      shipmentId={s.id}
                      orderRef={orderRef(s.orderId)}
                      codAmount={s.paymentMethod === "COD" ? formatLKR(itemsTotal + Number(s.deliveryFee)) : null}
                      couriers={s.paymentMethod === "COD" ? codCouriers(courierList) : courierList}
                    />
                  )}
                  {(s.status === "DISPATCHED" || s.status === "DELIVERED" || s.status === "RETURNED") && (
                    <p className="text-sm">
                      {s.courierName} · <span className="font-mono">{s.trackingNumber}</span>
                      <span className="text-text-secondary">
                        {" "}
                        · sent {s.dispatchedAt ? formatDateTime(s.dispatchedAt) : ""}
                        {s.status === "DELIVERED" && s.deliveredAt && <> · delivered {formatDateTime(s.deliveredAt)}</>}
                      </span>
                    </p>
                  )}
                  {s.status === "DISPATCHED" && (
                    <div className="mt-1">
                      <EditTracking
                        shipmentId={s.id}
                        couriers={s.paymentMethod === "COD" ? codCouriers(courierList) : courierList}
                        current={{ courierId: s.courierId, courierName: s.courierName, tracking: s.trackingNumber }}
                      />
                    </div>
                  )}
                  {s.status === "PENDING" && awaitingPayment && (
                    <p className="text-xs text-text-secondary">You&apos;ll get an email as soon as this order is ready to ship.</p>
                  )}
                  {cancelled && (
                    <p className="text-xs text-text-secondary">
                      {s.resolutionNote
                        ? `Cancelled by MIVO: ${s.resolutionNote}.`
                        : `Cancelled by ${s.cancelledBy === "BUYER" ? "the customer" : "MIVO"}.`}
                      {s.restockedAt ? " Stock has been returned." : " Ask the courier to return the package."}
                    </p>
                  )}
                  {s.status === "RETURNED" && (
                    <p className="text-xs text-text-secondary">
                      Returned by the customer{s.resolutionNote ? `: ${s.resolutionNote}` : ""}. You won&apos;t be paid for these items.
                    </p>
                  )}
                  {(cancelled || s.status === "RETURNED") && !s.restockedAt && (
                    <ActionForm
                      action={restockShipment}
                      fields={{ shipmentId: s.id }}
                      confirmMessage="Are these items back with you? They'll be added to your stock."
                      className="mt-2 flex flex-wrap items-center gap-2"
                    >
                      <span className="text-xs text-accent-hover">When the items are back with you:</span>
                      <SubmitButton tone="neutral">Back in stock</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} total={countOf(tab)} href={(p) => href(tab, p)} />
    </>
  );
}
