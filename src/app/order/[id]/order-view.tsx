import Image from "next/image";
import Link from "next/link";
import type { getOrderWithItems } from "@/lib/orders";
import { paymentLabel } from "@/lib/orders";
import { buyerCanCancel } from "@/lib/fulfilment";
import { SITE } from "@/lib/site";
import { shopPath } from "@/lib/shop-links";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cancelMyOrder } from "@/app/actions/buyer-orders";
import { getPlatformBankDetails, orderRef, paymentDeadline } from "@/lib/payments";
import { formatDateTime, formatLKR } from "@/lib/format";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { ShipmentStatusBadge } from "@/components/shipment-status-badge";
import { SlipUpload } from "./slip-upload";
import { ReviewButton } from "@/app/orders/review-button";
import { getMyReviewsForOrder } from "@/lib/reviews";

/** How the buyer reached the page: logged in, or through a guest order's secret link. */
export type OrderAccess = { kind: "account" } | { kind: "guest"; key: string };

type Order = NonNullable<Awaited<ReturnType<typeof getOrderWithItems>>>;

/** The buyer's view of one order. Used by /order/[id] (accounts) and /track/[id]/[key] (guests). */
export async function OrderView({ order, access }: { order: Order; access: OrderAccess }) {
  const guestKey = access.kind === "guest" ? access.key : null;
  // Delivered items can be reviewed (stars, fit, comment) right here.
  const anyDelivered = order.packages.some((p) => p.status === "DELIVERED");
  const myReviews = anyDelivered ? await getMyReviewsForOrder(order.id, order.buyerId) : new Map();
  const invoiceHref = guestKey ? `/api/invoice/${order.id}?k=${guestKey}` : `/api/invoice/${order.id}`;
  const slipHref = guestKey ? `/track/${order.id}/${guestKey}/slip` : `/order/${order.id}/slip`;
  const ref = orderRef(order.id);
  const subtotal = Number(order.totalAmount) - Number(order.deliveryFee);
  const awaitingTransfer = order.paymentMethod === "BANK_TRANSFER" && order.paymentStatus === "PENDING" && order.orderStatus !== "CANCELLED";
  const bank = getPlatformBankDetails();
  const canCancel = buyerCanCancel(order.orderStatus, order.packages);
  const isOpen = order.orderStatus !== "CANCELLED" && order.orderStatus !== "DELIVERED";

  return (
    <>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5 10 17l9-10" />
          </svg>
        </div>
        {order.referrerName && (
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.2em] text-text-secondary">{order.referrerName}</p>
        )}
        <h1 className="text-3xl font-bold">Thank you for your order!</h1>
        <p className="mt-2 text-text-secondary">
          Order <span className="font-mono font-semibold text-text">{ref}</span> ·{" "}
          {formatDateTime(order.createdAt)}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <OrderStatusBadge status={order.orderStatus} />
          <a
            href={invoiceHref}
            download
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium transition-colors hover:border-accent hover:text-accent-hover"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
            </svg>
            Download Invoice
          </a>
        </div>
      </div>

      {order.orderStatus === "CANCELLED" && (
        <section className="mb-8 rounded-xl border border-error/30 bg-error/10 p-4 text-center text-sm text-error">
          {order.cancelledBy === "BUYER" ? "You cancelled this order" : "This order was cancelled"}
          {order.cancelledAt && <> on {formatDateTime(order.cancelledAt)}</>}
          {order.cancelReason && <> ({order.cancelReason})</>}.{" "}
          {order.paymentStatus === "REFUND_PENDING"
            ? "If your bank transfer reached us, MIVO will contact you to refund it."
            : order.paymentStatus === "REFUNDED"
              ? `Your payment was refunded${order.refundedAt ? ` on ${formatDateTime(order.refundedAt)}` : ""}.`
              : "You haven't been charged."}
        </section>
      )}

      {awaitingTransfer && (
        <section className="mb-8 rounded-2xl border-2 border-accent bg-accent/5 p-6">
          <h2 className="text-lg font-bold">Complete your payment by bank transfer</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Transfer <strong className="text-text">{formatLKR(order.totalAmount)}</strong> to the account below. Use{" "}
            <strong className="font-mono text-text">{ref}</strong> as the payment reference. We&apos;ll start packing once
            the payment is confirmed.
          </p>
          <div role="note" className="mt-4 rounded-xl border-2 border-error bg-error/10 p-4 text-sm text-error">
            <p className="font-bold">
              Important: write <span className="whitespace-nowrap font-mono text-base">{ref}</span> on the bank slip or in the transfer
              remarks.
            </p>
            <p className="mt-1">Slips without the order number will be rejected, because we can&apos;t tell which order the money is for.</p>
          </div>
          {!order.paymentSlipUrl && order.slipRejectReason && (
            <div role="alert" className="mt-4 rounded-xl border border-error/40 bg-surface p-4 text-sm">
              <p className="font-semibold text-error">We couldn&apos;t confirm your payment from the last slip you sent.</p>
              <p className="mt-1">Reason: {order.slipRejectReason}</p>
              <p className="mt-1 text-text-secondary">
                If you have paid, upload a clear slip that shows {ref}. If not, please pay first.
              </p>
            </div>
          )}
          {!order.paymentSlipUrl && (
            <p className="mt-3 text-sm font-medium text-accent-hover">
              Please pay and upload your slip by {formatDateTime(paymentDeadline(order.createdAt, order.slipRejectedAt))}. After that,
              unpaid orders are cancelled automatically and the items go back on sale.
            </p>
          )}
          <dl className="mt-4 grid gap-3 rounded-xl bg-surface p-4 text-sm sm:grid-cols-2">
            <BankRow label="Bank" value={bank.bankName} />
            <BankRow label="Branch" value={bank.branch} />
            <BankRow label="Account name" value={bank.accountName} />
            <BankRow label="Account number" value={bank.accountNumber} mono />
            <BankRow label="Amount" value={formatLKR(order.totalAmount)} />
            <BankRow label="Reference" value={ref} mono />
          </dl>
          {order.paymentSlipUrl && (
            <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-success">
              <span>
                ✓ Slip received{order.slipReference && <> (reference <span className="font-mono">{order.slipReference}</span>)</>}. We&apos;re
                verifying your payment.
              </span>
              <a href={slipHref} target="_blank" rel="noopener" className="font-medium text-accent underline-offset-2 hover:underline">
                View slip
              </a>
            </p>
          )}
          <SlipUpload orderId={order.id} orderRef={ref} hasSlip={Boolean(order.paymentSlipUrl)} guestKey={guestKey} />
        </section>
      )}

      {order.paymentMethod === "COD" && order.orderStatus !== "CANCELLED" && (
        <section className="mb-8 rounded-xl border border-border bg-surface p-4 text-sm">
          <strong>Cash on delivery:</strong> {order.packages.length > 1 ? (
            <>you&apos;ll pay each courier for its own package ({formatLKR(order.totalAmount)} in total). The amounts are shown below.</>
          ) : (
            <>please keep <strong>{formatLKR(order.totalAmount)}</strong> ready for the courier.</>
          )}
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border p-4">
          <h2 className="font-bold">
            {order.packages.length === 1 ? "Your package" : `Your ${order.packages.length} packages`}
          </h2>
          {order.packages.length > 1 && (
            <p className="mt-0.5 text-sm text-text-secondary">
              Each boutique packs its own package, so they may arrive on different days.
            </p>
          )}
        </div>
        <ol className="divide-y divide-border">
          {order.packages.map((pkg, n) => (
            <li key={pkg.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="text-text-secondary">Package {n + 1} from</span>{" "}
                  <strong>{pkg.shopName}</strong>
                </p>
                <ShipmentStatusBadge status={pkg.status} />
              </div>

              {(pkg.status === "PENDING" || pkg.status === "DISPATCHED" || pkg.status === "DELIVERED") && <PackageSteps status={pkg.status} />}
              {(pkg.status === "CANCELLED" || pkg.status === "RETURNED") && pkg.resolutionNote && (
                <p className="mt-3 rounded-lg bg-background p-3 text-sm text-text-secondary">
                  {pkg.status === "RETURNED" ? "Returned" : "Cancelled"}: {pkg.resolutionNote}
                  {pkg.returnedAt && <> · {formatDateTime(pkg.returnedAt)}</>}
                </p>
              )}

              {pkg.trackingNumber && (
                <p className="mt-3 rounded-lg bg-background p-3 text-sm">
                  {pkg.status === "DELIVERED" ? "Delivered" : "On the way"} via <strong>{pkg.courierName}</strong> · Tracking{" "}
                  <span className="font-mono font-semibold">{pkg.trackingNumber}</span>
                  {pkg.deliveredAt && <span className="text-text-secondary"> · {formatDateTime(pkg.deliveredAt)}</span>}
                </p>
              )}
              {pkg.status === "PENDING" && order.orderStatus !== "CANCELLED" && (
                <p className="mt-3 text-sm text-text-secondary">
                  {awaitingTransfer
                    ? "The boutique will pack this once your payment is confirmed."
                    : pkg.inHubAt
                      ? "Your package is at the MIVO Hub and will be handed to the courier soon. You'll get an email with the tracking number."
                      : pkg.packedAt
                        ? `${pkg.shopName} has packed your order. It's on its way to the MIVO Hub.`
                        : `${pkg.shopName} is preparing this package. You'll get an email with the tracking number when it ships.`}
                </p>
              )}

              <ul className="mt-3 space-y-3">
                {pkg.items.map((i) => (
                  <li key={i.id} className="flex gap-4">
                    <div className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <Image src={i.imageUrl} alt={i.title} fill sizes="56px" className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium">{i.title}</p>
                      <p className="text-text-secondary">
                        Size {i.size} · Qty {i.quantity} · {formatLKR(i.price)} each
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{formatLKR(Number(i.price) * i.quantity)}</p>
                      {pkg.status === "DELIVERED" && (
                        <div className="mt-1.5">
                          <ReviewButton
                            orderId={order.id}
                            productId={i.productId}
                            title={i.title}
                            existing={myReviews.get(i.productId) ?? null}
                            guestKey={guestKey}
                          />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {order.paymentMethod === "COD" && order.paymentStatus !== "PAID" && (pkg.status === "PENDING" || pkg.status === "DISPATCHED") && (
                <p className="mt-3 text-right text-sm">
                  Pay this courier <strong>{formatLKR(pkg.packageTotal)}</strong>{" "}
                  <span className="text-text-secondary">(incl. {formatLKR(pkg.deliveryFee)} delivery)</span>
                </p>
              )}
            </li>
          ))}
        </ol>
        <dl className="space-y-2 border-t border-border p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-secondary">Subtotal</dt>
            <dd>{formatLKR(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">
              Delivery ({order.packages.length} {order.packages.length === 1 ? "package" : "packages"})
            </dt>
            <dd>{formatLKR(order.deliveryFee)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd>{formatLKR(order.totalAmount)}</dd>
          </div>
        </dl>
      </section>

      {order.refunds.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-surface p-4 text-sm">
          <h3 className="mb-2 font-semibold">Refunds</h3>
          <ul className="space-y-2">
            {order.refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-text-secondary">{r.reason}</span>
                <span>
                  <strong>{formatLKR(r.amount)}</strong>{" "}
                  <span className={r.status === "REFUNDED" ? "text-success" : r.status === "VOIDED" ? "text-text-secondary" : "text-accent-hover"}>
                    {r.status === "REFUNDED"
                      ? `refunded${r.settledAt ? ` ${formatDateTime(r.settledAt)}` : ""}`
                      : r.status === "VOIDED"
                        ? "nothing to refund (payment not received)"
                        : "refund in progress: MIVO will contact you"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-2 font-semibold">Delivering to</h3>
          <p>{order.recipientName}</p>
          <p className="whitespace-pre-line text-text-secondary">{order.shippingAddress}</p>
          <p className="text-text-secondary">{order.phoneNumber}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-2 font-semibold">Payment</h3>
          <p>{order.paymentMethod === "COD" ? "Cash on Delivery" : "Bank Transfer"}</p>
          <p className="text-text-secondary">{paymentLabel(order.paymentMethod, order.paymentStatus)}</p>
        </div>
      </section>

      {canCancel ? (
        <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
          <div>
            <h3 className="font-semibold">Changed your mind?</h3>
            <p className="text-text-secondary">
              You can cancel until a boutique hands your package to the courier.
              {order.paymentMethod === "BANK_TRANSFER" && order.paymentSlipUrl && " If you've already paid, we'll refund you."}
            </p>
          </div>
          <ActionForm
            action={cancelMyOrder}
            fields={guestKey ? { orderId: order.id, key: guestKey } : { orderId: order.id }}
            confirmMessage={`Cancel order ${ref}? The boutiques will be told not to send it. This can't be undone.`}
            className="flex flex-col items-end"
          >
            <SubmitButton tone="danger">Cancel Order</SubmitButton>
          </ActionForm>
        </section>
      ) : (
        isOpen && (
          <p className="mt-6 text-center text-sm text-text-secondary">
            Part of this order has already shipped, so it can&apos;t be cancelled online. Need help? Contact{" "}
            <a href={`mailto:${SITE.supportEmail}`} className="text-accent hover:underline">
              {SITE.supportEmail}
            </a>
            .
          </p>
        )
      )}

      {guestKey && (
        <p className="mt-6 rounded-xl border border-border bg-surface p-4 text-center text-sm text-text-secondary">
          <strong className="text-text">Bookmark this page</strong> to check your order later. We&apos;ve also emailed the link to{" "}
          {order.buyerEmail}. Don&apos;t share it: anyone with the link can see this order.
        </p>
      )}

      <div className="mt-8 flex flex-col justify-center gap-3 text-center sm:flex-row">
        {!guestKey && (
          <Link href="/orders" className="rounded-lg border border-border px-5 py-2.5 font-medium hover:bg-muted">
            My orders
          </Link>
        )}
        <Link
          href={order.referrerSlug ? shopPath(order.referrerSlug) : "/"}
          className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:bg-accent-hover"
        >
          {order.referrerName ? `More from ${order.referrerName}` : "Continue shopping"}
        </Link>
      </div>
    </>
  );
}

function BankRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className={`font-semibold ${mono ? "font-mono" : ""}`}>{value || "Not configured"}</dd>
    </div>
  );
}

const STEPS = [
  { key: "PENDING", label: "Preparing" },
  { key: "DISPATCHED", label: "On the way" },
  { key: "DELIVERED", label: "Delivered" },
] as const;

/** Mini progress bar for one package: Preparing → On the way → Delivered. */
function PackageSteps({ status }: { status: "PENDING" | "DISPATCHED" | "DELIVERED" }) {
  const current = STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="mt-3 grid grid-cols-3 gap-2" aria-label="Package progress">
      {STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <li key={step.key} aria-current={i === current ? "step" : undefined} className="text-xs">
            <span className={`block h-1.5 rounded-full ${done ? "bg-accent" : "bg-muted"}`} />
            <span className={`mt-1 block ${done ? "font-medium text-text" : "text-text-secondary"}`}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
