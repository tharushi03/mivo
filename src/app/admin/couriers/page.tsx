import { Suspense } from "react";
import type { Metadata } from "next";
import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { couriers, orders, shipments } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { countPendingCodPackages } from "@/lib/couriers";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createCourier, setCourierActive, updateCourier, updateCourierAccount } from "@/app/actions/couriers";

export const metadata: Metadata = { title: "Admin · Couriers" };

export default function AdminCouriersPage() {
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <h1 className="text-3xl font-bold">Couriers</h1>
      <p className="mb-6 mt-1 text-text-secondary">
        The courier services boutiques can choose when they dispatch a package. Inactive couriers are hidden from that
        list but stay on packages already sent with them.
      </p>
      <p className="-mt-4 mb-6 text-sm text-text-secondary">
        <strong className="text-text-primary">Cash on delivery</strong> packages can only be booked with couriers marked{" "}
        <em>MIVO COD account</em>, on MIVO&apos;s account, so the courier pays the cash to MIVO. Prepaid packages can use any
        active courier.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <Couriers />
      </Suspense>
    </main>
  );
}

const input = "rounded-md border border-border bg-background p-2 text-sm";

async function Couriers() {
  await requireAdmin();
  const rows = await db
    .select({
      id: couriers.id,
      name: couriers.name,
      isActive: couriers.isActive,
      sortOrder: couriers.sortOrder,
      supportsCod: couriers.supportsCod,
      accountNumber: couriers.accountNumber,
      bookingInstructions: couriers.bookingInstructions,
      used: count(shipments.id),
      // COD parcels with this courier now: cash MIVO is still waiting to receive from it.
      codOut: sql<number>`count(*) filter (where ${shipments.status} = 'DISPATCHED' and ${orders.paymentMethod} = 'COD')::int`,
    })
    .from(couriers)
    .leftJoin(shipments, eq(shipments.courierId, couriers.id))
    .leftJoin(orders, eq(shipments.orderId, orders.id))
    .groupBy(couriers.id)
    .orderBy(asc(couriers.sortOrder), asc(couriers.name));
  const activeCount = rows.filter((r) => r.isActive).length;
  const codCount = rows.filter((r) => r.isActive && r.supportsCod).length;
  const pendingCod = await countPendingCodPackages();

  return (
    <>
      {codCount === 0 && (
        <div role="alert" className="mb-6 rounded-xl border border-error/40 bg-error/5 p-4 text-sm">
          <p className="font-semibold text-error">Cash on delivery is switched off at checkout</p>
          <p className="mt-1">
            No active courier has a MIVO COD account. Buyers can only pay by bank transfer until you add MIVO&apos;s account
            number to a courier below and tick <em>MIVO COD account</em>.
          </p>
        </div>
      )}
      {codCount === 1 && pendingCod > 0 && (
        <p className="mb-6 text-sm text-text-secondary">
          {pendingCod} cash-on-delivery {pendingCod === 1 ? "package is" : "packages are"} waiting to be sent, so the last COD
          courier can&apos;t be switched off until {pendingCod === 1 ? "it's" : "they're"} dispatched or cancelled.
        </p>
      )}

      <section className="mb-8 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="mb-3 font-bold">Add a courier</h2>
        <ActionForm action={createCourier} fields={{}} className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium">
            Name
            <input name="name" required minLength={2} maxLength={100} placeholder="e.g. Aramex" className={`mt-1 block w-56 ${input}`} />
          </label>
          <label className="text-xs font-medium">
            Position
            <input name="sortOrder" type="number" min={0} max={999} defaultValue={rows.length * 10} className={`mt-1 block w-24 ${input}`} />
          </label>
          <SubmitButton>Add Courier</SubmitButton>
        </ActionForm>
        <p className="mt-2 text-xs text-text-secondary">Lower positions appear first in the boutiques&apos; dropdown.</p>
      </section>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Courier &amp; position</th>
              <th className="px-4 py-3 font-medium">MIVO account</th>
              <th className="px-4 py-3 font-medium">Packages</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Show to boutiques</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((c) => (
              <tr key={c.id} className={`align-top ${c.isActive ? "" : "bg-muted/30"}`}>
                <td className="px-4 py-3">
                  {/* key: reset the inputs to the saved values after each save */}
                  <ActionForm key={`${c.name}|${c.sortOrder}`} action={updateCourier} fields={{ courierId: c.id }} className="flex flex-wrap items-center gap-2">
                    <input name="name" required minLength={2} maxLength={100} defaultValue={c.name} aria-label="Courier name" className={`w-48 ${input}`} />
                    <input name="sortOrder" type="number" min={0} max={999} defaultValue={c.sortOrder} aria-label={`Position of ${c.name}`} className={`w-20 ${input}`} />
                    <SubmitButton tone="neutral">Save</SubmitButton>
                  </ActionForm>
                </td>
                <td className="px-4 py-3">
                  <ActionForm
                    key={`${c.accountNumber}|${c.bookingInstructions}|${c.supportsCod}`}
                    action={updateCourierAccount}
                    fields={{ courierId: c.id }}
                    className="grid w-80 gap-2"
                  >
                    <input
                      name="accountNumber"
                      maxLength={60}
                      defaultValue={c.accountNumber ?? ""}
                      placeholder="MIVO's account / merchant no."
                      aria-label={`MIVO's account number with ${c.name}`}
                      className={`font-mono placeholder:font-sans ${input}`}
                    />
                    <textarea
                      name="bookingInstructions"
                      maxLength={600}
                      rows={3}
                      defaultValue={c.bookingInstructions ?? ""}
                      placeholder="How boutiques book on MIVO's account, e.g. Call 011 234 5678 for a pickup and quote the account number."
                      aria-label={`Booking instructions for ${c.name}`}
                      className={input}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs font-medium">
                        <input type="checkbox" name="supportsCod" defaultChecked={c.supportsCod} className="accent-[var(--color-accent)]" />
                        MIVO COD account
                      </label>
                      <SubmitButton tone="neutral">Save account</SubmitButton>
                    </div>
                    <p className="text-xs text-text-secondary">Every boutique sees this. Never enter a password or PIN.</p>
                  </ActionForm>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {c.used}
                  {c.codOut > 0 && (
                    <div className="mt-1 w-28 text-xs font-medium text-accent-hover">
                      {c.codOut} COD {c.codOut === 1 ? "parcel" : "parcels"} out: cash still to come
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                      c.isActive ? "bg-success/15 text-success" : "bg-muted text-text-secondary"
                    }`}
                  >
                    {c.isActive ? "Active" : "Inactive"}
                  </span>
                  {c.isActive && (
                    <div className={`mt-1 whitespace-nowrap text-xs ${c.supportsCod ? "font-medium text-success" : "text-text-secondary"}`}>
                      {c.supportsCod ? "COD allowed" : "Prepaid only"}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.isActive ? (
                    activeCount > 1 ? (
                      <ActionForm
                        action={setCourierActive}
                        fields={{ courierId: c.id, active: "false" }}
                        confirmMessage={`Deactivate ${c.name}? Boutiques won't be able to choose it any more. Packages already sent with it are not affected.${
                          c.codOut > 0 ? ` ${c.codOut} COD ${c.codOut === 1 ? "parcel is" : "parcels are"} still out with ${c.name}: keep collecting that cash from them.` : ""
                        }${c.supportsCod && codCount === 1 ? " This is the last COD courier: cash on delivery will be switched off at checkout." : ""}`}
                      >
                        <SubmitButton tone="danger">Deactivate</SubmitButton>
                      </ActionForm>
                    ) : (
                      <span className="text-xs text-text-secondary">Last active courier</span>
                    )
                  ) : (
                    <ActionForm action={setCourierActive} fields={{ courierId: c.id, active: "true" }}>
                      <SubmitButton tone="neutral">Activate</SubmitButton>
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
