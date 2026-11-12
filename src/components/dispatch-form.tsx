"use client";

import { useActionState, useState } from "react";
import { dispatchShipment, type ActionResult } from "@/app/actions/admin-orders";
import { SubmitButton } from "@/components/action-form";
import type { CourierOption } from "@/lib/couriers";

type Props = {
  shipmentId: string;
  /** MIVO-1A2B3C4D: the reference boutiques give the courier, so statements can be matched. */
  orderRef: string;
  /** Cash the courier must collect, e.g. "LKR 6,850" (null for prepaid packages). */
  codAmount: string | null;
  /** Couriers this package may use: for COD, only those with a MIVO COD account. */
  couriers: CourierOption[];
};

/** "Courier + tracking number → Mark as Dispatched", with MIVO's booking details for COD. */
export function DispatchForm({ shipmentId, orderRef, codAmount, couriers }: Props) {
  const [courierId, setCourierId] = useState("");
  const [state, formAction] = useActionState<ActionResult, FormData>(dispatchShipment, {});
  const chosen = couriers.find((c) => c.id === courierId);
  const cod = codAmount !== null;

  if (cod && couriers.length === 0) {
    return (
      <p className="text-sm font-medium text-error">
        No courier is set up for cash on delivery yet, so this package can&apos;t be booked. Please contact MIVO before sending it.
      </p>
    );
  }

  const field = "mt-1 block rounded-md border border-border bg-background p-2 text-sm";
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Confirm you've handed ${orderRef} to the courier? The buyer will be emailed the tracking number.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium">
          Courier
          <select name="courierId" required value={courierId} onChange={(e) => setCourierId(e.target.value)} className={`${field} w-44`}>
            <option value="" disabled>
              Choose…
            </option>
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Tracking number
          <input
            name="trackingNumber"
            required
            minLength={4}
            maxLength={60}
            autoComplete="off"
            placeholder="e.g. KB123456789"
            className={`${field} w-52 font-mono uppercase placeholder:normal-case`}
          />
        </label>
        <SubmitButton>Mark as Dispatched</SubmitButton>
      </div>

      {cod && (
        <div className="mt-3 max-w-xl rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm">
          {!chosen ? (
            <p className="text-text-secondary">
              Cash on delivery: book it on <strong>MIVO&apos;s account</strong> so the cash comes to MIVO. Choose the courier to see how.
            </p>
          ) : (
            <>
              <p className="font-semibold">Book this on MIVO&apos;s {chosen.name} account</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-text-secondary">Account</dt>
                <dd className="font-mono">{chosen.accountNumber ?? "Ask MIVO"}</dd>
                <dt className="text-text-secondary">Reference</dt>
                <dd className="font-mono">{orderRef}</dd>
                <dt className="text-text-secondary">COD amount</dt>
                <dd className="font-semibold">{codAmount}</dd>
              </dl>
              {chosen.bookingInstructions && <p className="mt-2 whitespace-pre-line text-text-secondary">{chosen.bookingInstructions}</p>}
              <label className="mt-3 flex items-start gap-2 text-xs font-medium">
                <input type="checkbox" name="bookedOnMivoAccount" required className="mt-0.5 accent-[var(--color-accent)]" />
                <span>
                  I booked it on MIVO&apos;s {chosen.name} account, with reference {orderRef} and COD amount {codAmount}.
                </span>
              </label>
            </>
          )}
        </div>
      )}

      {state.error && (
        <p role="alert" className="mt-2 text-xs text-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
