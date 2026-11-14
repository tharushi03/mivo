import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { getOrderWithItems, paymentLabel } from "@/lib/orders";
import { orderRef } from "@/lib/payments";
import { formatDateTime, formatLKR } from "@/lib/format";
import { nextSlipToCheck, slipDuplicates, slipsToCheckCount } from "@/lib/slip-review";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { SlipViewer } from "./slip-viewer";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: "Admin · Check payment" };

export default function AdminOrderReviewPage({ params }: PageProps<"/admin/orders/[id]">) {
  return (
    <main className="mx-auto max-w-[1400px] p-4 sm:p-8">
      <Link href="/admin/orders?status=SLIPS" className="text-sm text-accent hover:underline">
        ← Slips to check
      </Link>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <Review params={params} />
      </Suspense>
    </main>
  );
}

async function Review({ params }: Pick<PageProps<"/admin/orders/[id]">, "params">) {
  await requireAdmin();
  const { id } = await params;
  const order = await getOrderWithItems(id);
  if (!order) notFound();

  const ref = orderRef(order.id);
  const awaitingPayment = order.paymentMethod === "BANK_TRANSFER" && order.paymentStatus === "PENDING" && order.orderStatus === "PENDING";
  const hasSlip = Boolean(order.paymentSlipUrl);
  const [duplicates, nextId, waiting] = await Promise.all([
    slipDuplicates(order.id, order.slipHash, order.slipReference),
    nextSlipToCheck(order.id),
    slipsToCheckCount(),
  ]);
  const sameImage = duplicates.some((d) => d.sameImage);
  const othersWaiting = waiting - (awaitingPayment && hasSlip ? 1 : 0);

  return (
    <>
      <div className="mb-6 mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Check payment</h1>
        {nextId && (
          <Link href={`/admin/orders/${nextId}`} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-muted">
            Next slip → <span className="text-text-secondary">({othersWaiting} waiting)</span>
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Left: what the bank should show */}
        <section className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Order</p>
            <p className="font-mono text-3xl font-bold">{ref}</p>
            <p className="mt-3 text-xs uppercase tracking-wide text-text-secondary">Expected amount</p>
            <p className="text-3xl font-bold">{formatLKR(order.totalAmount)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <OrderStatusBadge status={order.orderStatus} />
              <span className="text-text-secondary">{paymentLabel(order.paymentMethod, order.paymentStatus)}</span>
            </div>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl border border-border bg-surface p-5 text-sm">
            <dt className="text-text-secondary">Buyer</dt>
            <dd className="font-semibold">
              {order.buyerName}
              {!order.buyerId && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">Guest (no account)</span>}
            </dd>
            <dt className="text-text-secondary">Email</dt>
            <dd className="break-all">{order.buyerEmail}</dd>
            <dt className="text-text-secondary">Phone</dt>
            <dd>{order.phoneNumber}</dd>
            {order.recipientName !== order.buyerName && (
              <>
                <dt className="text-text-secondary">Deliver to</dt>
                <dd>{order.recipientName}</dd>
              </>
            )}
            <dt className="text-text-secondary">Ordered</dt>
            <dd>{formatDateTime(order.createdAt)}</dd>
            {order.referrerName && (
              <>
                <dt className="text-text-secondary">Came from</dt>
                <dd>{order.referrerName}&apos;s shop link</dd>
              </>
            )}
          </dl>

          <div className="rounded-2xl border border-border bg-surface p-5 text-sm">
            <p className="mb-2 font-semibold">Items</p>
            <ul className="space-y-1">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>
                    {i.title} <span className="text-text-secondary">· {i.size} × {i.quantity} · {i.shopName}</span>
                  </span>
                  <span className="whitespace-nowrap">{formatLKR(Number(i.price) * i.quantity)}</span>
                </li>
              ))}
            </ul>
          </div>

          {awaitingPayment && (
            <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5 text-sm">
              <p className="font-semibold">Before you verify, open MIVO&apos;s bank account and find a credit that matches:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Amount exactly <strong>{formatLKR(order.totalAmount)}</strong>
                </li>
                <li>
                  Remark <strong className="font-mono">{ref}</strong>
                  {order.slipReference && (
                    <>
                      {" "}
                      or transaction no. <strong className="font-mono">{order.slipReference}</strong>
                    </>
                  )}
                </li>
                <li>Received on or after {formatDateTime(order.createdAt)}</li>
              </ul>
              <p className="mt-2 text-xs text-text-secondary">A slip is only a picture and can be edited. Only the bank statement proves the money arrived.</p>
            </div>
          )}
        </section>

        {/* Right: the slip */}
        <section className="space-y-4">
          {hasSlip ? (
            <div className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-text-secondary">Transaction reference (typed by buyer)</p>
                  <p className="font-mono text-2xl font-bold">{order.slipReference ?? "Not given (uploaded before this was required)"}</p>
                </div>
                {order.slipUploadedAt && <p className="text-xs text-text-secondary">Uploaded {formatDateTime(order.slipUploadedAt)}</p>}
              </div>
              <SlipViewer src={`/order/${order.id}/slip?v=${order.slipUploadedAt?.getTime() ?? 0}`} />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-secondary">
              {order.paymentMethod !== "BANK_TRANSFER" ? "Cash on delivery: no slip." : "No slip uploaded."}
              {order.slipRejectReason && (
                <p className="mt-2 text-error">
                  Last slip rejected {order.slipRejectedAt && formatDateTime(order.slipRejectedAt)}: {order.slipRejectReason}
                </p>
              )}
            </div>
          )}

          {duplicates.length > 0 && (
            <div role="alert" className="rounded-2xl border-2 border-error bg-error/10 p-5 text-sm">
              <p className="font-bold text-error">
                {sameImage ? "This exact slip image was also uploaded for another order." : "This transaction reference was also given for another order."}
              </p>
              <p className="mt-1">One bank transfer can only pay for one order. Check carefully before verifying.</p>
              <ul className="mt-2 space-y-1">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    <Link href={`/admin/orders/${d.id}`} className="font-mono font-medium text-accent hover:underline">
                      {orderRef(d.id)}
                    </Link>{" "}
                    <span className="text-text-secondary">
                      ({[d.sameImage && "same image", d.sameReference && "same reference"].filter(Boolean).join(", ")} ·{" "}
                      {d.paymentStatus === "PAID" ? "already verified" : d.orderStatus === "CANCELLED" ? "cancelled" : "payment pending"})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {awaitingPayment ? (
            <ReviewActions
              orderId={order.id}
              orderRef={ref}
              amount={formatLKR(order.totalAmount)}
              hasSlip={hasSlip}
              suggestReason={duplicates.some((d) => d.paymentStatus === "PAID") ? "ALREADY_USED" : undefined}
            />
          ) : (
            <p className="rounded-xl border border-border bg-surface p-4 text-sm">
              {order.paymentStatus === "PAID"
                ? `Payment verified${order.paidAt ? ` on ${formatDateTime(order.paidAt)}` : ""}.`
                : order.orderStatus === "CANCELLED"
                  ? "This order is cancelled."
                  : "Nothing to check for this order."}{" "}
              <Link href="/admin/orders" className="text-accent hover:underline">
                All orders
              </Link>
            </p>
          )}
        </section>
      </div>
    </>
  );
}
