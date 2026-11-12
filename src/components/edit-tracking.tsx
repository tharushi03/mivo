"use client";

import { useActionState, useState } from "react";
import { updateTracking, type ActionResult } from "@/app/actions/admin-orders";
import { SubmitButton } from "@/components/action-form";

type Props = {
  shipmentId: string;
  /** Couriers it may switch to (active; for COD, only those with a MIVO COD account). */
  couriers: { id: string; name: string }[];
  current: { courierId: string | null; courierName: string | null; tracking: string | null };
  /** Narrow layout for table cells. */
  compact?: boolean;
};

/** "Edit tracking" link that opens an inline form to correct a typo on a dispatched package. */
export function EditTracking({ shipmentId, couriers, current, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await updateTracking(prev, fd);
    if (r.ok) setOpen(false);
    return r;
  }, {});

  // Keep the package's current courier selectable even if it's no longer in the list.
  const options =
    current.courierId && !couriers.some((c) => c.id === current.courierId)
      ? [{ id: current.courierId, name: `${current.courierName ?? "Current"} (current)` }, ...couriers]
      : couriers;

  if (!open) {
    return (
      <span>
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-accent underline-offset-2 hover:underline">
          Edit tracking
        </button>
        {state.ok && <span className="ml-2 text-xs text-success">Updated. The buyer was emailed.</span>}
      </span>
    );
  }

  const field = "mt-1 block rounded-md border border-border bg-background p-2 text-sm";
  return (
    <form action={formAction} className={`mt-2 flex flex-wrap items-end gap-2 ${compact ? "max-w-60" : ""}`}>
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <label className="text-xs font-medium">
        Courier
        <select name="courierId" required defaultValue={current.courierId ?? ""} className={`${field} ${compact ? "w-full" : "w-44"}`}>
          {options.map((c) => (
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
          defaultValue={current.tracking ?? ""}
          className={`${field} font-mono uppercase ${compact ? "w-full" : "w-52"}`}
        />
      </label>
      <div className="flex gap-2">
        <SubmitButton>Save</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-muted">
          Cancel
        </button>
      </div>
      {state.error && (
        <p role="alert" className="w-full text-xs text-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
