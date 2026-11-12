import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/dal";
import { PAYOUT_HOLD_DAYS, getHeldPayouts, getPendingPayouts, getRecentPayouts } from "@/lib/payouts";
import { formatDate, formatDateTime, formatLKR } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { markPayoutPaid } from "@/app/actions/payouts";
import { maskAccount } from "@/lib/banks";

export const metadata: Metadata = { title: "Admin · Payouts" };

const cents = (c: number) => formatLKR(c / 100);

export default function AdminPayoutsPage() {
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <h1 className="text-3xl font-bold">Payouts</h1>
      <p className="mb-6 mt-1 text-text-secondary">
        What MIVO owes each boutique for packages delivered <strong className="text-text">more than {PAYOUT_HOLD_DAYS} days ago</strong>{" "}
        (the buyer&apos;s return window), minus commission, plus delivery fees boutiques paid themselves on prepaid orders.
        Returned and cancelled packages are never included.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <Payouts />
      </Suspense>
    </main>
  );
}

async function Payouts() {
  await requireAdmin();
  const [pending, held, recent] = await Promise.all([getPendingPayouts(), getHeldPayouts(), getRecentPayouts()]);
  const heldCents = held.reduce((s, h) => s + h.netCents, 0);

  const totals = pending.reduce(
    (t, p) => ({ delivery: t.delivery + p.deliveryCents, commission: t.commission + p.commissionCents, net: t.net + Math.max(0, p.netCents) }),
    { delivery: 0, commission: 0, net: 0 },
  );

  return (
    <>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Owed to boutiques" value={cents(totals.net)} hint={`${pending.length} ${pending.length === 1 ? "boutique" : "boutiques"}`} strong />
        <Stat label="On hold (return window)" value={cents(heldCents)} hint={`Payable ${PAYOUT_HOLD_DAYS} days after delivery`} />
        <Stat label="MIVO commission" value={cents(totals.commission)} hint={`On pending payouts · ${cents(totals.delivery)} delivery repaid`} />
      </div>

      <h2 className="mb-3 text-xl font-bold">Pending payouts</h2>
      {pending.length === 0 ? (
        <EmptyState icon="store" title="Nothing to pay right now">
          Boutiques appear here {PAYOUT_HOLD_DAYS} days after their packages are delivered.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Boutique</th>
                <th className="px-4 py-3 text-right font-medium">Total sales</th>
                <th className="px-4 py-3 text-right font-medium">Commission</th>
                <th className="px-4 py-3 text-right font-medium">Delivery repaid</th>
                <th className="px-4 py-3 text-right font-medium">Net payable</th>
                <th className="px-4 py-3 font-medium">Pay out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pending.map((p) => (
                <tr key={p.sellerId} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.shopName}</div>
                    <div className="text-xs text-text-secondary">
                      {p.itemCount} {p.itemCount === 1 ? "item" : "items"} · {p.orderCount} {p.orderCount === 1 ? "order" : "orders"}
                      {p.oldestDeliveredAt && <> · oldest delivered {formatDate(new Date(p.oldestDeliveredAt))}</>}
                    </div>
                    <BankDetails p={p} />
                  </td>
                  <td className="px-4 py-3 text-right">{cents(p.grossCents)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">
                    −{cents(p.commissionCents)}
                    <div className="text-xs">{p.rate}%</div>
                  </td>
                  <td className="px-4 py-3 text-right text-text-secondary">
                    {p.deliveryCents > 0 ? `+${cents(p.deliveryCents)}` : "—"}
                    {p.packageCount > 0 && <div className="text-xs">{p.packageCount} prepaid {p.packageCount === 1 ? "package" : "packages"}</div>}
                    {p.adjustmentCents < 0 && (
                      <div className="mt-1 text-xs font-medium text-error">−{cents(-p.adjustmentCents)} returns after payout</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-base font-bold">{cents(p.netCents)}</td>
                  <td className="px-4 py-3">
                    {p.netCents <= 0 ? (
                      <p className="w-56 text-xs text-text-secondary">
                        Nothing to pay: deductions are larger than what&apos;s owed. The balance carries forward to this boutique&apos;s next sales.
                      </p>
                    ) : (
                    <ActionForm
                      action={markPayoutPaid}
                      fields={{ sellerId: p.sellerId, expectedNetCents: String(p.netCents), expectedAccount: p.bankAccountNumber ?? "" }}
                      confirmMessage={`Confirm you have transferred ${cents(p.netCents)} to ${p.shopName} (${p.bankName ?? "bank"} ${p.bankAccountNumber ?? "?"})?`}
                      className="flex w-56 flex-col gap-1.5"
                    >
                      <input
                        name="reference"
                        maxLength={100}
                        placeholder="Bank reference (optional)"
                        aria-label={`Bank transfer reference for ${p.shopName}`}
                        className="rounded-md border border-border bg-background p-1.5 text-xs"
                      />
                      <div>
                        <SubmitButton>Mark as Paid</SubmitButton>
                      </div>
                    </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 mt-10 text-xl font-bold">Recent payouts</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-text-secondary">No payouts recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Paid</th>
                <th className="px-4 py-3 font-medium">Boutique</th>
                <th className="px-4 py-3 text-right font-medium">Gross</th>
                <th className="px-4 py-3 text-right font-medium">Commission</th>
                <th className="px-4 py-3 text-right font-medium">Delivery</th>
                <th className="px-4 py-3 text-right font-medium">Net paid</th>
                <th className="px-4 py-3 font-medium">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-xs">{r.paidAt ? formatDateTime(r.paidAt) : "—"}</td>
                  <td className="px-4 py-3">
                    {r.shopName}
                    <div className="text-xs text-text-secondary">
                      {r.itemCount} {r.itemCount === 1 ? "item" : "items"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{formatLKR(r.grossAmount)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">
                    −{formatLKR(r.commissionAmount)} <span className="text-xs">({Number(r.commissionRate)}%)</span>
                  </td>
                  <td className="px-4 py-3 text-right text-text-secondary">
                    {Number(r.deliveryAmount) > 0 ? `+${formatLKR(r.deliveryAmount)}` : "—"}
                    {Number(r.adjustmentAmount) < 0 && <div className="text-xs text-error">{formatLKR(r.adjustmentAmount)} deducted</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatLKR(r.amount)}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {r.reference ?? "—"}
                    {r.bankAccountNumber && (
                      <div className="font-sans text-text-secondary">
                        to {r.bankName} {maskAccount(r.bankAccountNumber)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BankDetails({ p }: { p: Awaited<ReturnType<typeof getPendingPayouts>>[number] }) {
  if (!p.bankAccountNumber) {
    return <div className="mt-2 text-xs text-error">No bank details yet. Ask the boutique to add them in Store Settings.</div>;
  }
  const updated = p.bankDetailsUpdatedAt ? new Date(p.bankDetailsUpdatedAt) : null;
  return (
    <div className="mt-2 rounded-md bg-background p-2 text-xs leading-relaxed">
      <div>
        {p.bankName} · {p.bankBranch}
      </div>
      <div>{p.bankAccountName}</div>
      <div className="font-mono text-sm">{p.bankAccountNumber}</div>
      {p.bankChangedRecently && updated && (
        <div className="mt-1 font-medium text-error">⚠ Changed {formatDateTime(updated)}. Confirm with the boutique before paying.</div>
      )}
    </div>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${strong ? "border-accent/40 bg-accent/5" : "border-border bg-surface"}`}>
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs text-text-secondary">{hint}</p>
    </div>
  );
}
