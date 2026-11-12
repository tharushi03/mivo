import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { couriers, orderItems, orders, products, refunds, sellerProfiles, shipments, users } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { orderRef } from "@/lib/payments";
import { formatDateTime, formatLKR } from "@/lib/format";
import { STATUS_LABEL, paymentLabel } from "@/lib/orders";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PAGE_SIZE, Pagination, parsePage } from "@/components/pagination";
import { cancelOrder, cancelShipment, markShipmentDelivered, restockShipment, returnShipment, settleRefund, verifyPayment } from "@/app/actions/admin-orders";
import { ShipmentStatusBadge } from "@/components/shipment-status-badge";

export const metadata: Metadata = { title: "Admin · Orders" };

type Status = keyof typeof STATUS_LABEL;
const STATUSES = Object.keys(STATUS_LABEL) as Status[];

export default function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <main className="mx-auto max-w-[1400px] p-4 sm:p-8">
      <h1 className="text-3xl font-bold">Orders</h1>
      <p className="mb-6 mt-1 text-text-secondary">
        Verify bank transfers and follow each boutique&apos;s package. See{" "}
        <Link href="/admin/shipments" className="text-accent hover:underline">
          Shipments
        </Link>{" "}
        for every package and late dispatches.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <OrdersTable searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function OrdersTable({ searchParams }: Pick<PageProps<"/admin/orders">, "searchParams">) {
  await requireAdmin();
  const sp = await searchParams;
  // ?status=REFUNDS lists orders with money MIVO still has to send back.
  const refundsTab = sp.status === "REFUNDS";
  const filter = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : null;
  const page = parsePage(sp.page);
  const hasPendingRefund = sql`exists (select 1 from ${refunds} where ${refunds.orderId} = ${orders.id} and ${refunds.status} = 'PENDING')`;
  const where = refundsTab
    ? hasPendingRefund
    : filter
      ? eq(orders.orderStatus, filter)
      : undefined;

  const [counts, [{ refundsDue }], list] = await Promise.all([
    db.select({ status: orders.orderStatus, n: count() }).from(orders).groupBy(orders.orderStatus),
    db.select({ refundsDue: count() }).from(orders).where(hasPendingRefund),
    db
      .select({
        id: orders.id,
        createdAt: orders.createdAt,
        recipientName: orders.recipientName,
        buyerEmail: users.email,
        phoneNumber: orders.phoneNumber,
        shippingAddress: orders.shippingAddress,
        totalAmount: orders.totalAmount,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        paymentSlipUrl: orders.paymentSlipUrl,
        orderStatus: orders.orderStatus,
        paidAt: orders.paidAt,
        cancelledBy: orders.cancelledBy,
      })
      .from(orders)
      .innerJoin(users, eq(orders.buyerId, users.id))
      .where(where)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  const items = list.length
    ? await db
        .select({
          orderId: orderItems.orderId,
          id: orderItems.id,
          title: orderItems.productTitle,
          size: orderItems.selectedSize,
          quantity: orderItems.quantity,
          sellerId: products.sellerId,
        })
        .from(orderItems)
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, list.map((o) => o.id)))
    : [];
  const pkgs = list.length
    ? await db
        .select({
          id: shipments.id,
          orderId: shipments.orderId,
          sellerId: shipments.sellerId,
          shopName: sellerProfiles.shopName,
          status: shipments.status,
          courierName: couriers.name,
          trackingNumber: shipments.trackingNumber,
          resolutionNote: shipments.resolutionNote,
          restockedAt: shipments.restockedAt,
          // Paid out to the boutique already: a return can't be recorded here any more.
          paidOut: sql<boolean>`(${shipments.payoutId} is not null or exists (select 1 from ${orderItems} join ${products} on ${products.id} = ${orderItems.productId} where ${orderItems.orderId} = ${shipments.orderId} and ${products.sellerId} = ${shipments.sellerId} and ${orderItems.payoutId} is not null))`,
        })
        .from(shipments)
        .innerJoin(sellerProfiles, eq(shipments.sellerId, sellerProfiles.id))
        .leftJoin(couriers, eq(shipments.courierId, couriers.id))
        .where(inArray(shipments.orderId, list.map((o) => o.id)))
    : [];
  const refundRows = list.length
    ? await db
        .select({ id: refunds.id, orderId: refunds.orderId, shipmentId: refunds.shipmentId, amount: refunds.amount, status: refunds.status, reason: refunds.reason, reference: refunds.reference })
        .from(refunds)
        .where(inArray(refunds.orderId, list.map((o) => o.id)))
        .orderBy(refunds.createdAt)
    : [];
  const refundsByOrder = Map.groupBy(refundRows, (r) => r.orderId);
  const itemsByOrder = Map.groupBy(items, (i) => i.orderId);
  const pkgsByOrder = Map.groupBy(pkgs, (p) => p.orderId);

  const countOf = (s: Status) => counts.find((c) => c.status === s)?.n ?? 0;
  const total = counts.reduce((s, c) => s + c.n, 0);
  const filteredTotal = refundsTab ? refundsDue : filter ? countOf(filter) : total;
  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (refundsTab) qs.set("status", "REFUNDS");
    else if (filter) qs.set("status", filter);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/admin/orders?${s}` : "/admin/orders";
  };

  return (
    <>
      <nav aria-label="Filter by status" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <FilterTab href="/admin/orders" active={!filter && !refundsTab} label="All" n={total} />
        {STATUSES.map((s) => (
          <FilterTab key={s} href={`/admin/orders?status=${s}`} active={filter === s} label={STATUS_LABEL[s]} n={countOf(s)} />
        ))}
        {(refundsDue > 0 || refundsTab) && (
          <FilterTab href="/admin/orders?status=REFUNDS" active={refundsTab} label="Refunds due" n={refundsDue} />
        )}
      </nav>

      {list.length === 0 ? (
        <EmptyState icon="box" title="No orders found">
          {page > 1
            ? "There are no orders on this page."
            : refundsTab
              ? "No refunds are waiting."
              : filter
              ? `No orders are currently "${STATUS_LABEL[filter]}".`
              : "Orders will appear here as soon as buyers check out."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Buyer</th>
                <th className="px-4 py-3 font-medium">Deliver to</th>
                <th className="px-4 py-3 font-medium">Packages</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((o) => {
                const its = itemsByOrder.get(o.id) ?? [];
                const packages = [...(pkgsByOrder.get(o.id) ?? [])].sort((x, y) => x.shopName.localeCompare(y.shopName));
                const awaitingPayment = o.paymentMethod === "BANK_TRANSFER" && o.paymentStatus === "PENDING";
                const isOpen = o.orderStatus !== "CANCELLED" && o.orderStatus !== "DELIVERED";
                const anyDelivered = packages.some((p) => p.status === "DELIVERED");
                const sent = packages.filter((p) => p.status === "DISPATCHED" || p.status === "DELIVERED").length;

                return (
                  <tr key={o.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold">{orderRef(o.id)}</div>
                      <div className="text-xs text-text-secondary">{formatDateTime(o.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{o.recipientName}</div>
                      <div className="text-xs text-text-secondary">{o.buyerEmail}</div>
                      <a href={`tel:${o.phoneNumber}`} className="text-xs text-accent hover:underline">
                        {o.phoneNumber}
                      </a>
                    </td>
                    <td className="max-w-[220px] whitespace-pre-line px-4 py-3 text-xs">{o.shippingAddress}</td>
                    <td className="px-4 py-3">
                      {/* One package per boutique, shipped directly to the buyer */}
                      <ul className="w-72 space-y-2">
                        {packages.map((p) => (
                          <li key={p.id} className="rounded-lg border border-border p-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{p.shopName}</span>
                              <ShipmentStatusBadge status={p.status} />
                            </div>
                            <ul className="mt-1 text-text-secondary">
                              {its
                                .filter((i) => i.sellerId === p.sellerId)
                                .map((i) => (
                                  <li key={i.id}>
                                    {i.quantity} × {i.title} · {i.size}
                                  </li>
                                ))}
                            </ul>
                            {p.trackingNumber && (
                              <div className="mt-1">
                                {p.courierName} · <span className="font-mono">{p.trackingNumber}</span>
                              </div>
                            )}
                            {p.status === "DISPATCHED" && (
                              <ActionForm
                                action={markShipmentDelivered}
                                fields={{ shipmentId: p.id }}
                                confirmMessage={
                                  o.paymentMethod === "COD"
                                    ? `Mark the ${p.shopName} package delivered? Only do this once the courier has paid MIVO the cash.`
                                    : `Mark the ${p.shopName} package for ${orderRef(o.id)} as delivered?`
                                }
                                className="mt-1.5"
                              >
                                <SubmitButton tone="neutral">Mark Delivered</SubmitButton>
                              </ActionForm>
                            )}
                            {(p.status === "CANCELLED" || p.status === "RETURNED") && p.resolutionNote && (
                              <div className="mt-1 text-text-secondary">{p.resolutionNote}</div>
                            )}
                            {(p.status === "CANCELLED" || p.status === "RETURNED") && !p.restockedAt && (
                              <ActionForm
                                action={restockShipment}
                                fields={{ shipmentId: p.id }}
                                confirmMessage={`Are the ${p.shopName} items physically back? They'll be added to stock.`}
                                className="mt-1.5"
                              >
                                <span className="mr-2 text-accent-hover">Items not back yet</span>
                                <SubmitButton tone="neutral">Back in stock</SubmitButton>
                              </ActionForm>
                            )}
                            {isOpen &&
                              (p.status === "PENDING" || p.status === "DISPATCHED") &&
                              !awaitingPayment &&
                              packages.filter((x) => x.id !== p.id && x.status !== "CANCELLED" && x.status !== "RETURNED").length > 0 && (
                                <ResolvePackage
                                  label="Cancel package…"
                                  action={cancelShipment}
                                  shipmentId={p.id}
                                  restock={p.status === "DISPATCHED"}
                                  confirmMessage={`Cancel only the ${p.shopName} package? ${o.paymentMethod === "BANK_TRANSFER" ? "Its items and delivery fee will be recorded as a refund. " : ""}The boutique and buyer are emailed.`}
                                />
                              )}
                            {p.status === "DELIVERED" && p.paidOut && <div className="mt-1 text-text-secondary">Paid out to boutique</div>}
                            {p.status === "DELIVERED" && !p.paidOut && o.orderStatus !== "CANCELLED" && (
                              <ResolvePackage
                                label="Record return…"
                                action={returnShipment}
                                shipmentId={p.id}
                                restock
                                refundDeliveryOption
                                confirmMessage={`Record that the ${p.shopName} package came back? The buyer is refunded its items and the boutique isn't paid for them.`}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3 font-semibold">{formatLKR(o.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <div>{o.paymentMethod === "COD" ? "Cash on Delivery" : "Bank Transfer"}</div>
                      <div
                        className={`text-xs font-medium ${
                          o.paymentStatus === "PAID" || o.paymentStatus === "REFUNDED"
                            ? "text-success"
                            : o.paymentStatus === "REFUND_PENDING"
                              ? "text-error"
                              : o.paymentStatus === "VOIDED"
                                ? "text-text-secondary"
                                : "text-accent-hover"
                        }`}
                      >
                        {paymentLabel(o.paymentMethod, o.paymentStatus)}
                      </div>
                      {o.paymentMethod === "BANK_TRANSFER" &&
                        (o.paymentSlipUrl ? (
                          <a
                            href={`/order/${o.id}/slip`}
                            target="_blank"
                            rel="noopener"
                            className="mt-1 inline-block text-xs font-medium text-accent underline-offset-2 hover:underline"
                          >
                            View slip ↗
                          </a>
                        ) : (
                          o.paymentStatus === "PENDING" && <div className="mt-1 text-xs text-text-secondary">No slip yet</div>
                        ))}
                      {(refundsByOrder.get(o.id) ?? []).map((r) => (
                        <div key={r.id} className="mt-2 w-48 rounded-lg border border-border p-2 text-xs">
                          <div className="font-medium">
                            Refund {formatLKR(r.amount)}{" "}
                            <span className={r.status === "PENDING" ? "text-error" : r.status === "REFUNDED" ? "text-success" : "text-text-secondary"}>
                              {r.status === "PENDING" ? "due" : r.status === "REFUNDED" ? "sent" : "voided"}
                            </span>
                          </div>
                          <div className="text-text-secondary">{r.reason}</div>
                          {r.reference && <div className="font-mono">{r.reference}</div>}
                          {r.status === "PENDING" && (
                            <>
                              <ActionForm
                                action={settleRefund}
                                fields={{ refundId: r.id, outcome: "REFUNDED" }}
                                confirmMessage={`Confirm you have sent ${formatLKR(r.amount)} back to the buyer of ${orderRef(o.id)}?`}
                                className="mt-1.5 flex flex-col gap-1"
                              >
                                <input name="reference" maxLength={100} placeholder="Bank reference (optional)" aria-label="Refund bank reference" className="rounded-md border border-border bg-background p-1.5" />
                                <div>
                                  <SubmitButton>Mark Refunded</SubmitButton>
                                </div>
                              </ActionForm>
                              {!o.paidAt && !r.shipmentId && (
                                <ActionForm
                                  action={settleRefund}
                                  fields={{ refundId: r.id, outcome: "NOT_RECEIVED" }}
                                  confirmMessage={`Confirm the transfer for ${orderRef(o.id)} never reached MIVO's account, so there is nothing to refund?`}
                                  className="mt-1"
                                >
                                  <SubmitButton tone="neutral">Money never arrived</SubmitButton>
                                </ActionForm>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={o.orderStatus} />
                      {o.orderStatus === "CANCELLED" && o.cancelledBy && (
                        <div className="mt-1 text-xs text-text-secondary">by {o.cancelledBy === "BUYER" ? "buyer" : "admin"}</div>
                      )}
                      {isOpen && packages.length > 1 && (
                        <div className="mt-1 text-xs text-text-secondary">
                          {sent} of {packages.length} packages sent
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex w-44 flex-col items-start gap-2">
                        {awaitingPayment && isOpen && (
                          <ActionForm
                            action={verifyPayment}
                            fields={{ orderId: o.id }}
                            confirmMessage={`Confirm you received ${formatLKR(o.totalAmount)} for ${orderRef(o.id)}?`}
                          >
                            <SubmitButton>Verify Payment</SubmitButton>
                          </ActionForm>
                        )}
                        {isOpen && !anyDelivered && (
                          <ActionForm
                            action={cancelOrder}
                            fields={{ orderId: o.id }}
                            confirmMessage={`Cancel ${orderRef(o.id)}? Items go back into stock and boutiques are told not to ship. Packages already sent must be returned. This can't be undone.`}
                          >
                            <SubmitButton tone="danger">Cancel Order</SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={filteredTotal} href={pageHref} />
    </>
  );
}

function FilterTab({ href, active, label, n }: { href: string; active: boolean; label: string; n: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "border-primary bg-primary text-white" : "border-border bg-surface hover:bg-muted"
      }`}
    >
      {label} <span className={active ? "text-white/70" : "text-text-secondary"}>{n}</span>
    </Link>
  );
}

/** "Cancel package…" / "Record return…": a small disclosure with a reason and a restock choice. */
function ResolvePackage({
  label,
  action,
  shipmentId,
  restock,
  refundDeliveryOption,
  confirmMessage,
}: {
  label: string;
  action: typeof cancelShipment;
  shipmentId: string;
  /** Offer "put the items back in stock now" (otherwise stock returns automatically or not at all). */
  restock: boolean;
  /** Returns: refund the delivery fee too (faulty or wrong item). */
  refundDeliveryOption?: boolean;
  confirmMessage: string;
}) {
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-xs font-medium text-error">{label}</summary>
      <ActionForm action={action} fields={{ shipmentId }} confirmMessage={confirmMessage} className="mt-1.5 flex flex-col gap-1.5">
        <input name="reason" required minLength={3} maxLength={200} placeholder="Reason (shown to boutique and buyer)" aria-label="Reason" className="rounded-md border border-border bg-background p-1.5 text-xs" />
        {restock && (
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" name="restockNow" /> Items are back with the boutique: restock now
          </label>
        )}
        {refundDeliveryOption && (
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" name="refundDelivery" /> Faulty or wrong item: refund the delivery fee too
          </label>
        )}
        <div>
          <SubmitButton tone="danger">Confirm</SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}
