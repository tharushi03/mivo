"use client";

import { useActionState, useState } from "react";
import { dispatchShipment, type ActionResult } from "@/app/actions/admin-orders";
import { SubmitButton } from "@/components/action-form";
import type { CourierOption } from "@/lib/couriers";

type Props = {
  shipmentId: string;
  /** MIVO-1A2B3C4D: the reference given to the courier, so statements can be matched. */
  orderRef: string;
  /** Cash the courier must collect, e.g. "LKR 6,850" (null for prepaid packages). */
  codAmount: string | null;
  /** Couriers this package may use: for COD, only those with a MIVO COD account. */
  couriers: CourierOption[];
};

/** Admin, MIVO Hub: the courier collected this parcel → courier + tracking number → Sent. */
export function DispatchForm({ shipmentId, orderRef, codAmount, couriers }: Props) {
  const [courierId, setCourierId] = useState("");
  const [state, formAction] = useActionState<ActionResult, FormData>(dispatchShipment, {});
  const chosen = couriers.find((c) => c.id === courierId);
  const cod = codAmount !== null;

  if (cod && couriers.length === 0) {
    return (
      <p className="w-56 text-xs font-medium text-error">
        Cash on delivery, but no courier is ticked as a MIVO COD account (Admin → Couriers).
      </p>
    );
  }

  const field = "mt-1 block w-full rounded-md border border-border bg-background p-1.5 text-xs";
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Has the courier collected ${orderRef} from the MIVO Hub? The buyer will be emailed the tracking number.`)) e.preventDefault();
      }}
      className="w-56 space-y-1.5"
    >
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <label className="block text-xs font-medium">
        Courier
        <select name="courierId" required value={courierId} onChange={(e) => setCourierId(e.target.value)} className={field}>
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
      <label className="block text-xs font-medium">
        Tracking number
        <input
          name="trackingNumber"
          required
          minLength={4}
          maxLength={60}
          autoComplete="off"
          placeholder="e.g. KB123456789"
          className={`${field} font-mono uppercase placeholder:normal-case`}
        />
      </label>
      {cod && (
        <p className="rounded-md bg-accent/10 p-2 text-xs">
          Cash on delivery: book on MIVO&apos;s {chosen?.name ?? "courier"} account
          {chosen?.accountNumber && <> ({chosen.accountNumber})</>} with reference <span className="font-mono">{orderRef}</span> and COD amount{" "}
          <strong>{codAmount}</strong>.
        </p>
      )}
      <SubmitButton>Sent with courier</SubmitButton>
      {state.error && (
        <p role="alert" className="text-xs text-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
