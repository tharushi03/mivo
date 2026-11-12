import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/dal";
import { PAYOUT_HOLD_DAYS, getHeldPayouts, getPendingPayouts, getSellerPayouts } from "@/lib/payouts";
import { formatDate, formatLKR } from "@/lib/format";
import { maskAccount } from "@/lib/banks";
import { EmptyState } from "@/components/empty-state";
import { PAGE_SIZE, Pagination, parsePage } from "@/components/pagination";

export const metadata: Metadata = { title: "My payouts", robots: { index: false } };

export default function SellerPayoutsPage({ searchParams }: PageProps<"/seller/payouts">) {
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <h1 className="text-3xl font-bold">My payouts</h1>
      <p className="mb-6 mt-1 text-text-secondary">
        Money MIVO has sent you. Items become payable {PAYOUT_HOLD_DAYS} days after delivery (the customer&apos;s return
        window). For prepaid orders, the delivery fee you paid the courier is repaid with your payout.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <Payouts searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Payouts({ searchParams }: Pick<PageProps<"/seller/payouts">, "searchParams">) {
  const { profile } = await requireSeller();
  if (!profile) {
    return <p className="rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">Your account has no boutique profile yet.</p>;
  }

  const page = parsePage((await searchParams).page);
  // Both queries are filtered to THIS boutique only.
  const [[owed], [held], history] = await Promise.all([
    getPendingPayouts(profile.id),
    getHeldPayouts(profile.id),
    getSellerPayouts(profile.id, page, PAGE_SIZE),
  ]);

  return (
    <>
      {!profile.bankAccountNumber && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/30 bg-error/10 p-4 text-sm">
          <span>
            <strong className="text-error">Add your bank details</strong> so MIVO can send your payouts.
          </span>
          <Link href="/seller/settings" className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-hover">
            Store settings
          </Link>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-5">
          <p className="text-sm text-text-secondary">Awaiting payout</p>
          <p className={`mt-1 text-2xl font-bold ${owed && owed.netCents < 0 ? "text-error" : ""}`}>{formatLKR((owed?.netCents ?? 0) / 100)}</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {owed
              ? `${formatLKR(owed.grossCents / 100)} sales − ${formatLKR(owed.commissionCents / 100)} commission${owed.deliveryCents > 0 ? ` + ${formatLKR(owed.deliveryCents / 100)} delivery repaid` : ""}${owed.adjustmentCents < 0 ? ` − ${formatLKR(-owed.adjustmentCents / 100)} returns after payout` : ""}`
              : "Nothing ready to pay right now"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-sm text-text-secondary">On hold (return window)</p>
          <p className="mt-1 text-2xl font-bold">{formatLKR((held?.netCents ?? 0) / 100)}</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {held?.nextReleaseAt ? `Next becomes payable ${formatDate(held.nextReleaseAt)}` : "No recent deliveries waiting"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-sm text-text-secondary">Paid to date</p>
          <p className="mt-1 text-2xl font-bold">{formatLKR(history.paidToDate)}</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {history.total} {history.total === 1 ? "payout" : "payouts"}
          </p>
        </div>
      </div>

      {history.total === 0 ? (
        <EmptyState icon="store" title="No payouts yet">
          Your first payout will appear here once MIVO transfers the earnings from your delivered orders.
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Sales</th>
                  <th className="px-4 py-3 text-right font-medium">Commission</th>
                  <th className="px-4 py-3 text-right font-medium">Delivery repaid</th>
                  <th className="px-4 py-3 text-right font-medium">Payout (net)</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Bank reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      {formatDate(r.paidAt ?? r.createdAt)}
                      <div className="text-xs text-text-secondary">
                        {r.itemCount} {r.itemCount === 1 ? "item" : "items"}
                        {r.bankAccountNumber && <> · to {r.bankName} {maskAccount(r.bankAccountNumber)}</>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{formatLKR(r.grossAmount)}</td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      −{formatLKR(r.commissionAmount)} <span className="text-xs">({Number(r.commissionRate)}%)</span>
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {Number(r.deliveryAmount) > 0 ? `+${formatLKR(r.deliveryAmount)}` : "—"}
                      {Number(r.adjustmentAmount) < 0 && <div className="text-xs text-error">{formatLKR(r.adjustmentAmount)} returns</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{formatLKR(r.amount)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          r.status === "PAID" ? "bg-success/15 text-success" : "bg-accent/15 text-accent-hover"
                        }`}
                      >
                        {r.status === "PAID" ? "Paid" : "Processing"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{r.reference ?? <span className="text-text-secondary">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={history.total} href={(p) => (p > 1 ? `/seller/payouts?page=${p}` : "/seller/payouts")} />
        </>
      )}
    </>
  );
}
